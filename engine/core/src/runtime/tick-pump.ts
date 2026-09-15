/**
 * tick-pump.ts — generic, fixed-cadence tick pump for a Worker-hosted (or
 * any host-owned) continuous sim. Replaces each game's hand-rolled
 * `setInterval`/`clearInterval` loop lifecycle (audit-26).
 *
 * SPEED MODEL (audit-26 decision — Hollow's model wins over Citadel's prior
 * one): the fire PERIOD is fixed at `1000 / hz` ms for the life of the pump
 * and is NEVER re-periodized by a speed change. "Speed" is not a property of
 * this primitive at all — it is the caller's own concept, expressed purely
 * through how many logical ticks it asks for per fire via `getBatchSize`,
 * which is read FRESH on every fire. A caller that changes what
 * `getBatchSize` returns (e.g. in response to a UI speed control) changes
 * the batch size on the very next fire, with no interval teardown or
 * recreation — no timing hitch, ever, no matter how often speed changes.
 *
 * BATCH OVERRUN / DEBT (audit-26 ruling): a fire runs AT MOST
 * `getBatchSize()` logical ticks (each via `onTick`) and then returns, full
 * stop. This primitive does no wall-clock accounting whatsoever — no
 * `Date.now()`/`performance.now()`, no delta-time accumulator, no computing
 * "how many ticks should have run by now" to catch up, and no queue of
 * ticks deferred from a slow fire to a later one. If a fire's own work (the
 * `onTick` calls, or the host's event loop being busy) takes longer than one
 * period, the underlying timer simply fires again as soon as it next can —
 * ordinary `setInterval` behavior — and that next fire STILL runs only
 * `getBatchSize()` ticks, not more. On weak hardware the sim advances slower
 * in WALL-CLOCK terms; it never enters a catch-up death spiral. Determinism
 * is unaffected either way: sim output depends only on tick COUNT, never on
 * wall-clock timing (CLAUDE.md — Determinism; `setInterval` is pacing only).
 *
 * Game-agnostic by construction: no game names, no speed tables, no pause
 * concept baked in here. A caller models "paused" by having `getBatchSize`
 * resolve to 0 for that fire (see `onFire`'s `ticksThisFire` parameter).
 */

export interface TickPumpOptions {
  /** Fixed fire frequency in Hz. The fire period (`1000 / hz` ms) is set
   *  once at construction and never changes for the life of the pump — see
   *  this file's header (SPEED MODEL). Must be > 0. */
  hz: number;
  /** Called once per fire to get how many logical ticks to run THIS fire.
   *  Read fresh every fire — changing what this returns changes the batch
   *  size starting the very next fire, with no timer teardown/recreation.
   *  Clamped to a non-negative integer (`Math.max(0, Math.floor(...))`).
   *  Defaults to a constant `1` if omitted. */
  getBatchSize?: () => number;
  /** Called once per logical tick, up to `getBatchSize()` times per fire —
   *  never more, regardless of wall-clock time (see header: BATCH OVERRUN). */
  onTick: () => void;
  /** Called once per fire, after that fire's batch of `onTick` calls
   *  (including when the resolved batch size is 0 — e.g. a caller-modeled
   *  "paused" fire). Receives the actual number of `onTick` calls just made
   *  this fire, so a caller can distinguish a real batch from a zero one
   *  without keeping its own shadow state. Optional. */
  onFire?: (ticksThisFire: number) => void;
}

export interface TickPump {
  /** Starts the fixed-period timer. No-op if already running (does not
   *  reset or re-periodize an already-running pump). */
  start(): void;
  /** Stops the timer. No-op if not running. */
  stop(): void;
  isRunning(): boolean;
}

export function createTickPump(options: TickPumpOptions): TickPump {
  const { hz, onTick, onFire } = options;
  if (!(hz > 0)) throw new Error(`createTickPump: hz must be > 0, got ${hz}`);
  const getBatchSize = options.getBatchSize ?? (() => 1);
  const periodMs = 1000 / hz;

  let intervalId: ReturnType<typeof setInterval> | null = null;

  function fire(): void {
    const batchSize = Math.max(0, Math.floor(getBatchSize()));
    for (let i = 0; i < batchSize; i++) {
      onTick();
    }
    onFire?.(batchSize);
  }

  return {
    start(): void {
      if (intervalId !== null) return;
      intervalId = setInterval(fire, periodMs);
    },
    stop(): void {
      if (intervalId === null) return;
      clearInterval(intervalId);
      intervalId = null;
    },
    isRunning(): boolean {
      return intervalId !== null;
    },
  };
}
