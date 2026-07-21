/**
 * HollowCorpseSystem — chunk hollow-15's corpse lifecycle pass. Runs in its
 * own "CORPSE" stage placed immediately AFTER LIFECYCLE (sim-bootstrap.ts), so
 * a body spawned by a death THIS tick is already tracked from the same tick,
 * and BEFORE NEEDS-DECAY (a corpse has no needs — order there is only about
 * keeping all corpse bookkeeping together at the tail of the tick).
 *
 * Per corpse entity (`world.query("corpse")`), in ASCENDING id order
 * (determinism — CLAUDE.md):
 *   1. CARRY-FOLLOW — a corpse with `carriedBy` set tracks its carrier's tile
 *      (a grave-digger hauling it to the graveyard). If the carrier is no
 *      longer alive (despawned by any path), the body is dropped where it lies
 *      (`carriedBy = null`) — a defensive backstop; LIFECYCLE already releases
 *      a digger's load when the digger itself dies.
 *   2. ROT — an unburied, un-carried body that has lain past
 *      `CORPSE_ROT_DELAY_DAYS` (converted to ticks against `ticksPerDay`)
 *      flips to `rotting`. (Buried bodies are despawned by the bury care-act,
 *      so a buried corpse never reaches this system.)
 *   3. SPREAD — a rotting, un-carried body infects each uninfected living
 *      agent within `DISEASE_SPREAD_RADIUS` (Chebyshev tiles) at
 *      `DISEASE_INFECT_PROB_PER_TICK` per tick. A carried body does NOT spread
 *      (it's on its way to burial); already-sick agents are skipped.
 *
 * ── determinism ────────────────────────────────────────────────────────────
 * All randomness is `spreadRng` (`rng.fork("disease-spread")`, carved out
 * unconditionally at bootstrap after every pre-existing fork). The spread draw
 * is taken per (corpse, candidate) pair, corpses iterated ascending id and
 * candidates ascending id, only for uninfected candidates in range — so the
 * stream depends only on the (deterministic) corpse/agent positions + infection
 * state, never on `World.query` iteration nuance. A same-tick infection from an
 * earlier (lower-id) corpse removes that agent from later corpses' candidate
 * set via the local `infected` guard set, deterministically.
 */
import type { SimContext, System, World, MessageBus, Rng } from "@engine/core";
import { PERFORMATIVE } from "@engine/core/agent";
import type { HollowEntity } from "../components";
import { makeDisease } from "../components";
import { ONT_MORTALITY, type InfectedBody } from "../protocols";
import {
  CORPSE_ROT_DELAY_DAYS,
  DISEASE_SPREAD_RADIUS,
  DISEASE_INFECT_PROB_PER_TICK,
  daysToTicks,
} from "./constants";

export interface CorpseSystemOptions {
  ticksPerDay: number;
  rotDelayDays?: number;
  spreadRadius?: number;
  infectProbPerTick?: number;
}

interface LivingView {
  readonly id: number;
  readonly gx: number;
  readonly gy: number;
  readonly entity: HollowEntity;
}

type CorpseEntity = HollowEntity & { id: number; corpse: NonNullable<HollowEntity["corpse"]> };

export class HollowCorpseSystem implements System {
  readonly name = "HollowCorpseSystem";

  private readonly ticksPerDay: number;
  private readonly rotDelayDays: number;
  private readonly spreadRadius: number;
  private readonly infectProbPerTick: number;

  constructor(
    private readonly world: World<HollowEntity>,
    private readonly bus: MessageBus,
    private readonly spreadRng: Rng,
    opts: CorpseSystemOptions,
  ) {
    this.ticksPerDay = opts.ticksPerDay;
    this.rotDelayDays = opts.rotDelayDays ?? CORPSE_ROT_DELAY_DAYS;
    this.spreadRadius = opts.spreadRadius ?? DISEASE_SPREAD_RADIUS;
    this.infectProbPerTick = opts.infectProbPerTick ?? DISEASE_INFECT_PROB_PER_TICK;
  }

  run(ctx: SimContext): void {
    const corpses: CorpseEntity[] = [];
    for (const e of this.world.query("corpse")) {
      if ((e as CorpseEntity).id === undefined) continue;
      corpses.push(e as CorpseEntity);
    }
    if (corpses.length === 0) return;
    corpses.sort((a, b) => a.id - b.id);

    // Living index — position by id (for carry-follow) + a sorted candidate
    // list for spread. Built once (O(n)); `infected` guards against a
    // same-tick double-infection and reflects agents already sick.
    const posById = new Map<number, { gx: number; gy: number }>();
    const living: LivingView[] = [];
    const infected = new Set<number>();
    for (const e of this.world.query("agent")) {
      if (e.id === undefined) continue;
      posById.set(e.id, { gx: e.agent.gx, gy: e.agent.gy });
      living.push({ id: e.id, gx: e.agent.gx, gy: e.agent.gy, entity: e });
      if (e.disease) infected.add(e.id);
    }
    living.sort((a, b) => a.id - b.id);

    const rotDelayTicks = daysToTicks(this.rotDelayDays, this.ticksPerDay);

    for (const c of corpses) {
      const corpse = c.corpse;

      // 1. CARRY-FOLLOW
      if (corpse.carriedBy != null) {
        const carrierPos = posById.get(corpse.carriedBy);
        if (carrierPos) {
          corpse.gx = carrierPos.gx;
          corpse.gy = carrierPos.gy;
        } else {
          corpse.carriedBy = null; // carrier gone — drop where it lies
        }
      }

      // 2. ROT
      if (!corpse.buried && !corpse.rotting && corpse.carriedBy == null) {
        if (ctx.tick - corpse.diedTick >= rotDelayTicks) corpse.rotting = true;
      }

      // 3. SPREAD (rotting + uncarried only)
      if (!corpse.rotting || corpse.carriedBy != null) continue;
      for (const cand of living) {
        if (infected.has(cand.id)) continue;
        if (Math.max(Math.abs(cand.gx - corpse.gx), Math.abs(cand.gy - corpse.gy)) > this.spreadRadius) continue;
        if (this.spreadRng.nextFloat() < this.infectProbPerTick) {
          this.world.addComponent(cand.entity, "disease", makeDisease(ctx.tick));
          infected.add(cand.id);
          const body: InfectedBody = { agentId: cand.id, sourceCorpseId: c.id, tick: ctx.tick };
          this.emit(ONT_MORTALITY.INFECTED, body as unknown as Record<string, unknown>, ctx.tick);
        }
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
