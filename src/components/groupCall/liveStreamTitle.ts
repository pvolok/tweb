/*
 * https://github.com/morethanwords/tweb
 * Copyright (C) 2019-2021 Eduard Kuzmenko
 * https://github.com/morethanwords/tweb/blob/master/LICENSE
 */

import setInnerHTML from '../../helpers/dom/setInnerHTML';
import {GroupCall} from '../../layer';
import LiveStreamInstance from '../../lib/calls/liveStreamInstance';
import wrapEmojiText from '../../lib/richTextProcessor/wrapEmojiText';
import PeerTitle from '../peerTitle';

export default class LiveStreamTitleElement {
  private peerTitle: PeerTitle;

  constructor(private appendTo: HTMLElement) {
    this.peerTitle = new PeerTitle({peerId: 0});
  }

  public update(instance: LiveStreamInstance) {
    const {peerTitle, appendTo} = this;
    const groupCall = instance.groupCall as GroupCall.groupCall;
    const peerId = instance.chatId.toPeerId(true);
    if(groupCall?.title) {
      setInnerHTML(appendTo, wrapEmojiText(groupCall.title));
    } else {
      if(peerTitle.options.peerId !== peerId) {
        peerTitle.options.peerId = peerId;
        peerTitle.update();
      }

      if(peerTitle.element.parentElement !== appendTo) {
        appendTo.append(peerTitle.element);
      }
    }
  }
}
