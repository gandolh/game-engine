/**
 * HollowSocialWitnessSystem — chunk hollow-06a's third-party trust folding.
 * Two social verbs have effects reaching beyond their direct actor/target
 * pair — `rumor` (spread reputation damage to bystanders) and a DETECTED
 * `steal` (a caught thief's crime reaches witnesses, not just the victim) —
 * and this is where that fan-out lands in every OTHER agent's relationship
 * ledger.
 *
 * Delivery: subscribes directly to `ONT_SOCIAL.RUMOR`/`STEAL_DETECTED` on
 * the `MessageBus` in its constructor, mirroring sim-bootstrap.ts's own
 * `bornCount`/`diedCount` subscriptions — the established pattern in this
 * package for "fold a broadcast event into population-wide bookkeeping",
 * rather than routing through per-agent `inbox.messages` (Hollow has no
 * InboxDispatchSystem — nothing else needs one yet, and adding one just for
 * these two ontologies would mean either broadcasting to (and needing to
 * periodically clear) every agent's inbox, or building targeted delivery
 * infrastructure this dispatch doesn't otherwise need). The subscriber only
 * BUFFERS the event (`pendingRumors`/`pendingStealDetections`); `run()`
 * applies and clears the buffer — kept in this system's own PERCEIVE stage
 * slot for the same reason `HollowPerceiveSystem` folds starvation there:
 * third-party trust updates are a "world -> relationship" fold, PERCEIVE's
 * job.
 *
 * Timing: a RUMOR/STEAL_DETECTED sent during tick T's ACT stage
 * (`HollowSocialActSystem`) becomes `deliverable` — and is dispatched to
 * this system's subscriber, buffering it — when `bootstrapHollowSim.tick()`
 * calls `bus.flush()`/`notifySubscribers()` right after tick T's scheduler
 * run finishes, i.e. BEFORE tick T+1 starts. So this system's `run()`, at
 * the START of tick T+1 (the PERCEIVE stage), sees and applies it — a clean
 * one-tick delay: the direct actor/target effect lands immediately (same
 * tick as the verb), the bystander fan-out lands the following tick.
 *
 * Propagation rule (kept simple + deterministic, per the brief): a witness
 * within `witnessProximityTiles` (Chebyshev) of where the event happened
 * gets the FULL delta; for RUMOR only, a witness who is NOT close but
 * already has a relationship-ledger entry toward the actor ("already
 * connected", per the brief) still hears it secondhand, at
 * `rumorConnectedFactor` of full strength; everyone else is unaffected —
 * the "distance decay" the brief asks for, in three tiers rather than a
 * continuous falloff.
 */
import type { SimContext, System, World, MessageBus } from "@engine/core";
import { applyRelationshipDelta } from "@engine/core/agent";
import type { HollowEntity } from "../components";
import { ONT_SOCIAL, type RumorBody, type StealDetectedBody } from "../protocols";
import {
  WITNESS_PROXIMITY_TILES,
  RUMOR_TRUST_DELTA,
  RUMOR_CONNECTED_FACTOR,
  STEAL_WITNESS_TRUST_DELTA,
} from "./constants";

export interface SocialWitnessSystemOptions {
  witnessProximityTiles?: number;
  rumorTrustDelta?: number;
  rumorConnectedFactor?: number;
  stealWitnessTrustDelta?: number;
}

type WitnessAgent = HollowEntity & {
  id: number;
  agent: NonNullable<HollowEntity["agent"]>;
  relationships: NonNullable<HollowEntity["relationships"]>;
};

function chebyshev(ax: number, ay: number, bx: number, by: number): number {
  return Math.max(Math.abs(ax - bx), Math.abs(ay - by));
}

export class HollowSocialWitnessSystem implements System {
  readonly name = "HollowSocialWitnessSystem";

  private readonly witnessProximityTiles: number;
  private readonly rumorTrustDelta: number;
  private readonly rumorConnectedFactor: number;
  private readonly stealWitnessTrustDelta: number;

  private pendingRumors: RumorBody[] = [];
  private pendingStealDetections: StealDetectedBody[] = [];

  constructor(
    private readonly world: World<HollowEntity>,
    bus: MessageBus,
    opts: SocialWitnessSystemOptions = {},
  ) {
    this.witnessProximityTiles = opts.witnessProximityTiles ?? WITNESS_PROXIMITY_TILES;
    this.rumorTrustDelta = opts.rumorTrustDelta ?? RUMOR_TRUST_DELTA;
    this.rumorConnectedFactor = opts.rumorConnectedFactor ?? RUMOR_CONNECTED_FACTOR;
    this.stealWitnessTrustDelta = opts.stealWitnessTrustDelta ?? STEAL_WITNESS_TRUST_DELTA;

    bus.subscribeOntology(ONT_SOCIAL.RUMOR, (msg) => {
      this.pendingRumors.push(msg.body as unknown as RumorBody);
    });
    bus.subscribeOntology(ONT_SOCIAL.STEAL_DETECTED, (msg) => {
      this.pendingStealDetections.push(msg.body as unknown as StealDetectedBody);
    });
  }

  run(_ctx: SimContext): void {
    if (this.pendingRumors.length > 0) {
      const rumors = this.pendingRumors;
      this.pendingRumors = [];
      for (const rumor of rumors) this.applyRumor(rumor);
    }
    if (this.pendingStealDetections.length > 0) {
      const detections = this.pendingStealDetections;
      this.pendingStealDetections = [];
      for (const detection of detections) this.applyStealDetection(detection);
    }
  }

  private applyRumor(rumor: RumorBody): void {
    for (const w of this.world.query("agent", "relationships")) {
      const witness = w as WitnessAgent;
      if (witness.id === rumor.actorId || witness.id === rumor.targetId) continue;
      const dist = chebyshev(witness.agent.gx, witness.agent.gy, rumor.actorGx, rumor.actorGy);
      if (dist <= this.witnessProximityTiles) {
        applyRelationshipDelta(witness.relationships, rumor.targetId, -this.rumorTrustDelta);
      } else if (witness.relationships.byId.has(rumor.actorId)) {
        applyRelationshipDelta(witness.relationships, rumor.targetId, -this.rumorTrustDelta * this.rumorConnectedFactor);
      }
    }
  }

  private applyStealDetection(detection: StealDetectedBody): void {
    for (const w of this.world.query("agent", "relationships")) {
      const witness = w as WitnessAgent;
      if (witness.id === detection.actorId || witness.id === detection.targetId) continue;
      const dist = chebyshev(witness.agent.gx, witness.agent.gy, detection.actorGx, detection.actorGy);
      if (dist <= this.witnessProximityTiles) {
        applyRelationshipDelta(witness.relationships, detection.actorId, -this.stealWitnessTrustDelta);
      }
    }
  }
}
