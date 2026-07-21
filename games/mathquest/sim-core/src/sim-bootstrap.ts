/**
 * MateQuest sim bootstrap — M0 scaffold: a transport-agnostic, deterministic
 * skeleton. Mirrors the SHAPE of `@hollow/sim-core`'s and `@citadel/sim-core`'s
 * bootstrap (a seeded `Rng` + an ECS `World` + a `Scheduler`), but carries NO
 * gameplay yet — combat, math-problem generators, and the run map are later
 * milestones (see corpus/wiki/mathquest-overview.md and the M0 brief,
 * corpus/todos/2026-07-21-mathquest-M0-scaffold.md).
 *
 * `bootstrapMathquestSim` must stay usable from:
 *   - a headless test, driving `step()` directly (this package's own
 *     `sim-bootstrap.test.ts`);
 *   - a browser Web Worker (`@mathquest/client`'s `src/worker/sim-worker.ts`),
 *     which paces `step()` on a wall-clock `setInterval` — pacing only, never
 *     affecting what a tick computes (determinism is load-bearing; see root
 *     CLAUDE.md's "Architecture essentials").
 * Nothing Worker- or DOM-specific belongs in this file (the sim/render
 * boundary convention).
 *
 * Determinism: all randomness must flow through the seeded `rng`
 * (`createRng`, `@engine/core/runtime`) — never `Math.random()`/`Date.now()`.
 * This M0 skeleton draws nothing from `rng` yet (there is no gameplay to
 * randomize), but constructs it here, at the same fixed point every boot, so
 * the M1 combat loop and later problem generators can start `rng.fork(label)`
 * calls without disturbing this file's own construction order.
 */
import { World, Scheduler, createRng, type Rng, type System, type SimContext } from "@engine/core";

/**
 * MateQuest's M0 entity shape — just the placeholder tick counter. The `[key:
 * string]: unknown` index signature satisfies `World`'s `EngineEntity`
 * constraint (same pattern as `@hollow/sim-core`'s `HollowEntity` and
 * `@citadel/sim-core`'s entity types) and lets later milestones extend this
 * interface additively.
 */
export interface MathquestEntity {
  id?: number;
  counter?: { value: number };
  [key: string]: unknown;
}

export interface MathquestSimOptions {
  /** Seed for the sim's root `Rng` — all future randomness must fork from this (never `Math.random()`). */
  seed: number;
}

/** Data-only snapshot (sim/render boundary) — the M0 skeleton exposes only the tick count. */
export interface MathquestSnapshot {
  readonly tick: number;
}

/**
 * The ONE placeholder system for M0: increments the counter entity's `value`
 * every tick, so the ECS + Scheduler wiring has something real to move. The
 * M1 combat loop replaces this system outright — it exists purely to prove
 * the seam end to end.
 */
class TickCounterSystem implements System {
  readonly name = "TickCounterSystem";

  constructor(private readonly world: World<MathquestEntity>) {}

  run(_ctx: SimContext): void {
    for (const entity of this.world.query("counter")) {
      entity.counter.value++;
    }
  }
}

export interface BootedMathquestSim {
  world: World<MathquestEntity>;
  scheduler: Scheduler;
  rng: Rng;
  /** Advances the sim by exactly one tick. */
  step(): void;
  /** Returns a snapshot of the current sim state (render/transport boundary). */
  getSnapshot(): MathquestSnapshot;
}

export function bootstrapMathquestSim(opts: MathquestSimOptions): BootedMathquestSim {
  const rng = createRng(opts.seed);
  const world = new World<MathquestEntity>();

  // The one counter entity the placeholder system advances.
  world.spawn({ counter: { value: 0 } });

  const scheduler = new Scheduler();
  scheduler.stage("TICK").add(new TickCounterSystem(world));

  let tickCount = 0;

  return {
    world,
    scheduler,
    rng,
    step(): void {
      scheduler.tick({ tick: tickCount });
      tickCount++;
    },
    getSnapshot(): MathquestSnapshot {
      return { tick: tickCount };
    },
  };
}
