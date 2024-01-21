import safeAssign from '../../helpers/object/safeAssign';
import {AppManagers} from '../appManagers/managers';
import {Box, Boxes, DataViewReader, DataViewWriter} from './utils';
// @ts-ignore
import MP4Box from 'mp4box';

export class Mp4Stream {
  private videoElement: HTMLVideoElement;
  private peerId: PeerId;
  private managers: AppManagers;

  private initSegmentSent: boolean = false;
  private nextSegmentId: number = 0;
  private decodeTimeOffset: number = 0;

  constructor(options: {
    videoElement: HTMLVideoElement;
    peerId: PeerId;
    managers: Mp4Stream['managers'];
  }) {
    safeAssign(this, options);

    this.run();
  }

  private async run() {
    const videoElement = this.videoElement; // Replace with your actual video element ID

    const mediaSource = new MediaSource();
    (videoElement as any).ms = mediaSource;
    videoElement.src = URL.createObjectURL(mediaSource);

    await new Promise((rs) => {
      mediaSource.addEventListener('sourceopen', rs);
    });
    mediaSource.addEventListener('sourceclose', () => {});
    mediaSource.addEventListener('sourceended', () => {});

    const chatId = this.peerId.toChatId();
    const chatFull = await this.managers.appProfileManager.getChatFull(chatId);
    const sourceBufferType = 'video/mp4; codecs="avc1.64001f,Opus"';
    const sourceBuffer = mediaSource.addSourceBuffer(sourceBufferType);

    const queue: BufferSource[] = [];
    sourceBuffer.addEventListener('updateend', () => {
      if(queue.length > 0) {
        sourceBuffer.appendBuffer(queue.shift());
      }
      videoElement.play();
    });
    function sourceBufferAppend(buffer: BufferSource) {
      if(sourceBuffer.updating) {
        queue.push(buffer);
      } else {
        sourceBuffer.appendBuffer(buffer);
      }
    }

    if(chatFull.call) {
      const result = await this.managers.apiManager.invokeApi(
        'phone.getGroupCallStreamChannels',
        {
          call: chatFull.call
        }
      );
      const chan = result.channels[0];

      const groupCall = await this.managers.appGroupCallsManager.getGroupCall(
        chatId
      );
      if(groupCall && groupCall._ != 'groupCall') {
        return;
      }

      let next_time =
        typeof chan.last_timestamp_ms === 'number' ?
          chan.last_timestamp_ms :
          parseInt(chan.last_timestamp_ms);

      while(true) {
        const result = await this.managers.apiManager
        .invokeApi('upload.getFile', {
          location: {
            _: 'inputGroupCallStream',
            call: chatFull.call,
            scale: chan.scale,
            time_ms: next_time,
            video_channel: 1,
            video_quality: 2
          },
          offset: 0,
          limit: 1024 * 1024
        })
        .then(
          (data) => ({_: 'ok', data} as const),
          (err) => {
            if(err.code === 400) {
              // TIME_TOO_BIG
              return {_: 'timeTooBig'} as const;
            }
            throw err;
          }
        );
        if(result._ === 'timeTooBig') {
          await new Promise((rs) => setTimeout(rs, 900));
          continue;
        }
        const chunk1 = result.data;
        next_time += 1000;

        if(chunk1._ == 'upload.file') {
          const data = new DataViewReader(new DataView(chunk1.bytes.buffer));

          const magic = data.readUint32LE();
          if(magic != 0xa12e810d) {
            throw new Error(
              `Expected magic number 0x${magic.toString(
                16
              )}, got 0x${magic.toString(16)}.`
            );
          }

          const container = data.readTgStr();
          const activeMask = data.readUint32LE();
          const eventCount = data.readUint32LE();

          if(eventCount > 0) {
            const offsetValue = data.readUint32LE();
            const endpointId = data.readTgStr();
            const rotation = data.readInt32LE();
            const extra = data.readUint32LE();

            const videoData = new DataView(
              data.data.buffer,
              data.data.byteOffset + data.offset,
              data.data.byteLength - data.offset
            );
            const vdClone = data.data.buffer.slice(
              data.data.byteOffset + data.offset,
              data.data.byteOffset + data.data.byteLength
            );

            if(!this.initSegmentSent) {
              this.appendInitSegment(videoData, sourceBufferAppend);
              this.initSegmentSent = true;
            }

            this.recodeToMediaSegmentUsingMp4Box(vdClone, sourceBufferAppend);

            this.decodeTimeOffset += 16000;
          }
        }

        await new Promise((rs) => setTimeout(rs, 800));
      }
    }
  }

  private appendInitSegment(
    videoData: DataView,
    append: (buffer: BufferSource) => void
  ) {
    const orig = Boxes.parse(videoData);
    const frag = new Boxes([orig.get('ftyp')]);

    const origMoov = orig.get('moov').valueAsBoxes();

    const fragMoov = new Boxes([]);

    const fragMvhd = origMoov.get('mvhd').valueAsBytes().cloneBytes();
    fragMvhd.setInt32(4 * 4, 0, false);
    fragMoov.push(new Box('mvhd', fragMvhd));

    const fragTrex = new DataView(new ArrayBuffer(6 * 4));
    fragTrex.setUint32(0 * 4, 0, false); // full box
    fragTrex.setUint32(1 * 4, 1, false); // track_id
    fragTrex.setUint32(2 * 4, 1, false); // default_sample_description_index
    fragTrex.setUint32(3 * 4, 1000, false); // default_sample_duration
    fragTrex.setUint32(4 * 4, 0, false); // default_sample_size
    fragTrex.setUint32(5 * 4, 0x00010000, false); // default_sample_flags
    const fragMvex = new Boxes([new Box('trex', fragTrex)]);
    fragMoov.push(new Box('mvex', fragMvex));

    const mfhd_ = new DataView(new ArrayBuffer(2 * 4));
    mfhd_.setUint32(1 * 4, this.nextSegmentId++, false);

    origMoov.getAll('trak').forEach((trakBox) => {
      const trak = trakBox.valueAsBoxes();
      const tkhd = trak.get('tkhd').valueAsBytes().cloneBytes();
      const trackId = tkhd.getUint32(3 * 4);
      const duration = tkhd.getUint32(5 * 4);

      if(trackId === 1) {
        const fragTrak = new Boxes([]);

        tkhd.setUint32(5 * 4, 0, false);
        fragTrak.push(new Box('tkhd', tkhd));

        const mdia = trak.get('mdia').valueAsBoxes();
        const fragMdia = new Boxes([]);

        const mdhd = mdia.get('mdhd').valueAsBytes();
        const mdiaTimescale = mdhd.data.getInt32(3 * 4);
        const mdiaDuration = mdhd.data.getInt32(4 * 4);
        const fragMdhd = mdhd.cloneBytes();
        fragMdhd.setInt32(4 * 4, 0);
        fragMdia.push(new Box('mdhd', fragMdhd));
        fragMdia.push(mdia.get('hdlr'));

        const minf = mdia.get('minf').valueAsBoxes();
        const stbl = minf.get('stbl').valueAsBoxes();

        const fragStbl = new Boxes([]);
        fragStbl.push(new Box('stsd', stbl.get('stsd').value));
        fragStbl.push(new Box('stts', new Uint32Array([0, 0])));
        fragStbl.push(new Box('stsc', new Uint32Array([0, 0])));
        fragStbl.push(new Box('stsz', new Uint32Array([0, 0, 0])));
        fragStbl.push(new Box('stco', new Uint32Array([0, 0])));

        const fragMinf = new Boxes([
          minf.get('vmhd'),
          minf.get('dinf'),
          new Box('stbl', fragStbl)
        ]);
        fragMdia.push(new Box('minf', fragMinf));

        fragTrak.push(new Box('mdia', fragMdia));

        fragMoov.push(new Box('trak', fragTrak));
      }
    });

    frag.push(new Box('moov', fragMoov));

    append(frag.toBytes());
  }

  private recodeToMediaSegmentUsingMp4Box(
    buffer: ArrayBuffer,
    append: (buffer: BufferSource) => void
  ) {
    const mp4box = MP4Box.createFile();
    mp4box.onReady = (info: any) => {
      mp4box.onSegment = (id: any, user: any, buffer: any) => {
        const boxes = Boxes.parse(new DataView(buffer));
        console.log('segment', boxes);
        for(const box of boxes.boxes) {
          if(box.name === 'moof') {
            const mfhd = box.valueAsBoxes().get('mfhd').valueAsBytes();
            const origSegmentId = mfhd.data.getInt32(1 * 4, false);
            mfhd.data.setInt32(1 * 4, this.nextSegmentId++, false);

            const tfdt = box
            .valueAsBoxes()
            .get('traf')
            .valueAsBoxes()
            .get('tfdt')
            .valueAsBytes();
            const origBaseMediaDecodeTime = tfdt.data.getInt32(1 * 4, false);
            tfdt.data.setInt32(
              1 * 4,
              this.decodeTimeOffset + origBaseMediaDecodeTime,
              false
            );
          }
        }
        append(boxes.toBytes());
      };
      mp4box.setSegmentOptions(info.tracks[0].id, null, {
        nbSamples: 1000
      });
      const initSegs = mp4box.initializeSegmentation();
      mp4box.start();
    };
    (buffer as any).fileStart = 0;
    mp4box.appendBuffer(buffer);
    mp4box.flush();
  }

  private recodeToMediaSegmentManually(
    orig: Boxes,
    append: (buffer: BufferSource) => void
  ) {
    const origMoov = orig.get('moov').valueAsBoxes();
    const moof_ = new Boxes([]);

    const mfhd_ = new DataView(new ArrayBuffer(2 * 4));
    mfhd_.setUint32(1 * 4, this.nextSegmentId++, false);
    moof_.push(new Box('mfhd', mfhd_));

    origMoov.getAll('trak').forEach((trakBox) => {
      const trak = trakBox.valueAsBoxes();
      const tkhd = trak.get('tkhd').valueAsBytes().cloneBytes();
      const trackId = tkhd.getUint32(3 * 4);
      const duration = tkhd.getUint32(5 * 4);

      if(trackId === 1) {
        const stbl = trak
        .get('mdia')
        .valueAsBoxes()
        .get('minf')
        .valueAsBoxes()
        .get('stbl')
        .valueAsBoxes();
        const stsz = stbl.get('stsz').valueAsBytes();
        const sampleSize = stsz.data.getInt32(1 * 4, false);
        const sampleCount = stsz.data.getInt32(2 * 4, false);
        const sampleSizes = [];
        if(sampleSize === 0) {
          for(let i = 0; i < sampleCount; i++) {
            sampleSizes.push(stsz.data.getInt32((3 + i) * 4, false));
          }
        }

        const stts = stbl.get('stts').valueAsBytes();
        const sampleDurationCount = stts.data.getInt32(1 * 4, false);
        const sampleDurations = [];
        for(let i = 0; i < sampleDurationCount; i++) {
          const count = stts.data.getInt32((2 + i * 2) * 4, false);
          const time = stts.data.getInt32((2 + i * 2 + 1) * 4, false);
          for(let j = 0; j < count; j++) {
            sampleDurations.push(time);
          }
        }

        let compSampleTimes: null | number[] = null;
        if(stbl.getAll('ctts').length > 0) {
          const ctts = stbl.get('ctts').valueAsBytes();
          const compSampleTimeCount = ctts.data.getInt32(1 * 4, false);
          compSampleTimes = [];
          for(let i = 0; i < compSampleTimeCount; i++) {
            const count = ctts.data.getInt32((2 + i * 2) * 4, false);
            const offset = ctts.data.getInt32((2 + i * 2 + 1) * 4, false);
            for(let j = 0; j < count; j++) {
              compSampleTimes.push(offset);
            }
          }
        }

        const stco = stbl.get('stco').valueAsBytes();
        const chunkCount = stco.data.getInt32(1 * 4, false);
        const chunkOffsets = [];
        for(let i = 0; i < chunkCount; i++) {
          chunkOffsets.push(stco.data.getInt32((2 + i) * 4, false));
        }

        const stsc = stbl.get('stsc').valueAsBytes();
        const sampleToChunkCount = stsc.data.getInt32(1 * 4, false);
        const groupings = [];
        for(let i = 0, chunkIndex = 0; i < sampleToChunkCount; i++) {
          const firstChunk = stsc.data.getInt32((2 + i * 3) * 4, false);
          const samplesPerChunk = stsc.data.getInt32(
            (2 + i * 3 + 1) * 4,
            false
          );
          const sampleDescriptionIndex = stsc.data.getInt32(
            (2 + i * 3 + 2) * 4,
            false
          );

          groupings.push([
            firstChunk,
            samplesPerChunk,
            sampleDescriptionIndex
          ] as const);
        }

        const traf_ = new Boxes([]);

        const tfhdWriter = new DataViewWriter(2 * 4);
        tfhdWriter.writeUint32BE(0);
        tfhdWriter.writeUint32BE(trackId);
        const tfhd_ = tfhdWriter.data;
        traf_.push(new Box('tfhd', tfhd_));

        const tfdtWriter = new DataViewWriter(2 * 4);
        tfdtWriter.writeUint32BE(0);
        tfdtWriter.writeUint32BE(this.decodeTimeOffset);
        const tfdt_ = tfhdWriter.data;
        traf_.push(new Box('tfdt', tfdt_));

        let nextGroupingIdx = 0;
        let samplesPerChunk = 0;
        let sampleIdx = 0;
        for(let chunkIdx = 0; chunkIdx < chunkCount; chunkIdx++) {
          if(
            groupings[nextGroupingIdx] &&
            groupings[nextGroupingIdx][0] === chunkIdx + 1
          ) {
            samplesPerChunk = groupings[nextGroupingIdx][1];

            nextGroupingIdx += 1;
          }

          const samplesEndIdx = Math.min(
            groupings[nextGroupingIdx] ?
              groupings[nextGroupingIdx][0] - 1 :
              sampleCount,
            sampleIdx + samplesPerChunk
          );

          const trunWriter = new DataViewWriter(
            (1 + 1 + 1 + 3 * (samplesEndIdx - sampleIdx)) * 4
          );
          const TRUN_FLAGS_DATA_OFFSET = 0x1;
          const TRUN_FLAGS_DURATION = 0x100;
          const TRUN_FLAGS_SIZE = 0x200;
          const TRUN_FLAGS_CTS_OFFSET = 0x800;
          trunWriter.writeUint32BE(
            TRUN_FLAGS_DATA_OFFSET |
              TRUN_FLAGS_DURATION |
              TRUN_FLAGS_SIZE |
              TRUN_FLAGS_CTS_OFFSET
          );
          trunWriter.writeInt32BE(samplesEndIdx - sampleIdx);
          trunWriter.writeInt32BE(chunkOffsets[chunkIdx]);
          for(; sampleIdx < samplesEndIdx; sampleIdx++) {
            trunWriter.writeUint32BE(sampleDurations[sampleIdx]);
            trunWriter.writeUint32BE(sampleSize || sampleSizes[sampleIdx]);
            trunWriter.writeUint32BE(compSampleTimes[sampleIdx]);
          }
          const trun_ = trunWriter.data;
          traf_.push(new Box('trun', trun_));
        }

        moof_.push(new Box('traf', traf_));
      }
    });

    const frag = new Boxes([new Box('moof', moof_), orig.get('mdat')]);

    append(frag.toBytes());
  }
}
