/*
 * https://github.com/morethanwords/tweb
 * Copyright (C) 2019-2021 Eduard Kuzmenko
 * https://github.com/morethanwords/tweb/blob/master/LICENSE
 */

import PopupElement from './index';

export default class RtmpStart extends PopupElement {
  constructor(peerId: PeerId) {
    super('popup-rtmp-start', {
      overlayClosable: true,
      closable: true,
      body: true,
      title: 'VideoCall'
    });

    const urlDiv = document.createElement('div');
    this.body.append(urlDiv);
    const keyDiv = document.createElement('div');
    this.body.append(keyDiv);
    this.managers.appGroupCallsManager.getRtmpUrl(peerId).then(credentials => {
      urlDiv.innerText = credentials.url;
      keyDiv.innerText = credentials.key;
    });
  }
}
