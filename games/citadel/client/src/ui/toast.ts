/**
 * Citadel event toasts — transient notifications that float in at top-center.
 *
 * Replaces the old inline `#hud-events` span, which appended event text into the
 * bottom HUD's flex row and (when it wrapped) grew the HUD height, shoving the
 * canvas up — a visible layout shift on every event. Toasts live in a fixed,
 * pointer-transparent overlay that never participates in the page's flex layout,
 * so events can come and go without nudging anything.
 *
 * Pure DOM + the EDG palette (via inline class styling in index.html). Render-only;
 * no sim, no RNG, no determinism impact.
 */

/** How many toasts may stack at once (oldest evicted past this). */
const MAX_TOASTS = 4;
/** How long a toast stays fully visible before it begins fading (ms, render clock). */
const TOAST_HOLD_MS = 4200;
/** Fade-out duration (ms) — must match the CSS transition in index.html. */
const TOAST_FADE_MS = 450;

/**
 * Event severity → accent class. Drives the toast's left border + icon colour so
 * a fire/raid reads as urgent and a promotion reads as celebratory. Keyword match
 * is intentionally loose; an uncategorised event falls back to the neutral tone.
 */
function toneOf(msg: string): "danger" | "warn" | "good" | "info" {
  const m = msg.toLowerCase();
  if (/fire|burn|raid|sack|starv|died|disease|outbreak|attack|breach/.test(m)) return "danger";
  if (/threat|hungry|sick|shortage|unrest|fled|abandon|low /.test(m)) return "warn";
  if (/risen|promoted|arrived|completed|built|harvest|trade|prosper|grew/.test(m)) return "good";
  return "info";
}

/**
 * Manages the lifecycle of toast elements inside a host container. Call `push`
 * for each freshly-emitted event; `tick` (driven from the render loop with the
 * render clock) ages toasts out. Keeping aging on the render clock — rather than
 * setTimeout — means it pauses naturally if the tab is backgrounded and never
 * touches the sim clock.
 */
export class ToastManager {
  private readonly host: HTMLElement;
  /** Live toasts, oldest first. `bornMs` is the render-clock ms it appeared. */
  private readonly live: { el: HTMLElement; bornMs: number; fading: boolean }[] = [];

  constructor(host: HTMLElement) {
    this.host = host;
  }

  /** Show a new toast for `msg`. Evicts the oldest if at capacity. */
  push(msg: string, nowMs: number): void {
    if (msg.trim() === "") return;
    while (this.live.length >= MAX_TOASTS) {
      const oldest = this.live.shift();
      if (oldest) oldest.el.remove();
    }
    const el = document.createElement("div");
    el.className = `toast toast-${toneOf(msg)}`;
    el.textContent = msg;
    // Start hidden, then flip to .show on the next frame so the CSS transition
    // animates the slide/fade-in (rather than snapping).
    this.host.appendChild(el);
    requestAnimationFrame(() => el.classList.add("show"));
    this.live.push({ el, bornMs: nowMs, fading: false });
  }

  /** Age toasts: begin fading past the hold window, remove once faded. */
  tick(nowMs: number): void {
    for (let i = this.live.length - 1; i >= 0; i--) {
      const t = this.live[i]!;
      const age = nowMs - t.bornMs;
      if (!t.fading && age >= TOAST_HOLD_MS) {
        t.fading = true;
        t.el.classList.remove("show");
        t.el.classList.add("hide");
      }
      if (t.fading && age >= TOAST_HOLD_MS + TOAST_FADE_MS) {
        t.el.remove();
        this.live.splice(i, 1);
      }
    }
  }
}

/**
 * Diff the rolling `recentEvents` window between two snapshots to find only the
 * newly-appended events. The sim keeps `events` as a sliding window (push to the
 * back, shift off the front past a cap), so new events are the suffix of `next`
 * that follows the last event we already saw.
 *
 * `prevLast` is the last event string shown on the previous frame (or null on the
 * very first frame, where we deliberately show nothing — we don't toast the
 * historical backlog at load). Returns the new events in order; the caller should
 * then remember `next[next.length - 1]` as the next `prevLast`.
 */
export function newEventsSince(prevLast: string | null, next: readonly string[]): readonly string[] {
  if (next.length === 0) return [];
  if (prevLast === null) return []; // first frame — don't flood with backlog
  // Find the most recent occurrence of the last-seen event; everything after is new.
  for (let i = next.length - 1; i >= 0; i--) {
    if (next[i] === prevLast) return next.slice(i + 1);
  }
  // Last-seen event has already scrolled out of the window: show what's left, but
  // cap so a long stall doesn't dump the whole window at once.
  return next.slice(-MAX_TOASTS);
}
