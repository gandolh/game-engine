/**
 * Render-snapshot construction for Hollow: `getSnapshot`.
 *
 * Extracted verbatim from `bootstrapHollowSim`'s closure (audit-24), mirroring
 * `games/citadel/sim-core/src/snapshot-builder.ts` (audit-23) and
 * `games/farm/sim-core/src/snapshot-builder/`. Everything the old closure
 * read is threaded through explicitly: the ECS `world`, the plain-data
 * `resources`/`communities`/`households` registries, the running counters
 * (`bornCount`/`diedCount`/`buriedCount`/`socialCounts`), and the tick number.
 *
 * **tickCount single-sourcing (audit-04 handoff):** `bootstrapHollowSim` keeps
 * ONE closure-local `let tickCount`. Its `tick()` method increments that
 * variable, its `get tickCount()` getter reads it directly, and its
 * `getSnapshot()` method calls this file's `getSnapshot` passing that SAME
 * variable's current value as the `tick` parameter — not a second counter.
 * There is exactly one source of truth; this extraction does not introduce
 * a copy that could drift from it.
 *
 * **Behaviour is unchanged by construction**: the ECS query, the per-corpse/
 * per-node/per-community projections, and every field on the returned
 * snapshot are exactly as they were inside `bootstrapHollowSim`.
 */
import type { World } from "@engine/core";
import type { HollowEntity } from "./components";
import type { ResourceWorld } from "./world";
import { HEARTH_TILE, GRAVEYARD_TILE } from "./world";
import type { CommunityRegistry } from "./community";
import { COMMUNITY_DEFAULT_ADMISSION_POLICY } from "./community";
import type { HouseholdRegistry } from "./family";
import type {
  HollowSnapshot,
  HollowAgentSnapshot,
  HollowCorpseSnapshot,
  HollowResourceNodeSnapshot,
  HollowCommunitySnapshot,
} from "./sim-bootstrap";

/**
 * Full render/observer snapshot for the current tick.
 *
 * @param tick - the bootstrap's closure-local `tickCount`, passed by value at
 *   the call site (see this file's header for the single-source contract with
 *   `BootedHollowSim.tickCount`, audit-04).
 * @param socialCounts - the bootstrap's running per-verb totals; copied
 *   (`{ ...socialCounts }`) into the returned snapshot, same as the original
 *   closure did, so callers can't mutate the live counters through it.
 */
export function getSnapshot(
  world: World<HollowEntity>,
  resources: ResourceWorld,
  communities: CommunityRegistry,
  households: HouseholdRegistry,
  bornCount: number,
  diedCount: number,
  buriedCount: number,
  socialCounts: Readonly<Record<string, number>>,
  tick: number,
): HollowSnapshot {
  const agents: HollowAgentSnapshot[] = [];
  for (const entity of world.query(
    "agent",
    "needs",
    "inventory",
    "personality",
    "beliefs",
    "communityId",
    "lifecycle",
    "genome",
    "householdId",
    "occupation",
  )) {
    const needs: Record<string, number> = {};
    for (const [kind, need] of Object.entries(entity.needs.byKind)) {
      needs[kind] = need.value;
    }
    agents.push({
      id: entity.id ?? -1,
      kind: entity.personality.kind,
      gx: entity.agent.gx,
      gy: entity.agent.gy,
      needs,
      inventory: { ...entity.inventory.goods },
      starving: entity.beliefs.data.starving === true,
      communityId: entity.communityId,
      ageTicks: entity.lifecycle.ageTicks,
      stage: entity.lifecycle.stage,
      householdId: entity.householdId,
      appearance: {
        height: entity.genome.appearance.height,
        build: entity.genome.appearance.build,
        skinTone: entity.genome.appearance.skinTone,
        hairTone: entity.genome.appearance.hairTone,
      },
      action: entity.agent.currentAction ?? "idle",
      occupation: entity.occupation.role,
      diseased: entity.disease !== undefined,
    });
  }
  const corpses: HollowCorpseSnapshot[] = [];
  for (const entity of world.query("corpse")) {
    const c = entity.corpse;
    corpses.push({
      id: entity.id ?? -1,
      deceasedId: c.deceasedId,
      gx: c.gx,
      gy: c.gy,
      buried: c.buried,
      rotting: c.rotting,
      carriedBy: c.carriedBy,
    });
  }
  corpses.sort((a, b) => a.id - b.id);
  const resourceNodes: HollowResourceNodeSnapshot[] = resources.nodes.map((node) => ({
    id: node.id,
    kind: node.kind,
    gx: node.gx,
    gy: node.gy,
    stock: node.stock,
    maxStock: node.maxStock,
  }));
  const communitiesSnapshot: HollowCommunitySnapshot[] = communities.all().map((c) => ({
    id: c.id,
    members: [...c.members],
    territory: c.territory.map((t) => ({ gx: t.gx, gy: t.gy })),
    stockpile: { ...c.stockpile },
    norms: {
      shareRate: c.norms.shareRate,
      cooperationExpectation: c.norms.cooperationExpectation,
      admissionPolicy: c.norms.admissionPolicy ?? COMMUNITY_DEFAULT_ADMISSION_POLICY,
    },
    leaderId: c.leaderId,
  }));
  return {
    tick,
    aliveCount: agents.length,
    agents,
    resourceNodes,
    communities: communitiesSnapshot,
    bornCount,
    diedCount,
    householdCount: households.all().length,
    socialCounts: { ...socialCounts },
    hearth: { gx: HEARTH_TILE.gx, gy: HEARTH_TILE.gy },
    corpses,
    graveyard: { gx: GRAVEYARD_TILE.gx, gy: GRAVEYARD_TILE.gy },
    buriedCount,
  };
}
