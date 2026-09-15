/**
 * Building ONE consultation request (chunk hollow-13) — the "keep prompts
 * small + structured; never send anything that isn't needed for the
 * decision" half of the spec's contract.
 *
 * A request is a flat snapshot, built fresh at the moment of consultation
 * from live components but holding NO live references: plain numbers,
 * strings and arrays only. A provider can serialize it, sit on it for ten
 * ticks, and hand it back without ever being able to touch the world through
 * it — the same "plain-data view" discipline `agents/registry.ts`'s
 * `NeighborView` applies to neighbor reads.
 *
 * Determinism: every array built here is either already in ascending-id
 * order (`ctx.neighbors`) or explicitly sorted before it is returned. No
 * `Map`/`Set` iteration order reaches the output, and no `Rng` is touched —
 * the whole builder is a pure function of this tick's state.
 */
import { needFraction, relationshipScore } from "@engine/core/agent";
import type { HollowDeliberationContext } from "../agents/registry";
import type { ScoredChoice, SocialAgent } from "../agents/social-verbs";
import { candidateFingerprint } from "./validate";
import type {
  RationalizerCandidate,
  RationalizerGenomeSummary,
  RationalizerRelationship,
  RationalizerRequest,
  RationalizerStanding,
} from "./types";

/**
 * How many KEY relationships travel with a request, beyond the peers the
 * candidates actually name. Small on purpose: a 30-agent town has ~30
 * ledger entries per agent, almost all of them sitting at neutral because
 * the two agents merely walked past each other, and shipping those would be
 * pure prompt weight. The ones that carry information are the ones a
 * candidate targets (always included, whatever their trust) plus the most
 * EXTREME ties — the peers this agent most trusts and most resents.
 */
export const RELATIONSHIP_BUDGET = 6;

/** Trust's neutral midpoint (engine's `UNIT_TRUST_SCALE`) — an entry sitting
 *  exactly here carries no information, which is what makes distance from it
 *  the right "is this relationship interesting" ranking. */
const NEUTRAL_TRUST = 0.5;

/**
 * The belief keys the Hollow sim actually writes to `beliefs.data`
 * (`systems/perceive.ts`, `mortality/`), projected explicitly rather than
 * shipping the whole bag: `beliefs.data` is a `Record<string, unknown>` that
 * any later system may start writing to, and a request should never silently
 * start leaking new internal state into a prompt because someone added a
 * field. Adding a key here is a deliberate act.
 */
const BELIEF_KEYS = ["starving", "foodDepletedTicks"] as const;

function summarizeGenome(agent: SocialAgent): RationalizerGenomeSummary {
  const g = agent.genome;
  return {
    behavior: { ...g.behavior },
    aptitude: { ...g.aptitude },
    appearance: {
      height: g.appearance.height,
      build: g.appearance.build,
      skinTone: g.appearance.skinTone,
      hairTone: g.appearance.hairTone,
    },
  };
}

function summarizeNeeds(agent: SocialAgent): Record<string, number> {
  const out: Record<string, number> = {};
  // `byKind` is a plain object literal built at spawn (engine's `Needs`), so
  // its key order is insertion order and therefore deterministic; sorting
  // anyway costs nothing at this size and removes the question entirely.
  for (const kind of Object.keys(agent.needs.byKind).sort()) {
    const need = agent.needs.byKind[kind];
    if (need) out[kind] = needFraction(need);
  }
  return out;
}

function summarizeBeliefs(agent: SocialAgent): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  const data = agent.beliefs?.data;
  if (!data) return out;
  for (const key of BELIEF_KEYS) {
    const value = data[key];
    if (value !== undefined) out[key] = value;
  }
  return out;
}

function summarizeStanding(agent: SocialAgent, ctx: HollowDeliberationContext): RationalizerStanding {
  const communityId = agent.communityId ?? null;
  const community = communityId != null ? ctx.communities.get(communityId) : undefined;
  if (!community) {
    return { communityId: null, memberCount: 0, standing: null, isLeader: false };
  }
  return {
    communityId: community.id,
    memberCount: community.members.length,
    standing: community.standing[agent.id] ?? null,
    isLeader: community.leaderId === agent.id,
  };
}

/** Every peer id a candidate names as its target, ascending. A candidate
 *  without a `targetId` (`share`) names nobody. */
function candidateTargetIds(candidates: readonly ScoredChoice[]): ReadonlySet<number> {
  const ids = new Set<number>();
  for (const choice of candidates) {
    const target = choice.data["targetId"];
    if (typeof target === "number") ids.add(target);
  }
  return ids;
}

/**
 * The key relationships: every candidate target (unconditionally — the
 * decision literally turns on them), then the most extreme remaining ties up
 * to `RELATIONSHIP_BUDGET`, ranked by how far the actor's feeling sits from
 * neutral (grudge counts toward extremity), ties broken by ascending peer id.
 * The result is re-sorted ascending by peer id so the request's shape never
 * depends on the ranking.
 */
function summarizeRelationships(
  agent: SocialAgent,
  ctx: HollowDeliberationContext,
  candidates: readonly ScoredChoice[],
): readonly RationalizerRelationship[] {
  const targets = candidateTargetIds(candidates);
  const householdId = agent.householdId ?? null;
  const communityId = agent.communityId ?? null;

  const scored: Array<{ readonly view: RationalizerRelationship; readonly extremity: number }> = [];
  // `ctx.neighbors` is already ascending by id (agents/registry.ts), so equal
  // extremities keep the lower id under the strict `>` sort below.
  for (const neighbor of ctx.neighbors) {
    if (neighbor.id === agent.id) continue;
    const trust = relationshipScore(agent.relationships, neighbor.id);
    const grudge = agent.feud?.byId.get(neighbor.id) ?? 0;
    const isCandidateTarget = targets.has(neighbor.id);
    scored.push({
      view: {
        peerId: neighbor.id,
        trust,
        grudge,
        sameHousehold: householdId != null && neighbor.householdId === householdId,
        sameCommunity: communityId != null && neighbor.communityId === communityId,
        isCandidateTarget,
      },
      extremity: Math.abs(trust - NEUTRAL_TRUST) + grudge,
    });
  }

  const chosen: RationalizerRelationship[] = [];
  const taken = new Set<number>();
  for (const entry of scored) {
    if (entry.view.isCandidateTarget) {
      chosen.push(entry.view);
      taken.add(entry.view.peerId);
    }
  }
  const rest = scored
    .filter((e) => !taken.has(e.view.peerId))
    .sort((a, b) => (b.extremity !== a.extremity ? b.extremity - a.extremity : a.view.peerId - b.view.peerId));
  for (const entry of rest) {
    if (chosen.length >= RELATIONSHIP_BUDGET + taken.size) break;
    chosen.push(entry.view);
  }
  chosen.sort((a, b) => a.peerId - b.peerId);
  return chosen;
}

function toRequestCandidates(candidates: readonly ScoredChoice[]): readonly RationalizerCandidate[] {
  return candidates.map((choice, index) => ({
    index,
    kind: choice.kind,
    data: { ...choice.data },
    score: choice.score,
  }));
}

/**
 * Builds the request for one consultation. `bdiChoiceIndex` must be a valid
 * index into `candidates` (the caller has already run `bestCandidateIndex`
 * and refused to consult on an empty set), and the fingerprint is computed
 * from the SAME array the model will be shown — that pairing is what the
 * anchoring validator later re-checks against the live set.
 */
export function buildRationalizerRequest(
  agent: SocialAgent,
  ctx: HollowDeliberationContext,
  candidates: readonly ScoredChoice[],
  bdiChoiceIndex: number,
): RationalizerRequest {
  return {
    agentId: agent.id,
    tick: ctx.tick,
    genome: summarizeGenome(agent),
    beliefs: summarizeBeliefs(agent),
    needs: summarizeNeeds(agent),
    relationships: summarizeRelationships(agent, ctx, candidates),
    standing: summarizeStanding(agent, ctx),
    candidates: toRequestCandidates(candidates),
    bdiChoiceIndex,
    candidateFingerprint: candidateFingerprint(candidates),
  };
}
