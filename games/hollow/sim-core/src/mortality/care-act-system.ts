/**
 * HollowCareActSystem — chunk hollow-15's ACT-stage executor for the three
 * care intentions the grave-digger / medic routines queue (agents/villager.ts).
 * A sibling of `HollowActSystem`/`HollowSocialActSystem` in the same "ACT"
 * stage, registered right AFTER them (sim-bootstrap.ts): `HollowActSystem`'s
 * `default` case whitelists these kinds through (see `CARE_ACT_KINDS`, consumed
 * there) instead of dropping them, so a multi-tick approach isn't clobbered
 * before this system finishes it. Movement toward a corpse/patient/graveyard
 * uses the ordinary `"goto"` intention (handled by `HollowActSystem`); this
 * system only runs the terminal, on-arrival interactions:
 *
 *   - "collect_corpse" {corpseId}: a grave-digger standing on/next to an
 *     unburied, un-carried corpse picks it up (`corpse.carriedBy = diggerId`,
 *     `agent.carryingCorpseId = corpseId`). The corpse then follows the digger
 *     (mortality/corpse-system.ts's carry-follow).
 *   - "bury_corpse": a digger carrying a corpse and standing on the graveyard
 *     tile buries it — the corpse entity is despawned and `ONT_MORTALITY.BURIED`
 *     fires (bootstrap counts it into `buriedCount`).
 *   - "treat" {patientId}: a medic adjacent to a still-sick, untreated patient
 *     (with daily capacity left) flips the patient's `disease.treated` latch
 *     (dropping its recovery target to the medic days) and spends one unit of
 *     its daily budget. The 10%/day mortality is unchanged (treatment speeds
 *     recovery, never lowers the death odds).
 *
 * Each intention completes (pops) the tick it's attempted, whether or not it
 * succeeded (a stale target — corpse already taken, patient moved out of reach
 * or already treated — just pops and the agent re-deliberates next tick). No
 * `Rng` anywhere: every decision is arithmetic over deterministic state, agents
 * processed in ascending-id order.
 */
import type { SimContext, System, World, MessageBus, Intention } from "@engine/core";
import { PERFORMATIVE } from "@engine/core/agent";
import type { HollowEntity, HollowFsmState } from "../components";
import { GRAVEYARD_TILE } from "../world";
import { dayPhase } from "../world";
import { ONT_MORTALITY, type BuriedBody, type TreatedBody } from "../protocols";
import { MEDIC_MAX_TREATMENTS_PER_DAY } from "./constants";
import { medicTreatsRemaining, recordMedicTreatment } from "./medic";

const ACT_STATE: HollowFsmState = "ACT";

/** Intention kinds this system owns — `HollowActSystem`'s `default` case
 *  imports this set to whitelist them through untouched. */
export const CARE_ACT_KINDS: ReadonlySet<string> = new Set(["collect_corpse", "bury_corpse", "treat"]);

export interface CareActSystemOptions {
  ticksPerDay: number;
  medicMaxTreatmentsPerDay?: number;
}

function chebyshev(ax: number, ay: number, bx: number, by: number): number {
  return Math.max(Math.abs(ax - bx), Math.abs(ay - by));
}

export class HollowCareActSystem implements System {
  readonly name = "HollowCareActSystem";

  private readonly ticksPerDay: number;
  private readonly medicCap: number;

  constructor(
    private readonly world: World<HollowEntity>,
    private readonly bus: MessageBus,
    opts: CareActSystemOptions,
  ) {
    this.ticksPerDay = opts.ticksPerDay;
    this.medicCap = opts.medicMaxTreatmentsPerDay ?? MEDIC_MAX_TREATMENTS_PER_DAY;
  }

  run(ctx: SimContext): void {
    // Index every corpse + agent by id once (deterministic; care acts look up
    // their target by the id carried on the intention).
    const corpseById = new Map<number, HollowEntity>();
    for (const e of this.world.query("corpse")) {
      if (e.id !== undefined) corpseById.set(e.id, e);
    }
    const agentById = new Map<number, HollowEntity>();
    for (const e of this.world.query("agent")) {
      if (e.id !== undefined) agentById.set(e.id, e);
    }

    const actors: (HollowEntity & { id: number })[] = [];
    for (const e of this.world.query("agent", "fsm", "intentions")) {
      if (e.id === undefined) continue;
      if (e.fsm.current !== ACT_STATE) continue;
      const top = e.intentions.queue[0];
      if (top && CARE_ACT_KINDS.has(top.kind)) actors.push(e as HollowEntity & { id: number });
    }
    actors.sort((a, b) => a.id - b.id);

    for (const actor of actors) {
      const intention = actor.intentions!.queue[0]!;
      switch (intention.kind) {
        case "collect_corpse":
          this.runCollect(actor, intention, corpseById);
          break;
        case "bury_corpse":
          this.runBury(actor, corpseById, ctx.tick);
          break;
        case "treat":
          this.runTreat(actor, intention, agentById, ctx.tick);
          break;
      }
      actor.intentions!.queue.shift();
    }
  }

  private runCollect(actor: HollowEntity & { id: number }, intention: Intention, corpseById: Map<number, HollowEntity>): void {
    const pos = actor.agent!;
    if (actor.agent!.carryingCorpseId != null) return; // already carrying — ignore
    const corpseId = intention.data.corpseId as number | undefined;
    if (corpseId === undefined) return;
    const corpseEntity = corpseById.get(corpseId);
    const corpse = corpseEntity?.corpse;
    if (!corpse || corpse.buried || corpse.carriedBy != null) return; // stale target
    if (chebyshev(pos.gx, pos.gy, corpse.gx, corpse.gy) > 1) return; // not close enough
    corpse.carriedBy = actor.id;
    pos.carryingCorpseId = corpseId;
    pos.currentAction = "work"; // render-only
  }

  private runBury(actor: HollowEntity & { id: number }, corpseById: Map<number, HollowEntity>, tick: number): void {
    const pos = actor.agent!;
    const corpseId = pos.carryingCorpseId;
    if (corpseId == null) return;
    pos.carryingCorpseId = null;
    if (chebyshev(pos.gx, pos.gy, GRAVEYARD_TILE.gx, GRAVEYARD_TILE.gy) > 1) return; // not at the graveyard — drops the load (corpse-system releases it next tick)
    const corpseEntity = corpseById.get(corpseId);
    if (!corpseEntity?.corpse) return;
    corpseEntity.corpse.buried = true;
    corpseEntity.corpse.carriedBy = null;
    const deceasedId = corpseEntity.corpse.deceasedId;
    this.world.despawn(corpseEntity);
    pos.currentAction = "work"; // render-only
    const body: BuriedBody = { corpseId, deceasedId, diggerId: actor.id, tick };
    this.emit(ONT_MORTALITY.BURIED, body as unknown as Record<string, unknown>, tick);
  }

  private runTreat(actor: HollowEntity & { id: number }, intention: Intention, agentById: Map<number, HollowEntity>, tick: number): void {
    const pos = actor.agent!;
    const dayOfRun = dayPhase(tick, this.ticksPerDay).dayOfRun;
    if (medicTreatsRemaining(actor, dayOfRun, this.medicCap) <= 0) return; // out of daily budget
    const patientId = intention.data.patientId as number | undefined;
    if (patientId === undefined) return;
    const patient = agentById.get(patientId);
    const disease = patient?.disease;
    if (!patient || !disease || disease.treated) return; // stale — recovered/died/already treated
    if (chebyshev(pos.gx, pos.gy, patient.agent!.gx, patient.agent!.gy) > 1) return; // patient moved out of reach
    disease.treated = true;
    recordMedicTreatment(actor, dayOfRun);
    pos.currentAction = "help"; // render-only (reuse the caretaking pose)
    const body: TreatedBody = { medicId: actor.id, patientId, tick };
    this.emit(ONT_MORTALITY.TREATED, body as unknown as Record<string, unknown>, tick);
  }

  private emit(ontology: string, body: Record<string, unknown>, tick: number): void {
    this.bus.send(
      { performative: PERFORMATIVE.INFORM, ontology, sender: "world", recipient: "broadcast", body },
      tick,
    );
  }
}
