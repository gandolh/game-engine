/**
 * `buildInspectDetail` — assembles an `InspectDetail` (chunk hollow-09c) from
 * a LIVE `BootedHollowSim` by READING existing component/registry APIs —
 * `world.query`, `CommunityRegistry.get`, `HouseholdRegistry.get`,
 * `LineageRegistry.get`/`all` — never mutating the world, never advancing a
 * tick, never drawing from any `Rng` (the sim/render determinism boundary,
 * CLAUDE.md: an inspect request is a pure snapshot-style read, same
 * contract as `getSnapshot()`). Runs on the Worker thread
 * (`worker/sim-worker.ts`'s `"inspect"` message handler); the assembled
 * `InspectDetail` then crosses `postMessage` back to the main thread, so
 * every field must be plain, structured-clone-safe data (see
 * `inspect-detail.ts`'s header).
 *
 * Two branches, per the brief:
 *  - ALIVE: the agent still has live ECS components — full detail
 *    (needs/BDI/relationships/community all populated from current state).
 *  - DEAD/despawned: the ECS components are gone (lifecycle.ts's death
 *    handling despawns them — see family/lifecycle-system.ts), but the
 *    PERMANENT `LineageRegistry` entry survives forever (its own header
 *    explains why) — a REDUCED detail (genome + kin + death info only,
 *    `alive:false`) is built from that instead.
 *  - Neither found (an id that was never spawned): `null`.
 */
import type { BootedHollowSim } from "@hollow/sim-core/sim-bootstrap";
import type { HollowEntity } from "@hollow/sim-core/sim-bootstrap";
import type { Genome } from "@hollow/sim-core/components";
import type { LineageEntry } from "@hollow/sim-core/lineage";
import { agentName } from "../agent-name";
import type {
  InspectBdi,
  InspectCommunity,
  InspectDetail,
  InspectGenome,
  InspectKinRef,
  InspectRelationship,
} from "../inspect-detail";

/** How many top trust ties to include — a compact panel, not a full dump of
 *  every peer an agent has ever brushed past. */
const RELATIONSHIP_TOP_N = 5;

/** The exact component set `buildInspectDetail` needs off a live entity —
 *  its own `world.query` call (distinct from `getSnapshot()`'s own query
 *  key, which doesn't need `relationships`/`intentions`) — see
 *  `ecs/world.ts`'s `Query` caching: a new key just registers a second
 *  cached query, it does not disturb the existing one. */
type InspectableEntity = HollowEntity &
  Required<
    Pick<
      HollowEntity,
      "id" | "agent" | "beliefs" | "needs" | "communityId" | "lifecycle" | "genome" | "householdId" | "relationships" | "intentions"
    >
  >;

function findLiveEntity(sim: BootedHollowSim, agentId: number): InspectableEntity | null {
  for (const entity of sim.world.query(
    "agent",
    "beliefs",
    "needs",
    "communityId",
    "lifecycle",
    "genome",
    "householdId",
    "relationships",
    "intentions",
  )) {
    if (entity.id === agentId) return entity as InspectableEntity;
  }
  return null;
}

function genomeDetail(genome: Genome): InspectGenome {
  return {
    behavior: { ...genome.behavior },
    aptitude: { ...genome.aptitude },
    appearance: { ...genome.appearance },
  };
}

function childrenOf(sim: BootedHollowSim, agentId: number): InspectKinRef[] {
  const out: InspectKinRef[] = [];
  for (const entry of sim.lineage.all()) {
    if (entry.parents && entry.parents.includes(agentId)) out.push({ id: entry.id, name: agentName(entry.id) });
  }
  return out;
}

function buildAliveDetail(sim: BootedHollowSim, entity: InspectableEntity): InspectDetail {
  const agentId = entity.id;

  const needs: Record<string, number> = {};
  for (const [kind, need] of Object.entries(entity.needs.byKind)) needs[kind] = need.value;

  const relationships: InspectRelationship[] = [...entity.relationships.byId.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, RELATIONSHIP_TOP_N)
    .map(([peerId, score]) => ({ peerId, peerName: agentName(peerId), score }));

  const lineageEntry = sim.lineage.get(agentId);
  const parents: InspectKinRef[] = [];
  if (lineageEntry?.parents) {
    for (const parentId of lineageEntry.parents) parents.push({ id: parentId, name: agentName(parentId) });
  }
  const children = childrenOf(sim, agentId);

  let partner: InspectKinRef | null = null;
  if (entity.householdId !== null) {
    const household = sim.households.get(entity.householdId);
    if (household) {
      const partnerId = household.partnerA === agentId ? household.partnerB : household.partnerA;
      partner = { id: partnerId, name: agentName(partnerId) };
    }
  }

  let community: InspectCommunity | null = null;
  if (entity.communityId !== null) {
    const c = sim.communities.get(entity.communityId);
    if (c) {
      community = {
        id: c.id,
        memberCount: c.members.length,
        shareRate: c.norms.shareRate,
        cooperationExpectation: c.norms.cooperationExpectation,
      };
    }
  }

  const starving = entity.beliefs.data.starving === true;
  const bdi: InspectBdi = {
    action: entity.agent.currentAction ?? "idle",
    intentionKind: entity.intentions.queue[0]?.kind ?? null,
    starving,
    foodDepletedTicks: (entity.beliefs.data.foodDepletedTicks as number | undefined) ?? 0,
    violentDeath: entity.beliefs.data.violentDeath === true,
  };

  return {
    id: agentId,
    name: agentName(agentId),
    alive: true,
    stage: entity.lifecycle.stage,
    ageTicks: entity.lifecycle.ageTicks,
    communityId: entity.communityId,
    householdId: entity.householdId,
    genome: genomeDetail(entity.genome),
    needs,
    starving,
    bdi,
    relationships,
    kin: { parents, children, partner },
    community,
    deathCause: null,
    deathTick: null,
  };
}

function buildDeadDetail(sim: BootedHollowSim, entry: LineageEntry, currentTick: number): InspectDetail {
  const parents: InspectKinRef[] = [];
  if (entry.parents) {
    for (const parentId of entry.parents) parents.push({ id: parentId, name: agentName(parentId) });
  }
  const children = childrenOf(sim, entry.id);
  const ageTicks = (entry.deathTick ?? currentTick) - entry.birthTick;

  return {
    id: entry.id,
    name: agentName(entry.id),
    alive: false,
    stage: "deceased",
    ageTicks,
    communityId: null,
    householdId: null,
    genome: genomeDetail(entry.genome),
    needs: null,
    starving: false,
    bdi: null,
    relationships: [],
    kin: { parents, children, partner: null },
    community: null,
    deathCause: entry.deathCause,
    deathTick: entry.deathTick,
  };
}

/** Read-only: assembles `agentId`'s `InspectDetail`, or `null` if `agentId`
 *  was never spawned in this sim at all. */
export function buildInspectDetail(sim: BootedHollowSim, currentTick: number, agentId: number): InspectDetail | null {
  const live = findLiveEntity(sim, agentId);
  if (live) return buildAliveDetail(sim, live);

  const lineageEntry = sim.lineage.get(agentId);
  if (!lineageEntry) return null;
  return buildDeadDetail(sim, lineageEntry, currentTick);
}
