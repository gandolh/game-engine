/**
 * Social-verb DELIBERATION (chunk hollow-06b) — nine small `deliberate*`
 * helpers, one per verb in the brief's "shared intention-kind contract"
 * (gift/share/help_labor/teach/trade/steal/sabotage/rumor/attack), each a
 * PURE function of (agent, nearby candidates) that returns a `ScoredChoice`
 * — a numeric score plus the EXACT intention `data` hollow-06a's
 * `HollowSocialActSystem` (social/act-system.ts) consumes verbatim — or
 * `null` if the verb is infeasible for this agent right now (no surplus, no
 * candidate in range, actor isn't actually better at the skill, etc.).
 * `chooseSocialAction` (called by `agents/villager.ts`, AFTER the survival
 * ladder finds nothing urgent) runs all nine in one FIXED order and keeps
 * the highest score, gated by `SOCIAL_ACTION_MIN_SCORE` (falls back to
 * `work` below the gate — see villager.ts).
 *
 * ── determinism ───────────────────────────────────────────────────────────
 * No `Rng` anywhere in this file — every score is a pure function of THIS
 * tick's genome/needs/inventory/skills/relationships/neighbor-index state
 * (CLAUDE.md's determinism rule; see social/deliberation-constants.ts's
 * header for why a weighted-average-in-[0,1] scoring shape needs no random
 * tie-breaking at all). Ties are broken structurally, not by chance:
 *   - EVERY per-candidate scan below walks `ctx.neighbors` (already sorted
 *     ascending by id — agents/registry.ts's `buildNeighborIndex`) in that
 *     order and only replaces its running "best candidate" on a STRICT `>`
 *     (or `<` for a "lowest wins" scan like steal's distrust search), so a
 *     tie between two candidates always keeps the lower-id one.
 *   - `chooseSocialAction` walks `VERB_ORDER` in a fixed sequence and keeps
 *     the running best on a strict `>`, so a tie between two verbs' scores
 *     always keeps whichever verb comes first in `VERB_ORDER`.
 *
 * ── the "surplus good" helper ─────────────────────────────────────────────
 * `gift`/`share`/`trade` all need to answer "which good, if any, does the
 * actor have surplus of" — `bestSurplusGood` is the one shared helper for
 * that (favors materials on a tie, arbitrarily but consistently).
 *
 * ── grudge amplification (chunk hollow-12b) ──────────────────────────────
 * The four antagonistic helpers (`deliberateSteal`/`deliberateSabotage`/
 * `deliberateAttack`/`deliberateRumor`) each read the actor's OWN persistent
 * grudge toward a candidate via `grudgeToward` (`agent.feud?.byId.get(id) ?? 0`
 * — components/feud.ts) — no extra context plumbing, since the grudge ledger
 * already lives on the entity the deliberator is handed. A held grudge does
 * two things, both bounded by the same `FEUD_DELIBERATION_WEIGHT` dial
 * (social/feud-constants.ts): it biases target SELECTION (a candidate
 * already resented reads as more "distrusted" than the trust ledger alone
 * says, so a grudge-holder keeps re-targeting the same peer rather than
 * picking a fresh one each tick), and it adds a small ADDITIVE bonus on top
 * of (not folded into) the verb's own weighted-average score — nudging a
 * borderline case over `SOCIAL_ACTION_MIN_SCORE` without being large enough
 * to force action on its own (see feud-constants.ts's header for the exact
 * bound). This is still a PURE function of already-deterministic state (the
 * grudge ledger, like genome/trust, is arithmetic over deterministic prior
 * events) — no `Rng` anywhere here, same as the rest of this file.
 */
import { needFraction, relationshipScore } from "@engine/core/agent";
import type { HollowEntity, BehaviorGene } from "../components";
import type { HollowDeliberationContext, NeighborView } from "./registry";
import { NEED_FOOD, NEED_WEALTH, GOOD_FOOD, GOOD_MATERIALS } from "../economy";
import { SKILL_MATERIAL } from "../social/constants";
import {
  ROLE_SHARE_BIAS,
  ROLE_TEACH_BIAS,
  ROLE_TEACH_COMMUNITY_BONUS,
  ROLE_CARETAKER_BIAS,
  ROLE_CARETAKER_NEEDY_SELECTION_WEIGHT,
} from "../jobs/constants";
import {
  SOCIAL_CANDIDATE_RADIUS_TILES,
  SURPLUS_MATERIAL_THRESHOLD,
  SURPLUS_FOOD_THRESHOLD,
  RIVAL_MATERIAL_SCALE,
  NEUTRAL_TRUST,
  LOW_TRUST_THRESHOLD,
  VERY_LOW_TRUST_THRESHOLD,
  SOCIAL_ACTION_MIN_SCORE,
  STEAL_GREED_GATE,
  SABOTAGE_AGGRESSION_GATE,
  ATTACK_AGGRESSION_GATE,
  RUMOR_AGGRESSION_GATE,
  GIFT_LOYALTY_GATE,
  SHARE_LOYALTY_GATE,
  HELP_LABOR_SOCIABILITY_GATE,
  TEACH_CURIOSITY_GATE,
  STEAL_WEIGHTS,
  SABOTAGE_WEIGHTS,
  ATTACK_WEIGHTS,
  RUMOR_WEIGHTS,
  GIFT_WEIGHTS,
  SHARE_WEIGHTS,
  HELP_LABOR_WEIGHTS,
  TEACH_WEIGHTS,
  TRADE_WEIGHTS,
} from "../social/deliberation-constants";
import { FEUD_DELIBERATION_WEIGHT } from "../social/feud-constants";

/** What `chooseSocialAction` (and every `deliberate*` helper) returns for a
 *  feasible verb: a score (comparable across verbs — see the constants
 *  file's header) plus the intention `data` shape the ACT-stage social
 *  system expects verbatim. */
export interface ScoredChoice {
  readonly score: number;
  readonly kind: string;
  readonly data: Record<string, unknown>;
}

/** The narrowed shape every helper below requires — an agent with a full
 *  hollow-06 component set. `agents/villager.ts`'s `tryChooseSocialAction`
 *  is the one call site that narrows a plain `HollowEntity` down to this
 *  (falling back to the pure survival+work ladder for anything less, e.g. a
 *  hand-built test harness — same defensive convention as
 *  `restSeekThreshold`). */
export type SocialAgent = HollowEntity & {
  id: number;
  agent: NonNullable<HollowEntity["agent"]>;
  needs: NonNullable<HollowEntity["needs"]>;
  inventory: NonNullable<HollowEntity["inventory"]>;
  genome: NonNullable<HollowEntity["genome"]>;
  relationships: NonNullable<HollowEntity["relationships"]>;
  skills: NonNullable<HollowEntity["skills"]>;
};

function chebyshev(ax: number, ay: number, bx: number, by: number): number {
  return Math.max(Math.abs(ax - bx), Math.abs(ay - by));
}

/** Every OTHER living agent within `SOCIAL_CANDIDATE_RADIUS_TILES`, in the
 *  same ascending-id order `ctx.neighbors` already carries. */
function nearbyCandidates(agent: SocialAgent, ctx: HollowDeliberationContext): readonly NeighborView[] {
  const out: NeighborView[] = [];
  for (const n of ctx.neighbors) {
    if (n.id === agent.id) continue;
    if (chebyshev(agent.agent.gx, agent.agent.gy, n.gx, n.gy) > SOCIAL_CANDIDATE_RADIUS_TILES) continue;
    out.push(n);
  }
  return out;
}

/** Reads a behavior gene, defaulting to the neutral midpoint (0.5) if
 *  somehow absent (defensive only — every genome fills all `BEHAVIOR_GENES`). */
function gene(agent: SocialAgent, name: BehaviorGene): number {
  return agent.genome.behavior[name] ?? 0.5;
}

/** `1 - needFraction` for a named need — "how badly does the actor need
 *  this", 0 (fully satisfied) to 1 (empty). Missing need reads as no
 *  pressure (0), not maximum pressure — a defensive floor, not a signal. */
function needDeficit(agent: SocialAgent, kind: string): number {
  const need = agent.needs.byKind[kind];
  return need ? 1 - needFraction(need) : 0;
}

/** The actor's OWN persistent grudge toward `peerId` (chunk hollow-12b),
 *  `[0, FEUD_MAX]`, defaulting to 0 for a peer never wronged the actor (or a
 *  hand-built test harness with no `feud` component at all — see
 *  components/feud.ts's header). Shared by every antagonistic `deliberate*`
 *  helper below (see this file's "grudge amplification" header). */
function grudgeToward(agent: SocialAgent, peerId: number): number {
  return agent.feud?.byId.get(peerId) ?? 0;
}

/** The actor's own best surplus good right now — `{ good, have, threshold }`
 *  or `null` if neither good clears its threshold. Favors materials on a
 *  tie (arbitrary but consistent — see header). Shared by gift/share/trade. */
function bestSurplusGood(
  agent: SocialAgent,
): { readonly good: string; readonly have: number; readonly threshold: number } | null {
  const materials = agent.inventory.goods[GOOD_MATERIALS] ?? 0;
  const food = agent.inventory.goods[GOOD_FOOD] ?? 0;
  if (materials >= SURPLUS_MATERIAL_THRESHOLD && materials >= food) {
    return { good: GOOD_MATERIALS, have: materials, threshold: SURPLUS_MATERIAL_THRESHOLD };
  }
  if (food >= SURPLUS_FOOD_THRESHOLD) {
    return { good: GOOD_FOOD, have: food, threshold: SURPLUS_FOOD_THRESHOLD };
  }
  return null;
}

// --- antagonistic verbs -------------------------------------------------------

/** High need (low food/wealth) + a nearby holder of the wanted good + low
 *  trust toward them + high greed/aggression/risk. Targets the lowest-trust
 *  holder of whichever good the actor needs more. */
function deliberateSteal(agent: SocialAgent, candidates: readonly NeighborView[]): ScoredChoice | null {
  if (gene(agent, "greed") < STEAL_GREED_GATE) return null; // hard gate — see deliberation-constants.ts header
  const foodDeficit = needDeficit(agent, NEED_FOOD);
  const wealthDeficit = needDeficit(agent, NEED_WEALTH);
  const wantFood = foodDeficit >= wealthDeficit;
  const good = wantFood ? GOOD_FOOD : GOOD_MATERIALS;
  const threshold = wantFood ? SURPLUS_FOOD_THRESHOLD : SURPLUS_MATERIAL_THRESHOLD;
  const needPressure = Math.max(foodDeficit, wealthDeficit);

  let best: NeighborView | null = null;
  let bestTrust = Infinity;
  let bestBiasedTrust = Infinity;
  let bestGrudge = 0;
  for (const c of candidates) {
    const holding = wantFood ? c.food : c.materials;
    if (holding < threshold) continue;
    const trust = relationshipScore(agent.relationships, c.id);
    const grudge = grudgeToward(agent, c.id);
    // A held grudge biases target SELECTION toward this peer — reads as
    // "more distrusted than the ledger alone says" for picking whom to
    // steal from (see this file's "grudge amplification" header).
    const biasedTrust = trust - FEUD_DELIBERATION_WEIGHT * grudge;
    if (biasedTrust < bestBiasedTrust) {
      bestBiasedTrust = biasedTrust;
      bestTrust = trust;
      bestGrudge = grudge;
      best = c;
    }
  }
  if (!best) return null;

  const w = STEAL_WEIGHTS;
  const distrust = 1 - bestTrust;
  const score =
    w.needPressure * needPressure +
    w.greed * gene(agent, "greed") +
    w.aggression * gene(agent, "aggression") +
    w.risk * gene(agent, "risk") +
    w.distrust * distrust +
    FEUD_DELIBERATION_WEIGHT * bestGrudge;

  const holding = wantFood ? best.food : best.materials;
  const amount = Math.min(holding, threshold);
  return { score, kind: "steal", data: { targetId: best.id, good, amount } };
}

/** High aggression + low trust toward a nearby MATERIALLY SUCCESSFUL peer
 *  (rivalry) — no need requirement on the actor at all. */
function deliberateSabotage(agent: SocialAgent, candidates: readonly NeighborView[]): ScoredChoice | null {
  const aggression = gene(agent, "aggression");
  if (aggression < SABOTAGE_AGGRESSION_GATE) return null; // hard gate
  const w = SABOTAGE_WEIGHTS;

  let best: NeighborView | null = null;
  let bestScore = -Infinity;
  for (const c of candidates) {
    const distrust = 1 - relationshipScore(agent.relationships, c.id);
    const rivalry = Math.min(c.materials / RIVAL_MATERIAL_SCALE, 1);
    const grudge = grudgeToward(agent, c.id);
    const score = w.aggression * aggression + w.distrust * distrust + w.rivalry * rivalry + FEUD_DELIBERATION_WEIGHT * grudge;
    if (score > bestScore) {
      bestScore = score;
      best = c;
    }
  }
  if (!best) return null;
  return { score: bestScore, kind: "sabotage", data: { targetId: best.id } };
}

/** High aggression + a VERY curdled relationship — gated at
 *  `VERY_LOW_TRUST_THRESHOLD` so this stays rare (per the brief), on top of
 *  needing high aggression to also clear `SOCIAL_ACTION_MIN_SCORE`. */
function deliberateAttack(agent: SocialAgent, candidates: readonly NeighborView[]): ScoredChoice | null {
  if (gene(agent, "aggression") < ATTACK_AGGRESSION_GATE) return null; // hard gate — see header (rarity)
  let best: NeighborView | null = null;
  let bestTrust = Infinity;
  let bestBiasedTrust = Infinity;
  let bestGrudge = 0;
  for (const c of candidates) {
    const trust = relationshipScore(agent.relationships, c.id);
    // The rarity gate stays on RAW trust (a grudge alone must never bypass
    // "genuinely curdled relationship" — see deliberation-constants.ts's
    // header on ATTACK_AGGRESSION_GATE/VERY_LOW_TRUST_THRESHOLD); grudge only
    // biases WHICH already-gate-passing candidate gets picked.
    if (trust >= VERY_LOW_TRUST_THRESHOLD) continue;
    const grudge = grudgeToward(agent, c.id);
    const biasedTrust = trust - FEUD_DELIBERATION_WEIGHT * grudge;
    if (biasedTrust < bestBiasedTrust) {
      bestBiasedTrust = biasedTrust;
      bestTrust = trust;
      bestGrudge = grudge;
      best = c;
    }
  }
  if (!best) return null;

  const w = ATTACK_WEIGHTS;
  const distrust = 1 - bestTrust;
  const score = w.aggression * gene(agent, "aggression") + w.distrust * distrust + FEUD_DELIBERATION_WEIGHT * bestGrudge;
  return { score, kind: "attack", data: { targetId: best.id } };
}

/** Moderate aggression/low sociability + low trust toward a peer — cheap
 *  antagonism, gated only at `LOW_TRUST_THRESHOLD` (milder than attack's). */
function deliberateRumor(agent: SocialAgent, candidates: readonly NeighborView[]): ScoredChoice | null {
  const aggression = gene(agent, "aggression");
  if (aggression < RUMOR_AGGRESSION_GATE) return null; // hard gate
  let best: NeighborView | null = null;
  let bestTrust = Infinity;
  let bestBiasedTrust = Infinity;
  let bestGrudge = 0;
  for (const c of candidates) {
    const trust = relationshipScore(agent.relationships, c.id);
    if (trust >= LOW_TRUST_THRESHOLD) continue; // gate stays on RAW trust, same rationale as attack
    const grudge = grudgeToward(agent, c.id);
    const biasedTrust = trust - FEUD_DELIBERATION_WEIGHT * grudge;
    if (biasedTrust < bestBiasedTrust) {
      bestBiasedTrust = biasedTrust;
      bestTrust = trust;
      bestGrudge = grudge;
      best = c;
    }
  }
  if (!best) return null;

  const w = RUMOR_WEIGHTS;
  const distrust = 1 - bestTrust;
  const score =
    w.distrust * distrust +
    w.lowSociability * (1 - gene(agent, "sociability")) +
    w.aggression * gene(agent, "aggression") +
    FEUD_DELIBERATION_WEIGHT * bestGrudge;
  return { score, kind: "rumor", data: { targetId: best.id } };
}

// --- cooperative verbs ---------------------------------------------------------

/** Surplus goods + high loyalty/sociability + HIGH trust toward a nearby
 *  peer — targets the MOST trusted candidate in range.
 *
 *  hollow-14b: a CARETAKER additionally biases target SELECTION toward
 *  whoever looks neediest (poorest materials — same proxy `help_labor` uses)
 *  among trusted candidates, and gets a bounded score bump — see
 *  jobs/constants.ts's `ROLE_CARETAKER_*` header. With no caretaker role
 *  both bias terms are exactly 0, so selection/score are byte-identical to
 *  pre-hollow-14b (pure `trust`-max selection). */
function deliberateGift(agent: SocialAgent, candidates: readonly NeighborView[]): ScoredChoice | null {
  if (gene(agent, "loyalty") < GIFT_LOYALTY_GATE) return null; // hard gate
  const surplus = bestSurplusGood(agent);
  if (!surplus) return null;
  const isCaretaker = agent.occupation?.role === "caretaker";

  let best: NeighborView | null = null;
  let bestTrust = -Infinity;
  let bestEffective = -Infinity;
  for (const c of candidates) {
    const trust = relationshipScore(agent.relationships, c.id);
    const poorer = 1 - Math.min(c.materials / RIVAL_MATERIAL_SCALE, 1);
    const effective = trust + (isCaretaker ? ROLE_CARETAKER_NEEDY_SELECTION_WEIGHT * poorer : 0);
    if (effective > bestEffective) {
      bestEffective = effective;
      bestTrust = trust;
      best = c;
    }
  }
  if (!best) return null;

  const w = GIFT_WEIGHTS;
  const ownSurplus = Math.min(surplus.have / (surplus.threshold * 2), 1);
  let score = w.ownSurplus * ownSurplus + w.loyalty * gene(agent, "loyalty") + w.sociability * gene(agent, "sociability") + w.trust * bestTrust;
  if (isCaretaker) score += ROLE_CARETAKER_BIAS;
  const amount = Math.min(surplus.have, surplus.threshold);
  return { score, kind: "gift", data: { targetId: best.id, good: surplus.good, amount } };
}

/** Surplus + high loyalty + the actor actually belongs to a community
 *  (a hard gate, not a graded factor — nowhere to share into otherwise).
 *
 *  hollow-14b: a gatherer/crafter sharing THEIR OWN role's produced good
 *  (food-gatherer sharing food; material-gatherer/crafter sharing
 *  materials — crafter is, for now, just a material specialist, see
 *  jobs/constants.ts's header for the documented real-crafting seam) gets a
 *  bounded score bump so specialization visibly flows into the stockpile
 *  rather than waiting on loyalty/surplus alone. No role match (including
 *  "unassigned" or a missing `occupation`) leaves the score byte-identical
 *  to pre-hollow-14b. */
function deliberateShare(agent: SocialAgent): ScoredChoice | null {
  if (agent.communityId == null) return null;
  if (gene(agent, "loyalty") < SHARE_LOYALTY_GATE) return null; // hard gate
  const surplus = bestSurplusGood(agent);
  if (!surplus) return null;

  const w = SHARE_WEIGHTS;
  const ownSurplus = Math.min(surplus.have / (surplus.threshold * 2), 1);
  let score = w.ownSurplus * ownSurplus + w.loyalty * gene(agent, "loyalty");

  const role = agent.occupation?.role;
  const producesSharedGood =
    (role === "food-gatherer" && surplus.good === GOOD_FOOD) ||
    ((role === "material-gatherer" || role === "crafter") && surplus.good === GOOD_MATERIALS);
  if (producesSharedGood) score += ROLE_SHARE_BIAS;

  const amount = Math.min(surplus.have, surplus.threshold);
  return { score, kind: "share", data: { good: surplus.good, amount } };
}

/** High sociability/loyalty + a nearby community-mate (or, absent that, a
 *  trusted peer) who looks materially poorer.
 *
 *  hollow-14b: a CARETAKER additionally biases target SELECTION toward the
 *  neediest (poorest-looking) candidate — weighted onto the SAME `poorer`
 *  factor already computed per-candidate, so it shifts WHO gets helped, not
 *  just whether help fires — plus a bounded score bump. No caretaker role
 *  leaves both selection and score byte-identical to pre-hollow-14b. */
function deliberateHelpLabor(agent: SocialAgent, candidates: readonly NeighborView[]): ScoredChoice | null {
  const sociability = gene(agent, "sociability");
  if (sociability < HELP_LABOR_SOCIABILITY_GATE) return null; // hard gate
  const w = HELP_LABOR_WEIGHTS;
  const loyalty = gene(agent, "loyalty");
  const isCaretaker = agent.occupation?.role === "caretaker";

  let best: NeighborView | null = null;
  let bestScore = -Infinity;
  let bestEffective = -Infinity;
  for (const c of candidates) {
    const poorer = 1 - Math.min(c.materials / RIVAL_MATERIAL_SCALE, 1);
    const trust = relationshipScore(agent.relationships, c.id);
    const sameCommunity = agent.communityId != null && c.communityId === agent.communityId;
    const affinity = sameCommunity ? 1 : trust;
    const score = w.sociability * sociability + w.loyalty * loyalty + w.poorer * poorer + w.affinity * affinity;
    const effective = score + (isCaretaker ? ROLE_CARETAKER_NEEDY_SELECTION_WEIGHT * poorer : 0);
    if (effective > bestEffective) {
      bestEffective = effective;
      bestScore = score;
      best = c;
    }
  }
  if (!best) return null;
  const finalScore = isCaretaker ? bestScore + ROLE_CARETAKER_BIAS : bestScore;
  return { score: finalScore, kind: "help_labor", data: { targetId: best.id } };
}

/** High curiosity/sociability + the actor's `material` skill actually
 *  exceeding a nearby peer's (gated — teaching only means something if the
 *  teacher is genuinely better; picks the peer with the LARGEST gap).
 *
 *  hollow-14b: a TEACHER additionally biases target SELECTION toward a
 *  fellow COMMUNITY member (per the brief's "toward a lower-skilled
 *  community member") — added to the gap for selection purposes only, so a
 *  same-community lower-skilled peer can win over a larger-gap outsider —
 *  plus a bounded score bump. No teacher role leaves both selection and
 *  score byte-identical to pre-hollow-14b (pure largest-gap selection). */
function deliberateTeach(agent: SocialAgent, candidates: readonly NeighborView[]): ScoredChoice | null {
  if (gene(agent, "curiosity") < TEACH_CURIOSITY_GATE) return null; // hard gate
  const actorSkill = agent.skills.byKind[SKILL_MATERIAL] ?? 0;
  const isTeacher = agent.occupation?.role === "teacher";

  let best: NeighborView | null = null;
  let bestGap = 0;
  let bestEffective = 0;
  for (const c of candidates) {
    const gap = actorSkill - c.materialSkill;
    if (gap <= 0) continue;
    const sameCommunity = agent.communityId != null && c.communityId === agent.communityId;
    const effective = gap + (isTeacher && sameCommunity ? ROLE_TEACH_COMMUNITY_BONUS : 0);
    if (effective > bestEffective) {
      bestEffective = effective;
      bestGap = gap;
      best = c;
    }
  }
  if (!best) return null;

  const w = TEACH_WEIGHTS;
  let score = w.curiosity * gene(agent, "curiosity") + w.sociability * gene(agent, "sociability") + w.skillGap * bestGap;
  if (isTeacher) score += ROLE_TEACH_BIAS;
  return { score, kind: "teach", data: { targetId: best.id, skill: SKILL_MATERIAL } };
}

/** The actor has a surplus of one good and a deficit/need of the other, and
 *  a nearby peer holds enough of the complementary good — mutually
 *  beneficial, gated at neutral-or-better trust (no reason to propose a
 *  trade to someone who's unlikely to have one honored anyway). */
function deliberateTrade(agent: SocialAgent, candidates: readonly NeighborView[]): ScoredChoice | null {
  const materials = agent.inventory.goods[GOOD_MATERIALS] ?? 0;
  const food = agent.inventory.goods[GOOD_FOOD] ?? 0;

  let offerGood: string;
  let wantGood: string;
  let offerHave: number;
  let offerThreshold: number;
  let wantThreshold: number;
  if (materials >= SURPLUS_MATERIAL_THRESHOLD && food < SURPLUS_FOOD_THRESHOLD) {
    offerGood = GOOD_MATERIALS;
    wantGood = GOOD_FOOD;
    offerHave = materials;
    offerThreshold = SURPLUS_MATERIAL_THRESHOLD;
    wantThreshold = SURPLUS_FOOD_THRESHOLD;
  } else if (food >= SURPLUS_FOOD_THRESHOLD && materials < SURPLUS_MATERIAL_THRESHOLD) {
    offerGood = GOOD_FOOD;
    wantGood = GOOD_MATERIALS;
    offerHave = food;
    offerThreshold = SURPLUS_FOOD_THRESHOLD;
    wantThreshold = SURPLUS_MATERIAL_THRESHOLD;
  } else {
    return null; // no surplus-and-complementary-deficit shape right now
  }

  let best: NeighborView | null = null;
  let bestTrust = -Infinity;
  for (const c of candidates) {
    const candidateHolding = wantGood === GOOD_FOOD ? c.food : c.materials;
    if (candidateHolding < wantThreshold) continue;
    const trust = relationshipScore(agent.relationships, c.id);
    if (trust < NEUTRAL_TRUST) continue;
    if (trust > bestTrust) {
      bestTrust = trust;
      best = c;
    }
  }
  if (!best) return null;

  const w = TRADE_WEIGHTS;
  const ownSurplus = Math.min(offerHave / (offerThreshold * 2), 1);
  const ownDeficit = wantGood === GOOD_FOOD ? needDeficit(agent, NEED_FOOD) : needDeficit(agent, NEED_WEALTH);
  const score = w.ownSurplus * ownSurplus + w.ownDeficit * ownDeficit + w.trust * bestTrust;

  const offerAmount = Math.min(offerHave, offerThreshold);
  const candidateHolding = wantGood === GOOD_FOOD ? best.food : best.materials;
  const wantAmount = Math.min(wantThreshold, candidateHolding);
  return { score, kind: "trade", data: { targetId: best.id, offerGood, offerAmount, wantGood, wantAmount } };
}

// --- the chooser ---------------------------------------------------------------

/** Fixed evaluation order — ALSO the tie-break order (see header): the
 *  first verb here wins a strict-tie against a later one. Antagonistic
 *  verbs first, then cooperative, an arbitrary but fixed convention. */
const VERB_ORDER: ReadonlyArray<
  (agent: SocialAgent, candidates: readonly NeighborView[]) => ScoredChoice | null
> = [
  deliberateSteal,
  deliberateSabotage,
  deliberateAttack,
  deliberateRumor,
  deliberateGift,
  (agent) => deliberateShare(agent),
  deliberateHelpLabor,
  deliberateTeach,
  deliberateTrade,
];

/**
 * Runs every `deliberate*` helper above once and returns the single
 * highest-scoring feasible verb, gated by `SOCIAL_ACTION_MIN_SCORE` — or
 * `null` if nothing clears the gate (the caller, `agents/villager.ts`,
 * falls back to `work`).
 */
export function chooseSocialAction(agent: SocialAgent, ctx: HollowDeliberationContext): ScoredChoice | null {
  const candidates = nearbyCandidates(agent, ctx);

  let best: ScoredChoice | null = null;
  for (const fn of VERB_ORDER) {
    const choice = fn(agent, candidates);
    if (choice && (!best || choice.score > best.score)) best = choice;
  }
  if (!best || best.score < SOCIAL_ACTION_MIN_SCORE) return null;
  return best;
}
