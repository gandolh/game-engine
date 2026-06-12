/**
 * juice.ts — render-side juice effects (brief 86).
 *
 * All effects are purely cosmetic, wall-clock driven, off already-snapshotted
 * events. Zero sim/snapshot changes; no imports from sim-core sim systems.
 *
 * Exports:
 *   JuiceLayer — manages floating popups, shake, hitstop, score-bump.
 *
 * Design notes:
 *   - Floating popups: DOM overlay, not canvas, matching the existing DOM UI
 *     architecture (LeaderboardPanel, EventFeedPanel, etc.). CSS transitions
 *     give easeOutCubic rise + fade for free; canvas text would re-implement
 *     font layout.
 *   - Shake: trauma² decay, post-smoothing camera offset (never fed back into
 *     smoothed state). Tiny: 2–4 px max.
 *   - Hitstop: pauses the render interpolation clock (alpha stays frozen) for
 *     2–4 frames; snapshot consumption continues unaffected.
 *   - Score-bump: CSS transform on the leaderboard total element.
 *   - Drama scaling: popup font size and shake trauma scale with drama score.
 *   - Resync/skip guard: lastEventCount cursor, jumped on resync/skip without
 *     emitting effects for stale events.
 */

import { EDG } from "@engine/core/render";
import type { Camera2D } from "@engine/core";
import type { SnapshotEvent } from "@farm/sim-core/snapshot";

// ---------------------------------------------------------------------------
// Easing helpers (pure functions, exported for tests)
// ---------------------------------------------------------------------------

/** easeOutCubic: fast initial movement that decelerates to a stop. */
export function easeOutCubic(t: number): number {
  return 1 - Math.pow(1 - t, 3);
}

/** easeOutBack: overshoots slightly for a bouncy feel. */
export function easeOutBack(t: number): number {
  const c1 = 1.70158;
  const c3 = c1 + 1;
  return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2);
}

// ---------------------------------------------------------------------------
// Trauma decay (pure function, exported for tests)
// ---------------------------------------------------------------------------

/**
 * Decay trauma toward zero. Rate ≈ 1/s so trauma fully drains in 1 second.
 * Returns the new trauma value clamped to [0, 1].
 */
export function decayTrauma(trauma: number, dtSec: number): number {
  return Math.max(0, trauma - dtSec);
}

/**
 * Convert trauma to displacement magnitude.
 * shake = trauma² so low trauma barely registers and high trauma is pronounced.
 * Cap at MAX_SHAKE_PX for cozy feel.
 */
export const MAX_SHAKE_PX = 3; // cozy, not arcade
export function traumaToDisplacement(trauma: number): number {
  return trauma * trauma * MAX_SHAKE_PX;
}

// ---------------------------------------------------------------------------
// Popup pool constants
// ---------------------------------------------------------------------------

/** Total popup slots in the pool. */
export const POPUP_POOL_SIZE = 16;

/** Per-event-kind caps within the shared pool to prevent market-day bursts. */
export const POPUP_KIND_CAP: Readonly<Record<PopupKind, number>> = {
  gold: 6,
  positive: 4,
  neutral: 3,
  negative: 3,
} as const;

/** Duration of a popup animation in seconds. */
const POPUP_DURATION_S = 1.4;
/** How far the popup rises in CSS pixels over its lifetime. */
const POPUP_RISE_PX = 28;
/** Base font size for a drama=0 event (em-like, in px). */
const POPUP_FONT_BASE = 12;
/** Extra px added for drama=1 events. */
const POPUP_FONT_DRAMA_ADD = 5;

export type PopupKind = "gold" | "positive" | "neutral" | "negative";

interface PopupSlot {
  active: boolean;
  el: HTMLElement;
  /** World-pixel anchor X (farmer/structure position). */
  wx: number;
  /** World-pixel anchor Y. */
  wy: number;
  /** Elapsed seconds since spawn. */
  elapsed: number;
  /** Full duration in seconds. */
  duration: number;
  kind: PopupKind;
}

// ---------------------------------------------------------------------------
// Classify event → PopupKind + text
// ---------------------------------------------------------------------------

interface PopupSpec {
  kind: PopupKind;
  label: string;
}

/**
 * Classify a SnapshotEvent into a popup kind and label.
 * Returns null for events that should NOT spawn a popup (e.g. crop death, rivalry).
 *
 * The text patterns match what EventFeedSystem produces:
 *   trade:        "X bought N crop from Y (Zg)"    → gold for seller Y
 *   auction:      "X won the golden bean at Zg"     → gold
 *   coral-catch:  "X hauled in a coral-reef … (Zg)!" → gold
 *   contract-delivered: "X delivered a harbor contract — +Zg…" → gold
 *   contract-missed:    "X missed a harbor contract deadline"   → negative
 *   festival:     "… — X wins …"                   → positive
 *   rank-flip:    "X overtakes Y for 1st!"          → positive
 *   race-on:      "Final stretch — …"               → neutral
 *   shock:        "Drought! …"                      → negative
 *   crop-death:   no popup (too routine)
 *   accept:       no popup (too routine)
 *   alliance/rivalry: no popup
 */
function classifyEvent(ev: SnapshotEvent): PopupSpec | null {
  const t = ev.text;
  // Gold events — extract amount from the text
  const tradePriceMatch = t.match(/\((\d+)g\)/);
  const contractMatch = t.match(/\+(\d+)g/);
  const auctionMatch = t.match(/at (\d+)g/);

  if (tradePriceMatch !== null) {
    const amount = tradePriceMatch[1]!;
    return { kind: "gold", label: `+${amount}g` };
  }
  if (contractMatch !== null && t.includes("harbor contract")) {
    const amount = contractMatch[1]!;
    return { kind: "gold", label: `+${amount}g` };
  }
  if (auctionMatch !== null && t.includes("golden bean")) {
    const amount = auctionMatch[1]!;
    return { kind: "gold", label: `${amount}g` };
  }
  // Festival win
  if (t.includes("wins with a")) {
    return { kind: "positive", label: "🏆" };
  }
  // Rank flip
  if (t.includes("overtakes") && t.includes("for 1st")) {
    return { kind: "positive", label: "1st!" };
  }
  // Race on (late-game tension)
  if (t.startsWith("Final stretch")) {
    return { kind: "neutral", label: "!" };
  }
  // Missed contract
  if (t.includes("missed a harbor contract")) {
    return { kind: "negative", label: "✗" };
  }
  // Shock/drought
  if (t.startsWith("Drought!")) {
    return { kind: "negative", label: "✗" };
  }
  // Everything else: no popup (routine trade accept, alliance, rivalry)
  return null;
}

// ---------------------------------------------------------------------------
// Color per kind (EDG32 palette only)
// ---------------------------------------------------------------------------

const KIND_COLORS: Readonly<Record<PopupKind, string>> = {
  gold: EDG.gold,
  positive: EDG.green,
  neutral: EDG.silver,
  negative: EDG.salmon,
} as const;

// ---------------------------------------------------------------------------
// Shake events: which drama kinds trigger shake
// ---------------------------------------------------------------------------

/**
 * Events that trigger positive-beat screen shake.
 * Drama score threshold: only shake if drama ≥ 0.4 (filters routine trades).
 * Event kinds identified by text pattern:
 *   - rank-flip: "overtakes … for 1st!"
 *   - festival win: "wins with a"
 *   - coral-catch: "hauled in a coral-reef"
 */
function shouldShake(ev: SnapshotEvent): boolean {
  if (ev.drama < 0.4) return false;
  const t = ev.text;
  return (
    (t.includes("overtakes") && t.includes("for 1st")) ||
    t.includes("wins with a") ||
    t.includes("hauled in a coral-reef") ||
    t.startsWith("Final stretch")
  );
}

// ---------------------------------------------------------------------------
// Hitstop events: which events freeze interpolation
// ---------------------------------------------------------------------------

/**
 * Events that trigger hitstop (2–4 frame interpolation freeze).
 * Only the highest-drama events: rank-flip, auction win.
 */
function shouldHitstop(ev: SnapshotEvent): boolean {
  const t = ev.text;
  return (
    (t.includes("overtakes") && t.includes("for 1st")) ||
    (t.includes("golden bean") && t.includes("won"))
  );
}

// ---------------------------------------------------------------------------
// JuiceLayer
// ---------------------------------------------------------------------------

/** World-to-CSS-pixel conversion (inverse of screenToWorld). */
function worldToCss(
  wx: number,
  wy: number,
  camera: Camera2D,
  canvas: HTMLCanvasElement,
): { cx: number; cy: number } {
  const dpr = Math.min(typeof window !== "undefined" ? window.devicePixelRatio || 1 : 1, 2);
  const scaleX = (camera.worldUnitsX / canvas.clientWidth) * dpr;
  const scaleY = (camera.worldUnitsY / canvas.clientHeight) * dpr;
  const cx = (wx - (camera.centerX - camera.worldUnitsX / 2)) / scaleX;
  const cy = (wy - (camera.centerY - camera.worldUnitsY / 2)) / scaleY;
  return { cx, cy };
}

export class JuiceLayer {
  // ---------------------------------------------------------------------------
  // Popup pool
  // ---------------------------------------------------------------------------
  private readonly pool: PopupSlot[];
  private readonly overlay: HTMLElement;

  // ---------------------------------------------------------------------------
  // Shake state
  // ---------------------------------------------------------------------------
  private trauma = 0;
  /** Current shake offset in CSS/world pixels (post-smoothing). */
  readonly shake = { x: 0, y: 0 };

  // ---------------------------------------------------------------------------
  // Hitstop state
  // ---------------------------------------------------------------------------
  /**
   * Number of render frames the interpolation should be frozen.
   * Read by render-loop; cleared once consumed via consumeHitstopFrames().
   */
  private hitstopFrames = 0;

  // ---------------------------------------------------------------------------
  // Resync / skip guard
  // ---------------------------------------------------------------------------
  /**
   * The number of events we last processed. On resync or skip, we jump this
   * forward to match the current event array length so stale events never fire.
   */
  private lastEventCount = 0;
  /** True after a resync/skip signal; causes cursor to be jumped on next update. */
  private pendingSkip = false;

  // ---------------------------------------------------------------------------
  // Per-farmer world positions (updated each frame from farmerPositions)
  // ---------------------------------------------------------------------------
  private farmerPositions: ReadonlyMap<number, { x: number; y: number }> = new Map();

  constructor(parent: HTMLElement) {
    // Overlay div: covers the canvas exactly, pointer-events none so it never
    // blocks canvas mouse input. Positioned absolute to float over the canvas.
    this.overlay = document.createElement("div");
    applyOverlayStyles(this.overlay);
    parent.appendChild(this.overlay);

    // Preallocate popup pool
    this.pool = [];
    for (let i = 0; i < POPUP_POOL_SIZE; i++) {
      const el = document.createElement("div");
      applyPopupBaseStyles(el);
      el.style.display = "none";
      this.overlay.appendChild(el);
      this.pool.push({
        active: false,
        el,
        wx: 0,
        wy: 0,
        elapsed: 0,
        duration: POPUP_DURATION_S,
        kind: "gold",
      });
    }
  }

  // ---------------------------------------------------------------------------
  // Resync/skip signal
  // ---------------------------------------------------------------------------

  /**
   * Called when the client resyncs (tab-hide/show) or skips to highlight (H).
   * The next update() call will advance lastEventCount without firing effects.
   */
  signalResync(): void {
    this.pendingSkip = true;
  }

  // ---------------------------------------------------------------------------
  // Per-frame update
  // ---------------------------------------------------------------------------

  /**
   * Process new events and advance all active effects.
   *
   * @param events - The current snapshot's event array (oldest-first, capped).
   * @param farmerPositions - Map of farmer id → world pixel position (from interpolated sprites).
   * @param camera - Current camera (for world→screen conversion).
   * @param canvas - Game canvas (for world→screen conversion).
   * @param dtSec - Frame delta in seconds (capped at 0.1 by render-loop).
   */
  update(
    events: readonly SnapshotEvent[],
    farmerPositions: ReadonlyMap<number, { x: number; y: number }>,
    camera: Camera2D,
    canvas: HTMLCanvasElement,
    dtSec: number,
  ): void {
    this.farmerPositions = farmerPositions;

    // ── Resync guard ──────────────────────────────────────────────────────────
    if (this.pendingSkip) {
      this.pendingSkip = false;
      // Jump the cursor to the current event count — skip all stale events.
      this.lastEventCount = events.length;
      // Also clear any active popups and reset shake so there's no burst.
      this.trauma = 0;
      this.shake.x = 0;
      this.shake.y = 0;
      this.hitstopFrames = 0;
      for (const slot of this.pool) {
        if (slot.active) {
          slot.active = false;
          slot.el.style.display = "none";
        }
      }
    }

    // ── Process new events (events added since last frame) ────────────────────
    // The snapshot always sends the full capped feed (oldest-first). New events
    // appear at the tail. We process only the tail beyond lastEventCount.
    // NOTE: if the feed was trimmed (overflow), lastEventCount may be > events.length;
    // in that case we skip (no new events worth replaying from an older offset).
    const newStart = this.lastEventCount < events.length ? this.lastEventCount : events.length;
    const newEnd = events.length;
    this.lastEventCount = events.length;

    for (let i = newStart; i < newEnd; i++) {
      const ev = events[i]!;
      this.processEvent(ev);
    }

    // ── Advance popups ────────────────────────────────────────────────────────
    for (const slot of this.pool) {
      if (!slot.active) continue;
      slot.elapsed += dtSec;
      if (slot.elapsed >= slot.duration) {
        slot.active = false;
        slot.el.style.display = "none";
        continue;
      }
      // Update position each frame (farmer moves, camera pans, shake offsets)
      this._positionPopup(slot, camera, canvas);
    }

    // ── Trauma decay ─────────────────────────────────────────────────────────
    this.trauma = decayTrauma(this.trauma, dtSec);

    // ── Shake offset (post-smoothing; applied by render-loop after applyFocusAndPan) ──
    if (this.trauma > 0.001) {
      const disp = traumaToDisplacement(this.trauma);
      // Use performance.now for shake phase — display-only, never seeded
      const t = performance.now() * 0.01;
      this.shake.x = Math.sin(t * 13.7) * disp;
      this.shake.y = Math.sin(t * 17.3) * disp;
    } else {
      this.shake.x = 0;
      this.shake.y = 0;
    }
  }

  // ---------------------------------------------------------------------------
  // Hitstop
  // ---------------------------------------------------------------------------

  /**
   * Returns the number of hitstop frames requested this update cycle, and
   * resets the counter. The render-loop calls client.freezeInterp(n) when n > 0.
   * Called ONCE per frame immediately after update().
   */
  consumeHitstopFrames(): number {
    const n = this.hitstopFrames;
    this.hitstopFrames = 0;
    return n;
  }

  // ---------------------------------------------------------------------------
  // Destroy
  // ---------------------------------------------------------------------------

  destroy(): void {
    this.overlay.remove();
  }

  // ---------------------------------------------------------------------------
  // Private helpers
  // ---------------------------------------------------------------------------

  private processEvent(ev: SnapshotEvent): void {
    // Shake check (first — independent of popup)
    if (shouldShake(ev)) {
      // Scale trauma by drama; min 0.3 so even a low-drama hit lands
      const traumaAdd = 0.3 + ev.drama * 0.7;
      this.trauma = Math.min(1, this.trauma + traumaAdd);
    }

    // Hitstop check
    if (shouldHitstop(ev)) {
      // 2–4 frames, scaled slightly by drama
      this.hitstopFrames = Math.max(this.hitstopFrames, ev.drama >= 0.7 ? 4 : 2);
    }

    // Popup
    const spec = classifyEvent(ev);
    if (spec === null) return;

    // Anchor to the farmer's current world position, or center of world if unknown
    const farmerId = ev.farmerId;
    let wx = 0;
    let wy = 0;
    if (farmerId !== null && farmerId !== undefined) {
      const pos = this.farmerPositions.get(farmerId);
      if (pos !== undefined) {
        wx = pos.x;
        wy = pos.y - 12; // slightly above the farmer sprite
      }
    }

    this._spawnPopup(spec, wx, wy, ev.drama);
  }

  private _countActive(kind: PopupKind): number {
    let n = 0;
    for (const slot of this.pool) {
      if (slot.active && slot.kind === kind) n++;
    }
    return n;
  }

  private _findFreeSlot(): PopupSlot | null {
    for (const slot of this.pool) {
      if (!slot.active) return slot;
    }
    return null;
  }

  private _spawnPopup(spec: PopupSpec, wx: number, wy: number, drama: number): void {
    // Per-kind cap
    if (this._countActive(spec.kind) >= POPUP_KIND_CAP[spec.kind]) return;
    const slot = this._findFreeSlot();
    if (slot === null) return;

    slot.active = true;
    slot.wx = wx;
    slot.wy = wy;
    slot.elapsed = 0;
    slot.duration = POPUP_DURATION_S;
    slot.kind = spec.kind;

    const fontSize = POPUP_FONT_BASE + Math.round(drama * POPUP_FONT_DRAMA_ADD);
    slot.el.textContent = spec.label;
    slot.el.style.color = KIND_COLORS[spec.kind];
    slot.el.style.fontSize = `${fontSize}px`;
    slot.el.style.display = "block";
    slot.el.style.opacity = "1";
    // Remove any stale transform so the element starts clean
    slot.el.style.transform = "none";
  }

  private _positionPopup(slot: PopupSlot, camera: Camera2D, canvas: HTMLCanvasElement): void {
    const t = Math.min(slot.elapsed / slot.duration, 1);
    // easeOutCubic for vertical rise
    const rise = easeOutCubic(t) * POPUP_RISE_PX;
    // Fade: start fading at 60% of duration
    const fadeFrac = 0.6;
    const fadeT = Math.max(0, (t - fadeFrac) / (1 - fadeFrac));
    const alpha = 1 - fadeT;

    const { cx, cy } = worldToCss(slot.wx, slot.wy, camera, canvas);

    slot.el.style.left = `${cx}px`;
    slot.el.style.top = `${cy - rise}px`;
    slot.el.style.opacity = String(alpha.toFixed(3));
  }
}

// ---------------------------------------------------------------------------
// Overlay / popup DOM style helpers (no inline hex literals — all EDG.*)
// ---------------------------------------------------------------------------

function applyOverlayStyles(el: HTMLElement): void {
  el.style.position = "absolute";
  el.style.inset = "0";
  el.style.pointerEvents = "none";
  el.style.overflow = "hidden";
  el.style.zIndex = "100";
}

function applyPopupBaseStyles(el: HTMLElement): void {
  el.style.position = "absolute";
  el.style.fontFamily = "monospace";
  el.style.fontWeight = "bold";
  el.style.lineHeight = "1";
  el.style.whiteSpace = "nowrap";
  el.style.pointerEvents = "none";
  el.style.userSelect = "none";
  // Text shadow in a darker EDG color for legibility on any background.
  // EDG.ink is the darkest non-black palette entry — safe.
  el.style.textShadow = `0 1px 2px ${EDG.ink}`;
  el.style.willChange = "transform, opacity, top";
}
