/**
 * HollowFeudSystem — chunk hollow-12b's persistent, directed grudge pass
 * (the "antagonism arcs" half of the hollow-12 governance milestone;
 * hollow-12a built the standing/leader/norms/sanctions core). Today's
 * antagonistic verbs (agents/social-verbs.ts's `deliberateSteal`/
 * `deliberateSabotage`/`deliberateAttack`/`deliberateRumor`) are STATELESS —
 * recomputed fresh every tick from genome+trust+need, with nothing carried
 * forward — so nothing ever ESCALATES (repeated harm from the same peer
 * doesn't compound) or genuinely RECONCILES (a grudge is indistinguishable
 * from ordinary trust noise). This system is the missing persistent memory:
 * a per-agent, per-peer `Feud` ledger (components/feud.ts) that grows on
 * harm and shrinks on decay/cooperation, feeding back into deliberation
 * (agents/social-verbs.ts's grudge-amplification term) so a wronged agent
 * measurably keeps targeting the SAME peer rather than picking a fresh
 * victim every tick — the brief's "A keeps targeting B specifically, and
 * mutual harm spirals" — while repeated genuine cooperation can still pull
 * the grudge back down (an arc, not a one-way death spiral).
 *
 * ── delivery + stage placement ────────────────────────────────────────────
 * Subscribes directly to the relevant `ONT_SOCIAL.*` ontologies on the
 * `MessageBus` in its constructor — mirrors `social/witness-system.ts`'s own
 * "subscribe once at construction, buffer, apply-and-clear in `run()`"
 * pattern (see that file's header for the full delivery-timing rationale)
 * rather than sim-bootstrap.ts's `bornCount`/`socialCounts` inline-counter
 * style, since this system needs to MUTATE per-agent state, not just tally.
 * A verb's ONT_SOCIAL event sent during tick T's ACT stage becomes
 * `deliverable` (and dispatched to this system's subscribers) when
 * `bootstrapHollowSim.tick()` calls `bus.flush()`/`notifySubscribers()`
 * right after tick T's scheduler run finishes — i.e. BEFORE tick T+1
 * starts. So this system's `run()`, at the START of tick T+1's PERCEIVE
 * stage, sees and applies it: a clean one-tick delay, identical to
 * `HollowSocialWitnessSystem`'s own rumor/steal-detected fold. Placed in the
 * SAME "PERCEIVE" stage, right after that system (sim-bootstrap.ts) — this
 * is a "world/message -> per-agent relationship state" fold, exactly
 * `HollowPerceiveSystem`/`HollowSocialWitnessSystem`'s own job, and running
 * it here means grudge accrued from last tick's harm is visible to THIS
 * tick's DELIBERATE stage (agents/social-verbs.ts reads `agent.feud`
 * directly off the entity, no context plumbing needed).
 *
 * ── three sub-passes, in this fixed order every `run()` ───────────────────
 *  a) ESCALATION — every buffered harm event (a DETECTED `steal`, a DETECTED
 *     `sabotage`, an `attack`, or a `rumor`) bumps the VICTIM's grudge toward
 *     the ACTOR by that verb's `FEUD_INCREMENT_*` (social/feud-constants.ts),
 *     clamped to `FEUD_MAX`. If the updated grudge crosses
 *     `FEUD_START_THRESHOLD` for the FIRST time, emits `ONT_FEUD.STARTED`;
 *     if it was ALREADY at/above that threshold, emits `ONT_FEUD.ESCALATED`
 *     instead (a further harm piling onto an already-active feud).
 *  b) RECONCILIATION (cooperative) — every buffered cooperative event
 *     (`GIFT`/`HELP`/`TEACH` toward the grudge-holder, or EITHER side of an
 *     ACCEPTED `TRADE`, which counts as a mutual gesture) reduces the
 *     RECIPIENT's grudge toward the GIVER by `FEUD_RECONCILE_REDUCTION`,
 *     but only when a grudge actually exists (`> 0`) — a kind act toward
 *     someone never resented has nothing to reconcile. If an ACTIVE feud's
 *     grudge falls below `FEUD_RECONCILE_THRESHOLD`, emits
 *     `ONT_FEUD.RECONCILED` and clears the "active" flag.
 *  c) PASSIVE DECAY — every agent's every held grudge (however it got there)
 *     decays toward 0 by `FEUD_DECAY_PER_TICK` EVERY tick this system runs
 *     (i.e. every tick — PERCEIVE is not a periodic stage, unlike
 *     GOVERNANCE/COMMUNITY's interval passes), so an unattended grudge fades
 *     on its own even with no further harm or cooperation. Can also cross
 *     `FEUD_RECONCILE_THRESHOLD` and fire `RECONCILED` on its own, same as
 *     sub-pass (b).
 *
 * `activeFeuds` (a `Set<"holderId:towardId">`) is this system's own
 * hysteresis-band state (see feud-constants.ts's header for why START/
 * RECONCILE use two DIFFERENT thresholds) — persisted across ticks so
 * STARTED/ESCALATED/RECONCILED are each emitted exactly once per genuine
 * state transition, not re-fired every tick a grudge merely sits above/below
 * a threshold.
 *
 * ── determinism ───────────────────────────────────────────────────────────
 * No `Rng` anywhere in this system — every update is pure arithmetic over
 * already-deterministic inputs (harm/cooperation event bodies, which are
 * themselves the deterministic output of upstream systems). `run()` always
 * builds its `byId` map from the world query and, for iteration that could
 * affect emitted-event order (the passive-decay sweep), sorts by agent id
 * ascending, then by TARGET id ascending within each agent's own grudge map
 * (never trusting `Map`'s insertion-order iteration) — mirrors
 * governance-system.ts's/community/trust.ts's own "never trust World.query's
 * or Map's incidental order" discipline. Buffered harm/cooperation events
 * are applied in the order they were RECEIVED this tick (the bus's own
 * dispatch order, already fixed and tick-ordered), the same convention
 * `HollowSocialWitnessSystem` uses for its own buffers.
 */
import type { SimContext, System, World, MessageBus, AgentMessage } from "@engine/core";
import { PERFORMATIVE } from "@engine/core/agent";
import type { HollowEntity } from "../components";
import { makeFeud } from "../components";
import {
  ONT_SOCIAL,
  ONT_FEUD,
  type StealDetectedBody,
  type SabotageBody,
  type AttackBody,
  type RumorBody,
} from "../protocols";
import {
  FEUD_MAX,
  FEUD_INCREMENT_ATTACK,
  FEUD_INCREMENT_SABOTAGE,
  FEUD_INCREMENT_STEAL,
  FEUD_INCREMENT_RUMOR,
  FEUD_DECAY_PER_TICK,
  FEUD_RECONCILE_REDUCTION,
  FEUD_START_THRESHOLD,
  FEUD_RECONCILE_THRESHOLD,
} from "./feud-constants";

export interface FeudSystemOptions {
  feudMax?: number;
  feudIncrementAttack?: number;
  feudIncrementSabotage?: number;
  feudIncrementSteal?: number;
  feudIncrementRumor?: number;
  feudDecayPerTick?: number;
  feudReconcileReduction?: number;
  feudStartThreshold?: number;
  feudReconcileThreshold?: number;
}

type FeudEntity = HollowEntity & { id: number };

/** A harm event bumping `targetId`'s (the victim's) grudge toward
 *  `actorId` (the harmer) by `increment`. */
interface HarmEvent {
  actorId: number;
  targetId: number;
  increment: number;
}

/** A cooperative gesture FROM `actorId` (the giver) TO `targetId` (the
 *  recipient) — reduces the recipient's grudge toward the giver, if any. */
interface CoopEvent {
  actorId: number;
  targetId: number;
}

/** Lazily attaches a `Feud` component (empty) to an entity that doesn't
 *  have one yet — defensive only: production code (population.ts,
 *  family/reproduction-system.ts) always seeds one at spawn; this guards
 *  hand-built test harnesses / pre-hollow-12b entities from throwing. Mirrors
 *  social/act-system.ts's `ensureSkills`. */
function ensureFeud(entity: HollowEntity): NonNullable<HollowEntity["feud"]> {
  if (!entity.feud) entity.feud = makeFeud();
  return entity.feud;
}

function dyadKey(holderId: number, towardId: number): string {
  return `${holderId}:${towardId}`;
}

export class HollowFeudSystem implements System {
  readonly name = "HollowFeudSystem";

  private readonly feudMax: number;
  private readonly incrementAttack: number;
  private readonly incrementSabotage: number;
  private readonly incrementSteal: number;
  private readonly incrementRumor: number;
  private readonly decayPerTick: number;
  private readonly reconcileReduction: number;
  private readonly startThreshold: number;
  private readonly reconcileThreshold: number;

  private pendingHarm: HarmEvent[] = [];
  private pendingCoop: CoopEvent[] = [];
  /** Hysteresis-band state — see this file's header. Keyed `"holderId:towardId"`. */
  private readonly activeFeuds = new Set<string>();

  constructor(
    private readonly world: World<HollowEntity>,
    private readonly bus: MessageBus,
    opts: FeudSystemOptions = {},
  ) {
    this.feudMax = opts.feudMax ?? FEUD_MAX;
    this.incrementAttack = opts.feudIncrementAttack ?? FEUD_INCREMENT_ATTACK;
    this.incrementSabotage = opts.feudIncrementSabotage ?? FEUD_INCREMENT_SABOTAGE;
    this.incrementSteal = opts.feudIncrementSteal ?? FEUD_INCREMENT_STEAL;
    this.incrementRumor = opts.feudIncrementRumor ?? FEUD_INCREMENT_RUMOR;
    this.decayPerTick = opts.feudDecayPerTick ?? FEUD_DECAY_PER_TICK;
    this.reconcileReduction = opts.feudReconcileReduction ?? FEUD_RECONCILE_REDUCTION;
    this.startThreshold = opts.feudStartThreshold ?? FEUD_START_THRESHOLD;
    this.reconcileThreshold = opts.feudReconcileThreshold ?? FEUD_RECONCILE_THRESHOLD;

    // --- harm (escalation source) -----------------------------------------
    bus.subscribeOntology(ONT_SOCIAL.STEAL_DETECTED, (msg: AgentMessage) => {
      const body = msg.body as unknown as StealDetectedBody;
      this.pendingHarm.push({ actorId: body.actorId, targetId: body.targetId, increment: this.incrementSteal });
    });
    bus.subscribeOntology(ONT_SOCIAL.SABOTAGE, (msg: AgentMessage) => {
      const body = msg.body as unknown as SabotageBody;
      if (!body.detected) return; // undetected sabotage: the victim never learns who did it
      this.pendingHarm.push({ actorId: body.actorId, targetId: body.targetId, increment: this.incrementSabotage });
    });
    bus.subscribeOntology(ONT_SOCIAL.ATTACK, (msg: AgentMessage) => {
      const body = msg.body as unknown as AttackBody;
      // No detection gate -- an attack is always known to its victim,
      // lethal or not (see feud-constants.ts's escalation header).
      this.pendingHarm.push({ actorId: body.actorId, targetId: body.targetId, increment: this.incrementAttack });
    });
    bus.subscribeOntology(ONT_SOCIAL.RUMOR, (msg: AgentMessage) => {
      const body = msg.body as unknown as RumorBody;
      this.pendingHarm.push({ actorId: body.actorId, targetId: body.targetId, increment: this.incrementRumor });
    });

    // --- cooperation (reconciliation source) ------------------------------
    bus.subscribeOntology(ONT_SOCIAL.GIFT, (msg: AgentMessage) => this.recordCoop(msg));
    bus.subscribeOntology(ONT_SOCIAL.HELP, (msg: AgentMessage) => this.recordCoop(msg));
    bus.subscribeOntology(ONT_SOCIAL.TEACH, (msg: AgentMessage) => this.recordCoop(msg));
    bus.subscribeOntology(ONT_SOCIAL.TRADE, (msg: AgentMessage) => {
      if (msg.body["accepted"] !== true) return; // a rejected offer reconciles nothing
      const actorId = msg.body["actorId"] as number;
      const targetId = msg.body["targetId"] as number;
      // A settled trade is a MUTUAL gesture -- both sides gave something and
      // got something back -- so both directions count as a cooperative act
      // toward the other, unlike GIFT/HELP/TEACH (which are one-directional).
      this.pendingCoop.push({ actorId, targetId });
      this.pendingCoop.push({ actorId: targetId, targetId: actorId });
    });
  }

  private recordCoop(msg: AgentMessage): void {
    this.pendingCoop.push({ actorId: msg.body["actorId"] as number, targetId: msg.body["targetId"] as number });
  }

  run(ctx: SimContext): void {
    const byId = new Map<number, FeudEntity>();
    for (const e of this.world.query("agent")) {
      byId.set((e as FeudEntity).id, e as FeudEntity);
    }

    const harm = this.pendingHarm;
    this.pendingHarm = [];
    const coop = this.pendingCoop;
    this.pendingCoop = [];

    // a) escalation -- processed in received (dispatch) order, same
    // convention as HollowSocialWitnessSystem's buffered application.
    for (const event of harm) {
      if (event.actorId === event.targetId) continue; // defensive -- no self-grudge
      const holder = byId.get(event.targetId); // the VICTIM holds the grudge
      if (!holder) continue;
      const feud = ensureFeud(holder);
      const current = feud.byId.get(event.actorId) ?? 0;
      const next = Math.min(this.feudMax, current + event.increment);
      feud.byId.set(event.actorId, next);
      if (next < this.startThreshold) continue;

      const key = dyadKey(event.targetId, event.actorId);
      if (this.activeFeuds.has(key)) {
        this.emit(
          ONT_FEUD.ESCALATED,
          { holderId: event.targetId, towardId: event.actorId, grudge: next, tick: ctx.tick },
          ctx.tick,
        );
      } else {
        this.activeFeuds.add(key);
        this.emit(
          ONT_FEUD.STARTED,
          { holderId: event.targetId, towardId: event.actorId, grudge: next, tick: ctx.tick },
          ctx.tick,
        );
      }
    }

    // b) cooperative reconciliation -- same received-order convention.
    for (const event of coop) {
      if (event.actorId === event.targetId) continue; // defensive
      const holder = byId.get(event.targetId); // the RECIPIENT may hold a grudge toward the giver
      if (!holder || !holder.feud) continue; // nothing to reconcile if no ledger exists at all
      const current = holder.feud.byId.get(event.actorId) ?? 0;
      if (current <= 0) continue; // no grudge toward this giver -- nothing to reconcile
      const next = Math.max(0, current - this.reconcileReduction);
      holder.feud.byId.set(event.actorId, next);
      this.maybeReconcile(event.targetId, event.actorId, next, ctx.tick);
    }

    // c) passive decay -- every agent with a feud ledger, sorted ascending by
    // holder id, then by target id within each agent's own ledger (never the
    // Map's raw insertion order -- see this file's determinism note).
    const holders: FeudEntity[] = [];
    for (const e of byId.values()) {
      if (e.feud) holders.push(e);
    }
    holders.sort((a, b) => a.id - b.id);
    for (const holder of holders) {
      const feud = holder.feud;
      if (!feud) continue; // narrowed above, but keeps TS happy without a non-null assertion
      const targetIds = Array.from(feud.byId.keys()).sort((a, b) => a - b);
      for (const towardId of targetIds) {
        const current = feud.byId.get(towardId) ?? 0;
        if (current <= 0) continue;
        const next = Math.max(0, current - this.decayPerTick);
        feud.byId.set(towardId, next);
        this.maybeReconcile(holder.id, towardId, next, ctx.tick);
      }
    }
  }

  /** If `holderId`'s grudge toward `towardId` is currently ACTIVE and has
   *  just fallen below `reconcileThreshold`, emits `RECONCILED` and clears
   *  the active flag. Shared by both the cooperative (b) and decay (c)
   *  sub-passes -- the transition rule is identical either way. */
  private maybeReconcile(holderId: number, towardId: number, grudge: number, tick: number): void {
    if (grudge >= this.reconcileThreshold) return;
    const key = dyadKey(holderId, towardId);
    if (!this.activeFeuds.has(key)) return;
    this.activeFeuds.delete(key);
    this.emit(ONT_FEUD.RECONCILED, { holderId, towardId, grudge, tick }, tick);
  }

  private emit(ontology: string, body: Record<string, unknown>, tick: number): void {
    this.bus.send({ performative: PERFORMATIVE.INFORM, ontology, sender: "world", recipient: "broadcast", body }, tick);
  }
}
