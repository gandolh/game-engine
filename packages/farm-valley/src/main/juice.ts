

import { EDG } from "@engine/core/render";
import type { Camera2D } from "@engine/core";
import type { SnapshotEvent } from "@farm/sim-core/snapshot";

export function easeOutCubic(t: number): number {
  return 1 - Math.pow(1 - t, 3);
}

export function easeOutBack(t: number): number {
  const c1 = 1.70158;
  const c3 = c1 + 1;
  return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2);
}

export function decayTrauma(trauma: number, dtSec: number): number {
  return Math.max(0, trauma - dtSec);
}

export const MAX_SHAKE_PX = 3; 
export function traumaToDisplacement(trauma: number): number {
  return trauma * trauma * MAX_SHAKE_PX;
}

export const POPUP_POOL_SIZE = 16;

export const POPUP_KIND_CAP: Readonly<Record<PopupKind, number>> = {
  gold: 6,
  positive: 4,
  neutral: 3,
  negative: 3,
} as const;

const POPUP_DURATION_S = 1.4;

const POPUP_RISE_PX = 28;

const POPUP_FONT_BASE = 12;

const POPUP_FONT_DRAMA_ADD = 5;

export type PopupKind = "gold" | "positive" | "neutral" | "negative";

interface PopupSlot {
  active: boolean;
  el: HTMLElement;

  wx: number;

  wy: number;

  elapsed: number;

  duration: number;
  kind: PopupKind;
}

interface PopupSpec {
  kind: PopupKind;
  label: string;
}

function classifyEvent(ev: SnapshotEvent): PopupSpec | null {
  const t = ev.text;

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

  if (t.includes("wins with a")) {
    return { kind: "positive", label: "🏆" };
  }

  if (t.includes("overtakes") && t.includes("for 1st")) {
    return { kind: "positive", label: "1st!" };
  }

  if (t.startsWith("Final stretch")) {
    return { kind: "neutral", label: "!" };
  }

  if (t.includes("missed a harbor contract")) {
    return { kind: "negative", label: "✗" };
  }

  if (t.startsWith("Drought!")) {
    return { kind: "negative", label: "✗" };
  }

  return null;
}

const KIND_COLORS: Readonly<Record<PopupKind, string>> = {
  gold: EDG.gold,
  positive: EDG.green,
  neutral: EDG.silver,
  negative: EDG.salmon,
} as const;

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

function shouldHitstop(ev: SnapshotEvent): boolean {
  const t = ev.text;
  return (
    (t.includes("overtakes") && t.includes("for 1st")) ||
    (t.includes("golden bean") && t.includes("won"))
  );
}

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

  private readonly pool: PopupSlot[];
  private readonly overlay: HTMLElement;

  private trauma = 0;

  readonly shake = { x: 0, y: 0 };

  private hitstopFrames = 0;

  private lastEventCount = 0;

  private pendingSkip = false;

  private farmerPositions: ReadonlyMap<number, { x: number; y: number }> = new Map();

  constructor(parent: HTMLElement) {

    this.overlay = document.createElement("div");
    applyOverlayStyles(this.overlay);
    parent.appendChild(this.overlay);

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

  signalResync(): void {
    this.pendingSkip = true;
  }

  update(
    events: readonly SnapshotEvent[],
    farmerPositions: ReadonlyMap<number, { x: number; y: number }>,
    camera: Camera2D,
    canvas: HTMLCanvasElement,
    dtSec: number,
  ): void {
    this.farmerPositions = farmerPositions;

    if (this.pendingSkip) {
      this.pendingSkip = false;

      this.lastEventCount = events.length;

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

    const newStart = this.lastEventCount < events.length ? this.lastEventCount : events.length;
    const newEnd = events.length;
    this.lastEventCount = events.length;

    for (let i = newStart; i < newEnd; i++) {
      const ev = events[i]!;
      this.processEvent(ev);
    }

    for (const slot of this.pool) {
      if (!slot.active) continue;
      slot.elapsed += dtSec;
      if (slot.elapsed >= slot.duration) {
        slot.active = false;
        slot.el.style.display = "none";
        continue;
      }

      this._positionPopup(slot, camera, canvas);
    }

    this.trauma = decayTrauma(this.trauma, dtSec);

    if (this.trauma > 0.001) {
      const disp = traumaToDisplacement(this.trauma);

      const t = performance.now() * 0.01;
      this.shake.x = Math.sin(t * 13.7) * disp;
      this.shake.y = Math.sin(t * 17.3) * disp;
    } else {
      this.shake.x = 0;
      this.shake.y = 0;
    }
  }

  consumeHitstopFrames(): number {
    const n = this.hitstopFrames;
    this.hitstopFrames = 0;
    return n;
  }

  destroy(): void {
    this.overlay.remove();
  }

  private processEvent(ev: SnapshotEvent): void {

    if (shouldShake(ev)) {

      const traumaAdd = 0.3 + ev.drama * 0.7;
      this.trauma = Math.min(1, this.trauma + traumaAdd);
    }

    if (shouldHitstop(ev)) {

      this.hitstopFrames = Math.max(this.hitstopFrames, ev.drama >= 0.7 ? 4 : 2);
    }

    const spec = classifyEvent(ev);
    if (spec === null) return;

    const farmerId = ev.farmerId;
    let wx = 0;
    let wy = 0;
    if (farmerId !== null && farmerId !== undefined) {
      const pos = this.farmerPositions.get(farmerId);
      if (pos !== undefined) {
        wx = pos.x;
        wy = pos.y - 12; 
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

    slot.el.style.transform = "none";
  }

  private _positionPopup(slot: PopupSlot, camera: Camera2D, canvas: HTMLCanvasElement): void {
    const t = Math.min(slot.elapsed / slot.duration, 1);

    const rise = easeOutCubic(t) * POPUP_RISE_PX;

    const fadeFrac = 0.6;
    const fadeT = Math.max(0, (t - fadeFrac) / (1 - fadeFrac));
    const alpha = 1 - fadeT;

    const { cx, cy } = worldToCss(slot.wx, slot.wy, camera, canvas);

    slot.el.style.left = `${cx}px`;
    slot.el.style.top = `${cy - rise}px`;
    slot.el.style.opacity = String(alpha.toFixed(3));
  }
}

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

  el.style.textShadow = `0 1px 2px ${EDG.ink}`;
  el.style.willChange = "transform, opacity, top";
}
