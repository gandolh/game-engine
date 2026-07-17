import { createPersonalityRegistry, type Deliberator } from "@engine/core/agent";
import type { HollowEntity } from "../components";
import type { ResourceWorld } from "../world";

/**
 * The deliberation context handed to every Hollow deliberator: the tick plus
 * a read-only handle on the resource world (for nearest-node lookups). This
 * is Hollow's `Ctx` type parameter for `createDeliberateSystem`/
 * `createPersonalityRegistry` — the engine kernel's default `{tick}` shape
 * doesn't know about resource nodes, which are Hollow-specific.
 */
export interface HollowDeliberationContext {
  readonly tick: number;
  readonly resources: ResourceWorld;
}

export type HollowDeliberator = Deliberator<HollowEntity, HollowDeliberationContext>;

/**
 * One registry instance for the whole package (mirrors
 * `@farm/sim-core/agents/registry.ts`'s `personalityRegistry` — an isolated
 * instance per game, not a module-global map, so Farm/Citadel/Hollow kinds
 * never collide even though all three sit on the same engine kernel).
 */
export const personalityRegistry = createPersonalityRegistry<HollowEntity, HollowDeliberationContext>();

export function registerPersonality(kind: string, fn: HollowDeliberator): void {
  personalityRegistry.register(kind, fn);
}
