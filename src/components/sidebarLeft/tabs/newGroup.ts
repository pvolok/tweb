import appSidebarLeft, { AppSidebarLeft } from "..";
import { InputFile } from "../../../layer";
import appChatsManager from "../../../lib/appManagers/appChatsManager";
import appDialogsManager from "../../../lib/appManagers/appDialogsManager";
import appUsersManager from "../../../lib/appManagers/appUsersManager";
import { SearchGroup } from "../../appSearch";
import Button from "../../button";
import InputField from "../../inputField";
import PopupAvatar from "../../popups/avatar";
import Scrollable from "../../scrollable";
import { SliderTab } from "../../slider";

export default class AppNewGroupTab implements SliderTab {
  private container = document.querySelector('.new-group-container') as HTMLDivElement;
  private contentDiv = this.container.querySelector('.sidebar-content') as HTMLDivElement;
  private canvas = this.container.querySelector('.avatar-edit-canvas') as HTMLCanvasElement;
  private searchGroup = new SearchGroup(' ', 'contacts', true, 'new-group-members disable-hover', false);
  private uploadAvatar: () => Promise<InputFile> = null;
  private userIds: number[];
  private nextBtn: HTMLButtonElement;
  private groupNameInputField: InputField;
  
  constructor() {
    this.container.querySelector('.avatar-edit').addEventListener('click', () => {
      new PopupAvatar().open(this.canvas, (_upload) => {
        this.uploadAvatar = _upload;
      });
    });

    const inputWrapper = document.createElement('div');
    inputWrapper.classList.add('input-wrapper');

    this.groupNameInputField = new InputField({
      label: 'Group Name',
      maxLength: 128
    });

    inputWrapper.append(this.groupNameInputField.container);

    this.groupNameInputField.input.addEventListener('input', () => {
      const value = this.groupNameInputField.value;
      this.nextBtn.classList.toggle('is-visible', !!value.length && !this.groupNameInputField.input.classList.contains('error'));
    });

    this.nextBtn = Button('btn-corner btn-circle', {icon: 'next'});

    this.nextBtn.addEventListener('click', () => {
      const title = this.groupNameInputField.value;

      this.nextBtn.disabled = true;
      appChatsManager.createChat(title, this.userIds).then((chatId) => {
        if(this.uploadAvatar) {
          this.uploadAvatar().then((inputFile) => {
            appChatsManager.editPhoto(chatId, inputFile);
          });
        }
        
        appSidebarLeft.selectTab(0);
      });
    });

    const chatsContainer = document.createElement('div');
    chatsContainer.classList.add('chatlist-container');
    chatsContainer.append(this.searchGroup.container);

    const scrollable = new Scrollable(chatsContainer);

    this.contentDiv.append(inputWrapper, chatsContainer, this.nextBtn);
  }

  public onClose() {

  }

  public onCloseAfterTimeout() {
    this.searchGroup.clear();

    const ctx = this.canvas.getContext('2d');
    ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);

    this.uploadAvatar = null;
    this.groupNameInputField.value = '';
    this.nextBtn.disabled = false;
    this.searchGroup.clear();
  }

  public init(userIds: number[]) {
    this.userIds = userIds;

    appSidebarLeft.selectTab(AppSidebarLeft.SLIDERITEMSIDS.newGroup);
    this.userIds.forEach(userId => {
      let {dom} = appDialogsManager.addDialogNew({
        dialog: userId,
        container: this.searchGroup.list,
        drawStatus: false,
        rippleEnabled: false,
        avatarSize: 48
      });

      let subtitle = '';
      subtitle = appUsersManager.getUserStatusString(userId);
      if(subtitle == 'online') {
        subtitle = `<i>${subtitle}</i>`;
      }

      if(subtitle) {
        dom.lastMessageSpan.innerHTML = subtitle;
      }
    });

    this.searchGroup.nameEl.innerText = this.userIds.length + ' members';
    this.searchGroup.setActive();
  }
}