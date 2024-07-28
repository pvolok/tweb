import findUpClassName from '../../helpers/dom/findUpClassName';
import {MyDocument} from '../../lib/appManagers/appDocsManager';
import {AppManagers} from '../../lib/appManagers/managers';
import wrapSticker from '../wrappers/sticker';

const MEDIA_EDITOR_STICKERS_CLASSNAME = 'media-editor-stickers';

type Category = {
  div: HTMLElement;
  thumbs: HTMLElement[];
};

export default class MediaEditorStickers {
  private managers: AppManagers;

  container: HTMLElement;
  categoriesDiv: HTMLElement;
  categories: Category[];

  constructor(managers: AppManagers, onSticker: (sticker: HTMLImageElement | HTMLCanvasElement) => void) {
    this.managers = managers;

    this.container = document.createElement('div');

    this.categoriesDiv = document.createElement('div');
    this.container.append(this.categoriesDiv);

    this.container.addEventListener('click', (event) => {
      const stickerDiv = findUpClassName(event.target, MEDIA_EDITOR_STICKERS_CLASSNAME + '-sticker');
      if(stickerDiv) {
        const child = stickerDiv.firstElementChild;
        if(child.tagName === 'CANVAS' || child.tagName === 'IMG') {
          onSticker(child as any);
        }
      }
    });

    this.loadStickers();
  }

  private async loadStickers() {
    const stickers = await this.managers.appStickersManager.getAllStickers();

    for(const stickerSet of stickers.sets) {
      const category: Category = {
        div: document.createElement('div'),
        thumbs: []
      };
      category.div.classList.add(MEDIA_EDITOR_STICKERS_CLASSNAME + '-category');
      this.categoriesDiv.append(category.div);

      const titleDiv = document.createElement('div');
      titleDiv.classList.add(MEDIA_EDITOR_STICKERS_CLASSNAME + '-category-title');
      titleDiv.innerText = stickerSet.short_name;
      category.div.append(titleDiv);

      const thumbsDiv = document.createElement('div');
      thumbsDiv.classList.add(MEDIA_EDITOR_STICKERS_CLASSNAME + '-thumbs');
      category.div.append(thumbsDiv);
      for(let i = 0; i < stickerSet.count; ++i) {
        const div = document.createElement('div');
        div.classList.add(MEDIA_EDITOR_STICKERS_CLASSNAME + '-sticker');
        thumbsDiv.append(div);
        category.thumbs.push(div);
      }

      this.managers.appStickersManager.getStickerSet(stickerSet).then(stickers => {
        const docs = stickers.documents as MyDocument[];
        for(let i = 0; i < category.thumbs.length && i < docs.length; ++i) {
          const doc = docs[i];
          wrapSticker({doc, div: category.thumbs[i]});
        }
      });
    }
  }
}
