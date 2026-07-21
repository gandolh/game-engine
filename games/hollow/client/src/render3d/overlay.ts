/**
 * The screen-projection glyph/`[T]`-tag overlay (chunk hollow-09c) — a 2D
 * canvas layered above the WebGPU `#scene` canvas (cheaper for a crowd of
 * agents than a DOM node per agent — matches Citadel's overlay idiom, see
 * this brief's header). `app.ts` publishes `getAgentRenderState()`/
 * `getViewProj()` every frame; `main.ts` feeds this module the CURRENT
 * snapshot's per-agent `action`/`needs`/`starving` (not on `AgentRenderState`,
 * which only carries render geometry) alongside that render state, once per
 * rAF frame — see this module's `drawAgentOverlay`.
 *
 * `OverlayCtx` is a narrow structural subset of `CanvasRenderingContext2D`
 * (just the drawing calls this module actually makes) rather than the full
 * DOM type, so `drawAgentOverlay` can be unit-tested against a plain mock
 * object under jsdom (which doesn't implement real 2D canvas rendering) —
 * a real `CanvasRenderingContext2D` satisfies this interface structurally,
 * no cast needed at the real call site.
 */
import type { Mat4, Vec3 } from "@engine/core/render3d";
import { NEED_MIN, NEED_MAX } from "@hollow/sim-core/economy";
import { HOLLOW_PAL } from "../render/hollow-palette";
import { agentName } from "../agent-name";
import { projectToScreen } from "./screen-project";
import { glyphForAction, glyphForOccupation } from "./glyphs";

// ---------------------------------------------------------------------------
// Pure helpers — most-depleted-need + its bar color, each independently
// tested (overlay.test.ts).
// ---------------------------------------------------------------------------

export interface DepletedNeed {
  readonly kind: string;
  readonly fraction: number;
}

/**
 * The lowest-fraction need in `needs` (raw values, per `HollowAgentSnapshot`'s
 * doc — see `sim-core/economy/constants.ts`'s header: EVERY need shares the
 * same `NEED_MIN..NEED_MAX` range, so a plain linear fraction is valid
 * without needing each need's own min/max, which the snapshot doesn't
 * carry). `null` for an empty `needs` record (defensive — never happens for
 * a real spawned agent, but keeps this pure function total).
 */
export function mostDepletedNeed(needs: Readonly<Record<string, number>>): DepletedNeed | null {
  let worst: DepletedNeed | null = null;
  for (const [kind, value] of Object.entries(needs)) {
    const fraction = (value - NEED_MIN) / (NEED_MAX - NEED_MIN);
    if (worst === null || fraction < worst.fraction) worst = { kind, fraction };
  }
  return worst;
}

const LOW_THRESHOLD = 0.3;
const HEALTHY_THRESHOLD = 0.6;

/**
 * The `HOLLOW_PAL` role name for a need bar at `fraction` full — `starving`
 * always wins (forces the alarm role regardless of fraction, per the
 * brief's "or starving = red"). Pure; returns a ROLE NAME (not a resolved
 * hex) so this stays independently testable against role identity.
 */
export function needBarColorRole(fraction: number, starving: boolean): keyof typeof HOLLOW_PAL {
  if (starving) return "red";
  if (fraction <= LOW_THRESHOLD) return "orange";
  if (fraction <= HEALTHY_THRESHOLD) return "gold";
  return "green";
}

/**
 * The badge background `HOLLOW_PAL` role for an agent's job-cue letter
 * (chunk hollow-14d — mirrors sim-core's `JOB_ROLES`; chunk hollow-15 adds
 * the two care roles below). Seven distinct, already palette-pure roles so
 * every real job stays visually distinguishable at a glance;
 * `"unassigned"`/unrecognized fall back to a neutral `"steel"` (never drawn
 * in practice — `glyphForOccupation` returns `null` for those, so
 * `drawAgentOverlay` never calls this with them, but this stays total).
 */
export function occupationColorRole(occupation: string): keyof typeof HOLLOW_PAL {
  switch (occupation) {
    case "food-gatherer":
      return "green";
    case "material-gatherer":
      return "slate";
    case "crafter":
      return "orange";
    case "teacher":
      return "cyan";
    case "caretaker":
      return "salmon";
    // chunk hollow-15's two care roles — earthy "woodDark" for digging a
    // grave, alarm-adjacent "crimson" for a medic's cross (distinct from
    // every role above).
    case "grave-digger":
      return "woodDark";
    case "medic":
      return "crimson";
    default:
      return "steel";
  }
}

// ---------------------------------------------------------------------------
// Draw
// ---------------------------------------------------------------------------

export interface OverlayAgentInput {
  readonly id: number;
  readonly headWorld: Vec3;
  readonly action: string;
  readonly needs: Readonly<Record<string, number>>;
  readonly starving: boolean;
  /** Leader-assigned (or loner-self-assigned) job role (chunk hollow-14b) —
   *  drives the job-cue badge, gated by `showJobs` below. */
  readonly occupation: string;
}

export interface OverlayDrawOptions {
  readonly viewProj: Mat4;
  /** Viewport size in the SAME units as `headWorld` projects into — CSS
   *  pixels in practice (the overlay canvas's 2D context is pre-scaled by
   *  devicePixelRatio, see `resizeOverlayCanvas`/`main.ts`). */
  readonly width: number;
  readonly height: number;
  readonly showTags: boolean;
  /** Job-cue toggle (chunk hollow-14d) — INDEPENDENT of `showTags` (its own
   *  legibility control, per the brief: not always-on clutter, but also not
   *  tied to the name/need-bar tags). */
  readonly showJobs: boolean;
  readonly selectedAgentId: number | null;
}

/** Structural subset of `CanvasRenderingContext2D` this module draws with —
 *  see this file's header for why. `fillStyle`/`strokeStyle` match the real
 *  DOM type exactly (`string | CanvasGradient | CanvasPattern`) so a real
 *  `CanvasRenderingContext2D` satisfies this interface structurally with no
 *  cast; `textAlign`/`textBaseline` stay plain `string` (rather than the
 *  DOM's narrower `CanvasTextAlign`/`CanvasTextBaseline` literal unions) so
 *  a plain test mock can implement this interface too. */
export interface OverlayCtx {
  fillStyle: string | CanvasGradient | CanvasPattern;
  strokeStyle: string | CanvasGradient | CanvasPattern;
  lineWidth: number;
  font: string;
  textAlign: string;
  textBaseline: string;
  clearRect(x: number, y: number, w: number, h: number): void;
  fillRect(x: number, y: number, w: number, h: number): void;
  fillText(text: string, x: number, y: number): void;
  beginPath(): void;
  arc(x: number, y: number, radius: number, startAngle: number, endAngle: number): void;
  stroke(): void;
}

const GLYPH_FONT = "16px sans-serif";
const TAG_NAME_FONT = "11px monospace";
const GLYPH_Y_OFFSET = 16; // px above the projected head point
const BAR_W = 28;
const BAR_H = 4;
const BAR_GAP_ABOVE_GLYPH = 8;
const NAME_GAP_ABOVE_BAR = 12;
const SELECTION_RING_RADIUS = 12;

// Job-cue badge (chunk hollow-14d) — a small colored square to the SIDE of
// the action glyph (same y, offset in x) so it never overlaps the glyph or
// the name/need-bar tag stack above it.
const JOB_BADGE_SIZE = 13;
const JOB_BADGE_X_OFFSET = 15; // px to the right of the head point
const JOB_BADGE_FONT = "10px monospace";

/**
 * Draw one frame of the glyph/tag overlay for every VISIBLE alive agent in
 * `agents`. Clears the full `width x height` canvas first (the overlay owns
 * its own canvas exclusively — nothing else draws to it). Pure with respect
 * to its inputs (deterministic call sequence for a given input), but of
 * course has the side effect of issuing draw calls on `ctx`.
 */
export function drawAgentOverlay(ctx: OverlayCtx, agents: readonly OverlayAgentInput[], opts: OverlayDrawOptions): void {
  ctx.clearRect(0, 0, opts.width, opts.height);
  ctx.textAlign = "center";

  for (const agent of agents) {
    const p = projectToScreen(agent.headWorld, opts.viewProj, opts.width, opts.height);
    if (!p.visible) continue;

    if (agent.id === opts.selectedAgentId) {
      ctx.strokeStyle = HOLLOW_PAL.gold;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(p.x, p.y, SELECTION_RING_RADIUS, 0, Math.PI * 2);
      ctx.stroke();
    }

    const glyph = glyphForAction(agent.action);
    const glyphY = p.y - GLYPH_Y_OFFSET;
    if (glyph) {
      ctx.font = GLYPH_FONT;
      ctx.textBaseline = "bottom";
      ctx.fillStyle = HOLLOW_PAL.cream;
      ctx.fillText(glyph, p.x, glyphY);
    }

    // Job cue (chunk hollow-14d) — its OWN toggle, independent of `showTags`
    // (legibility, per the brief: not always-on clutter). A small colored
    // badge to the side of the action glyph, letter in `ink` for contrast
    // against the badge's (light) role color.
    if (opts.showJobs) {
      const cue = glyphForOccupation(agent.occupation);
      if (cue) {
        const badgeCx = p.x + JOB_BADGE_X_OFFSET;
        const badgeCy = glyphY - GLYPH_Y_OFFSET / 2;
        ctx.fillStyle = HOLLOW_PAL[occupationColorRole(agent.occupation)];
        ctx.fillRect(badgeCx - JOB_BADGE_SIZE / 2, badgeCy - JOB_BADGE_SIZE / 2, JOB_BADGE_SIZE, JOB_BADGE_SIZE);
        ctx.font = JOB_BADGE_FONT;
        ctx.textBaseline = "middle";
        ctx.fillStyle = HOLLOW_PAL.ink;
        ctx.fillText(cue, badgeCx, badgeCy);
      }
    }

    if (!opts.showTags) continue;

    const worst = mostDepletedNeed(agent.needs);
    let barTopY = glyphY;
    if (worst) {
      const barY = glyphY - BAR_GAP_ABOVE_GLYPH;
      const barX = p.x - BAR_W / 2;
      ctx.fillStyle = HOLLOW_PAL.ink;
      ctx.fillRect(barX, barY, BAR_W, BAR_H);
      const fillW = BAR_W * Math.max(0, Math.min(1, worst.fraction));
      ctx.fillStyle = HOLLOW_PAL[needBarColorRole(worst.fraction, agent.starving)];
      ctx.fillRect(barX, barY, fillW, BAR_H);
      barTopY = barY;
    }

    ctx.font = TAG_NAME_FONT;
    ctx.textBaseline = "bottom";
    ctx.fillStyle = HOLLOW_PAL.white;
    ctx.fillText(agentName(agent.id), p.x, barTopY - NAME_GAP_ABOVE_BAR);
  }
}

// ---------------------------------------------------------------------------
// Canvas creation / resize (thin DOM glue — see this module's header)
// ---------------------------------------------------------------------------

/** Creates the overlay `<canvas>`, absolutely positioned to fill `container`
 *  and click-through (`pointer-events: none` — the WebGPU canvas beneath
 *  still receives the click-to-inspect ray-pick). Appended as the LAST
 *  child so it paints above the WebGPU canvas. */
export function createOverlayCanvas(container: HTMLElement): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  canvas.style.position = "absolute";
  canvas.style.inset = "0";
  canvas.style.width = "100%";
  canvas.style.height = "100%";
  canvas.style.pointerEvents = "none";
  container.appendChild(canvas);
  return canvas;
}

/** Resizes `canvas`'s backing pixel buffer to `cssWidth/cssHeight * dpr`
 *  (only when changed — resizing a canvas clears it, so this is a no-op
 *  most frames). Caller is responsible for re-applying
 *  `ctx.setTransform(dpr,0,0,dpr,0,0)` after a resize (or every frame,
 *  idempotently) so subsequent draws can use CSS-pixel coordinates. */
export function resizeOverlayCanvas(canvas: HTMLCanvasElement, cssWidth: number, cssHeight: number, dpr: number): boolean {
  const width = Math.max(1, Math.round(cssWidth * dpr));
  const height = Math.max(1, Math.round(cssHeight * dpr));
  if (canvas.width === width && canvas.height === height) return false;
  canvas.width = width;
  canvas.height = height;
  return true;
}
