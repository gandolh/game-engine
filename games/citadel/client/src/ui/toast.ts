/**
 * Citadel event toasts — transient notifications that float in at top-center,
 * rendered IN-CANVAS via `@engine/ui` (replacing the old pointer-transparent DOM
 * overlay). Each toast is a `@engine/ui` panel + a tone-coloured label; the stack is
 * a column container the host lays out (top-centre) + renders each frame. Toasts fade
 * in / hold / fade out via the node `opacity` channel (no DOM transition). A hidden
 * `aria-live` region (`#toast-live`) mirrors each new toast's text for screen readers.
 *
 * Aging runs on the RENDER clock (an injected `nowMs`, never the sim clock) so it
 * pauses naturally when the tab is backgrounded and never touches determinism.
 */
import { EDG } from "@engine/core";
import { box, panel, label } from "@engine/ui";
import type { ContainerNode, LabelNode } from "@engine/ui";

/** How many toasts may stack at once (oldest evicted past this). */
const MAX_TOASTS = 4;
/** Fade-in ramp (ms) when a toast first appears. */
const TOAST_FADE_IN_MS = 160;
/** How long a toast stays fully visible before it begins fading (ms, render clock). */
const TOAST_HOLD_MS = 4200;
/** Fade-out duration (ms). */
const TOAST_FADE_MS = 450;

/** Tone → label colour (mirrors the old DOM toast text colours; every one an `EDG.*`). */
const TONE_COLORS: Record<"danger" | "warn" | "good" | "info", string> = {
  danger: EDG.salmon,
  warn: EDG.yellow,
  good: EDG.green,
  info: EDG.cyan,
};

/**
 * Event severity → tone. Drives the toast's label colour so a fire/raid reads as
 * urgent and a promotion reads as celebratory. Keyword match is intentionally loose;
 * an uncategorised event falls back to the neutral tone.
 */
function toneOf(msg: string): "danger" | "warn" | "good" | "info" {
  const m = msg.toLowerCase();
  if (/fire|burn|raid|sack|starv|died|disease|outbreak|attack|breach/.test(m)) return "danger";
  if (/threat|hungry|sick|shortage|unrest|fled|abandon|low /.test(m)) return "warn";
  if (/risen|promoted|arrived|completed|built|harvest|trade|prosper|grew/.test(m)) return "good";
  return "info";
}

/** Opacity for a toast of the given age (ms): ramp in, hold, ramp out, then gone. */
export function toastOpacity(age: number): number {
  if (age < TOAST_FADE_IN_MS) return age / TOAST_FADE_IN_MS;
  if (age < TOAST_HOLD_MS) return 1;
  if (age < TOAST_HOLD_MS + TOAST_FADE_MS) return 1 - (age - TOAST_HOLD_MS) / TOAST_FADE_MS;
  return 0;
}

interface LiveToast {
  readonly panel: ContainerNode;
  readonly bornMs: number;
}

/**
 * Manages the in-canvas toast stack. Call `push` for each freshly-emitted event; `tick`
 * (driven from the render loop with the render clock) ages toasts out by updating each
 * panel's `opacity` and removing faded ones. The host reads {@link ToastManager.root} to
 * lay out (top-centre) + render the stack each frame.
 */
export class ToastManager {
  /** The toast-stack container (a column) — the host lays it out + renders it each frame. */
  readonly root: ContainerNode;
  /** Live toasts, oldest first. `bornMs` is the render-clock ms it appeared. */
  private readonly live: LiveToast[] = [];
  /** Optional hidden aria-live region; each push sets its text so AT announces the toast. */
  private readonly liveRegion: HTMLElement | null;

  constructor(liveRegion?: HTMLElement | null) {
    this.root = box({ direction: "column", gap: 6, align: "center" }, []);
    this.liveRegion = liveRegion ?? null;
  }

  /** Show a new toast for `msg`. Evicts the oldest if at capacity. */
  push(msg: string, nowMs: number): void {
    if (msg.trim() === "") return;
    while (this.live.length >= MAX_TOASTS) {
      const oldest = this.live.shift();
      if (oldest) this.detach(oldest.panel);
    }
    const lbl: LabelNode = label(msg, { color: TONE_COLORS[toneOf(msg)] });
    const p = panel({ direction: "row", padding: { top: 6, bottom: 6, left: 12, right: 12 } }, [lbl]);
    p.opacity = 0; // starts transparent; the next tick ramps it in
    this.root.children.push(p);
    this.live.push({ panel: p, bornMs: nowMs });
    if (this.liveRegion !== null) this.liveRegion.textContent = msg; // a11y announce
  }

  /** Age toasts: ramp opacity in/out by age; drop a toast once fully faded. */
  tick(nowMs: number): void {
    for (let i = this.live.length - 1; i >= 0; i--) {
      const t = this.live[i]!;
      const age = nowMs - t.bornMs;
      if (age >= TOAST_HOLD_MS + TOAST_FADE_MS) {
        this.detach(t.panel);
        this.live.splice(i, 1);
        continue;
      }
      t.panel.opacity = toastOpacity(age);
    }
  }

  /** Remove a toast panel from the stack container. */
  private detach(p: ContainerNode): void {
    const i = this.root.children.indexOf(p);
    if (i >= 0) this.root.children.splice(i, 1);
  }
}

/**
 * Diff the rolling `recentEvents` window between two snapshots to find only the
 * newly-appended events — SEQUENCE-based, not string-based (brief 97/20). The sim
 * keeps `events` as a capped sliding window (push to the back, shift off the front
 * past `MAX_EVENTS`; see `pushEvent` in sim-state.ts) but also exposes `eventsSeq`,
 * a monotonic count of every event ever pushed, unaffected by that cap. New events
 * are the last `min(events.length, eventsSeq - prevSeq)` entries of the window —
 * exact under the cap, and correct even when two entries in the window are
 * byte-identical strings (a string-matching diff drops the second one: it matches
 * the RIGHTMOST occurrence — the new event — and reports nothing new).
 *
 * `prevSeq` is the `eventsSeq` last seen (or null on the very first frame, where we
 * deliberately show nothing — we don't toast the historical backlog at load).
 * Returns the new events in order; the caller should then remember `eventsSeq` as
 * the next `prevSeq`.
 *
 * The `MAX_TOASTS` cap (also used to size the live toast stack) guards a long stall
 * — a client that missed many snapshots — from dumping the whole window at once.
 */
export function newEventsSince(
  prevSeq: number | null,
  eventsSeq: number,
  events: readonly string[],
): readonly string[] {
  if (events.length === 0) return [];
  if (prevSeq === null) return []; // first frame — don't flood with backlog
  const newCount = Math.min(events.length, MAX_TOASTS, Math.max(0, eventsSeq - prevSeq));
  return newCount === 0 ? [] : events.slice(events.length - newCount);
}
