import type { SimContext, System, World } from "@engine/core";
import { createDeliberateSystem } from "@engine/core/agent";
import type { GameEntity } from "../../components";
import { personalityRegistry } from "../../agents/registry";

/**
 * Farm's deliberation loop is the engine's generic PERCEIVE → ACT dispatch,
 * wired to Farm's personality registry and its human-player skip. Behavior is
 * identical to the previous hand-rolled loop; kept as a class so the scheduler
 * registration (`new DeliberateSystem(world)`) and the system name are unchanged.
 */
export class DeliberateSystem implements System {
  readonly name = "DeliberateSystem";
  private readonly inner: System;

  constructor(world: World<GameEntity>) {
    this.inner = createDeliberateSystem(world, {
      name: "DeliberateSystem",
      registry: personalityRegistry,
      perceiveState: "PERCEIVE",
      actState: "ACT",
      shouldSkip: (agent) => agent.player !== undefined,
    });
  }

  run(ctx: SimContext): void {
    this.inner.run(ctx);
  }
}
