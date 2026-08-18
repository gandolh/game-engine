/**
 * The per-frame view record every render pass reads — backend-neutral.
 *
 * Lived in `webgpu/gpu-context.ts` until 2026-08-18; relocated here for the WebGL2
 * migration so the 2D passes (sprite, shadow, static, water, particle, weather, cloud,
 * tint) and the 2D overlay can all name it without importing a backend.
 *
 * TWO DIFFERENT INSTANCES are computed per frame and they are NOT interchangeable —
 * see `endFrame` in the renderer:
 *
 *  - the **clip-space** view handed to GPU passes:
 *      scaleX =  sx * 2 / canvasW      offsetX = ox * 2 / canvasW - 1
 *      scaleY = -sy * 2 / canvasH      offsetY = 1 - oy * 2 / canvasH
 *    `scaleY` is ALREADY NEGATIVE (the Y-flip is baked in) — shaders must not negate
 *    again. The canonical convention, documented identically in every shader, is:
 *      clipX = worldX * scaleX + offsetX
 *      clipY = worldY * scaleY + offsetY
 *
 *  - the **screen-pixel** view handed to the 2D overlay via `applyWorldTransform`:
 *      scaleX = sx, scaleY = sy (BOTH POSITIVE), offsetX = ox, offsetY = oy
 *    No clip-space conversion; a 2D canvas transform wants raw pixel scale.
 *
 * Do not "unify" the two. The sign difference is the difference between a GPU clip
 * transform and a canvas pixel transform.
 */
export interface ViewUniform {
  scaleX: number;
  scaleY: number;
  offsetX: number;
  offsetY: number;

  /** Seconds since page load, for shader animation (`performance.now() / 1000`). */
  timeSec: number;

  /** Gust multiplier for sway/weather: `1.0 + 0.15 * sin(timeSec * 0.37)`. */
  windStrength: number;
}
