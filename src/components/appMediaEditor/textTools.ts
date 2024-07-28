import EventListenerBase from '../../helpers/eventListenerBase';
import RangeSelector from '../rangeSelector';
import {MEDIA_EDITOR_CLASSNAME} from './appMediaEditor';
import {DrawingTool} from './changes';
import ColorSelect from './colorSelect';

export default class TextTools extends EventListenerBase<{
  setFontSize: (size: number) => void,
  setColor: (color: string) => void
}> {
  container: HTMLElement;

  constructor() {
    super();

    this.container = document.createElement('div');

    const colors = new ColorSelect();
    colors.addEventListener('pick', color => {
      this.dispatchEvent('setColor', color);
    });
    this.container.append(colors.container);

    const filtersContainer = document.createElement('div');
    filtersContainer.classList.add(MEDIA_EDITOR_CLASSNAME + '-filters');
    this.container.append(filtersContainer);

    const sizeContainer = document.createElement('div');
    sizeContainer.classList.add(MEDIA_EDITOR_CLASSNAME + '-filter-range');
    filtersContainer.append(sizeContainer);

    const sizeLabel = document.createElement('div');
    sizeLabel.classList.add(MEDIA_EDITOR_CLASSNAME + '-filter-range-label')
    sizeContainer.append(sizeLabel);

    const sizeName = document.createElement('div');
    sizeName.innerText = 'Size';
    sizeName.classList.add(MEDIA_EDITOR_CLASSNAME + '-filter-range-name');
    sizeLabel.append(sizeName);

    const sizeValue = document.createElement('div');
    sizeValue.classList.add(MEDIA_EDITOR_CLASSNAME + '-filter-range-value');
    sizeValue.innerText = '24';
    sizeLabel.append(sizeValue);

    const sizeRange = new RangeSelector({step: 1, min: 8, max: 48});
    sizeRange.setProgress(24);
    sizeRange.setListeners();
    sizeRange.setHandlers({
      onScrub: (value) => {
        sizeValue.innerText = String(value);
        this.dispatchEvent('setFontSize', value);
      }
    });
    sizeContainer.append(sizeRange.container);
  }
}

