import findUpClassName from '../../helpers/dom/findUpClassName';
import EventListenerBase from '../../helpers/eventListenerBase';
import ColorPicker from '../colorPicker';
import {MEDIA_EDITOR_CLASSNAME} from './appMediaEditor';

const COLORS = [
  '#ffffff',
  '#fe4438',
  '#ff8901',
  '#ffd60a',
  '#33c759',
  '#62e5e0',
  '#0a84ff',
  '#bd5cf3'
];

export default class Colors extends EventListenerBase<{
  pick: (color: string) => void
}> {
  container: HTMLElement;
  buttons: HTMLElement[] = [];

  private colorPicker: ColorPicker;

  private colorIndex = 0;

  constructor() {
    super();

    this.container = document.createElement('div');

    const colorsDiv = document.createElement('div');
    colorsDiv.classList.add(MEDIA_EDITOR_CLASSNAME + '-colors');
    this.container.append(colorsDiv);

    const pickerDiv = document.createElement('div');
    pickerDiv.classList.add(MEDIA_EDITOR_CLASSNAME + '-colors-picker');
    this.container.append(pickerDiv);

    this.colorPicker = new ColorPicker();
    pickerDiv.append(this.colorPicker.container);
    this.colorPicker.onChange = color => {
      this.dispatchEvent('pick', color.rgb);
    };

    for(let i = 0; i < COLORS.length; ++i) {
      const color = COLORS[i];
      const circle = document.createElement('div');
      circle.classList.add(MEDIA_EDITOR_CLASSNAME + '-colors-circle');
      circle.style.background = color + '0f';
      circle.dataset['colorIndex'] = String(i);
      colorsDiv.append(circle);
      this.buttons.push(circle);

      const inner = document.createElement('div');
      inner.classList.add(MEDIA_EDITOR_CLASSNAME + '-colors-circle-inner');
      inner.style.background = color;
      circle.append(inner);
    }
    {
      const circle = document.createElement('div');
      circle.classList.add(MEDIA_EDITOR_CLASSNAME + '-colors-circle');
      circle.style.background = '#ffffff0f';
      circle.dataset['colorIndex'] = String(COLORS.length);
      colorsDiv.append(circle);
      this.buttons.push(circle);

      const inner = document.createElement('img');
      inner.src = 'assets/img/colors.png';
      inner.classList.add(MEDIA_EDITOR_CLASSNAME + '-colors-circle-inner2');
      circle.append(inner);
    }

    this.container.addEventListener('click', e => {
      const circle = findUpClassName(e.target, MEDIA_EDITOR_CLASSNAME + '-colors-circle');
      if(circle) {
        const index = parseInt(circle.dataset['colorIndex']) || 0;
        this.selectIndex(index);
        this.dispatchEvent('pick', this.getCurrentColor());
      }
    });

    this.selectIndex(0);
  }

  getCurrentColor() {
    return COLORS[this.colorIndex] || this.colorPicker.getCurrentColor().rgb;
  }

  private selectIndex(index: number) {
    this.buttons[this.colorIndex].classList.remove('selected');
    this.buttons[index].classList.add('selected');
    this.colorIndex = index;

    this.colorPicker.container.style.display = index === COLORS.length ? '' : 'none';
  }
}
