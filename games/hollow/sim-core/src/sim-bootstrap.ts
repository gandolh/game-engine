/**
 * Hollow sim bootstrap — transport-agnostic, deterministic sim core.
 *
 * Chunk hollow-01: scaffolding only. This mirrors the SHAPE of
 * `@farm/sim-core`'s `bootstrapSim` (world + message bus + scheduler + seeded
 * `Rng`) so later Hollow briefs have a home to register real systems, but it
 * does NOT import `@farm/sim-core` (games never import each other — see
 * CLAUDE.md's dependency rule) and registers an EMPTY system list — no
 * gameplay yet.
 *
 * `bootstrapHollowSim` must stay usable from:
 *   - a headless Node script (tools/hollow-sim) — no Worker, no DOM;
 *   - a browser Web Worker (@hollow/client's src/worker/sim-worker.ts);
 *   - a test, driving the scheduler directly.
 * Nothing Worker- or DOM-specific belongs in this file (the sim ↔ render
 * boundary convention — see CLAUDE.md's "Architecture essentials").
 *
 * A note on "20 Hz": that cadence is a TRANSPORT concern — how often a
 * Worker's `setInterval` calls `tick()` in real time (mirroring
 * @citadel/client's sim-worker.ts, which paces itself via
 * `1000 / (20 * speed)`). `@engine/core` exposes no `FixedStepClock`
 * abstraction (there is only `Scheduler.tick(ctx)`, which advances by tick
 * COUNT, not wall time), so the 20 Hz pacing lives in the Worker, not here.
 * This module only counts ticks — a tick's output depends solely on the tick
 * count, never on wall-clock time (determinism is load-bearing; see
 * CLAUDE.md).
 */
import { MessageBus, Scheduler, World, createRng, type EngineEntity, type Rng } from "@engine/core";

/** Hollow's entity shape. Empty for now — later briefs add components. */
export type HollowEntity = EngineEntity;

export interface HollowSimOptions {
  /** Seed for the sim's root `Rng` — all randomness must fork from this (never `Math.random()`). */
  seed: number;
  /** Ticks per in-game day. No day/night system exists yet (chunk hollow-01); carried through
   *  for shape-parity with `@farm/sim-core`'s and `@citadel/sim-core`'s bootstrap options, so
   *  later briefs that add a day clock don't need to change this option's name. */
  ticksPerDay: number;
}

/** Trivial snapshot shape for chunk hollow-01. Later briefs replace/extend this. */
export interface HollowSnapshot {
  readonly tick: number;
}

export interface BootedHollowSim {
  world: World<HollowEntity>;
  bus: MessageBus;
  scheduler: Scheduler;
  rng: Rng;
  /** Advances the sim by exactly one tick. */
  tick(): void;
  /** Returns a snapshot of the current sim state (render/transport boundary). */
  getSnapshot(): HollowSnapshot;
}

export function bootstrapHollowSim(opts: HollowSimOptions): BootedHollowSim {
  const rng = createRng(opts.seed);
  const world = new World<HollowEntity>();
  const bus = new MessageBus();
  // No systems registered yet — chunk hollow-01 is scaffolding only. Later
  // briefs add `.stage("...").add(new SomeSystem(...))` calls here, mirroring
  // @farm/sim-core's and @citadel/sim-core's bootstrap.
  const scheduler = new Scheduler();

  let tickCount = 0;

  return {
    world,
    bus,
    scheduler,
    rng,
    tick(): void {
      scheduler.tick({ tick: tickCount });
      tickCount++;
    },
    getSnapshot(): HollowSnapshot {
      return { tick: tickCount };
    },
  };
}
