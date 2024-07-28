import {logger} from '../../lib/logger';
import rootScope from '../../lib/rootScope';
import findUpClassName from '../../helpers/dom/findUpClassName';
import renderImageFromUrl from '../../helpers/dom/renderImageFromUrl';
import EventListenerBase from '../../helpers/eventListenerBase';
import {AppManagers} from '../../lib/appManagers/managers';
import RangeSelector from '../rangeSelector';
import MediaEditorStickerTools from './stickerTools';
import {TextAnnotation} from './annotation';
import Drawing from './drawing';
import TextTools from './textTools';
import {CurrentTool, Layer, Layers, MediaFilter, Scene, SceneEvent, SceneEvents, SceneText, ToolsTab} from './changes';
import DrawingTools from './drawingTools';
import ListenerSetter from '../../helpers/listenerSetter';

import crossImg from './images/cross.svg?raw';
import cropImg  from './images/crop.svg?raw';
import drawImg  from './images/draw.svg?raw';
import filtersImg  from './images/filters.svg?raw';
import redoImg from './images/redo.svg?raw';
import stickersImg  from './images/stickers.svg?raw';
import textImg  from './images/text.svg?raw';
import undoImg from './images/undo.svg?raw';
import cancelEvent from '../../helpers/dom/cancelEvent';

export const MEDIA_EDITOR_CLASSNAME = 'media-editor';

const TAB_NAMES: Record<ToolsTab, string> = {
  filters: 'Filters',
  crop: 'Crop',
  text: 'Text',
  draw: 'Draw',
  stickers: 'Stickers'
};

const TAB_IMGS: Record<ToolsTab, string> = {
  filters: filtersImg,
  crop: cropImg,
  text: textImg,
  draw: drawImg,
  stickers: stickersImg
};

const FILTERS = {
  enhance: {name: 'Enhance (TODO)', min: 0},
  brightness: {name: 'Brightness', min: -100},
  contrast: {name: 'Contrast', min: -100},
  saturation: {name: 'Saturation', min: -100},
  warmth: {name: 'Warmth', min: -100},
  fade: {name: 'Fade', min: 0},
  highlights: {name: 'Highlights', min: -100},
  shadow: {name: 'Shadow', min: -100},
  vignette: {name: 'Vignette (TODO)', min: 0},
  grain: {name: 'Grain (TODO)', min: 0},
  sharpen: {name: 'Sharpen (TODO)', min: 0}
};

export default class AppMediaEditor extends EventListenerBase<{
  close: () => void,
  confirm: (blob: Blob) => void,
}> {
  private mainDiv: HTMLElement;
  private leftDiv: HTMLElement;
  private mediaDiv: HTMLElement;
  private tabContainer: HTMLElement;

  private layers: Layers;
  private scene: Scene;
  private sceneEvents: SceneEvents;

  private currentTool: CurrentTool;

  private currentTab: ToolsTab;
  private tabs: Record<ToolsTab, HTMLElement>;
  private tabBodies: Partial<Record<ToolsTab, HTMLElement>> = {};

  private log: ReturnType<typeof logger>;

  private listenerSetter: ListenerSetter;
  private managers: AppManagers;
  private closing: boolean;

  private filters: Record<keyof typeof FILTERS, FilterRange>;
  private renderer: MediaRenderer;
  private cropBar: CropBar;
  private drawing: Drawing;
  private annotation: TextAnnotation;
  private drawingTools: DrawingTools;

  constructor(protected imageFile: HTMLImageElement) {
    super(false);

    this.listenerSetter = new ListenerSetter();
    this.managers = rootScope.managers;

    this.log = logger('AME');

    this.scene = {
      image: imageFile,
      filters: {},
      angle: 0,
      flip: false,
      drawings: [],
      objects: []
    };
    this.sceneEvents = new SceneEvents();

    const mainDiv = document.createElement('div');
    mainDiv.tabIndex = 0;
    mainDiv.classList.add(MEDIA_EDITOR_CLASSNAME);
    this.mainDiv = mainDiv;

    this.leftDiv = document.createElement('div');
    this.leftDiv.classList.add(MEDIA_EDITOR_CLASSNAME + '-left');

    const rightDiv = document.createElement('div');
    rightDiv.classList.add(MEDIA_EDITOR_CLASSNAME + '-right');

    mainDiv.append(this.leftDiv, rightDiv);

    // * media
    this.mediaDiv = document.createElement('div');
    this.mediaDiv.classList.add(MEDIA_EDITOR_CLASSNAME + '-media');
    this.leftDiv.append(this.mediaDiv);

    let dragging: {x: number, y: number} = null;
    this.mediaDiv.addEventListener('mousedown', (event) => {
      const onMouseUp = () => {
        dragging = null;
        window.removeEventListener('mouseup', onMouseUp);
      }
      window.addEventListener('mouseup', onMouseUp);

      const rect = (event.currentTarget as HTMLElement).getBoundingClientRect();
      const canvas = this.layers.picture.canvas;
      const x = (event.clientX - rect.left) / canvas.offsetWidth * canvas.width;
      const y = (event.clientY - rect.top) / canvas.offsetHeight * canvas.height;

      dragging = {x, y};

      // for(const annotation of this.annotations) {
      //   annotation.handleMouseDown({x, y});
      // }
      if(this.currentTab === 'text' || this.currentTab === 'stickers') {
        this.annotation.handleMouseDown({x, y}, this.scene);
        this.render();
      } else if(this.currentTab === 'draw') {
        this.drawing.onMouseDown({x, y});
        this.render();
      }
    });
    this.mediaDiv.addEventListener('mousemove', (event) => {
      const rect = (event.currentTarget as HTMLElement).getBoundingClientRect();
      const canvas = this.layers.picture.canvas;
      const x = (event.clientX - rect.left) / canvas.offsetWidth * canvas.width;
      const y = (event.clientY - rect.top) / canvas.offsetHeight * canvas.height;

      if(this.currentTab === 'text' || this.currentTab === 'stickers') {
        this.annotation.handleMouseMove({x, y}, this.scene);
        this.render();
      } else if(this.currentTab === 'draw') {
        if(dragging) {
          dragging.x = x;
          dragging.y = y;
          this.drawing.onDrag({x, y});
          this.render();
        }
      }
    });
    this.mediaDiv.addEventListener('mouseup', (event) => {
      const rect = (event.currentTarget as HTMLElement).getBoundingClientRect();
      const canvas = this.layers.picture.canvas;
      const x = (event.clientX - rect.left) / canvas.offsetWidth * canvas.width;
      const y = (event.clientY - rect.top) / canvas.offsetHeight * canvas.height;

      if(this.currentTab === 'text' || this.currentTab === 'stickers') {
        this.annotation.handleMouseUp({x, y});
      }
    });

    const pictureCanvas = document.createElement('canvas');
    pictureCanvas.classList.add(MEDIA_EDITOR_CLASSNAME + '-canvas');
    const drawingCanvas = document.createElement('canvas');
    drawingCanvas.classList.add(MEDIA_EDITOR_CLASSNAME + '-canvas');
    this.mediaDiv.append(pictureCanvas, drawingCanvas);
    this.layers = {
      picture: {canvas: pictureCanvas, ctx: pictureCanvas.getContext('webgl', {preserveDrawingBuffer: true})},
      drawing: {canvas: drawingCanvas, ctx: drawingCanvas.getContext('2d')}
    };

    // * crop
    this.cropBar = new CropBar(this.listenerSetter, this.sceneEvents);
    this.cropBar.addEventListener('rotate', (angle) => {
      const event = this.sceneEvents.latest();
      if(event && event._ === 'rotate') {
        event.angle = angle;
      } else {
        this.sceneEvents.push({_: 'rotate', angle});
      }
      this.render();
    });
    this.leftDiv.append(this.cropBar.container);

    // * tools

    const topButtons = document.createElement('div');
    topButtons.classList.add(MEDIA_EDITOR_CLASSNAME + '-top');
    rightDiv.append(topButtons);

    const topLeft = document.createElement('div');
    topLeft.classList.add(MEDIA_EDITOR_CLASSNAME + '-top-left');
    topButtons.append(topLeft);

    const closeButton = document.createElement('div');
    closeButton.innerHTML = crossImg;
    closeButton.addEventListener('click', () => this.dispatchEvent('close'));
    topLeft.append(closeButton);

    const editTitle = document.createElement('div');
    editTitle.classList.add(MEDIA_EDITOR_CLASSNAME + '-edit-title');
    editTitle.innerText = 'Edit';
    topLeft.append(editTitle);

    const topRight = document.createElement('div');
    topRight.classList.add(MEDIA_EDITOR_CLASSNAME + '-top-right');
    topButtons.append(topRight);

    const undoButton = document.createElement('div');
    undoButton.innerHTML = undoImg;
    undoButton.addEventListener('click', () => {
      this.sceneEvents.undo();
      this.render();
    });
    topRight.append(undoButton);

    const redoButton = document.createElement('div');
    redoButton.innerHTML = redoImg;
    redoButton.addEventListener('click', () => {
      this.sceneEvents.redo();
      this.render();
    });
    topRight.append(redoButton);

    const tabsDiv = document.createElement('div');
    tabsDiv.classList.add(MEDIA_EDITOR_CLASSNAME + '-tabs');

    const constructTab = (tab: ToolsTab) => {
      const tabDiv = document.createElement('div');
      tabDiv.classList.add(MEDIA_EDITOR_CLASSNAME + '-tab');
      tabDiv.innerHTML = TAB_IMGS[tab];
      tabDiv.addEventListener('click', () => {
        this.setTab(tab);
      });
      tabsDiv.append(tabDiv);
      return tabDiv;
    };
    this.tabs = {
      filters: constructTab('filters'),
      crop: constructTab('crop'),
      text: constructTab('text'),
      draw: constructTab('draw'),
      stickers: constructTab('stickers')
    }
    rightDiv.append(tabsDiv);

    this.tabContainer = document.createElement('div');
    this.tabContainer.classList.add(MEDIA_EDITOR_CLASSNAME + '-tab-container');
    rightDiv.append(this.tabContainer);

    const confirmBtn = document.createElement('button');
    confirmBtn.classList.add('btn-circle', 'btn-corner');
    confirmBtn.style.transform = 'translateZ(0)';
    confirmBtn.addEventListener('click', async() => {
      const img = new Image();

      const target = document.createElement('canvas');
      const ctx = target.getContext('2d');
      const {width, height} = this.layers.picture.canvas;
      target.height = height;
      target.width = width;

      ctx.drawImage(this.layers.picture.canvas, 0, 0);
      ctx.drawImage(this.layers.drawing.canvas, 0, 0);

      const blob = await new Promise<Blob>((rs) => {
        target.toBlob((blob) => rs(blob));
      });

      this.dispatchEvent('confirm', blob);
    });
    rightDiv.append(confirmBtn);

    const confirmIcon = document.createElement('span');
    confirmIcon.classList.add('tgico');
    confirmIcon.innerHTML = '&#xe900;';
    confirmBtn.append(confirmIcon);

    // * constructing html end

    this.renderer = new MediaRenderer(this.layers.picture);

    this.drawing = new Drawing(this.layers, this.sceneEvents);
    this.annotation = new TextAnnotation(this.layers.drawing, this.scene, this.sceneEvents);
    this.drawingTools = new DrawingTools({onToolSelect: (tool) => {
      this.drawing.setTool(tool);
    }});

    this.listenerSetter.add(document.body)('keydown', (e) => this.onKeyDown(e), {capture: true});

    this.setTab('filters');
    this.mainDiv.focus();
    this.render();
  }

  private onKeyDown = (e: KeyboardEvent) => {
    if(this.currentTab === 'text' || this.currentTab === 'stickers') {
      this.annotation.handleKey(e.key);
      this.render();
    }
    cancelEvent(e);
  };

  private setTab(tab: ToolsTab) {
    if(this.currentTab === tab) {
      return;
    }

    if(this.currentTab) {
      this.leftDiv.classList.remove('crop');

      this.tabs[this.currentTab].classList.remove('current');
      this.tabBodies[this.currentTab].remove();
    }

    this.annotation.setCurrentTab(tab);

    this.currentTab = tab;
    this.tabs[tab].classList.add('current');
    const tabBody = this.getOrCreateTabBody(tab);
    this.tabContainer.append(tabBody);

    if(tab === 'crop') {
      this.leftDiv.classList.add('crop');
    }
  }

  private getOrCreateTabBody(tab: ToolsTab) {
    if(this.tabBodies[tab]) {
      return this.tabBodies[tab];
    }

    const tabBody = document.createElement('div');

    switch(tab) {
      case 'filters': {
        const filtersDiv = document.createElement('div');
        filtersDiv.classList.add(MEDIA_EDITOR_CLASSNAME + '-filters');

        const createFilter = (filter: MediaFilter) => {
          const {name, min} = FILTERS[filter];
          const range = new FilterRange({name, min});
          range.setHandlers({
            onChange: (value) => {
              const event = this.sceneEvents.latest();
              if(event && event._ === 'filter' && event.filter === filter) {
                event.value = value;
              } else {
                this.sceneEvents.push({_: 'filter', filter, value});
              }
              this.render();
            }
          });
          filtersDiv.append(range.container);
          return range;
        };
        this.filters = {
          enhance: createFilter('enhance'),
          brightness: createFilter('brightness'),
          contrast: createFilter('contrast'),
          saturation: createFilter('saturation'),
          warmth: createFilter('warmth'),
          fade: createFilter('fade'),
          highlights: createFilter('highlights'),
          shadow: createFilter('shadow'),
          vignette: createFilter('vignette'),
          grain: createFilter('grain'),
          sharpen: createFilter('sharpen')
        };

        tabBody.append(filtersDiv);
        break;
      }
      case 'crop': {
        break;
      }
      case 'text': {
        const textTools = new TextTools();
        textTools.addEventListener('setFontSize', size => {
          this.annotation.setFontSize(size);
          this.render();
        });
        textTools.addEventListener('setColor', color => {
          this.annotation.setTextColor(color);
          this.render();
        });
        tabBody.append(textTools.container);
        break;
      }
      case 'draw': {
        tabBody.append(this.drawingTools.container);
        break;
      }
      case 'stickers': {
        const stickers = new MediaEditorStickerTools(this.managers, (sticker) => {
          this.annotation.addSticker(sticker);
          this.render();
        });
        tabBody.append(stickers.container);
        break;
      }
      default:
        tab satisfies never;
    }

    this.tabBodies[tab] = tabBody;
    return tabBody;
  }

  public attachTo(container: HTMLElement) {
    container.append(this.mainDiv);
  }

  public detach() {
    this.mainDiv.parentElement.removeChild(this.mainDiv);
    super.cleanup();
    this.listenerSetter.removeAll();
  }

  private render() {
    const imageWidth = this.imageFile.naturalWidth;
    const imageHeight = this.imageFile.naturalHeight;
    this.mediaDiv.style.maxWidth = (imageWidth /* / devicePixelRatio */) + 'px';
    this.mediaDiv.style.aspectRatio = imageWidth + ' / ' + imageHeight;
    this.layers.picture.canvas.width = imageWidth;
    this.layers.picture.canvas.height = imageHeight;
    this.layers.drawing.canvas.width = imageWidth;
    this.layers.drawing.canvas.height = imageHeight;

    this.replayEvents();

    this.renderer.render(this.scene);

    this.layers.drawing.ctx.clearRect(0, 0, imageWidth, imageHeight);
    this.drawing.render(this.scene);
    this.annotation.render(this.scene);
  }

  private replayEvents() {
    const scene = this.scene;

    scene.filters = {};

    scene.angle = 0;
    scene.flip = false;
    scene.drawings.length = 0;
    scene.objects.length = 0;

    for(const event of this.sceneEvents.iter()) {
      switch(event._) {
        case 'filter':
          scene.filters[event.filter] = event.value;
          break;
        case 'rotate':
          scene.angle = event.angle;
          break;
        case 'draw':
          scene.drawings.push({
            tool: event.tool,
            path: event.path
          });
          break;
        case 'text':
          const object = scene.objects.find(o => o.id === event.id);
          const obj: SceneText = {
            _: 'text',
            lines: event.lines,
            font: 'Roboto',
            fontSize: event.fontSize,
            color: event.color,
            pos: {...event.pos},
            angle: object ? object.obj.angle : 0,
            scale: object ? object.obj.scale : 1
          };
          if(object) {
            object.obj = obj;
          } else {
            scene.objects.push({id: event.id, obj});
          }
          break;
        case 'sticker': {
          scene.objects.push({
            id: event.id,
            obj: {
              _: 'sticker',
              sticker: event.sticker,
              pos: event.pos,
              scale: 1,
              angle: 0
            }
          });
          break;
        }
        case 'move': {
          const object = scene.objects.find(o => o.id === event.id);
          if(object) {
            object.obj.pos.x = event.x;
            object.obj.pos.y = event.y;
          }
          break;
        }
        case 'transform': {
          const object = scene.objects.find(o => o.id === event.id);
          if(object) {
            object.obj.angle = event.angle;
            object.obj.scale = event.scale;
          }
        }
      }
    }

    this.cropBar.setAngle(scene.angle);
  }
}

const FILTER_RANGE_CLASSNAME = MEDIA_EDITOR_CLASSNAME + '-filter-range';

class FilterRange {
  public container: HTMLElement;
  private valueDiv: HTMLElement;

  private initValue: number = 0;
  public value: number = 0;

  private events: {onChange?: (value: number) => void} = {};

  constructor(options: {name: string, min: number}) {
    this.container = document.createElement('div');
    this.container.classList.add(FILTER_RANGE_CLASSNAME);

    const labelDiv = document.createElement('div');
    labelDiv.classList.add(FILTER_RANGE_CLASSNAME + '-label');

    const nameDiv = document.createElement('div');
    nameDiv.innerText = options.name;
    nameDiv.classList.add(FILTER_RANGE_CLASSNAME + '-name');

    this.valueDiv = document.createElement('div');
    this.valueDiv.classList.add(FILTER_RANGE_CLASSNAME + '-value');
    this.updateValueText();

    labelDiv.append(nameDiv, this.valueDiv);

    const range = new RangeSelector({step: 1, min: options.min, max: 100});
    range.setProgress(this.value);
    range.setListeners();
    range.setHandlers({
      onScrub: (value) => {
        this.value = value;
        this.updateValueText();
        this.events.onChange?.(value);
      }
    });

    this.container.append(labelDiv, range.container);
  }

  private updateValueText() {
    this.valueDiv.innerText = String(this.value);
    if(this.value === this.initValue) {
      this.valueDiv.classList.remove('changed');
    } else {
      this.valueDiv.classList.add('changed');
    }
  }

  setHandlers(events: FilterRange['events']) {
    this.events = events;
  }
}

const vertexShaderCode = `
  attribute vec2 a_position;
  attribute vec2 a_texCoord;
  varying vec2 v_texCoord;

  uniform mat4 u_transform;

  void main() {
    gl_Position = u_transform * vec4(a_position, 0.0, 1.0);
    v_texCoord = a_texCoord;
  }
`;

const fragmentShaderCode = `
  precision mediump float;
  varying vec2 v_texCoord;
  uniform sampler2D u_image;

const mediump vec3 hsLuminanceWeighting = vec3(0.3, 0.3, 0.3);
  const mediump vec3 satLuminanceWeighting = vec3(0.2126, 0.7152, 0.0722);

  uniform lowp float u_brightness;
  uniform lowp float u_contrast;
  uniform lowp float u_saturation;
  uniform lowp float u_warmth;
  uniform lowp float u_fade;
  uniform lowp float u_highlights;
  uniform lowp float u_shadows;

  highp float getLuma(highp vec3 rgbP) {
    return (0.299 * rgbP.r) + (0.587 * rgbP.g) + (0.114 * rgbP.b);
  }

  highp vec3 rgbToYuv(highp vec3 inP) {
    highp float luma = getLuma(inP);
    return vec3(luma, (1.0 / 1.772) * (inP.b - luma), (1.0 / 1.402) * (inP.r - luma));
  }
  lowp vec3 yuvToRgb(highp vec3 inP) {
    return vec3(1.402 * inP.b + inP.r, (inP.r - (0.299 * 1.402 / 0.587) * inP.b - (0.114 * 1.772 / 0.587) * inP.g), 1.772 * inP.g + inP.r);
  }

  highp vec3 fadeAdjust(highp vec3 color, highp float fadeVal) {
    return (color * (1.0 - fadeVal)) + ((color + (vec3(-0.9772) * pow(vec3(color), vec3(3.0)) + vec3(1.708) * pow(vec3(color), vec3(2.0)) + vec3(-0.1603) * vec3(color) + vec3(0.2878) - color * vec3(0.9))) * fadeVal);
  }

  void main() {
    vec4 color = texture2D(u_image, v_texCoord);
    vec4 result = color;

    mediump float hsLuminance = dot(result.rgb, hsLuminanceWeighting);
    mediump float shadow = clamp((pow(hsLuminance, 1.0 / u_shadows) + (-0.76) * pow(hsLuminance, 2.0 / u_shadows)) - hsLuminance, 0.0, 1.0);
    mediump float highlight = clamp((1.0 - (pow(1.0 - hsLuminance, 1.0 / (2.0 - u_highlights)) + (-0.8) * pow(1.0 - hsLuminance, 2.0 / (2.0 - u_highlights)))) - hsLuminance, -1.0, 0.0);
    lowp vec3 hsresult = vec3(0.0, 0.0, 0.0) + ((hsLuminance + shadow + highlight) - 0.0) * ((result.rgb - vec3(0.0, 0.0, 0.0)) / (hsLuminance - 0.0));
    mediump float contrastedLuminance = ((hsLuminance - 0.5) * 1.5) + 0.5;
    mediump float whiteInterp = contrastedLuminance * contrastedLuminance * contrastedLuminance;
    mediump float whiteTarget = clamp(u_highlights, 1.0, 2.0) - 1.0;
    hsresult = mix(hsresult, vec3(1.0), whiteInterp * whiteTarget);
    mediump float invContrastedLuminance = 1.0 - contrastedLuminance;
    mediump float blackInterp = invContrastedLuminance * invContrastedLuminance * invContrastedLuminance;
    mediump float blackTarget = 1.0 - clamp(u_shadows, 0.0, 1.0);
    hsresult = mix(hsresult, vec3(0.0), blackInterp * blackTarget);
    result = vec4(hsresult.rgb, result.a);

    result = vec4(clamp(((result.rgb - vec3(0.5)) * u_contrast + vec3(0.5)), 0.0, 1.0), result.a);

    if (abs(u_fade) > 0.0) {
      result.rgb = fadeAdjust(result.rgb, u_fade);
    }

    lowp float satLuminance = dot(result.rgb, satLuminanceWeighting);
    lowp vec3 greyScaleColor = vec3(satLuminance);
    result = vec4(clamp(mix(greyScaleColor, result.rgb, u_saturation), 0.0, 1.0), result.a);

    if (u_brightness != 0.0) {
      mediump float mag = u_brightness * 1.045;
      mediump float exppower = 1.0 + abs(mag);
      if (mag < 0.0) {
        exppower = 1.0 / exppower;
      }
      result.r = 1.0 - pow((1.0 - result.r), exppower);
      result.g = 1.0 - pow((1.0 - result.g), exppower);
      result.b = 1.0 - pow((1.0 - result.b), exppower);
    }

    if (abs(u_warmth) > 0.0) {
      highp vec3 yuvVec;
      if (u_warmth > 0.0 ) {
        yuvVec = vec3(0.1765, -0.1255, 0.0902);
      } else {
        yuvVec = -vec3(0.0588, 0.1569, -0.1255);
      }
      highp vec3 yuvColor = rgbToYuv(result.rgb);
      highp float luma = yuvColor.r;
      highp float curveScale = sin(luma * 3.14159);
      yuvColor += 0.375 * u_warmth * curveScale * yuvVec;
      result.rgb = yuvToRgb(yuvColor);
    }

    gl_FragColor = result;
  }
`;

class MediaRenderer {
  private canvas: HTMLCanvasElement;
  private gl: WebGLRenderingContext;

  private program;

  private transformLoc: WebGLUniformLocation;

  private positionLoc: number;
  private texCoordLoc: number;
  private imageLoc: WebGLUniformLocation;

  private brightnessLoc;
  private contrastLoc;
  private saturationLoc;
  private warmthLoc;
  private fadeLoc;
  private highlightsLoc;
  private shadowsLoc;

  private texture;

  private positionBuffer;
  private texCoordBuffer;

  constructor(layer: Layer<'webgl'>) {
    this.canvas = layer.canvas;
    const gl = this.gl = layer.ctx;

    const vertexShader = gl.createShader(gl.VERTEX_SHADER);
    gl.shaderSource(vertexShader, vertexShaderCode);
    gl.compileShader(vertexShader);
    if(!gl.getShaderParameter(vertexShader, gl.COMPILE_STATUS)) {
      console.error('Error compiling vertex shader:', gl.getShaderInfoLog(vertexShader));
      return;
    }

    const fragmentShader = gl.createShader(gl.FRAGMENT_SHADER);
    gl.shaderSource(fragmentShader, fragmentShaderCode);
    gl.compileShader(fragmentShader);
    if(!gl.getShaderParameter(fragmentShader, gl.COMPILE_STATUS)) {
      console.error('Error compiling fragment shader:', gl.getShaderInfoLog(fragmentShader));
      return;
    }

    this.program = gl.createProgram();
    gl.attachShader(this.program, vertexShader);
    gl.attachShader(this.program, fragmentShader);
    gl.linkProgram(this.program);
    if(!gl.getProgramParameter(this.program, gl.LINK_STATUS)) {
      console.error('Error linking program:', gl.getProgramInfoLog(this.program));
      return;
    }

    this.transformLoc = gl.getUniformLocation(this.program, 'u_transform');

    this.positionLoc = gl.getAttribLocation(this.program, 'a_position');
    this.texCoordLoc = gl.getAttribLocation(this.program, 'a_texCoord');
    this.imageLoc = gl.getUniformLocation(this.program, 'u_image');

    this.brightnessLoc = gl.getUniformLocation(this.program, 'u_brightness');
    this.contrastLoc = gl.getUniformLocation(this.program, 'u_contrast');
    this.saturationLoc = gl.getUniformLocation(this.program, 'u_saturation');
    this.warmthLoc = gl.getUniformLocation(this.program, 'u_warmth');
    this.fadeLoc = gl.getUniformLocation(this.program, 'u_fade');
    this.highlightsLoc = gl.getUniformLocation(this.program, 'u_highlights');
    this.shadowsLoc = gl.getUniformLocation(this.program, 'u_shadows');

    this.positionBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, this.positionBuffer);
    const positions = [
      -1, -1,
      1, -1,
      -1, 1,
      -1, 1,
      1, -1,
      1, 1
    ];
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(positions), gl.STATIC_DRAW);

    this.texCoordBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, this.texCoordBuffer);
    const texCoords = [
      0, 1,
      1, 1,
      0, 0,
      0, 0,
      1, 1,
      1, 0
    ];
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(texCoords), gl.STATIC_DRAW);

    this.texture = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, this.texture);

    const level = 0;
    const internalFormat = gl.RGBA;
    const width = 1;
    const height = 1;
    const border = 0;
    const srcFormat = gl.RGBA;
    const srcType = gl.UNSIGNED_BYTE;
    const pixel = new Uint8Array([0, 0, 255, 255]); // opaque blue
    gl.texImage2D(gl.TEXTURE_2D, level, internalFormat, width, height, border, srcFormat, srcType, pixel);
  }

  private setSource(source: TexImageSource) {
    const gl = this.gl;
    gl.bindTexture(gl.TEXTURE_2D, this.texture);

    const level = 0;
    const internalFormat = gl.RGBA;
    const srcFormat = gl.RGBA;
    const srcType = gl.UNSIGNED_BYTE;
    gl.texImage2D(gl.TEXTURE_2D, level, internalFormat, srcFormat, srcType, source);

    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);

    gl.viewport(0, 0, this.canvas.width, this.canvas.height);
  }

  render(scene: Scene) {
    const gl = this.gl;
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);

    this.setSource(scene.image);

    gl.bindBuffer(gl.ARRAY_BUFFER, this.positionBuffer);
    gl.vertexAttribPointer(this.positionLoc, 2, gl.FLOAT, false, 0, 0);
    gl.enableVertexAttribArray(this.positionLoc);

    gl.bindBuffer(gl.ARRAY_BUFFER, this.texCoordBuffer);
    gl.vertexAttribPointer(this.texCoordLoc, 2, gl.FLOAT, false, 0, 0);
    gl.enableVertexAttribArray(this.texCoordLoc);

    gl.useProgram(this.program);

    function createTransforMatrix(
      canvasWidth: number,
      canvasHeight: number,
      textureWidth: number,
      textureHeight: number,
      angle: number,
      centerX: number,
      centerY: number
    ) {
      const cos = Math.cos(angle);
      const sin = Math.sin(angle);

      const scaleX = (canvasWidth / textureWidth);
      const scaleY = (canvasHeight / textureHeight);
      const scale = Math.min(scaleX, scaleY);
      const aspect = canvasWidth / canvasHeight;

      const translateX = centerX - textureWidth / 2;
      const translateY = centerY - textureHeight / 2;

      return new Float32Array([
        scale * cos, -scale * sin * aspect, 0.0, 0.0,
        scale * sin / aspect,  scale * cos, 0.0, 0.0,
        0.0,          0.0,         1.0, 0.0,
        translateX * cos - translateY * sin, translateX * sin + translateY * cos,  0.0, 1.0
      ]);
    }
    const transformMaxtrix = createTransforMatrix(
      this.canvas.width,
      this.canvas.height,
      this.canvas.width,
      this.canvas.height,
      scene.angle,
      this.canvas.width / 2,
      this.canvas.height / 2
    );
    gl.uniformMatrix4fv(this.transformLoc, false, transformMaxtrix);

    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.texture);
    gl.uniform1i(this.imageLoc, 0);

    const filters = scene.filters;
    gl.uniform1f(this.brightnessLoc, (filters.brightness ?? 0) / 100);
    gl.uniform1f(this.contrastLoc, ((filters.contrast ?? 0) / 100) * 0.3 + 1);
    let saturation = (filters.saturation ?? 0) / 100;
    if(saturation > 0) {
      saturation *= 1.05;
    }
    gl.uniform1f(this.saturationLoc, saturation + 1);
    gl.uniform1f(this.warmthLoc, (filters.warmth ?? 0) / 100);
    gl.uniform1f(this.fadeLoc, (filters.fade ?? 0) / 100);
    gl.uniform1f(this.highlightsLoc, ((filters.highlights ?? 0) * 0.75 + 100) / 100);
    gl.uniform1f(this.shadowsLoc, ((filters.shadow ?? 0) * 0.55 + 100) / 100);

    gl.drawArrays(gl.TRIANGLES, 0, 6);
  }
}

class CropBar extends EventListenerBase<{
  rotate: (angle: number) => void;
}> {
  static HEIGHT = 40;
  static CONTEXT_PADDING = 40;

  container: HTMLElement;
  private layer: Layer<'2d'>;

  private angle = 0;

  constructor(private listenerSetter: ListenerSetter, private events: SceneEvents) {
    super();

    this.container = document.createElement('div');
    this.container.classList.add(MEDIA_EDITOR_CLASSNAME + '-crop-bar');
    this.container.style.height = CropBar.HEIGHT + 'px';

    const canvas = document.createElement('canvas');
    canvas.classList.add(MEDIA_EDITOR_CLASSNAME + '-crop-bar-canvas');
    canvas.height = CropBar.HEIGHT * devicePixelRatio;
    canvas.style.height = CropBar.HEIGHT + 'px';
    canvas.style.left = CropBar.CONTEXT_PADDING + 'px';
    this.container.append(canvas);
    this.layer = {canvas, ctx: canvas.getContext('2d')};

    this.listenerSetter.add(canvas)('mousedown', (e) => {
      const initAngle = this.angle;
      const initX = e.screenX;
      const onMove = (e: MouseEvent) => {
        const angleDiff = (initX - e.screenX) / 40 * (Math.PI / 180 * 15);
        this.angle = normAngle(initAngle + angleDiff);
        this.render();
        this.dispatchEvent('rotate', this.angle);
      };
      const onUp = (e: MouseEvent) => {
        window.removeEventListener('mousemove', onMove);
        window.removeEventListener('mouseup', onUp);
      };
      window.addEventListener('mousemove', onMove);
      window.addEventListener('mouseup', onUp);
    });

    new ResizeObserver(() => this.resize()).observe(this.container);
  }

  setAngle(angle: number) {
    this.angle = normAngle(angle);
    this.render();
  }

  private resize = () => {
    const canvas = this.layer.canvas;
    canvas.width = (this.container.clientWidth - CropBar.CONTEXT_PADDING * 2) * devicePixelRatio;
    canvas.style.width = (this.container.clientWidth - CropBar.CONTEXT_PADDING * 2) + 'px';
    this.render();
  };

  private render() {
    const ctx = this.layer.ctx;
    const DPR = devicePixelRatio;

    ctx.save();

    ctx.clearRect(0, 0, this.layer.canvas.width, this.layer.canvas.height);

    const width = this.layer.canvas.width / devicePixelRatio;
    const segmentPx = 45;
    const segmentAngle = degToRad(15);
    const shift = -Math.round((this.angle % segmentAngle) / segmentAngle * segmentPx);
    const startSegment = -Math.ceil(width / 2 / segmentPx);
    const endSegment = Math.ceil(width / 2 / segmentPx);
    ctx.fillStyle = '#fff';
    ctx.font = `${12 * devicePixelRatio}px Roboto`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'bottom';
    for(let segment = startSegment; segment <= endSegment; ++segment) {
      const x = width / 2 + shift + segment * segmentPx;
      const curAngle = normAngle(segment * segmentAngle + this.angle - this.angle % segmentAngle);
      ctx.fillText(`${radToDeg(curAngle)}°`, x * devicePixelRatio, 20 * devicePixelRatio);
      ctx.beginPath();
      ctx.ellipse(x * DPR, 30 * DPR, 2 * DPR, 2 * DPR, 0, 0, Math.PI * 2);
      ctx.fill();
    }

    const gradient = ctx.createLinearGradient(0, 0, width * DPR, 0);
    gradient.addColorStop(0, 'rgba(255, 255, 255, 1)');
    gradient.addColorStop(0.5, 'rgba(255, 255, 255, 0)');
    gradient.addColorStop(1, 'rgba(255, 255, 255, 1)');
    ctx.globalCompositeOperation = 'destination-out';
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, width * DPR, CropBar.HEIGHT * DPR);

    ctx.restore();
  }
}

function radToDeg(rad: number) {
  return Math.round(rad * 180 / Math.PI);
}

function degToRad(deg: number) {
  return deg / 180 * Math.PI;
}

function normAngle(angle: number) {
  const a360 = Math.PI * 2;
  angle = angle % a360;
  angle = (angle + a360) % a360;
  if(angle > a360 / 2) {
    angle -= a360;
  }
  return angle;
}
