/**
 * GL call counters for the shared profiler (corpus brief 05): draw calls, instances drawn, texture bytes
 * uploaded and textures created, for any WebGL2 context.
 *
 * `installGlCounters` wraps the context's own methods (an instance property in front of the prototype's),
 * so both renderers and every pass are counted without each call site knowing. It is installed only when
 * profiling is on; without it the context is untouched and costs nothing. `uninstall()` restores it.
 */

/** Counts kept for the frame in progress, reset by `frameReset()`. */
export interface GlFrameCounts {
  drawCalls: number;
  instances: number;
  textureBytes: number;
}

/** Totals since the counters were installed. */
export interface GlTotals {
  drawCalls: number;
  textureBytes: number;
  textureUploads: number;
  texturesCreated: number;
}

export interface GlCounters {
  readonly frame: GlFrameCounts;
  readonly totals: GlTotals;
  frameReset(): void;
  uninstall(): void;
}

type AnyFn = (...args: unknown[]) => unknown;

/** Bytes per pixel for a `format` and `type` pair. Packed 16-bit types are 2 bytes a pixel. */
export function bytesPerPixel(gl: WebGL2RenderingContext, format: number, type: number): number {
  if (type === gl.UNSIGNED_SHORT_5_6_5 || type === gl.UNSIGNED_SHORT_4_4_4_4 || type === gl.UNSIGNED_SHORT_5_5_5_1) {
    return 2;
  }
  if (type === gl.UNSIGNED_INT_2_10_10_10_REV || type === gl.UNSIGNED_INT_24_8) return 4;
  let channels = 4;
  if (format === gl.RGB || format === gl.RGB_INTEGER) channels = 3;
  else if (format === gl.RG || format === gl.RG_INTEGER || format === gl.LUMINANCE_ALPHA) channels = 2;
  else if (
    format === gl.RED ||
    format === gl.RED_INTEGER ||
    format === gl.ALPHA ||
    format === gl.LUMINANCE ||
    format === gl.DEPTH_COMPONENT
  ) {
    channels = 1;
  }
  let size = 1;
  if (type === gl.FLOAT || type === gl.INT || type === gl.UNSIGNED_INT) size = 4;
  else if (type === gl.HALF_FLOAT || type === gl.SHORT || type === gl.UNSIGNED_SHORT) size = 2;
  return channels * size;
}

/** Width and height of an image source (bitmap, canvas, image, image data or video frame). */
function sourceSize(source: unknown): { w: number; h: number } {
  if (typeof source !== "object" || source === null) return { w: 0, h: 0 };
  const s = source as {
    naturalWidth?: number;
    naturalHeight?: number;
    displayWidth?: number;
    displayHeight?: number;
    videoWidth?: number;
    videoHeight?: number;
    width?: number;
    height?: number;
  };
  const w = s.naturalWidth ?? s.displayWidth ?? s.videoWidth ?? s.width ?? 0;
  const h = s.naturalHeight ?? s.displayHeight ?? s.videoHeight ?? s.height ?? 0;
  return { w: Number(w) || 0, h: Number(h) || 0 };
}

/**
 * Bytes a `texImage2D` call uploads. Two shapes: `(target, level, internalformat, format, type, source)`
 * and `(target, level, internalformat, width, height, border, format, type, …)`.
 */
export function texImage2DBytes(gl: WebGL2RenderingContext, args: readonly unknown[]): number {
  if (args.length === 6) {
    const { w, h } = sourceSize(args[5]);
    return w * h * bytesPerPixel(gl, Number(args[3]), Number(args[4]));
  }
  const w = Number(args[3]) || 0;
  const h = Number(args[4]) || 0;
  return w * h * bytesPerPixel(gl, Number(args[6]), Number(args[7]));
}

/**
 * Bytes a `texSubImage2D` call uploads. Two shapes: `(target, level, x, y, format, type, source)` and
 * `(target, level, x, y, width, height, format, type, …)`.
 */
export function texSubImage2DBytes(gl: WebGL2RenderingContext, args: readonly unknown[]): number {
  if (args.length === 7) {
    const { w, h } = sourceSize(args[6]);
    return w * h * bytesPerPixel(gl, Number(args[4]), Number(args[5]));
  }
  const w = Number(args[4]) || 0;
  const h = Number(args[5]) || 0;
  return w * h * bytesPerPixel(gl, Number(args[6]), Number(args[7]));
}

const DRAW_METHODS = ["drawArrays", "drawElements", "drawRangeElements"] as const;
const INSTANCED_METHODS = { drawArraysInstanced: 3, drawElementsInstanced: 4 } as const;

/** Wraps the context's draw and texture-upload methods to count them. */
export function installGlCounters(gl: WebGL2RenderingContext): GlCounters {
  const frame: GlFrameCounts = { drawCalls: 0, instances: 0, textureBytes: 0 };
  const totals: GlTotals = { drawCalls: 0, textureBytes: 0, textureUploads: 0, texturesCreated: 0 };
  const target = gl as unknown as Record<string, AnyFn>;
  const originals = new Map<string, AnyFn>();

  const wrap = (name: string, count: (args: unknown[]) => void): void => {
    const original = target[name];
    if (typeof original !== "function") return;
    originals.set(name, original);
    target[name] = function counted(this: unknown, ...args: unknown[]): unknown {
      count(args);
      return original.apply(gl, args);
    };
  };

  for (const name of DRAW_METHODS) {
    wrap(name, () => {
      frame.drawCalls += 1;
      frame.instances += 1;
      totals.drawCalls += 1;
    });
  }
  for (const [name, countIndex] of Object.entries(INSTANCED_METHODS)) {
    wrap(name, (args) => {
      frame.drawCalls += 1;
      frame.instances += Number(args[countIndex]) || 0;
      totals.drawCalls += 1;
    });
  }
  wrap("texImage2D", (args) => {
    const bytes = texImage2DBytes(gl, args);
    frame.textureBytes += bytes;
    totals.textureBytes += bytes;
    totals.textureUploads += 1;
  });
  wrap("texSubImage2D", (args) => {
    const bytes = texSubImage2DBytes(gl, args);
    frame.textureBytes += bytes;
    totals.textureBytes += bytes;
    totals.textureUploads += 1;
  });
  wrap("createTexture", () => {
    totals.texturesCreated += 1;
  });

  return {
    frame,
    totals,
    frameReset(): void {
      frame.drawCalls = 0;
      frame.instances = 0;
      frame.textureBytes = 0;
    },
    uninstall(): void {
      for (const name of originals.keys()) delete target[name];
      originals.clear();
    },
  };
}
