import EventListenerBase from '../../helpers/eventListenerBase';
import safeAssign from '../../helpers/object/safeAssign';
import {GroupCall} from '../../layer';
import {AppManagers} from '../appManagers/managers';
import GROUP_CALL_STATE from './groupCallState';

export type LiveStreamId = string | number;

export default class LiveStreamInstance extends EventListenerBase<{
  state: (state: GROUP_CALL_STATE) => void,
}> {
  public id: LiveStreamId;
  public chatId: ChatId;
  public groupCall: GroupCall;

  private managers: AppManagers;

  constructor(options: {
    id: LiveStreamInstance['id'],
    chatId: LiveStreamInstance['chatId'],
    managers: AppManagers
  }) {
    super();

    safeAssign(this, options);

    this.addEventListener('state', (state) => {
      //
    });
  }

  public async hangUp(discard = false, rejoin = false, isDiscarded = false) {
    //
  }
}
