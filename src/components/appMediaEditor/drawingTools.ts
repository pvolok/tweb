import {MEDIA_EDITOR_CLASSNAME} from './appMediaEditor';
import {DrawingTool} from './changes';

import penImg from './images/pen.svg?raw';
import arrowImg from './images/arrow.svg?raw';
import brushImg from './images/brush.svg?raw';
import neonImg from './images/neon.svg?raw';
import blurImg from './images/blur.svg?raw';
import eraserImg from './images/eraser.svg?raw';

const TOOL_NAMES: Record<DrawingTool, string> = {
  pen: 'Pen',
  arrow: 'Arrow',
  // brush: 'Brush',
  // neon: 'Neon',
  blur: 'Blur',
  eraser: 'Eraser'
};

const TOOL_IMGS: Record<DrawingTool, string> = {
  pen: penImg,
  arrow: arrowImg,
  // brush: brushImg,
  // neon: neonImg,
  blur: blurImg,
  eraser: eraserImg
};

export default class DrawingTools {
  container: HTMLElement;

  private currentTool: DrawingTool;
  private toolDivs: Record<DrawingTool, HTMLElement>;

  private onToolSelect: (tool: DrawingTool) => void;

  constructor(options: {onToolSelect: (tool: DrawingTool) => void}) {
    this.container = document.createElement('div');

    this.onToolSelect = options.onToolSelect;

    const constructToolSelect = (tool: DrawingTool) => {
      const div = document.createElement('div');
      div.classList.add(MEDIA_EDITOR_CLASSNAME + '-drawing-tool');
      div.addEventListener('click', () => {
        this.onToolSelect(tool);
        this.setTool(tool);
      });

      const imgContainer = document.createElement('div');
      imgContainer.innerHTML = TOOL_IMGS[tool];
      imgContainer.classList.add(MEDIA_EDITOR_CLASSNAME + '-drawing-tool-img');
      div.append(imgContainer);

      const nameDiv = document.createElement('div');
      nameDiv.innerText = TOOL_NAMES[tool];
      nameDiv.classList.add(MEDIA_EDITOR_CLASSNAME + '-drawing-tool-name');
      div.append(nameDiv);

      this.container.append(div);

      return div;
    };
    this.toolDivs = {
      pen: constructToolSelect('pen'),
      arrow: constructToolSelect('arrow'),
      // brush: constructToolSelect('brush'),
      // neon: constructToolSelect('neon'),
      blur: constructToolSelect('blur'),
      eraser: constructToolSelect('eraser')
    };

    this.setTool('pen');
  }

  private setTool(tool: DrawingTool) {
    if(this.currentTool) {
      this.toolDivs[this.currentTool].classList.remove('current');
    }
    this.currentTool = tool;
    this.toolDivs[tool].classList.add('current');
  }
}
