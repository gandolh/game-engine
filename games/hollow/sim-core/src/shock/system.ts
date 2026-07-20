/**
 * HollowShockSystem — chunk hollow-11a's deterministic environmental-shock
 * engine. Owns three things: the PENDING queue (interventions scheduled for
 * a future tick boundary), the replayable `interventionLog` (every
 * intervention ever scheduled, in schedule order), and the ACTIVE-window
 * bookkeeping for famine/boom/plague (disaster is a one-shot — no window).
 *
 * ── stage placement (see sim-bootstrap.ts) ───────────────────────────────
 * Registered in its OWN "SHOCK" stage, the very FIRST stage of the tick —
 * before PERCEIVE. Two reasons:
 *   1. "Shocks apply at a tick boundary only" (the brief's hard rule) — this
 *      is the ONLY place in the whole tick a shock is ever applied, never
 *      mid-tick, so it's always deterministically ordered w.r.t. every
 *      other system and w.r.t. the `interventionLog`.
 *   2. Running before PERCEIVE means THIS tick's agents already perceive the
 *      post-shock world (a famine's reduced regen, a disaster's zeroed
 *      node, a plague's drained need) — a shock scheduled to apply at tick N
 *      is visible to tick N's deliberation, not tick N+1's.
 *
 * ── determinism / replay ──────────────────────────────────────────────────
 * All randomness comes from `shockRng` (`rng.fork("shock")`, carved out
 * UNCONDITIONALLY at bootstrap, right after `personaRng` — see
 * sim-bootstrap.ts) — a SEPARATE fork from `personaRng`, so scheduling
 * shocks never perturbs persona-authoring's draw sequence or vice versa. A
 * disaster's victim-node pick draws from `shockRng.fork(`${tick}:${seq}`)` —
 * keyed by the intervention's OWN (tick, seq) pair, not by its position
 * relative to other scheduled shocks — so replaying the exact same
 * `interventionLog` (same tick/seq pairs, same order) reproduces the exact
 * same victim pick byte-for-byte, whether the interventions were scheduled
 * live (`schedule`) or loaded wholesale from a prior run's log (`loadLog`,
 * the replay path).
 *
 * famine/boom SET (not add to) `ResourceWorld`'s regen multiplier for a
 * `[tick, tick+durationTicks)` window; every tick this system recomputes
 * each resource kind's multiplier FROM SCRATCH as the product of every
 * still-active famine/boom factor targeting that kind (1 if none active) —
 * a stateless recompute rather than "set once, revert on expiry", so
 * overlapping or back-to-back shocks never leave a stale multiplier behind.
 */
import type { SimContext, System, World, MessageBus, Rng } from "@engine/core";
import { PERFORMATIVE, replenishNeed } from "@engine/core/agent";
import type { HollowEntity } from "../components";
import type { ResourceWorld, ResourceKind } from "../world";
import { shockOntology, type Shock, type Intervention, type ShockAppliedBody } from "../protocols/shock";

interface ActiveWindow {
  readonly resourceKind: ResourceKind;
  readonly factor: number;
  readonly endTick: number;
}

interface ActivePlague {
  readonly need: string;
  readonly amountPerTick: number;
  readonly endTick: number;
}

const RESOURCE_KINDS: readonly ResourceKind[] = ["food", "material"];

export class HollowShockSystem implements System {
  readonly name = "HollowShockSystem";

  private readonly pendingByTick = new Map<number, Intervention[]>();
  private readonly log: Intervention[] = [];
  private nextSeq = 0;
  private readonly activeWindows: ActiveWindow[] = [];
  private readonly activePlagues: ActivePlague[] = [];

  constructor(
    private readonly world: World<HollowEntity>,
    private readonly resources: ResourceWorld,
    private readonly bus: MessageBus,
    private readonly shockRng: Rng,
  ) {}

  /** Live scheduling API (`BootedHollowSim.scheduleShock`) — enqueues
   *  `shock` to apply at `applyTick` (the NEXT tick boundary, per the
   *  caller), assigns the next `seq`, and appends it to the replayable log
   *  immediately (not deferred to apply time), so a caller can inspect/
   *  export `interventionLog` even before the shock has fired. */
  schedule(shock: Shock, applyTick: number): Intervention {
    const intervention: Intervention = { seq: this.nextSeq++, tick: applyTick, shock };
    this.enqueue(intervention);
    return intervention;
  }

  /**
   * Replay path (`BootedHollowSim.loadInterventionLog`) — seeds the pending
   * queue + log from a PRIOR run's exact `interventionLog` (same tick/seq
   * pairs, same order), and fast-forwards `nextSeq` past the highest loaded
   * `seq` so any further LIVE `schedule` calls on this sim don't collide
   * with a replayed one. Entries whose `tick` has already passed (a caller
   * replaying onto a sim that isn't fresh) are silently skipped — a tick
   * boundary that's already gone can never be re-applied.
   */
  loadLog(entries: readonly Intervention[], currentTick: number): void {
    for (const entry of entries) {
      if (entry.tick < currentTick) continue;
      this.enqueue(entry);
      if (entry.seq >= this.nextSeq) this.nextSeq = entry.seq + 1;
    }
  }

  get interventionLog(): readonly Intervention[] {
    return this.log;
  }

  private enqueue(intervention: Intervention): void {
    this.log.push(intervention);
    const bucket = this.pendingByTick.get(intervention.tick);
    if (bucket) bucket.push(intervention);
    else this.pendingByTick.set(intervention.tick, [intervention]);
  }

  run(ctx: SimContext): void {
    const due = this.pendingByTick.get(ctx.tick);
    if (due) {
      this.pendingByTick.delete(ctx.tick);
      // Same-tick shocks apply in `seq` (schedule) order — deterministic
      // regardless of any Map/array insertion nuance.
      for (const intervention of [...due].sort((a, b) => a.seq - b.seq)) {
        this.applyOne(intervention);
      }
    }

    this.recomputeRegenMultipliers(ctx.tick);
    this.drainPlagues(ctx.tick);
  }

  private applyOne(intervention: Intervention): void {
    const { shock, tick, seq } = intervention;
    switch (shock.kind) {
      case "famine":
      case "boom":
        this.activeWindows.push({
          resourceKind: shock.resourceKind,
          factor: shock.factor,
          endTick: tick + shock.durationTicks,
        });
        break;
      case "disaster":
        this.applyDisaster(shock.resourceKind, tick, seq);
        break;
      case "plague":
        this.activePlagues.push({ need: shock.need, amountPerTick: shock.amountPerTick, endTick: tick + shock.durationTicks });
        break;
    }
    this.emit(intervention);
  }

  private applyDisaster(resourceKind: ResourceKind, tick: number, seq: number): void {
    const candidates = this.resources.nodes.filter((n) => n.kind === resourceKind);
    if (candidates.length === 0) return; // no node of that kind exists — nothing to destroy
    const pickRng = this.shockRng.fork(`${tick}:${seq}`);
    const victim = pickRng.pick(candidates);
    this.resources.destroyNode(victim.id);
  }

  private recomputeRegenMultipliers(tick: number): void {
    // Prune windows whose LAST active tick has passed — a window covers
    // `[applyTick, applyTick + durationTicks)`, so it's dead once
    // `endTick <= tick`.
    for (let i = this.activeWindows.length - 1; i >= 0; i--) {
      if (this.activeWindows[i]!.endTick <= tick) this.activeWindows.splice(i, 1);
    }
    for (const kind of RESOURCE_KINDS) {
      let multiplier = 1;
      for (const w of this.activeWindows) {
        if (w.resourceKind === kind) multiplier *= w.factor;
      }
      this.resources.setRegenMultiplier(kind, multiplier);
    }
  }

  private drainPlagues(tick: number): void {
    for (let i = this.activePlagues.length - 1; i >= 0; i--) {
      if (this.activePlagues[i]!.endTick <= tick) this.activePlagues.splice(i, 1);
    }
    if (this.activePlagues.length === 0) return;
    for (const entity of this.world.query("needs")) {
      for (const plague of this.activePlagues) {
        const need = entity.needs.byKind[plague.need];
        if (need) replenishNeed(need, -plague.amountPerTick);
      }
    }
  }

  private emit(intervention: Intervention): void {
    const body: ShockAppliedBody = { tick: intervention.tick, seq: intervention.seq, shock: intervention.shock };
    this.bus.send(
      {
        performative: PERFORMATIVE.INFORM,
        ontology: shockOntology(intervention.shock.kind),
        sender: "world",
        recipient: "broadcast",
        body: body as unknown as Record<string, unknown>,
      },
      intervention.tick,
    );
  }
}
