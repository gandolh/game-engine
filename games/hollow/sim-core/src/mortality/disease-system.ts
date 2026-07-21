/**
 * HollowDiseaseSystem — chunk hollow-15's per-day illness outcome pass. Runs
 * in its own "DISEASE" stage placed AFTER REPRODUCTION and immediately BEFORE
 * LIFECYCLE (sim-bootstrap.ts): a disease death decided here sets
 * `beliefs.data.pendingDeathCause = "disease"`, which LIFECYCLE reads THIS same
 * tick — so a disease death flows through LIFECYCLE's single death path
 * (corpse spawn + inheritance + cleanup), never a second despawn site.
 *
 * Fires only on an in-game-day BOUNDARY (`isDayBoundary`, mortality/
 * constants.ts) — the user's spec is per-DAY ("10% chance to die per day",
 * "heal in 5/2 days"), not per-tick. On each boundary, per diseased agent in
 * ASCENDING id order (determinism — CLAUDE.md):
 *   1. MORTALITY: draw `mortalityRng.nextFloat() < mortalityProbPerDay` (0.10)
 *      — a flat daily hazard applied REGARDLESS of treatment (a medic speeds
 *      recovery, it does NOT lower the death odds — the user's spec is
 *      explicit the 10% "remains"). On a hit, flag the pending disease death
 *      and STOP (no recovery bookkeeping for a corpse-to-be).
 *   2. RECOVERY: otherwise `sickDays++`; recover (remove the `Disease`
 *      component) once `sickDays` reaches the recovery target —
 *      `medicRecoveryDays` (2) if a medic has `treated` it, else
 *      `selfRecoveryDays` (5).
 *
 * ── determinism ────────────────────────────────────────────────────────────
 * The mortality draw is taken once per diseased agent per day boundary, in a
 * freshly-sorted-by-id order (never `World.query`'s incidental order), so the
 * `mortalityRng` stream depends only on the (deterministic) set of sick agents
 * and the tick, never on iteration nuance. Recovery is pure arithmetic. The
 * fork (`rng.fork("disease-mortality")`) is carved out unconditionally at
 * bootstrap, appended after every pre-existing fork (the `Rng.fork` consumes-a-
 * parent-draw rule — see sim-bootstrap.ts).
 */
import type { SimContext, System, World, MessageBus, Rng } from "@engine/core";
import { PERFORMATIVE } from "@engine/core/agent";
import type { HollowEntity } from "../components";
import { ONT_MORTALITY, type RecoveredBody } from "../protocols";
import {
  DISEASE_MORTALITY_PROB_PER_DAY,
  DISEASE_SELF_RECOVERY_DAYS,
  DISEASE_MEDIC_RECOVERY_DAYS,
  isDayBoundary,
} from "./constants";

export interface DiseaseSystemOptions {
  ticksPerDay: number;
  mortalityProbPerDay?: number;
  selfRecoveryDays?: number;
  medicRecoveryDays?: number;
}

type SickEntity = HollowEntity & {
  id: number;
  beliefs: NonNullable<HollowEntity["beliefs"]>;
  disease: NonNullable<HollowEntity["disease"]>;
};

export class HollowDiseaseSystem implements System {
  readonly name = "HollowDiseaseSystem";

  private readonly ticksPerDay: number;
  private readonly mortalityProbPerDay: number;
  private readonly selfRecoveryDays: number;
  private readonly medicRecoveryDays: number;

  constructor(
    private readonly world: World<HollowEntity>,
    private readonly bus: MessageBus,
    private readonly mortalityRng: Rng,
    opts: DiseaseSystemOptions,
  ) {
    this.ticksPerDay = opts.ticksPerDay;
    this.mortalityProbPerDay = opts.mortalityProbPerDay ?? DISEASE_MORTALITY_PROB_PER_DAY;
    this.selfRecoveryDays = opts.selfRecoveryDays ?? DISEASE_SELF_RECOVERY_DAYS;
    this.medicRecoveryDays = opts.medicRecoveryDays ?? DISEASE_MEDIC_RECOVERY_DAYS;
  }

  run(ctx: SimContext): void {
    if (!isDayBoundary(ctx.tick, this.ticksPerDay)) return;

    const sick: SickEntity[] = [];
    for (const e of this.world.query("disease", "beliefs")) {
      if ((e as SickEntity).id === undefined) continue;
      sick.push(e as SickEntity);
    }
    sick.sort((a, b) => a.id - b.id);

    for (const entity of sick) {
      // MORTALITY — flat daily hazard, treatment-independent.
      if (this.mortalityRng.nextFloat() < this.mortalityProbPerDay) {
        entity.beliefs.data.pendingDeathCause = "disease";
        continue; // LIFECYCLE (this same tick) turns the flag into a death.
      }
      // RECOVERY — survived another day.
      entity.disease.sickDays += 1;
      const target = entity.disease.treated ? this.medicRecoveryDays : this.selfRecoveryDays;
      if (entity.disease.sickDays >= target) {
        const daysSick = entity.disease.sickDays;
        const treated = entity.disease.treated;
        this.world.removeComponent(entity, "disease");
        const body: RecoveredBody = { agentId: entity.id, treated, daysSick, tick: ctx.tick };
        this.emit(ONT_MORTALITY.RECOVERED, body as unknown as Record<string, unknown>, ctx.tick);
      }
    }
  }

  private emit(ontology: string, body: Record<string, unknown>, tick: number): void {
    this.bus.send(
      { performative: PERFORMATIVE.INFORM, ontology, sender: "world", recipient: "broadcast", body },
      tick,
    );
  }
}
