import type { LoadedAtlasImage } from "../assets/loader";
import { Camera2D } from "./camera";

export interface Canvas2dSprite {
  x: number;
  y: number;
  width: number;
  height: number;
  frame: string;
  rotation: number;
  layer: number;
  alpha: number;
}

export class Canvas2dRenderer {
  readonly camera: Camera2D;
  private readonly ctx: CanvasRenderingContext2D;
  private readonly canvas: HTMLCanvasElement;
  private atlas: LoadedAtlasImage | null = null;
  private queue: Canvas2dSprite[] = [];

  constructor(canvas: HTMLCanvasElement, camera: Camera2D) {
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Failed to acquire 2d canvas context");
    ctx.imageSmoothingEnabled = false;
    this.ctx = ctx;
    this.canvas = canvas;
    this.camera = camera;
  }

  setAtlas(atlas: LoadedAtlasImage): void {
    this.atlas = atlas;
  }

  beginFrame(): void {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const desiredW = Math.max(1, Math.floor(this.canvas.clientWidth * dpr));
    const desiredH = Math.max(1, Math.floor(this.canvas.clientHeight * dpr));
    if (this.canvas.width !== desiredW || this.canvas.height !== desiredH) {
      this.canvas.width = desiredW;
      this.canvas.height = desiredH;
    }
    this.queue = [];
  }

  push(sprite: Canvas2dSprite): void {
    this.queue.push(sprite);
  }

  endFrame(): void {
    if (!this.atlas) return;

    const { ctx, canvas, camera } = this;
    const bitmap = this.atlas.bitmap;

    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = "#0c0d12";
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    const sx = canvas.width / camera.worldUnitsX;
    const sy = canvas.height / camera.worldUnitsY;
    const left = camera.centerX - camera.worldUnitsX / 2;
    const top = camera.centerY - camera.worldUnitsY / 2;
    ctx.setTransform(sx, 0, 0, sy, -left * sx, -top * sy);
    ctx.imageSmoothingEnabled = false;

    const indexed = this.queue.map((s, i) => ({ s, i }));
    indexed.sort((a, b) => a.s.layer !== b.s.layer ? a.s.layer - b.s.layer : a.i - b.i);

    for (const { s } of indexed) {
      ctx.globalAlpha = s.alpha;
      const r = this.atlas!.frameRect(s.frame);
      if (s.rotation !== 0) {
        ctx.save();
        ctx.translate(s.x, s.y);
        ctx.rotate(s.rotation);
        ctx.drawImage(bitmap, r.x, r.y, r.w, r.h, -s.width / 2, -s.height / 2, s.width, s.height);
        ctx.restore();
      } else {
        ctx.drawImage(bitmap, r.x, r.y, r.w, r.h, s.x - s.width / 2, s.y - s.height / 2, s.width, s.height);
      }
    }

    ctx.globalAlpha = 1;
  }
}
