/**
 * HollowGovernanceSystem — chunk hollow-12a's PERIODIC (mirrors the
 * community pass's own cadence — see `GOVERNANCE_INTERVAL_TICKS`'s doc)
 * governance pass: per-member standing, a contestable emergent leader,
 * votable community norms, and collective sanctions. Runs in its own
 * "GOVERNANCE" stage, placed between TRUST-ACCRUAL and COMMUNITY
 * (sim-bootstrap.ts) so this pass's trust/belonging effects (sanctions'
 * trust penalty, norm-clash erosion) are visible to the SAME tick's
 * `HollowCommunitySystem` LEAVE/SPLIT dynamics — this system feeds that
 * EXISTING machinery for defection/splitting, it never reimplements it (no
 * `registry.setMembers`/split logic lives here beyond the one direct
 * `removeMember` call a sanction's EXCLUSION performs, which mirrors
 * `HollowCommunitySystem`'s own LEAVE removal one-for-one).
 *
 * Four deterministic sub-passes, in this fixed order, over every extant
 * community (`registry.all()`, ascending id; every per-community loop below
 * also iterates `community.members`, which `CommunityRegistry` keeps sorted
 * ascending — see community/community.ts's header):
 *
 *  a) STANDING + LEADER — each member's standing is a weighted blend of
 *     lifetime contribution (goods shared into the stockpile), lifetime
 *     help given (GIFT/HELP/TEACH toward a FELLOW member), trust HELD
 *     (average incoming trust from fellow members — the one ingredient that
 *     genuinely fluctuates tick to tick, since the other three are
 *     lifetime-cumulative and rarely reverse), and tenure (ticks since
 *     joining). The highest-standing member (ties broken by lowest agent
 *     id) becomes leader; `ONT_GOVERNANCE.LEADER_CHANGED` fires only when
 *     that identity actually changes.
 *  b) NORM VOTE — every member's genome (loyalty/greed) implies a preferred
 *     value for each of the three `CommunityNorms` fields (loyal/unselfish
 *     -> prefers the high end; greedy -> prefers the low end); each
 *     member's vote is weighted by `STANDING_VOTE_WEIGHT_FLOOR + standing`
 *     (the leader's vote additionally multiplied by
 *     `LEADER_VOTE_WEIGHT_MULTIPLIER` — influence, not dictatorship: the
 *     standing-weighted sum of every OTHER member can still outweigh a
 *     mediocre-standing leader). The norm drifts toward that
 *     standing-weighted target by AT MOST `NORM_VOTE_STEP` this pass (a
 *     bounded step, so norms evolve rather than snap); `NORM_CHANGED` fires
 *     when the move clears `NORM_CHANGE_EMIT_EPSILON`.
 *  c) SANCTIONS — a member "hoarding" (holding >= `SANCTION_HOARD_MIN_GOODS`
 *     total goods while their lifetime contribution sits well below what
 *     the community's CURRENT `shareRate` would imply) or who committed an
 *     antisocial act (steal/sabotage/attack) against a FELLOW member
 *     accrues violation severity; at or above
 *     `SANCTION_EXCLUSION_SEVERITY_THRESHOLD` the sanction is EXCLUSION
 *     (removed from the community, feeding the existing belonging-decay/
 *     dissolve machinery — see `HollowBelongingSystem`/
 *     `HollowCommunitySystem`'s LEAVE); otherwise it's a FINE (a
 *     severity-scaled fraction of the violator's current holdings
 *     transferred to the stockpile) plus a trust penalty (every fellow
 *     member's trust toward the violator drops). `SANCTIONED` fires either
 *     way.
 *  d) NORM-CLASH -> DEFECTION — a member whose genome-implied preference for
 *     `shareRate` clashes strongly (>= `NORM_CLASH_THRESHOLD`) with the
 *     community's (just-updated, sub-pass b) actual `shareRate` has their
 *     OUTGOING trust toward every fellow member nudged down, and their
 *     `belonging` need nudged down directly — feeding the EXISTING
 *     COMMUNITY-stage LEAVE/SPLIT pass (which runs immediately after this
 *     one, same tick) so norm disagreement can genuinely drive a factional
 *     split, not just raw trust collapse. This sub-pass NEVER removes a
 *     member itself.
 *
 * ── per-agent tallies (contribution / help / violation) ─────────────────
 * Fed by `bus.subscribeOntology` on the relevant `ONT_SOCIAL.*` ontologies,
 * same "subscribe once at construction" pattern as sim-bootstrap.ts's
 * `bornCount`/`socialCounts` running totals — those subscriptions fire from
 * `bus.notifySubscribers()`, called once per tick AFTER the scheduler
 * finishes (see sim-bootstrap.ts's `tick()`), so a governance pass always
 * reads tallies reflecting every tick UP TO AND INCLUDING the previous one
 * — a one-tick lag, same rationale as `HollowSocialWitnessSystem`'s
 * rumor/steal-detected fold. Community-membership gating for help/violation
 * events (only counts if actor and target currently share a community) is
 * resolved at TALLY-CONSUMPTION time (this pass's `run()`), not at
 * subscription time, since membership can change between the event and the
 * next governance pass.
 *
 * ── determinism ───────────────────────────────────────────────────────────
 * No `Rng` anywhere in this system — every decision here is arithmetic over
 * already-deterministic inputs (trust ledger scores, genome floats, sorted
 * member/community ids), with every genuine tie (leader, in practice never
 * exactly-equal standing but specified for completeness) broken by lowest
 * agent id, mirroring community/trust.ts's own tie-break convention. `run()`
 * always builds its `byId` map from a freshly-sorted-by-id entity list
 * (never trusts `World.query`'s incidental iteration order) before doing
 * anything positional, same discipline as `HollowTrustAccrualSystem`/
 * `HollowCommunitySystem`.
 */
import type { SimContext, System, World, MessageBus, AgentMessage } from "@engine/core";
import { PERFORMATIVE, relationshipScore, applyRelationshipDelta, replenishNeed, UNIT_TRUST_SCALE } from "@engine/core/agent";
import type { HollowEntity } from "../components";
import { takeGoods } from "../components";
import { NEED_BELONGING } from "../economy";
import type { CommunityRegistry, Community } from "../community";
import { ONT_SOCIAL, ONT_GOVERNANCE, type GovernanceNormKind } from "../protocols";
import {
  GOVERNANCE_INTERVAL_TICKS,
  STANDING_CONTRIBUTION_NORMALIZER,
  STANDING_CONTRIBUTION_WEIGHT,
  STANDING_HELP_NORMALIZER,
  STANDING_HELP_WEIGHT,
  STANDING_TRUST_WEIGHT,
  STANDING_TENURE_NORMALIZER_TICKS,
  STANDING_TENURE_WEIGHT,
  NORM_SHARE_RATE_MIN,
  NORM_SHARE_RATE_MAX,
  NORM_COOPERATION_EXPECTATION_MIN,
  NORM_COOPERATION_EXPECTATION_MAX,
  NORM_ADMISSION_POLICY_MIN,
  NORM_ADMISSION_POLICY_MAX,
  STANDING_VOTE_WEIGHT_FLOOR,
  LEADER_VOTE_WEIGHT_MULTIPLIER,
  NORM_VOTE_STEP,
  NORM_CHANGE_EMIT_EPSILON,
  NORM_CLASH_THRESHOLD,
  NORM_CLASH_TRUST_ERODE,
  NORM_CLASH_BELONGING_ERODE,
  VIOLATION_SEVERITY_HOARD,
  VIOLATION_SEVERITY_STEAL,
  VIOLATION_SEVERITY_SABOTAGE,
  VIOLATION_SEVERITY_ATTACK,
  SANCTION_HOARD_MIN_GOODS,
  SANCTION_HOARD_LENIENCY_FRACTION,
  SANCTION_EXCLUSION_SEVERITY_THRESHOLD,
  SANCTION_RESIDUAL_FRACTION,
  SANCTION_FINE_BASE_FRACTION,
  SANCTION_FINE_MAX_FRACTION,
  SANCTION_TRUST_PENALTY_BASE,
  SANCTION_TRUST_PENALTY_MAX,
  SANCTION_SEVERITY_NORMALIZER,
  SANCTION_SEVERITY_SCALE_CAP,
} from "./constants";

export interface GovernanceSystemOptions {
  intervalTicks?: number;
  standingContributionWeight?: number;
  standingHelpWeight?: number;
  standingTrustWeight?: number;
  standingTenureWeight?: number;
  normVoteStep?: number;
  leaderVoteWeightMultiplier?: number;
  sanctionExclusionSeverityThreshold?: number;
  normClashThreshold?: number;
}

type GovernanceEntity = HollowEntity & {
  id: number;
  agent: NonNullable<HollowEntity["agent"]>;
  needs: NonNullable<HollowEntity["needs"]>;
  inventory: NonNullable<HollowEntity["inventory"]>;
  relationships: NonNullable<HollowEntity["relationships"]>;
  communityId: number | null;
};

interface TargetedEvent {
  actorId: number;
  targetId: number;
}

interface ViolationEvent extends TargetedEvent {
  severity: number;
}

function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v));
}

function sumGoods(inventory: HollowEntity["inventory"]): number {
  if (!inventory) return 0;
  let total = 0;
  for (const amount of Object.values(inventory.goods)) total += amount;
  return total;
}

export class HollowGovernanceSystem implements System {
  readonly name = "HollowGovernanceSystem";

  private readonly intervalTicks: number;
  private readonly standingContributionWeight: number;
  private readonly standingHelpWeight: number;
  private readonly standingTrustWeight: number;
  private readonly standingTenureWeight: number;
  private readonly normVoteStep: number;
  private readonly leaderVoteWeightMultiplier: number;
  private readonly sanctionExclusionSeverityThreshold: number;
  private readonly normClashThreshold: number;

  // --- per-agent lifetime tallies, fed by ONT_SOCIAL subscriptions (see header) ---
  private readonly contributionTally = new Map<number, number>();
  private readonly helpLog: TargetedEvent[] = [];
  private readonly violationLog: ViolationEvent[] = [];
  /** Persistent (residual-decayed, not reset every pass — see
   *  `SANCTION_RESIDUAL_FRACTION`) antisocial violation severity per agent,
   *  carried ACROSS governance passes so repeated smaller violations can
   *  still accumulate toward exclusion. */
  private readonly persistentAntisocialSeverity = new Map<number, number>();

  // --- tenure bookkeeping (see header + `refreshJoinTicks`) ---
  private joinTick = new Map<string, number>();
  private seenCommunityIds = new Set<number>();

  constructor(
    private readonly world: World<HollowEntity>,
    private readonly communities: CommunityRegistry,
    private readonly bus: MessageBus,
    opts: GovernanceSystemOptions = {},
  ) {
    this.intervalTicks = opts.intervalTicks ?? GOVERNANCE_INTERVAL_TICKS;
    this.standingContributionWeight = opts.standingContributionWeight ?? STANDING_CONTRIBUTION_WEIGHT;
    this.standingHelpWeight = opts.standingHelpWeight ?? STANDING_HELP_WEIGHT;
    this.standingTrustWeight = opts.standingTrustWeight ?? STANDING_TRUST_WEIGHT;
    this.standingTenureWeight = opts.standingTenureWeight ?? STANDING_TENURE_WEIGHT;
    this.normVoteStep = opts.normVoteStep ?? NORM_VOTE_STEP;
    this.leaderVoteWeightMultiplier = opts.leaderVoteWeightMultiplier ?? LEADER_VOTE_WEIGHT_MULTIPLIER;
    this.sanctionExclusionSeverityThreshold =
      opts.sanctionExclusionSeverityThreshold ?? SANCTION_EXCLUSION_SEVERITY_THRESHOLD;
    this.normClashThreshold = opts.normClashThreshold ?? NORM_CLASH_THRESHOLD;

    bus.subscribeOntology(ONT_SOCIAL.SHARE, (msg: AgentMessage) => {
      const actorId = msg.body["actorId"] as number;
      const amount = msg.body["amount"] as number;
      this.contributionTally.set(actorId, (this.contributionTally.get(actorId) ?? 0) + amount);
    });
    bus.subscribeOntology(ONT_SOCIAL.GIFT, (msg: AgentMessage) => this.recordHelp(msg));
    bus.subscribeOntology(ONT_SOCIAL.HELP, (msg: AgentMessage) => this.recordHelp(msg));
    bus.subscribeOntology(ONT_SOCIAL.TEACH, (msg: AgentMessage) => this.recordHelp(msg));
    bus.subscribeOntology(ONT_SOCIAL.STEAL, (msg: AgentMessage) => this.recordViolation(msg, VIOLATION_SEVERITY_STEAL));
    bus.subscribeOntology(ONT_SOCIAL.SABOTAGE, (msg: AgentMessage) =>
      this.recordViolation(msg, VIOLATION_SEVERITY_SABOTAGE),
    );
    bus.subscribeOntology(ONT_SOCIAL.ATTACK, (msg: AgentMessage) => this.recordViolation(msg, VIOLATION_SEVERITY_ATTACK));
  }

  private recordHelp(msg: AgentMessage): void {
    this.helpLog.push({ actorId: msg.body["actorId"] as number, targetId: msg.body["targetId"] as number });
  }

  private recordViolation(msg: AgentMessage, severity: number): void {
    this.violationLog.push({
      actorId: msg.body["actorId"] as number,
      targetId: msg.body["targetId"] as number,
      severity,
    });
  }

  run(ctx: SimContext): void {
    if (ctx.tick % this.intervalTicks !== 0) return;

    const byId = new Map<number, GovernanceEntity>();
    for (const e of this.world.query("agent", "needs", "inventory", "relationships", "communityId")) {
      byId.set((e as GovernanceEntity).id, e as GovernanceEntity);
    }

    this.refreshJoinTicks(ctx.tick);

    // Per-community, per-member standing (needed by both the leader
    // computation below and the norm vote's weighting) — computed once up
    // front so sub-passes (b)/(d) can reuse it without recomputing.
    const standingByCommunity = new Map<number, Map<number, number>>();
    const helpCountByActor = this.aggregateHelp(byId);
    const freshViolationByActor = this.aggregateViolations(byId);

    for (const community of this.communities.all()) {
      standingByCommunity.set(community.id, this.computeStanding(community, byId, helpCountByActor, ctx.tick));
    }
    // Both logs are fully consumed into this pass's aggregates above — clear
    // them so the NEXT pass only sees events from the ticks in between.
    this.helpLog.length = 0;
    this.violationLog.length = 0;

    this.runStandingAndLeader(standingByCommunity, ctx.tick);
    this.runNormVote(standingByCommunity, byId, ctx.tick);
    this.runSanctions(freshViolationByActor, byId, ctx.tick);
    this.runNormClashDefection(byId, ctx.tick);
  }

  // ---- tenure bookkeeping -----------------------------------------------

  /**
   * Rebuilds `joinTick` fresh every pass from the CURRENT membership of
   * every extant community: a member already tracked keeps their original
   * join tick; a member appearing for the first time in an ALREADY-SEEN
   * community is treated as having just joined (tenure starts now — an
   * approximation for a GROW-pass joiner, since this system only observes
   * membership once per governance interval); a member of a community seen
   * for the very FIRST time is a founder, backdated to `community.formedTick`.
   * Rebuilding wholesale (rather than mutating) means a member who left
   * (LEAVE/SPLIT/dissolve) is automatically dropped — no stale entry lingers
   * to falsely inflate tenure if they (or a same-id-reused community) ever
   * reappear.
   */
  private refreshJoinTicks(tick: number): void {
    const next = new Map<string, number>();
    const nextSeen = new Set<number>();
    for (const community of this.communities.all()) {
      const wasSeenBefore = this.seenCommunityIds.has(community.id);
      for (const memberId of community.members) {
        const key = `${community.id}:${memberId}`;
        const prior = this.joinTick.get(key);
        next.set(key, prior ?? (wasSeenBefore ? tick : community.formedTick));
      }
      nextSeen.add(community.id);
    }
    this.joinTick = next;
    this.seenCommunityIds = nextSeen;
  }

  // ---- a) standing + leader -----------------------------------------------

  private aggregateHelp(byId: Map<number, GovernanceEntity>): Map<number, number> {
    const counts = new Map<number, number>();
    for (const event of this.helpLog) {
      const actor = byId.get(event.actorId);
      const target = byId.get(event.targetId);
      if (!actor || !target) continue;
      if (actor.communityId == null || actor.communityId !== target.communityId) continue;
      counts.set(event.actorId, (counts.get(event.actorId) ?? 0) + 1);
    }
    return counts;
  }

  private aggregateViolations(byId: Map<number, GovernanceEntity>): Map<number, number> {
    const severities = new Map<number, number>();
    for (const event of this.violationLog) {
      const actor = byId.get(event.actorId);
      const target = byId.get(event.targetId);
      if (!actor || !target) continue;
      if (actor.communityId == null || actor.communityId !== target.communityId) continue;
      severities.set(event.actorId, (severities.get(event.actorId) ?? 0) + event.severity);
    }
    return severities;
  }

  private computeStanding(
    community: Community,
    byId: Map<number, GovernanceEntity>,
    helpCountByActor: Map<number, number>,
    tick: number,
  ): Map<number, number> {
    const standing = new Map<number, number>();
    for (const memberId of community.members) {
      const member = byId.get(memberId);
      if (!member) {
        standing.set(memberId, 0);
        continue;
      }
      const contribNorm = clamp((this.contributionTally.get(memberId) ?? 0) / STANDING_CONTRIBUTION_NORMALIZER, 0, 1);
      const helpNorm = clamp((helpCountByActor.get(memberId) ?? 0) / STANDING_HELP_NORMALIZER, 0, 1);

      let trustSum = 0;
      let trustN = 0;
      for (const otherId of community.members) {
        if (otherId === memberId) continue;
        const other = byId.get(otherId);
        if (!other) continue;
        trustSum += relationshipScore(other.relationships, memberId);
        trustN++;
      }
      const trustHeld = trustN > 0 ? trustSum / trustN : UNIT_TRUST_SCALE.neutral;

      const joinedAt = this.joinTick.get(`${community.id}:${memberId}`) ?? community.formedTick;
      const tenureNorm = clamp((tick - joinedAt) / STANDING_TENURE_NORMALIZER_TICKS, 0, 1);

      const score =
        this.standingContributionWeight * contribNorm +
        this.standingHelpWeight * helpNorm +
        this.standingTrustWeight * trustHeld +
        this.standingTenureWeight * tenureNorm;
      standing.set(memberId, score);
    }
    return standing;
  }

  private runStandingAndLeader(standingByCommunity: Map<number, Map<number, number>>, tick: number): void {
    for (const community of this.communities.all()) {
      const standing = standingByCommunity.get(community.id);
      if (!standing) continue;

      let leader: number | null = null;
      let leaderScore = -Infinity;
      for (const memberId of community.members) {
        const score = standing.get(memberId) ?? 0;
        // Strict `>` so the FIRST member to reach a given score (ascending
        // member-id iteration order) keeps it — the deterministic
        // lowest-id tie-break the brief requires.
        if (score > leaderScore) {
          leaderScore = score;
          leader = memberId;
        }
      }

      community.standing = Object.fromEntries(standing);

      if (leader !== null && leader !== community.leaderId) {
        const previousLeaderId = community.leaderId;
        community.leaderId = leader;
        this.emit(
          ONT_GOVERNANCE.LEADER_CHANGED,
          { communityId: community.id, previousLeaderId, newLeaderId: leader, tick },
          tick,
        );
      } else if (leader === null) {
        community.leaderId = null;
      }
    }
  }

  // ---- b) votable norms ---------------------------------------------------

  /** Blend of `loyalty` and `(1 - greed)`, in [0, 1] — high for
   *  loyal/unselfish members (who prefer the HIGH end of every norm's
   *  authoring range below), low for greedy/individualist ones (who prefer
   *  the LOW end). Missing genes (hand-built test harnesses) default to a
   *  neutral 0.5, same fallback convention as `relationshipScore`'s. */
  private preferenceScalar(member: GovernanceEntity): number {
    const loyalty = member.genome?.behavior["loyalty"] ?? 0.5;
    const greed = member.genome?.behavior["greed"] ?? 0.5;
    return clamp((loyalty + (1 - greed)) / 2, 0, 1);
  }

  private preferredShareRate(member: GovernanceEntity): number {
    return NORM_SHARE_RATE_MIN + this.preferenceScalar(member) * (NORM_SHARE_RATE_MAX - NORM_SHARE_RATE_MIN);
  }

  private preferredCooperationExpectation(member: GovernanceEntity): number {
    return (
      NORM_COOPERATION_EXPECTATION_MIN +
      this.preferenceScalar(member) * (NORM_COOPERATION_EXPECTATION_MAX - NORM_COOPERATION_EXPECTATION_MIN)
    );
  }

  private preferredAdmissionPolicy(member: GovernanceEntity): number {
    return (
      NORM_ADMISSION_POLICY_MIN + this.preferenceScalar(member) * (NORM_ADMISSION_POLICY_MAX - NORM_ADMISSION_POLICY_MIN)
    );
  }

  private runNormVote(
    standingByCommunity: Map<number, Map<number, number>>,
    byId: Map<number, GovernanceEntity>,
    tick: number,
  ): void {
    for (const community of this.communities.all()) {
      const standing = standingByCommunity.get(community.id);
      if (!standing || community.members.length === 0) continue;

      let weightedShare = 0;
      let weightedCoop = 0;
      let weightedAdmission = 0;
      let totalWeight = 0;
      for (const memberId of community.members) {
        const member = byId.get(memberId);
        if (!member) continue;
        let weight = STANDING_VOTE_WEIGHT_FLOOR + (standing.get(memberId) ?? 0);
        if (memberId === community.leaderId) weight *= this.leaderVoteWeightMultiplier;

        weightedShare += weight * this.preferredShareRate(member);
        weightedCoop += weight * this.preferredCooperationExpectation(member);
        weightedAdmission += weight * this.preferredAdmissionPolicy(member);
        totalWeight += weight;
      }
      if (totalWeight <= 0) continue;

      this.driftNorm(community, "shareRate", weightedShare / totalWeight, tick);
      this.driftNorm(community, "cooperationExpectation", weightedCoop / totalWeight, tick);
      this.driftNorm(community, "admissionPolicy", weightedAdmission / totalWeight, tick);
    }
  }

  private driftNorm(community: Community, norm: GovernanceNormKind, target: number, tick: number): void {
    const current = community.norms[norm] ?? 0;
    const step = clamp(target - current, -this.normVoteStep, this.normVoteStep);
    const next = current + step;
    community.norms[norm] = next;
    if (Math.abs(next - current) >= NORM_CHANGE_EMIT_EPSILON) {
      this.emit(ONT_GOVERNANCE.NORM_CHANGED, { communityId: community.id, norm, oldValue: current, newValue: next, tick }, tick);
    }
  }

  // ---- c) sanctions --------------------------------------------------------

  private runSanctions(
    freshViolationByActor: Map<number, number>,
    byId: Map<number, GovernanceEntity>,
    tick: number,
  ): void {
    for (const community of this.communities.all()) {
      const leader = community.leaderId != null ? byId.get(community.leaderId) : undefined;
      const leaderLoyalty = leader?.genome?.behavior["loyalty"] ?? 0.5;
      const leaderStanceMultiplier = clamp(0.5 + leaderLoyalty, 0.5, 1.5);
      const cooperationMultiplier = 0.5 + community.norms.cooperationExpectation;

      // Snapshot membership up front — a sanction this pass may EXCLUDE a
      // member (mutating `community.members`), and we must still finish
      // evaluating every OTHER member who was present at the start of the
      // pass, same rationale as HollowCommunitySystem's LEAVE snapshot.
      for (const memberId of [...community.members]) {
        const member = byId.get(memberId);
        if (!member) continue;

        const persisted = this.persistentAntisocialSeverity.get(memberId) ?? 0;
        const freshAntisocial = freshViolationByActor.get(memberId) ?? 0;
        const antisocialTotal = persisted + freshAntisocial;

        const totalGoods = sumGoods(member.inventory);
        const contributed = this.contributionTally.get(memberId) ?? 0;
        const expectedContribution = totalGoods * community.norms.shareRate;
        const isHoarding =
          totalGoods >= SANCTION_HOARD_MIN_GOODS && contributed < expectedContribution * SANCTION_HOARD_LENIENCY_FRACTION;

        const severity = antisocialTotal + (isHoarding ? VIOLATION_SEVERITY_HOARD : 0);
        if (severity <= 0) {
          this.persistentAntisocialSeverity.delete(memberId);
          continue;
        }

        if (severity >= this.sanctionExclusionSeverityThreshold) {
          this.communities.removeMember(community.id, memberId);
          member.communityId = null;
          this.persistentAntisocialSeverity.delete(memberId);
          this.emit(
            ONT_GOVERNANCE.SANCTIONED,
            { communityId: community.id, agentId: memberId, severity, action: "excluded", finedAmount: 0, trustPenalty: 0, tick },
            tick,
          );
          continue;
        }

        const severityScale =
          Math.min(severity / SANCTION_SEVERITY_NORMALIZER, SANCTION_SEVERITY_SCALE_CAP) *
          leaderStanceMultiplier *
          cooperationMultiplier;

        const fineFraction = clamp(SANCTION_FINE_BASE_FRACTION * severityScale, 0, SANCTION_FINE_MAX_FRACTION);
        let finedAmount = 0;
        for (const [good, amount] of Object.entries({ ...member.inventory.goods })) {
          const taken = takeGoods(member.inventory, good, amount * fineFraction);
          if (taken > 0) {
            this.communities.contribute(community.id, good, taken);
            finedAmount += taken;
          }
        }

        const trustPenalty = clamp(SANCTION_TRUST_PENALTY_BASE * severityScale, 0, SANCTION_TRUST_PENALTY_MAX);
        for (const otherId of community.members) {
          if (otherId === memberId) continue;
          const other = byId.get(otherId);
          if (!other) continue;
          applyRelationshipDelta(other.relationships, memberId, -trustPenalty);
        }

        this.persistentAntisocialSeverity.set(memberId, antisocialTotal * SANCTION_RESIDUAL_FRACTION);
        this.emit(
          ONT_GOVERNANCE.SANCTIONED,
          { communityId: community.id, agentId: memberId, severity, action: "fined", finedAmount, trustPenalty, tick },
          tick,
        );
      }
    }
  }

  // ---- d) norm-clash -> defection ------------------------------------------

  private runNormClashDefection(byId: Map<number, GovernanceEntity>, tick: number): void {
    for (const community of this.communities.all()) {
      const range = NORM_SHARE_RATE_MAX - NORM_SHARE_RATE_MIN;
      for (const memberId of community.members) {
        const member = byId.get(memberId);
        if (!member) continue;
        const clash = Math.abs(community.norms.shareRate - this.preferredShareRate(member)) / range;
        if (clash < this.normClashThreshold) continue;

        for (const otherId of community.members) {
          if (otherId === memberId) continue;
          applyRelationshipDelta(member.relationships, otherId, -NORM_CLASH_TRUST_ERODE);
        }
        const belonging = member.needs.byKind[NEED_BELONGING];
        if (belonging) replenishNeed(belonging, -NORM_CLASH_BELONGING_ERODE);
      }
    }
  }

  // ---- shared helper --------------------------------------------------------

  private emit(ontology: string, body: Record<string, unknown>, tick: number): void {
    this.bus.send({ performative: PERFORMATIVE.INFORM, ontology, sender: "world", recipient: "broadcast", body }, tick);
  }
}
