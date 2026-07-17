/**
 * HollowDeliberateSystem — the engine's generic PERCEIVE → ACT dispatch
 * (`createDeliberateSystem`), wired to Hollow's personality registry and its
 * resource-world-aware deliberation context. Same thin-wrapper shape as
 * `@farm/sim-core/systems/cognition/deliberate.ts`.
 */
import type { SimContext, System, World } from "@engine/core";
import { createDeliberateSystem } from "@engine/core/agent";
import type { HollowEntity, HollowFsmState } from "../components";
import { personalityRegistry } from "../agents";
import type { ResourceWorld } from "../world";

const PERCEIVE_STATE: HollowFsmState = "PERCEIVE";
const ACT_STATE: HollowFsmState = "ACT";

export class HollowDeliberateSystem implements System {
  readonly name = "HollowDeliberateSystem";
  private readonly inner: System;

  constructor(world: World<HollowEntity>, resources: ResourceWorld) {
    this.inner = createDeliberateSystem(world, {
      name: "HollowDeliberateSystem",
      registry: personalityRegistry,
      perceiveState: PERCEIVE_STATE,
      actState: ACT_STATE,
      makeContext: (ctx: SimContext) => ({ tick: ctx.tick, resources }),
    });
  }

  run(ctx: SimContext): void {
    this.inner.run(ctx);
  }
}
