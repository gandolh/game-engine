/**
 * HollowDeliberateSystem — the engine's generic PERCEIVE → ACT dispatch
 * (`createDeliberateSystem`), wired to Hollow's personality registry and its
 * resource-world-aware deliberation context. Same thin-wrapper shape as
 * `@farm/sim-core/systems/cognition/deliberate.ts`.
 *
 * Chunk hollow-06b additionally builds the per-tick NEIGHBOR index
 * (agents/registry.ts's `NeighborView`/`buildNeighborIndex`) that social-verb
 * deliberation reads to find candidates. It's built HERE, in `run()`, rather
 * than inside the `makeContext` callback passed to `createDeliberateSystem`
 * below — the engine kernel calls `makeContext(ctx)` once PER AGENT (see
 * `@engine/core/agent/deliberate-system.ts`), so building an O(n) index
 * there would rebuild it n times a tick. Building it once in `run()`
 * (before delegating to the wrapped system) and having `makeContext` just
 * read the already-built array via closure keeps the whole pass O(n).
 *
 * Chunk hollow-14c additionally threads `ticksPerDay` (so a deliberator can
 * compute `dayPhase(ctx.tick, ctx.ticksPerDay)`, `world/day-cycle.ts`) and a
 * read-only `communities` handle (so it can resolve its own community's
 * territory centroid as a SLEEP-phase "go home" anchor) into the context —
 * both plain constructor params closed over by `makeContext`, same pattern
 * as `resources` above.
 */
import type { SimContext, System, World } from "@engine/core";
import { createDeliberateSystem } from "@engine/core/agent";
import type { HollowEntity, HollowFsmState } from "../components";
import { personalityRegistry, buildNeighborIndex, type NeighborView } from "../agents";
import type { ResourceWorld } from "../world";
import type { CommunityRegistry } from "../community";

const PERCEIVE_STATE: HollowFsmState = "PERCEIVE";
const ACT_STATE: HollowFsmState = "ACT";

export class HollowDeliberateSystem implements System {
  readonly name = "HollowDeliberateSystem";
  private readonly inner: System;
  private neighbors: readonly NeighborView[] = [];

  constructor(
    private readonly world: World<HollowEntity>,
    resources: ResourceWorld,
    communities: CommunityRegistry,
    ticksPerDay: number,
  ) {
    this.inner = createDeliberateSystem(world, {
      name: "HollowDeliberateSystem",
      registry: personalityRegistry,
      perceiveState: PERCEIVE_STATE,
      actState: ACT_STATE,
      makeContext: (ctx: SimContext) => ({
        tick: ctx.tick,
        resources,
        neighbors: this.neighbors,
        ticksPerDay,
        communities,
      }),
    });
  }

  run(ctx: SimContext): void {
    this.neighbors = buildNeighborIndex(this.world);
    this.inner.run(ctx);
  }
}
