import {DrawingTool, Layer, Layers, Scene, SceneDrawing, SceneEvent, SceneEvents} from './changes';

type Segment = {
  path: Array<{x: number, y: number}>;
  tool: DrawingTool;
};

export default class Drawing {
  private tool: DrawingTool;

  private auxLayer: Layer<'2d'>;

  constructor(private layers: Layers, private events: SceneEvents) {
    this.tool = 'pen';

    const auxCanvas = document.createElement('canvas');
    this.auxLayer = {canvas: auxCanvas, ctx: auxCanvas.getContext('2d')};
  }

  setTool(tool: DrawingTool) {
    this.tool = tool;
  }

  onMouseDown(coords: {x: number, y: number}) {
    this.events.push({_: 'draw', tool: this.tool, path: [coords]});
  }

  onDrag(coords: {x: number, y: number}) {
    const latestEvent = this.events.latest();
    if(latestEvent && latestEvent._ === 'draw') {
      latestEvent.path.push(coords);
    }
  }

  render(scene: Scene) {
    for(const segment of scene.drawings) {
      this.renderSegment(segment);
    }
  }

  private renderSegment(segment: SceneDrawing) {
    let ctx;
    if(segment.tool === 'blur') {
      ctx = this.auxLayer.ctx;
      const {width, height} = this.layers.picture.canvas;
      this.auxLayer.canvas.width = width;
      this.auxLayer.canvas.height = height;
      ctx.clearRect(0, 0, width, height);
    } else {
      ctx = this.layers.drawing.ctx;
    }
    ctx.save();

    const path = segment.path;
    ctx.beginPath();
    ctx.strokeStyle = '#ff07ff';
    ctx.lineWidth = 20;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.moveTo(path[0].x, path[0].y);

    for(let i = 0; i < path.length; ++i) {
      ctx.lineTo(path[i].x, path[i].y);
    }

    if(segment.tool === 'eraser') {
      ctx.globalCompositeOperation = 'destination-out';
    }

    ctx.stroke();

    if(segment.tool === 'arrow') {
      const last = segment.path.at(-1);
      const prev = segment.path[Math.max(0, segment.path.length - 10)];
      const angle = Math.atan2(last.y - prev.y, last.x - prev.x);

      ctx.save();

      ctx.translate(last.x, last.y);

      ctx.rotate(angle);
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.lineTo(-40, -40);
      ctx.stroke();

      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.lineTo(-40, 40);
      ctx.stroke();

      ctx.restore();
    }

    if(segment.tool === 'blur') {
      ctx.globalCompositeOperation = 'source-atop';
      ctx.filter = `blur(${10}px)`;
      ctx.drawImage(this.layers.picture.canvas, 0, 0);
      ctx.drawImage(this.layers.drawing.canvas, 0, 0);
      this.layers.drawing.ctx.drawImage(this.auxLayer.canvas, 0, 0);
    }
    ctx.restore();
  }
}
