import {MyDocument} from '../../lib/appManagers/appDocsManager';

export type Layer<ContextType extends 'webgl' | '2d'> = {
  canvas: HTMLCanvasElement;
  ctx: ContextType extends 'webgl' ? WebGLRenderingContext : CanvasRenderingContext2D;
}

export type Layers = {
  picture: Layer<'webgl'>;
  drawing: Layer<'2d'>;
}

export type ToolsTab = 'filters' | 'crop' | 'text' | 'draw' | 'stickers';

export type MediaPoint = {x: number, y: number};

export type MediaFilter =
  | 'enhance'
  | 'brightness'
  | 'contrast'
  | 'saturation'
  | 'warmth'
  | 'fade'
  | 'highlights'
  | 'shadow'
  | 'vignette'
  | 'grain'
  | 'sharpen';

export type DrawingTool = 'pen' | 'arrow' /* | 'brush' | 'neon' */ | 'blur' | 'eraser';

export type CurrentTool =
  | {_: 'none'}
  | {_: 'transform'}
  | {_: 'text', change: MediaTextChange}
  | {_: 'draw', tool: DrawingTool};

export type MediaTextChange = {_: 'text', id: number, lines: SceneTextLine[], pos: MediaPoint, fontSize: number, color: string};

export type SceneEventTransform = {_: 'transform', id: number, scale: number, angle: number};

export type SceneEvent =
  | {_: 'filter', filter: MediaFilter, value: number}
  | {_: 'crop', topLeft: MediaPoint, bottomRight: MediaPoint}
  | {_: 'rotate', angle: number}
  | {_: 'flip'}
  | MediaTextChange
  | {_: 'draw', tool: DrawingTool, path: MediaPoint[]}
  | {_: 'sticker', id: number, sticker: HTMLCanvasElement | HTMLImageElement, pos: MediaPoint, size: MediaPoint}
  | {_: 'move', id: number, x: number, y: number}
  | SceneEventTransform;

export class SceneEvents {
  private events: SceneEvent[] = [];
  private length = 0;

  iter() {
    return this.events.slice(0, this.length);
  }

  latest() {
    return this.events[this.length - 1];
  }

  push(event: SceneEvent) {
    this.events.length = this.length;
    this.events.push(event);
    this.length = this.events.length;
  }

  undo() {
    if(this.events.length === 0) {
      return;
    }
    this.length = Math.max(0, this.length - 1);
  }

  redo() {
    this.length = Math.min(this.events.length, this.length + 1);
  }
}

export type SceneDrawing = {
  tool: DrawingTool;
  path: MediaPoint[];
};

export type SceneObject = {
  id: number;
  obj: SceneText | SceneSticker;
}

export type SceneText = {
  _: 'text',
  lines: SceneTextLine[];
  font: string;
  color: string;
  fontSize: number;
  pos: MediaPoint;
  scale: number;
  angle: number;
};

export type SceneTextLine = {
  text: string;
  width: number;
  height: number;
};

export type SceneSticker = {
  _: 'sticker';
  sticker: HTMLCanvasElement | HTMLImageElement,
  pos: MediaPoint;
  scale: number;
  angle: number;
};

export type Scene = {
  image: HTMLCanvasElement | HTMLImageElement;
  angle: number;
  flip: boolean,
  filters: Partial<Record<MediaFilter, number>>;
  drawings: SceneDrawing[];
  objects: SceneObject[];
};
