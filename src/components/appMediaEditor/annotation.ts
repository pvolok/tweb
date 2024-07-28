import {Layer, Scene, SceneEvent, SceneEvents, SceneObject, SceneText, SceneTextLine, ToolsTab} from './changes';

const DPR = window.devicePixelRatio;

type Editing = EditingText | EditingSticker;
type EditingText = {_: 'text', id: number, cursor: number, action?: Move | Resize};
type EditingSticker = {_: 'sticker', id: number, action?: Move | Resize};
type Move = {_: 'move', lastX: number, lastY: number};
type Resize = {_: 'resize', startX: number, startY: number, scale: number, angle: number};

const SPECIAL_KEY_REGEX = /^[0-9a-zA-Z]{2,}$/;

export class TextAnnotation {
  private currentTab: ToolsTab;

  private lastId = 0;
  private editing: Editing;

  fontSize = 24;
  textColor = '#ffffff';

  constructor(private layer: Layer<'2d'>, private scene: Scene, private events: SceneEvents) {
    this.layer = layer;
  }

  setCurrentTab(tab: ToolsTab) {
    this.currentTab = tab;
  }

  setFontSize(size: number) {
    this.fontSize = size;
    if(this.editing && this.editing._ === 'text') {
      const object = this.scene.objects.find(o => o.id === this.editing.id);
      if(object && object.obj._ === 'text') {
        const event = this.events.latest();
        if(event._ === 'text' && event.id === this.editing.id) {
          event.fontSize = size;
        } else {
          this.events.push({
            _: 'text',
            id: this.editing.id,
            color: object.obj.color,
            fontSize: size,
            pos: object.obj.pos,
            lines: object.obj.lines
          });
        }
        this.measureLines(object.obj.lines, size);
      }
    }
  }

  setTextColor(color: string) {
    this.textColor = color;
    if(this.editing && this.editing._ === 'text') {
      const object = this.scene.objects.find(o => o.id === this.editing.id);
      if(object && object.obj._ === 'text') {
        const event = this.events.latest();
        if(event._ === 'text' && event.id === this.editing.id) {
          event.color = color;
        } else {
          this.events.push({
            _: 'text',
            id: this.editing.id,
            color,
            fontSize: object.obj.fontSize,
            pos: object.obj.pos,
            lines: object.obj.lines
          });
        }
      }
    }
  }

  addSticker(sticker: HTMLCanvasElement | HTMLImageElement) {
    const pos = {
      x: Math.floor(this.layer.canvas.width / 2),
      y: Math.floor(this.layer.canvas.height / 2)
    };
    const id = this.lastId++;
    const width = sticker instanceof HTMLImageElement ? sticker.naturalWidth : sticker.width;
    const height = sticker instanceof HTMLImageElement ? sticker.naturalHeight : sticker.height;
    this.events.push({
      _: 'sticker',
      id,
      sticker,
      pos,
      size: {x: width, y: height}
    });
    this.editing = {_: 'sticker', id};
  }

  public measureLines(lines: SceneTextLine[], fontSize: number) {
    const ctx = this.layer.ctx;
    ctx.save();
    ctx.font = fontSize + 'px Roboto';
    for(const line of lines) {
      const measurement = ctx.measureText(line.text);
      line.width = measurement.width;
      line.height = measurement.fontBoundingBoxAscent + measurement.fontBoundingBoxDescent;
    }
    ctx.restore();
  }

  render(scene: Scene) {
    const ctx = this.layer.ctx;

    for(const object of scene.objects) {
      ctx.save();
      this.applyObjectTransformations(object);
      if(object.obj._ === 'text') {
        this.setFontStyle(object.obj);
        const w = Math.max(...object.obj.lines.map(l => l.width));
        const h = object.obj.lines.reduce((acc, l) => acc + l.height, 0);
        let y = -h / 2;
        for(const line of object.obj.lines) {
          const x = -w / 2;
          ctx.fillText(line.text, x, y);
          ctx.strokeText(line.text, x, y);
          y += line.height;
        }

        if(this.editing?._ === 'text' && this.editing.id === object.id) {
          this.renderCursor(object.obj.lines, this.editing.cursor);
        }
      } else if(object.obj._ === 'sticker') {
        const obj = object.obj;
        const width = (obj.sticker as any).naturalWidth || obj.sticker.width;
        const height = (obj.sticker as any).naturalHeight || obj.sticker.height;
        ctx.drawImage(obj.sticker, -width / 2, -height / 2);
      } else {
        object.obj satisfies never;
      }

      ctx.restore();

      if(this.editing) {
        const object = scene.objects.find(o => o.id === this.editing.id);
        if(object) {
          this.renderFrame(object);
        }
      }
    }
  }

  private applyObjectTransformations(object: SceneObject) {
    const ctx = this.layer.ctx;
    const obj = object.obj;
    ctx.translate(obj.pos.x, obj.pos.y);
    ctx.scale(obj.scale, obj.scale);
    ctx.rotate(obj.angle);
  }

  private setFontStyle(obj: SceneText) {
    const ctx = this.layer.ctx;
    ctx.font = obj.fontSize + 'px Roboto';
    ctx.textBaseline = 'top';
    ctx.fillStyle = obj.color;
    ctx.strokeStyle = '#000';
  }

  private renderCursor(lines: SceneTextLine[], cursor: number) {
    const ctx = this.layer.ctx;
    ctx.save();
    let i = 0;
    const x0 = -Math.max(...lines.map(l => l.width)) / 2;
    let y = -lines.reduce((acc, l) => acc + l.height, 0) / 2;
    for(const line of lines) {
      if(i + line.text.length >= cursor) {
        const x = x0 + findOffset(ctx, line.text, cursor - i);
        ctx.beginPath();
        ctx.moveTo(x, y);
        ctx.lineTo(x, y + line.height);
        ctx.strokeStyle = '#fff';
        ctx.lineWidth = DPR;
        ctx.stroke();
        break;
      }
      i += line.text.length + 1;
      y += line.height;
    }
    ctx.restore();
  }

  private renderFrame(object: SceneObject) {
    const obj = object.obj;
    const ctx = this.layer.ctx;
    ctx.save();
    this.applyObjectTransformations(object);
    ctx.setLineDash([2 * DPR, 2 * DPR]);
    ctx.lineWidth = DPR;
    let w, h;
    if(obj._ === 'text') {
      w = Math.max(...obj.lines.map(l => l.width)) + 20;
      h = obj.lines.reduce((acc, line) => acc + line.height, 0) + 20;
    } else {
      w = (obj.sticker as any).naturalWidth || obj.sticker.width;
      h = (obj.sticker as any).naturalHeight || obj.sticker.height;
    }
    ctx.strokeStyle = '#ffffff4d';
    ctx.strokeRect(-w / 2, -h / 2, w, h);

    const corners = [
      {x: -w / 2, y: -h / 2},
      {x: +w / 2, y: -h / 2},
      {x: +w / 2, y: +h / 2},
      {x: -w / 2, y: +h / 2}
    ];
    ctx.lineWidth = 0;
    ctx.fillStyle = '#fff';
    for(const corner of corners) {
      ctx.beginPath();
      ctx.ellipse(corner.x, corner.y, 4 * DPR, 4 * DPR, 0, 0, Math.PI * 2);
      ctx.fill();
    }

    ctx.restore();
  }

  public handleMouseDown(coords: {x: number, y: number}, scene: Scene) {
    const ctx = this.layer.ctx;
    let handled = false;
    if(this.editing) {
      const object = scene.objects.find(o => o.id === this.editing.id);
      if(object) {
        const obj = object.obj;
        let w, h;
        if(obj._ === 'text') {
          w = obj.lines.reduce((acc, line) => acc + line.width, 0) + 20;
          h = obj.lines.reduce((acc, line) => acc + line.height, 0) + 20;
        } else {
          const sticker = obj.sticker;
          w = sticker instanceof HTMLImageElement ? sticker.naturalWidth : sticker.width;
          h = sticker instanceof HTMLImageElement ? sticker.naturalHeight : sticker.height;
        }

        ctx.save();
        (() => {
          ctx.resetTransform();
          this.applyObjectTransformations(object);

          const tlPath = new Path2D();
          tlPath.rect(-w / 2 - 4, -h / 2 - 4, 8, 8);
          if(ctx.isPointInPath(tlPath, coords.x, coords.y)) {
            this.editing.action = {
              _: 'resize',
              startX: coords.x,
              startY: coords.y,
              scale: object.obj.scale,
              angle: object.obj.angle
            };
            handled = true;
            return;
          }

          const trPath = new Path2D();
          trPath.rect(w / 2 - 4, -h / 2 - 4, 8, 8);
          if(ctx.isPointInPath(trPath, coords.x, coords.y)) {
            this.editing.action = {
              _: 'resize',
              startX: coords.x,
              startY: coords.y,
              scale: object.obj.scale,
              angle: object.obj.angle
            };
            handled = true;
            return;
          }

          const brPath = new Path2D();
          brPath.rect(w / 2 - 4, h / 2 - 4, 8, 8);
          if(ctx.isPointInPath(brPath, coords.x, coords.y)) {
            this.editing.action = {
              _: 'resize',
              startX: coords.x,
              startY: coords.y,
              scale: object.obj.scale,
              angle: object.obj.angle
            };
            handled = true;
            return;
          }

          const blPath = new Path2D();
          blPath.rect(-w / 2 - 4, h / 2 - 4, 8, 8);
          if(ctx.isPointInPath(blPath, coords.x, coords.y)) {
            this.editing.action = {
              _: 'resize',
              startX: coords.x,
              startY: coords.y,
              scale: object.obj.scale,
              angle: object.obj.angle
            };
            handled = true;
            return;
          }

          const path = new Path2D();
          path.rect(-w / 2, -h / 2, w, h);
          if(ctx.isPointInPath(path, coords.x, coords.y)) {
            this.editing.action = {_: 'move', lastX: coords.x, lastY: coords.y};
            handled = true;
          }
        })();
        ctx.restore();
      }
    }
    if(!handled) {
      let object;
      for(const target of this.scene.objects) {
        let w, h;
        if(target.obj._ === 'text') {
          w = Math.max(...target.obj.lines.map(l => l.width));
          h = target.obj.lines.reduce((acc, l) => acc + l.height, 0);
        } else {
          const sticker = target.obj.sticker;
          w = sticker instanceof HTMLImageElement ? sticker.naturalWidth : sticker.width;
          h = sticker instanceof HTMLImageElement ? sticker.naturalHeight : sticker.height;
        }
        w *= target.obj.scale;
        h *= target.obj.scale;

        ctx.save();
        this.applyObjectTransformations(target);
        const path = new Path2D();
        path.rect(-w / 2, -h / 2, w, h);
        if(ctx.isPointInPath(path, coords.x, coords.y)) {
          object = target;
          break;
        }
        ctx.restore();
      }

      if(object) {
        const action: Move = {_: 'move', lastX: coords.x, lastY: coords.y};
        if(object.obj._ === 'text') {
          this.editing = {_: 'text', id: object.id, cursor: 0, action};
        } else {
          this.editing = {_: 'sticker', id: object.id, action};
        }
        handled = true;
      }
    }
    if(!handled) {
      if(this.currentTab === 'text') {
        const id = this.lastId++;
        const lines: SceneTextLine[] = [{text: '', width: 0, height: 0}];
        this.measureLines(lines, this.fontSize);
        this.events.push({_: 'text', id, lines, pos: coords, fontSize: this.fontSize, color: this.textColor});
        this.editing = {_: 'text', id, cursor: 0};
      } else {
        this.editing = null;
      }
    }
  }

  public handleMouseUp(coords: {x: number, y: number}) {
    if(this.editing) {
      this.editing.action = null;
    }
  }

  public handleMouseMove(coords: {x: number, y: number}, scene: Scene) {
    const ctx = this.layer.ctx;
    if(this.editing) {
      const object = scene.objects.find(o => o.id === this.editing.id);
      if(object) {
        const obj = object.obj;
        const x = obj.pos.x;
        const y = obj.pos.y;
        let w, h;
        if(obj._ === 'text') {
          w = obj.lines.reduce((acc, line) => acc + line.width, 0);
          h = obj.lines.reduce((acc, line) => acc + line.height, 0);
        } else {
          w = obj.sticker.width;
          h = obj.sticker.height;
        }

        const action = this.editing.action;
        if(action?._ === 'move') {
          ctx.save();

          let event: SceneEvent;
          const prevEvent = this.events.latest();
          const newX = x + (coords.x - action.lastX);
          const newY = y + (coords.y - action.lastY);
          if(prevEvent && prevEvent._ === 'move' && prevEvent.id === this.editing.id) {
            event = prevEvent;
            event.x = newX;
            event.y = newY;
          } else {
            event = {_: 'move', id: this.editing.id, x: newX, y: newY};
            this.events.push(event);
          }

          ctx.restore();

          action.lastX = coords.x;
          action.lastY = coords.y;
        } else if(action?._ === 'resize') {
          ctx.save();

          let event: SceneEvent;
          const prevEvent = this.events.latest();

          const cx = obj.pos.x;
          const cy = obj.pos.y;
          const ax = action.startX - cx;
          const ay = action.startY - cy;
          const bx = coords.x - cx;
          const by = coords.y - cy;

          const newScale = Math.sqrt(bx ** 2 + by ** 2) / Math.sqrt(ax ** 2 + ay ** 2);
          const newAngle = Math.atan2(by, bx) - Math.atan2(ay, ax);

          if(prevEvent && prevEvent._ === 'transform' && prevEvent.id === this.editing.id) {
            event = prevEvent;
            event.scale = newScale;
            event.angle = action.angle + newAngle;
          } else {
            event = {_: 'transform', id: this.editing.id, scale: newScale, angle: newAngle};
            this.events.push(event);
          }

          ctx.restore();
        }
      }
    }

    // this.setFontStyle();
    // if(this.editing._ === 'text') {
    //   const cursor = this.findCursor(text, coords);
    //   if(cursor > -1) {
    //     this.cursor = cursor;
    //   }
    // }
  }

  handleKey(key: string) {
    if(this.editing && this.editing._ === 'text') {
      const object = this.scene.objects.find(o => o.id === this.editing.id);
      if(!object || object.obj._ !== 'text') {
        return;
      }

      let lineOffset = 0;
      for(let lineNo = 0; lineNo < object.obj.lines.length; ++lineNo) {
        const line = object.obj.lines[lineNo];
        if(this.editing.cursor <= lineOffset + line.text.length) {
          if(key === 'Space') {
            key = ' ';
          }

          let newLines: SceneTextLine[] = null;

          if(key === 'ArrowLeft') {
            if(this.editing.cursor > 0) {
              this.editing.cursor -= 1;
            }
          } else if(key === 'ArrowRight') {
            if(this.editing.cursor < lineOffset + line.text.length || lineNo + 1 < object.obj.lines.length) {
              this.editing.cursor += 1;
            }
          } else if(key === 'Enter') {
            const prefix = line.text.slice(0, this.editing.cursor - lineOffset);
            const suffix = line.text.slice(this.editing.cursor - lineOffset);
            newLines = [...object.obj.lines];
            newLines.splice(lineNo, 1, {text: prefix, width: 0, height: 0}, {text: suffix, width: 0, height: 0});

            this.editing.cursor += 1;
          } else if(key === 'Backspace') {
            if(lineOffset === this.editing.cursor && lineOffset > 0) {
              newLines = [...object.obj.lines];
              newLines[lineNo - 1].text = newLines[lineNo - 1].text + line.text;
              newLines.splice(lineNo, 1);

              this.editing.cursor -= 1;
            } else if(lineOffset < this.editing.cursor) {
              const prefix = line.text.slice(0, this.editing.cursor - lineOffset - 1);
              const suffix = line.text.slice(this.editing.cursor - lineOffset);
              const newText = prefix + suffix;
              newLines = [...object.obj.lines];
              newLines.splice(lineNo, 1, {text: newText, width: 0, height: 0});

              this.editing.cursor -= 1;
            }
          } else if(!SPECIAL_KEY_REGEX.test(key)) {
            const prefix = line.text.slice(0, this.editing.cursor - lineOffset);
            const suffix = line.text.slice(this.editing.cursor - lineOffset);
            const newText = prefix + key + suffix;
            newLines = [...object.obj.lines];
            newLines.splice(lineNo, 1, {text: newText, width: 0, height: 0});

            this.editing.cursor += key.length;
          }

          if(newLines) {
            const event = this.events.latest();
            if(event && event._ === 'text' && event.id === this.editing.id) {
              event.lines = newLines;
            } else {
              this.events.push({
                _: 'text',
                id: object.id,
                lines: newLines,
                pos: object.obj.pos,
                fontSize: object.obj.fontSize,
                color: object.obj.color
              });
            }
            this.measureLines(newLines, object.obj.fontSize);
          }

          break;
        }
        lineOffset += line.text.length + 1;
      }
    }
    return false;
  }

  findCursor(text: SceneText, coords: {x: number, y: number}) {
    // TODO: use binary search or measure one char per time
    const x0 = 100;
    let y0 = 0;
    let cursor = 0;
    for(let i = 0; i < text.lines.length; ++i) {
      const line = text.lines[i];
      const left = x0 - line.width / 2;
      const right = x0 + line.width / 2;
      if(left <= coords.x && right >= coords.x) {
        for(let j = 0; j < line.text.length; ++j) {
          const meas = this.layer.ctx.measureText(line.text.slice(0, j));
          if(meas.width > coords.x - left) {
            return cursor + j;
          }
        }
      }
      y0 += line.height;
      cursor += line.text.length;
    }
    return -1;
  }
}

function findOffset(ctx: CanvasRenderingContext2D, text: string, index: number) {
  const measurement = ctx.measureText(text.slice(0, index));
  return measurement.width;
}
