import type { World } from "@engine/core";
import { createPersonalityRegistry, type Deliberator } from "@engine/core/agent";
import type { HollowEntity } from "../components";
import type { ResourceWorld } from "../world";
import { GOOD_FOOD, GOOD_MATERIALS } from "../economy";
import { SKILL_MATERIAL } from "../social/constants";
import type { CommunityRegistry } from "../community";

/**
 * A plain-data snapshot of ONE agent, as seen by every OTHER agent's social
 * deliberation this tick (chunk hollow-06b) — built once per tick (see
 * `buildNeighborIndex`/`systems/deliberate.ts`'s `HollowDeliberateSystem`,
 * which builds the whole index exactly once per `run()` call, not once per
 * agent) from a `world.query`, NOT a live entity reference: a deliberator
 * can read a neighbor's position/holdings/skill but can never reach through
 * this view to mutate the neighbor (mutation only ever happens in an ACT-
 * stage system, on the entity itself). `materials`/`food` are read from
 * `inventory.goods` (economy/constants.ts's `GOOD_MATERIALS`/`GOOD_FOOD`
 * keys); `materialSkill` from `skills.byKind[SKILL_MATERIAL]`
 * (social/constants.ts) — both default to 0 for an entity missing that
 * component (defensive for hand-built test harnesses, same convention as
 * `agents/villager.ts`'s `restSeekThreshold`).
 */
export interface NeighborView {
  readonly id: number;
  readonly gx: number;
  readonly gy: number;
  readonly communityId: number | null;
  readonly materials: number;
  readonly food: number;
  readonly materialSkill: number;
}

/**
 * The deliberation context handed to every Hollow deliberator: the tick, a
 * read-only handle on the resource world (for nearest-node lookups), and the
 * per-tick neighbor index (chunk hollow-06b) a deliberator scans to find
 * social-verb candidates WITHOUT running its own `world.query` (which would
 * both duplicate the O(n) scan per agent and hand out live entity refs a
 * deliberator has no business mutating). This is Hollow's `Ctx` type
 * parameter for `createDeliberateSystem`/`createPersonalityRegistry` — the
 * engine kernel's default `{tick}` shape doesn't know about resource nodes
 * or neighbors, which are Hollow-specific.
 */
export interface HollowDeliberationContext {
  readonly tick: number;
  readonly resources: ResourceWorld;
  /** Every living agent (including the reader itself — callers filter out
   *  their own id), sorted ascending by id (determinism, CLAUDE.md). */
  readonly neighbors: readonly NeighborView[];
  /**
   * The run's day length in ticks (chunk hollow-14c) — threaded through so a
   * deliberator can compute `dayPhase(ctx.tick, ctx.ticksPerDay)`
   * (`world/day-cycle.ts`) and gate its ROUTINE (commute/work/gather/sleep)
   * without reaching into `HollowSimOptions` itself. Same value as
   * `HollowSimOptions.ticksPerDay` — see systems/deliberate.ts for how it's
   * threaded from `sim-bootstrap.ts`.
   */
  readonly ticksPerDay: number;
  /**
   * Read-only handle on the community registry (chunk hollow-14c) — lets a
   * deliberator resolve its own `communityId` to a `Community.territory`
   * centroid (the SLEEP-phase "go home" anchor for members; see
   * `agents/villager.ts`'s `homeAnchorFor`). Mirrors `resources` above: a
   * plain-data registry handle, never mutated by deliberation.
   */
  readonly communities: CommunityRegistry;
}

/**
 * Builds this tick's neighbor index (see `NeighborView`'s header) from the
 * live world — called ONCE per tick by `HollowDeliberateSystem.run` (NOT by
 * `makeContext`, which the engine's `createDeliberateSystem` invokes once
 * PER AGENT — see systems/deliberate.ts's header for why the build has to
 * happen outside that per-agent hook). `world.query("agent", "inventory")`
 * is the minimal component set every spawned agent has; `communityId`/
 * `skills` are read defensively (`?.`) since some hand-built test harnesses
 * omit them.
 */
export function buildNeighborIndex(world: World<HollowEntity>): readonly NeighborView[] {
  const out: NeighborView[] = [];
  for (const entity of world.query("agent", "inventory")) {
    if (entity.id === undefined) continue;
    out.push({
      id: entity.id,
      gx: entity.agent.gx,
      gy: entity.agent.gy,
      communityId: entity.communityId ?? null,
      materials: entity.inventory.goods[GOOD_MATERIALS] ?? 0,
      food: entity.inventory.goods[GOOD_FOOD] ?? 0,
      materialSkill: entity.skills?.byKind[SKILL_MATERIAL] ?? 0,
    });
  }
  out.sort((a, b) => a.id - b.id);
  return out;
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
