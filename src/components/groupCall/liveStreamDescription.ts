/*
 * https://github.com/morethanwords/tweb
 * Copyright (C) 2019-2021 Eduard Kuzmenko
 * https://github.com/morethanwords/tweb/blob/master/LICENSE
 */

import {GroupCall} from '../../layer';
import GROUP_CALL_STATE from '../../lib/calls/groupCallState';
import LiveStreamInstance from '../../lib/calls/liveStreamInstance';
import I18n, {LangPackKey, FormatterArguments} from '../../lib/langPack';

export default class LiveStreamDescriptionElement {
  private descriptionIntl: I18n.IntlElement;

  constructor(private appendTo: HTMLElement) {
    this.descriptionIntl = new I18n.IntlElement({
      key: 'VoiceChat.Status.Connecting'
    });

    this.descriptionIntl.element.classList.add('group-call-description');
  }

  public detach() {
    this.descriptionIntl.element.remove();
  }

  public update(instance: LiveStreamInstance) {
    // TODO
    const state: string = 'connected';

    let key: LangPackKey, args: FormatterArguments;
    if(state === 'connecting') {
      key = 'VoiceChat.Status.Connecting';
    } else {
      key = 'VoiceChat.Status.Members';
      args = [(instance.groupCall as GroupCall.groupCall).participants_count];
    }

    const {descriptionIntl} = this;
    descriptionIntl.compareAndUpdate({
      key,
      args
    });

    if(!this.descriptionIntl.element.parentElement) {
      this.appendTo.append(this.descriptionIntl.element);
    }
  }
}
