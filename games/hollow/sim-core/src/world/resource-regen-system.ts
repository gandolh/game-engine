import type { System } from "@engine/core";
import type { ResourceWorld } from "./resources";

/** Advances every resource node's regeneration by one tick. Runs LAST in the
 *  scheduler order (see `sim-bootstrap.ts`) — nodes regen once per tick
 *  regardless of what harvesting happened earlier in the same tick, so a
 *  node harvested down to zero this tick still ticks its regen forward
 *  rather than skipping a step. */
export function createResourceRegenSystem(resources: ResourceWorld): System {
  return {
    name: "ResourceRegenSystem",
    run(): void {
      resources.regenTick();
    },
  };
}
