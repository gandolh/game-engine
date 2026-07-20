/**
 * HollowSocialActSystem — chunk hollow-06a's ACT-stage dispatch for the nine
 * social verbs (the brief's "shared intention-kind contract"): gift, share,
 * help_labor, teach, trade, steal, sabotage, rumor, attack. A dedicated
 * sibling of `HollowActSystem` (not new `case`s bolted onto it) — nine
 * verbs is enough that folding them into `act.ts` would double that file's
 * size and mix two genuinely separate concerns (subsistence work vs.
 * inter-agent social moves). Registered in the SAME "ACT" stage right after
 * `HollowActSystem` (sim-bootstrap.ts); like that system, it only acts on
 * "ACT"-state agents whose TOP intention is one it owns, and pops the
 * intention on completion (see `runHelpLabor`'s note on the one exception —
 * a multi-tick verb that stays queued while travelling).
 *
 * `systems/act.ts`'s own ACT-stage dispatch has a defensive default case
 * that drops any intention `kind` it doesn't recognize (stall-prevention).
 * A social verb's kind is exactly such an "unrecognized kind" from
 * `HollowActSystem`'s point of view, so `social/constants.ts`'s
 * `SOCIAL_VERB_KINDS` set is consulted there to whitelist these nine kinds
 * through untouched, leaving them for this system to execute (and pop) —
 * see act.ts's updated default-case comment.
 *
 * Every verb here does a REAL, observable thing and emits exactly one
 * `ONT_SOCIAL.*` event (see protocols/social.ts) — nothing here is a no-op
 * dressed up as a mechanic. Guards (missing/despawned target, insufficient
 * goods, self-target) resolve to a silent no-op (intention still popped —
 * a bad/stale intention should never stall an agent), never a throw.
 *
 * Target lookups resolve `targetId` via a small id -> entity index built
 * once per `run()` call (ascending entity-id order — determinism,
 * CLAUDE.md), not a fresh `world.query` scan per verb.
 */
import type { SimContext, System, World, MessageBus, Rng, Intention } from "@engine/core";
import { PERFORMATIVE, applyRelationshipDelta, replenishNeed, OfferLedger } from "@engine/core/agent";
import type { HollowEntity, HollowFsmState, HollowAgent, Skills } from "../components";
import { makeSkills, practiceSkill, GENE_MAX, addGoods, takeGoods } from "../components";
import { GOOD_MATERIALS, NEED_WEALTH, MATERIAL_HARVEST_PER_TICK, WEALTH_PER_MATERIAL_UNIT } from "../economy";
import type { ResourceWorld } from "../world";
import type { CommunityRegistry } from "../community";
import {
  ONT_SOCIAL,
  type GiftBody,
  type ShareBody,
  type HelpLaborBody,
  type TeachBody,
  type TradeBody,
  type StealBody,
  type StealDetectedBody,
  type SabotageBody,
  type RumorBody,
  type AttackBody,
} from "../protocols";
import {
  SKILL_MATERIAL,
  SKILL_YIELD_BONUS,
  PRACTICE_RATE,
  TEACH_RATE,
  GIFT_TRUST_DELTA,
  HELP_TRUST_DELTA,
  TEACH_TRUST_DELTA,
  TRADE_TRUST_DELTA,
  STEAL_DETECTION_PROB,
  STEAL_DETECTED_TRUST_DELTA,
  SABOTAGE_DETECTION_PROB,
  SABOTAGE_DETECTED_TRUST_DELTA,
  SABOTAGE_DESTROY_FRACTION,
  SABOTAGE_SKILL_PENALTY,
  ATTACK_LETHALITY_PROB,
  ATTACK_TRUST_DELTA,
  TRADE_OFFER_TTL_TICKS,
  SOCIAL_VERB_KINDS,
} from "./constants";

const ACT_STATE: HollowFsmState = "ACT";

export interface SocialActSystemOptions {
  /** Probability a `steal` is detected — defaults to `STEAL_DETECTION_PROB`.
   *  Override to 0/1 to force the undetected/detected branch deterministically. */
  stealDetectionProb?: number;
  /** Probability an `attack` is lethal — defaults to `ATTACK_LETHALITY_PROB`. */
  attackLethalityProb?: number;
  /** Probability a `sabotage` is detected — defaults to `SABOTAGE_DETECTION_PROB`. */
  sabotageDetectionProb?: number;
}

type SocialAgent = HollowEntity & {
  id: number;
  agent: NonNullable<HollowEntity["agent"]>;
  needs: NonNullable<HollowEntity["needs"]>;
  inventory: NonNullable<HollowEntity["inventory"]>;
  intentions: NonNullable<HollowEntity["intentions"]>;
  fsm: NonNullable<HollowEntity["fsm"]>;
  beliefs: NonNullable<HollowEntity["beliefs"]>;
  relationships: NonNullable<HollowEntity["relationships"]>;
};

/** The payload an in-flight `trade` offer's `OfferLedger` entry carries —
 *  everything needed to settle it (see `runTrade`). */
interface TradeOfferPayload {
  actorId: number;
  targetId: number;
  offerGood: string;
  offerAmount: number;
  wantGood: string;
  wantAmount: number;
}

/** Steps `agent` one tile toward (targetGx, targetGy); returns true once
 *  arrived. Copied from systems/act.ts's private helper of the same name
 *  (identical grid-stepping contract — no pathfinder, M1 scope) rather than
 *  exported/shared, to keep the two ACT-stage systems fully independent. */
function stepToward(agent: HollowAgent, targetGx: number, targetGy: number): boolean {
  if (agent.gx === targetGx && agent.gy === targetGy) {
    agent.moveTarget = null;
    return true;
  }
  agent.moveTarget = { gx: targetGx, gy: targetGy };
  agent.gx += Math.sign(targetGx - agent.gx);
  agent.gy += Math.sign(targetGy - agent.gy);
  return false;
}

/** Lazily attaches a `Skills` component (all-zero) to an entity that
 *  doesn't have one yet — defensive only: production code (population.ts,
 *  family/reproduction-system.ts) always seeds one at spawn; this guards
 *  hand-built test harnesses / pre-hollow-06a entities from throwing. */
function ensureSkills(entity: HollowEntity): Skills {
  if (!entity.skills) entity.skills = makeSkills();
  return entity.skills;
}

export class HollowSocialActSystem implements System {
  readonly name = "HollowSocialActSystem";

  private readonly stealDetectionProb: number;
  private readonly attackLethalityProb: number;
  private readonly sabotageDetectionProb: number;
  private readonly tradeOffers = new OfferLedger<TradeOfferPayload>(TRADE_OFFER_TTL_TICKS);

  constructor(
    private readonly world: World<HollowEntity>,
    private readonly resources: ResourceWorld,
    private readonly communities: CommunityRegistry,
    private readonly bus: MessageBus,
    private readonly stealDetectionRng: Rng,
    private readonly attackRng: Rng,
    private readonly sabotageDetectionRng: Rng,
    opts: SocialActSystemOptions = {},
  ) {
    this.stealDetectionProb = opts.stealDetectionProb ?? STEAL_DETECTION_PROB;
    this.attackLethalityProb = opts.attackLethalityProb ?? ATTACK_LETHALITY_PROB;
    this.sabotageDetectionProb = opts.sabotageDetectionProb ?? SABOTAGE_DETECTION_PROB;
  }

  run(ctx: SimContext): void {
    this.tradeOffers.expire(ctx.tick);
    this.tradeOffers.beginHandshakeRound();

    const byId = new Map<number, SocialAgent>();
    const acting: SocialAgent[] = [];
    for (const e of this.world.query("agent", "needs", "inventory", "intentions", "fsm", "beliefs", "relationships")) {
      const entity = e as SocialAgent;
      byId.set(entity.id, entity);
      if (entity.fsm.current === ACT_STATE) acting.push(entity);
    }
    acting.sort((a, b) => a.id - b.id);

    for (const entity of acting) {
      const intention = entity.intentions.queue[0];
      if (!intention || !SOCIAL_VERB_KINDS.has(intention.kind)) continue;

      switch (intention.kind) {
        case "gift":
          this.runGift(entity, intention, byId, ctx.tick);
          break;
        case "share":
          this.runShare(entity, intention, ctx.tick);
          break;
        case "help_labor":
          this.runHelpLabor(entity, intention, byId, ctx.tick);
          break;
        case "teach":
          this.runTeach(entity, intention, byId, ctx.tick);
          break;
        case "trade":
          this.runTrade(entity, intention, byId, ctx.tick);
          break;
        case "steal":
          this.runSteal(entity, intention, byId, ctx.tick);
          break;
        case "sabotage":
          this.runSabotage(entity, intention, byId, ctx.tick);
          break;
        case "rumor":
          this.runRumor(entity, intention, byId, ctx.tick);
          break;
        case "attack":
          this.runAttack(entity, intention, byId, ctx.tick);
          break;
      }
    }
  }

  // --- cooperative verbs -----------------------------------------------------

  private runGift(entity: SocialAgent, intention: Intention, byId: Map<number, SocialAgent>, tick: number): void {
    entity.agent.currentAction = "gift"; // render-only (chunk hollow-09a)
    entity.intentions.queue.shift(); // always resolves (or no-ops) in one tick
    const targetId = intention.data.targetId as number;
    if (targetId === entity.id) return;
    const target = byId.get(targetId);
    if (!target) return;
    const good = intention.data.good as string;
    const amount = intention.data.amount as number;

    const taken = takeGoods(entity.inventory, good, amount);
    if (taken <= 0) return; // actor had nothing to give
    addGoods(target.inventory, good, taken);
    applyRelationshipDelta(target.relationships, entity.id, GIFT_TRUST_DELTA);

    const body: GiftBody = { actorId: entity.id, targetId, good, amount: taken, tick };
    this.emit(ONT_SOCIAL.GIFT, entity.id, body, tick);
  }

  private runShare(entity: SocialAgent, intention: Intention, tick: number): void {
    entity.agent.currentAction = "share"; // render-only (chunk hollow-09a)
    entity.intentions.queue.shift();
    const communityId = entity.communityId;
    if (communityId == null) return; // unaffiliated -- nowhere to share into
    const good = intention.data.good as string;
    const amount = intention.data.amount as number;

    const taken = takeGoods(entity.inventory, good, amount);
    if (taken <= 0) return;
    this.communities.contribute(communityId, good, taken);

    const body: ShareBody = { actorId: entity.id, communityId, good, amount: taken, tick };
    this.emit(ONT_SOCIAL.SHARE, entity.id, body, tick);
  }

  /** Actor works ONE tick of a material node (travel + harvest, same
   *  mechanic as systems/act.ts's `runWork`) but the produce lands in the
   *  TARGET's inventory and replenishes the TARGET's `wealth` need — the
   *  actor's own inventory never changes. Multi-tick like `runWork`: while
   *  still travelling, `stepToward` returns false and the intention stays
   *  queued (NOT popped) so the same intention resumes next tick — this is
   *  the one social verb that can span more than one tick. */
  private runHelpLabor(
    entity: SocialAgent,
    intention: Intention,
    byId: Map<number, SocialAgent>,
    tick: number,
  ): void {
    const targetId = intention.data.targetId as number;
    if (targetId === entity.id) {
      entity.intentions.queue.shift();
      return;
    }
    const target = byId.get(targetId);
    if (!target) {
      entity.intentions.queue.shift();
      return;
    }

    const node = this.resources.nearestNode("material", entity.agent.gx, entity.agent.gy);
    if (!node) {
      entity.intentions.queue.shift();
      return;
    }
    if (!stepToward(entity.agent, node.gx, node.gy)) {
      entity.agent.currentAction = "walk"; // render-only (chunk hollow-09a)
      return;
    }
    entity.agent.currentAction = "help"; // render-only (chunk hollow-09a)

    const actorSkill = entity.skills?.byKind[SKILL_MATERIAL] ?? 0;
    const harvested = this.resources.harvest(node.id, MATERIAL_HARVEST_PER_TICK * (1 + SKILL_YIELD_BONUS * actorSkill));
    if (harvested > 0) {
      const actorSkills = ensureSkills(entity);
      const actorCap = entity.genome?.aptitude[SKILL_MATERIAL] ?? GENE_MAX;
      practiceSkill(actorSkills, actorCap, SKILL_MATERIAL, PRACTICE_RATE);

      addGoods(target.inventory, GOOD_MATERIALS, harvested);
      const wealth = target.needs.byKind[NEED_WEALTH];
      if (wealth) replenishNeed(wealth, harvested * WEALTH_PER_MATERIAL_UNIT);
      applyRelationshipDelta(target.relationships, entity.id, HELP_TRUST_DELTA);

      const body: HelpLaborBody = { actorId: entity.id, targetId, good: GOOD_MATERIALS, amount: harvested, tick };
      this.emit(ONT_SOCIAL.HELP, entity.id, body, tick);
    }

    const wealth = target.needs.byKind[NEED_WEALTH];
    const full = wealth ? wealth.value >= wealth.max : true;
    if (full || harvested === 0) entity.intentions.queue.shift();
  }

  /** Raises the TARGET's skill toward the ACTOR's, capped by the target's
   *  own aptitude — a strict no-op (still popped, no event) if the actor
   *  isn't actually better than the learner. */
  private runTeach(entity: SocialAgent, intention: Intention, byId: Map<number, SocialAgent>, tick: number): void {
    entity.agent.currentAction = "teach"; // render-only (chunk hollow-09a)
    entity.intentions.queue.shift();
    const targetId = intention.data.targetId as number;
    if (targetId === entity.id) return;
    const target = byId.get(targetId);
    if (!target) return;
    const skillKind = intention.data.skill as string;

    const actorSkill = entity.skills?.byKind[skillKind] ?? 0;
    const targetSkills = ensureSkills(target);
    const before = targetSkills.byKind[skillKind] ?? 0;
    if (actorSkill <= before) return; // teacher isn't better than the learner -- no-op

    // Move the learner toward the ACTOR's level (not the learner's own
    // aptitude cap — `practiceSkill`'s `cap` argument here is "what we're
    // approaching", which for `teach` is the teacher's skill, not a hard
    // ceiling), then separately clamp the result to the learner's own
    // aptitude cap — exactly the brief's
    // `min(targetAptitudeCap, target.skill + TEACH_RATE*(actor.skill - target.skill))`.
    const targetCap = target.genome?.aptitude[skillKind] ?? GENE_MAX;
    practiceSkill(targetSkills, actorSkill, skillKind, TEACH_RATE);
    const uncapped = targetSkills.byKind[skillKind] ?? before;
    const after = Math.min(targetCap, uncapped);
    targetSkills.byKind[skillKind] = after;
    if (after <= before) return; // already at (or somehow above) the achievable ceiling

    applyRelationshipDelta(target.relationships, entity.id, TEACH_TRUST_DELTA);
    const body: TeachBody = { actorId: entity.id, targetId, skill: skillKind, before, after, tick };
    this.emit(ONT_SOCIAL.TEACH, entity.id, body, tick);
  }

  /**
   * `trade` — a CNP handshake shape (PROPOSE implied by the offer, then a
   * settled ACCEPT/REJECT) over `OfferLedger`, but resolved SYNCHRONOUSLY
   * within this single ACT pass rather than a genuine multi-tick round trip
   * — both inventories are already fully knowable this tick (both entities
   * are in `byId`), so there is nothing a later tick's re-check would learn
   * that this tick doesn't already know. A richer negotiation (the target
   * reasoning about whether the trade BENEFITS it, a counter-offer, a delay
   * before replying) is a documented SEAM for a later brief — this dispatch
   * only proves the settlement mechanism: the ACCEPT rule here is the
   * straightforward "both sides can actually honor the trade" case the
   * brief calls out as the acceptable fallback. `OfferLedger.add`/
   * `.claimHandshake`/`.remove` are still exercised (not merely imported
   * for show) so a genuinely multi-tick follow-up brief can extend this
   * without changing the ledger's usage contract.
   */
  private runTrade(entity: SocialAgent, intention: Intention, byId: Map<number, SocialAgent>, tick: number): void {
    const targetId = intention.data.targetId as number;
    const offerGood = intention.data.offerGood as string;
    const offerAmount = intention.data.offerAmount as number;
    const wantGood = intention.data.wantGood as string;
    const wantAmount = intention.data.wantAmount as number;
    entity.agent.currentAction = "trade"; // render-only (chunk hollow-09a)
    entity.intentions.queue.shift(); // always settles (accept or reject) this tick

    if (targetId === entity.id) return;
    const target = byId.get(targetId);
    if (!target) return;

    const offerId = `trade:${entity.id}:${targetId}:${tick}`;
    if (!this.tradeOffers.add(offerId, { actorId: entity.id, targetId, offerGood, offerAmount, wantGood, wantAmount }, tick)) {
      return; // an offer with this exact id is already in flight (shouldn't happen -- defensive)
    }
    if (!this.tradeOffers.claimHandshake(offerId)) {
      this.tradeOffers.remove(offerId);
      return; // already resolved this round (shouldn't happen for a freshly-added id -- defensive)
    }

    const actorHasOffer = (entity.inventory.goods[offerGood] ?? 0) >= offerAmount;
    const targetHasWant = (target.inventory.goods[wantGood] ?? 0) >= wantAmount;
    const accepted = actorHasOffer && targetHasWant;

    if (!accepted) {
      this.tradeOffers.remove(offerId);
      const body: TradeBody = { actorId: entity.id, targetId, offerGood, offerAmount, wantGood, wantAmount, accepted, tick };
      this.emit(ONT_SOCIAL.TRADE, entity.id, body, tick, PERFORMATIVE.REJECT);
      return;
    }

    takeGoods(entity.inventory, offerGood, offerAmount);
    addGoods(target.inventory, offerGood, offerAmount);
    takeGoods(target.inventory, wantGood, wantAmount);
    addGoods(entity.inventory, wantGood, wantAmount);
    applyRelationshipDelta(entity.relationships, targetId, TRADE_TRUST_DELTA);
    applyRelationshipDelta(target.relationships, entity.id, TRADE_TRUST_DELTA);

    this.tradeOffers.remove(offerId);
    const body: TradeBody = { actorId: entity.id, targetId, offerGood, offerAmount, wantGood, wantAmount, accepted, tick };
    this.emit(ONT_SOCIAL.TRADE, entity.id, body, tick, PERFORMATIVE.ACCEPT);
  }

  // --- antagonistic verbs ------------------------------------------------------

  private runSteal(entity: SocialAgent, intention: Intention, byId: Map<number, SocialAgent>, tick: number): void {
    entity.agent.currentAction = "steal"; // render-only (chunk hollow-09a)
    entity.intentions.queue.shift();
    const targetId = intention.data.targetId as number;
    if (targetId === entity.id) return;
    const target = byId.get(targetId);
    if (!target) return;
    const good = intention.data.good as string;
    const amount = intention.data.amount as number;

    const taken = takeGoods(target.inventory, good, amount);
    if (taken <= 0) return; // target had nothing to steal
    addGoods(entity.inventory, good, taken);

    // Rolled unconditionally (not short-circuited) so the draw always
    // happens once per executed steal, mirroring HollowLifecycleSystem's
    // "rolled unconditionally" determinism note.
    const detected = this.stealDetectionRng.nextFloat() < this.stealDetectionProb;
    if (detected) {
      applyRelationshipDelta(target.relationships, entity.id, -STEAL_DETECTED_TRUST_DELTA);
      const detectedBody: StealDetectedBody = {
        actorId: entity.id,
        targetId,
        actorGx: entity.agent.gx,
        actorGy: entity.agent.gy,
        tick,
      };
      this.emit(ONT_SOCIAL.STEAL_DETECTED, entity.id, detectedBody, tick);
    }

    const body: StealBody = { actorId: entity.id, targetId, good, amount: taken, detected, tick };
    this.emit(ONT_SOCIAL.STEAL, entity.id, body, tick);
  }

  /** Destroys a fraction of the target's material stockpile AND dents its
   *  `material` skill LEVEL — a production-capability hit layered on top of
   *  the inventory loss. No third-party fan-out (unlike steal/rumor) — see
   *  social/constants.ts's header for why this verb only affects the direct
   *  target->actor trust score, and only on detection. */
  private runSabotage(entity: SocialAgent, intention: Intention, byId: Map<number, SocialAgent>, tick: number): void {
    entity.agent.currentAction = "sabotage"; // render-only (chunk hollow-09a)
    entity.intentions.queue.shift();
    const targetId = intention.data.targetId as number;
    if (targetId === entity.id) return;
    const target = byId.get(targetId);
    if (!target) return;

    const have = target.inventory.goods[GOOD_MATERIALS] ?? 0;
    const destroyed = takeGoods(target.inventory, GOOD_MATERIALS, have * SABOTAGE_DESTROY_FRACTION);

    const targetSkills = ensureSkills(target);
    const currentSkill = targetSkills.byKind[SKILL_MATERIAL] ?? 0;
    targetSkills.byKind[SKILL_MATERIAL] = Math.max(0, currentSkill - SABOTAGE_SKILL_PENALTY);

    const detected = this.sabotageDetectionRng.nextFloat() < this.sabotageDetectionProb;
    if (detected) {
      applyRelationshipDelta(target.relationships, entity.id, -SABOTAGE_DETECTED_TRUST_DELTA);
    }

    const body: SabotageBody = {
      actorId: entity.id,
      targetId,
      good: GOOD_MATERIALS,
      amountDestroyed: destroyed,
      detected,
      tick,
    };
    this.emit(ONT_SOCIAL.SABOTAGE, entity.id, body, tick);
  }

  /** Spreads reputation damage about `targetId` to THIRD parties — no
   *  direct actor->target (or actor->self) effect here at all; the fan-out
   *  is folded by `social/witness-system.ts`, which subscribes to
   *  `ONT_SOCIAL.RUMOR`. */
  private runRumor(entity: SocialAgent, intention: Intention, byId: Map<number, SocialAgent>, tick: number): void {
    entity.agent.currentAction = "rumor"; // render-only (chunk hollow-09a)
    entity.intentions.queue.shift();
    const targetId = intention.data.targetId as number;
    if (targetId === entity.id) return;
    if (!byId.has(targetId)) return; // no-op: target doesn't exist

    const body: RumorBody = {
      actorId: entity.id,
      targetId,
      actorGx: entity.agent.gx,
      actorGy: entity.agent.gy,
      tick,
    };
    this.emit(ONT_SOCIAL.RUMOR, entity.id, body, tick);
  }

  /** With probability `attackLethalityProb`, sets the hollow-05 lifecycle
   *  seam (`beliefs.data.violentDeath = true` — see
   *  family/lifecycle-system.ts's class doc) so the NEXT LIFECYCLE stage
   *  pass kills the target with cause "violence". Otherwise, a hard direct
   *  trust hit (no death). */
  private runAttack(entity: SocialAgent, intention: Intention, byId: Map<number, SocialAgent>, tick: number): void {
    entity.agent.currentAction = "attack"; // render-only (chunk hollow-09a)
    entity.intentions.queue.shift();
    const targetId = intention.data.targetId as number;
    if (targetId === entity.id) return;
    const target = byId.get(targetId);
    if (!target) return;

    const lethal = this.attackRng.nextFloat() < this.attackLethalityProb;
    if (lethal) {
      target.beliefs.data.violentDeath = true;
      target.beliefs.revision += 1;
    } else {
      applyRelationshipDelta(target.relationships, entity.id, -ATTACK_TRUST_DELTA);
    }

    const body: AttackBody = { actorId: entity.id, targetId, lethal, tick };
    this.emit(ONT_SOCIAL.ATTACK, entity.id, body, tick);
  }

  /** `body` is one of protocols/social.ts's typed shapes at every call site
   *  above; the cast to `Record<string, unknown>` mirrors the idiom already
   *  used throughout this package (e.g. family/reproduction-system.ts's
   *  `emit`) for handing a typed body to the ontology-agnostic bus. */
  private emit(
    ontology: string,
    sender: number,
    body: object,
    tick: number,
    performative: string = PERFORMATIVE.INFORM,
  ): void {
    this.bus.send(
      { performative, ontology, sender, recipient: "broadcast", body: body as unknown as Record<string, unknown> },
      tick,
    );
  }
}
