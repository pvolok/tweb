export class Box {
  name: string;
  value: BoxValue;

  constructor(name: string, value: BoxValue) {
    this.name = name;
    this.value = value;
  }

  valueAsBoxes(): Boxes {
    if(!(this.value instanceof Boxes)) {
      throw new Error();
    }
    return this.value;
  }

  valueAsBytes(): DataViewReader {
    if(!(this.value instanceof DataViewReader)) {
      throw new Error();
    }
    return this.value;
  }

  serialize(writer: DataViewWriter) {
    const lengthOffset = writer.offset;
    writer.offset += 4;

    writer.writeAsciiStr(this.name);

    const value = this.value;
    if(value instanceof DataViewReader) {
      writer.writeBuffer(value.data);
    } else if(ArrayBuffer.isView(value)) {
      writer.writeBuffer(value);
    } else if(value instanceof Boxes) {
      for(const box of value.boxes) {
        box.serialize(writer);
      }
    } else {
      throw new Error('Unexpected box value: ' + String(value));
    }

    const len = writer.offset - lengthOffset;
    new DataView(
      writer.data.buffer,
      writer.data.byteOffset + lengthOffset,
      4
    ).setUint32(0, len);
  }

  getByteSize(): number {
    const value = this.value;
    let valueSize;
    if(value instanceof DataViewReader) {
      valueSize = value.data.byteLength;
    } else if(value instanceof Boxes) {
      valueSize = value.boxes.reduce((acc, box) => acc + box.getByteSize(), 0);
    } else if(ArrayBuffer.isView(value)) {
      valueSize = value.byteLength;
    } else {
      throw new Error('Unexpected box value: ' + String(value));
    }

    return 8 + valueSize;
  }
}

export class Boxes {
  boxes: Box[];

  static parse(data: ArrayBufferView) {
    const reader = new DataViewReader(
      new DataView(data.buffer, data.byteOffset, data.byteLength)
    );

    const boxes = new Boxes([]);
    while(reader.hasData()) {
      const len = reader.readUint32BE();
      const name = reader.readAsciiStr(4);
      const value = reader.readSlice(len - 8);

      let val: any = value;
      switch(name) {
        case 'moov':
        case 'trak': // moov
        case 'edts': // moov/trak
        case 'mdia': // moov/trak
        case 'minf': // moov/trak/mdia
        case 'dinf': // moov/trak/mdia/minf
        case 'stbl': // moov/trak/mdia/minf
        case 'mvex': // moov
        case 'udta': // moov
        case 'moof':
        case 'traf': // moof
          val = Boxes.parse(value.data);
          break;
        default:
        // val = value.data.buffer.slice(
        //   value.data.byteOffset,
        //   value.data.byteOffset + value.data.byteLength
        // );
      }

      boxes.push(new Box(name, val));
    }

    return boxes;
  }

  constructor(boxes: Box[]) {
    this.boxes = boxes;
  }

  get(name: string): Box {
    // TODO: null check
    return this.boxes.find((b) => b.name === name);
  }

  getAll(name: string): Box[] {
    return this.boxes.filter((b) => b.name === name);
  }

  push(box: Box) {
    this.boxes.push(box);
  }

  toBytes(): Uint8Array {
    const size = this.boxes.reduce((acc, box) => acc + box.getByteSize(), 0);
    const writer = new DataViewWriter(size);

    this.serialize(writer);

    return new Uint8Array(
      writer.data.buffer,
      writer.data.byteOffset,
      writer.data.byteLength
    );
  }

  private serialize(writer: DataViewWriter) {
    for(const box of this.boxes) {
      box.serialize(writer);
    }

    return writer.data;
  }
}

type BoxValue = DataViewReader | ArrayBufferView | Boxes;

export class DataViewWriter {
  data: DataView;
  offset: number = 0;

  constructor(size: number) {
    this.data = new DataView(new ArrayBuffer(size));
  }

  writeBuffer(buffer: ArrayBufferView) {
    const bytes = new Uint8Array(
      buffer.buffer,
      buffer.byteOffset,
      buffer.byteLength
    );
    new Uint8Array(
      this.data.buffer,
      this.data.byteOffset,
      this.data.byteLength
    ).set(bytes, this.offset);
    this.offset += buffer.byteLength;
  }

  writeAsciiStr(str: string) {
    for(let i = 0; i < str.length; i++) {
      const byte = str.charCodeAt(i);
      if(byte > 127) {
        throw new Error('DataViewWriter.writeAsciiStr expects ASCII string.');
      }
      this.writeUint8(byte);
    }
  }

  writeUint8(byte: number) {
    this.data.setUint8(this.offset, byte);
    this.offset += 1;
  }

  writeInt32BE(value: number) {
    this.data.setInt32(this.offset, value, false);
    this.offset += 4;
  }

  writeUint32BE(value: number) {
    this.data.setUint32(this.offset, value, false);
    this.offset += 4;
  }
}

export class DataViewReader {
  data: DataView;
  offset: number = 0;

  constructor(data: DataView) {
    this.data = data;
  }

  hasData() {
    return this.offset < this.data.byteLength;
  }

  cloneBytes() {
    const data = this.data;
    return new DataView(data.buffer, data.byteOffset, data.byteLength);
  }

  get DEBUG_DATA() {
    return this.data.buffer.slice(
      this.data.byteOffset,
      this.data.byteOffset + this.data.byteLength
    );
  }

  readInt32LE() {
    const value = this.data.getInt32(this.offset, true);
    this.offset += 4;
    return value;
  }

  readUint32BE() {
    const value = this.data.getUint32(this.offset, false);
    this.offset += 4;
    return value;
  }

  readUint32LE() {
    const value = this.data.getUint32(this.offset, true);
    this.offset += 4;
    return value;
  }

  readUint8() {
    const value = this.data.getUint8(this.offset);
    this.offset += 1;
    return value;
  }

  readAsciiStr(len: number) {
    const bytes = new Uint8Array(
      this.data.buffer,
      this.data.byteOffset + this.offset,
      len
    );
    this.offset += len;
    return String.fromCharCode(...bytes);
  }

  readTgStr() {
    const len = this.readUint8();
    if(len == 254) {
      throw new Error('readStr len=254');
    }
    const str = this.readAsciiStr(len);

    const remainder = (1 + len) % 4;
    if(remainder > 0) {
      this.offset += 4 - remainder;
    }

    return str;
  }

  readSlice(len: number) {
    const reader = new DataViewReader(
      new DataView(this.data.buffer, this.data.byteOffset + this.offset, len)
    );
    this.offset += len;
    return reader;
  }
}
