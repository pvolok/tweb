import { copy } from "../../helpers/object";
import type { DialogFilter, Update } from "../../layer";
import type { Modify } from "../../types";
import type { AppPeersManager } from "../appManagers/appPeersManager";
import type { AppUsersManager } from "../appManagers/appUsersManager";
//import type { ApiManagerProxy } from "../mtproto/mtprotoworker";
import type _$rootScope from "../rootScope";
import type {Dialog} from '../appManagers/appMessagesManager';
import apiManager from "../mtproto/mtprotoworker";

export type MyDialogFilter = Modify<DialogFilter, {
  pinned_peers: number[],
  include_peers: number[],
  exclude_peers: number[],
  orderIndex?: number
}>;

// ! because 0 index is 'All Chats'
const START_ORDER_INDEX = 1;

export default class FiltersStorage {
  public filters: {[filterID: string]: MyDialogFilter} = {};
  public orderIndex = START_ORDER_INDEX;

  constructor(private appPeersManager: AppPeersManager, private appUsersManager: AppUsersManager, /* private apiManager: ApiManagerProxy, */ private $rootScope: typeof _$rootScope) {
    $rootScope.$on('apiUpdate', (e) => {
      this.handleUpdate(e.detail);
    });
  }

  public handleUpdate(update: Update) {
    switch(update._) {
      case 'updateDialogFilter': {
        //console.log('updateDialogFilter', update);

        if(update.filter) {
          this.saveDialogFilter(update.filter as any);
        } else if(this.filters[update.id]) { // Папка удалена
          //this.getDialogFilters(true);
          this.$rootScope.$broadcast('filter_delete', this.filters[update.id]);
          delete this.filters[update.id];
        }

        break;
      }

      case 'updateDialogFilters': {
        //console.warn('updateDialogFilters', update);

        const oldFilters = copy(this.filters);

        this.getDialogFilters(true).then(filters => {
          for(const _filterID in oldFilters) {
            const filterID = +_filterID;
            if(!filters.find(filter => filter.id == filterID)) { // * deleted
              this.handleUpdate({_: 'updateDialogFilter', id: filterID});
            }
          }

          this.handleUpdate({_: 'updateDialogFilterOrder', order: filters.map(filter => filter.id)});
        });

        break;
      }

      case 'updateDialogFilterOrder': {
        //console.log('updateDialogFilterOrder', update);

        this.orderIndex = START_ORDER_INDEX;
        update.order.forEach((filterID, idx) => {
          const filter = this.filters[filterID];
          delete filter.orderIndex;
          this.setOrderIndex(filter);
        });

        this.$rootScope.$broadcast('filter_order', update.order);
        
        break;
      }
    }
  }

  public testDialogForFilter(dialog: Dialog, filter: MyDialogFilter) {
    // exclude_peers
    for(const peerID of filter.exclude_peers) {
      if(peerID == dialog.peerID) {
        return false;
      }
    }

    // include_peers
    for(const peerID of filter.include_peers) {
      if(peerID == dialog.peerID) {
        return true;
      }
    }

    const pFlags = filter.pFlags;

    // exclude_archived
    if(pFlags.exclude_archived && dialog.folder_id == 1) {
      return false;
    }

    // exclude_read
    if(pFlags.exclude_read && !dialog.unread_count) {
      return false;
    }

    // exclude_muted
    if(pFlags.exclude_muted) {
      const isMuted = (dialog.notify_settings?.mute_until * 1000) > Date.now();
      if(isMuted) {
        return false;
      }
    }

    const peerID = dialog.peerID;
    if(peerID < 0) {
      // broadcasts
      if(pFlags.broadcasts && this.appPeersManager.isBroadcast(peerID)) {
        return true;
      }

      // groups
      if(pFlags.groups && this.appPeersManager.isAnyGroup(peerID)) {
        return true;
      }
    } else {
      // bots
      if(this.appPeersManager.isBot(peerID)) {
        return !!pFlags.bots;
      }
      
      // non_contacts
      if(pFlags.non_contacts && !this.appUsersManager.contactsList.has(peerID)) {
        return true;
      }

      // contacts
      if(pFlags.contacts && this.appUsersManager.contactsList.has(peerID)) {
        return true;
      }
    }

    return false;
  }

  public toggleDialogPin(peerID: number, filterID: number) {
    const filter = this.filters[filterID];

    const wasPinned = filter.pinned_peers.findAndSplice(p => p == peerID);
    if(!wasPinned) {
      filter.pinned_peers.unshift(peerID);
    }
    
    return this.updateDialogFilter(filter);
  }

  public createDialogFilter(filter: MyDialogFilter) {
    let maxID = Math.max(1, ...Object.keys(this.filters).map(i => +i));
    filter = copy(filter);
    filter.id = maxID + 1;
    return this.updateDialogFilter(filter);
  }

  public updateDialogFilter(filter: MyDialogFilter, remove = false) {
    const flags = remove ? 0 : 1;

    return apiManager.invokeApi('messages.updateDialogFilter', {
      flags,
      id: filter.id,
      filter: remove ? undefined : this.getOutputDialogFilter(filter)
    }).then((bool: boolean) => { // возможно нужна проверка и откат, если результат не ТРУ
      //console.log('updateDialogFilter bool:', bool);

      if(bool) {
        /* if(!this.filters[filter.id]) {
          this.saveDialogFilter(filter);
        }

        $rootScope.$broadcast('filter_update', filter); */

        this.handleUpdate({
          _: 'updateDialogFilter',
          id: filter.id,
          filter: remove ? undefined : filter as any
        });
      }

      return bool;
    });
  }

  public getOutputDialogFilter(filter: MyDialogFilter) {
    const c: MyDialogFilter = copy(filter);
    ['pinned_peers', 'exclude_peers', 'include_peers'].forEach(key => {
      // @ts-ignore
      c[key] = c[key].map((peerID: number) => this.appPeersManager.getInputPeerByID(peerID));
    });

    c.include_peers.forEachReverse((peerID, idx) => {
      if(c.pinned_peers.includes(peerID)) {
        c.include_peers.splice(idx, 1);
      }
    });

    return c as any as DialogFilter;
  }

  public async getDialogFilters(overwrite = false): Promise<MyDialogFilter[]> {
    const keys = Object.keys(this.filters);
    if(keys.length && !overwrite) {
      return keys.map(filterID => this.filters[filterID]).sort((a, b) => a.orderIndex - b.orderIndex);
    }

    const filters: MyDialogFilter[] = await apiManager.invokeApi('messages.getDialogFilters') as any;
    for(const filter of filters) {
      this.saveDialogFilter(filter, overwrite);
    }

    //console.log(this.filters);
    return filters;
  }

  public saveDialogFilter(filter: MyDialogFilter, update = true) {
    ['pinned_peers', 'exclude_peers', 'include_peers'].forEach(key => {
      // @ts-ignore
      filter[key] = filter[key].map((peer: any) => this.appPeersManager.getPeerID(peer));
    });

    filter.include_peers.forEachReverse((peerID, idx) => {
      if(filter.pinned_peers.includes(peerID)) {
        filter.include_peers.splice(idx, 1);
      }
    });
    
    filter.include_peers = filter.pinned_peers.concat(filter.include_peers);

    if(this.filters[filter.id]) {
      Object.assign(this.filters[filter.id], filter);
    } else {
      this.filters[filter.id] = filter;
    }

    this.setOrderIndex(filter);

    if(update) {
      this.$rootScope.$broadcast('filter_update', filter);
    }
  }

  public setOrderIndex(filter: MyDialogFilter) {
    if(filter.hasOwnProperty('orderIndex')) {
      if(filter.orderIndex >= this.orderIndex) {
        this.orderIndex = filter.orderIndex + 1;
      }
    } else {
      filter.orderIndex = this.orderIndex++;
    }
  }
}