/**
 * HollowReproductionSystem — chunk hollow-05's conception + birth pass. Each
 * household rolls for a new pregnancy at most once every `birthWindowTicks`
 * ticks (periodic, mirrors community/crystallize-system.ts's check-interval
 * cadence rather than an every-tick coin flip), gated by BOTH partners being
 * adults and food-secure (neither `starving` nor below `foodSecurityFraction`
 * of the `food` need) — the "coupled to scarcity" requirement: a starving
 * village doesn't grow. A successful roll starts a fixed `gestationTicks`
 * delay (tracked on the household itself, `household.pregnancy` — see
 * family/household.ts) before the child actually spawns, with a genome from
 * `crossoverGenomes` (family/genetics.ts).
 *
 * Two SEPARATE `Rng` forks are threaded in (sim-bootstrap.ts): `reproductionRng`
 * for the birth-window roll itself, `geneticsRng` for genome crossover — kept
 * distinct so a later brief tweaking birth-rate tuning can't accidentally
 * perturb genome draws (or vice versa) by changing how many `Rng` calls one
 * side consumes.
 *
 * Runs in its own "REPRODUCTION" stage, after PAIRBOND (a household must
 * exist to reproduce) and before LIFECYCLE (so a same-tick birth isn't aged
 * or evaluated for death the same tick it spawns) — see sim-bootstrap.ts's
 * scheduler-order comment.
 */
import type { SimContext, System, World, MessageBus, Rng } from "@engine/core";
import { PERFORMATIVE, needFraction, makeNeed } from "@engine/core/agent";
import type { HollowEntity } from "../components";
import { makeSkills } from "../components";
import type { ResourceWorld } from "../world";
import { VILLAGER_KIND } from "../agents";
import {
  NEED_FOOD,
  NEED_REST,
  NEED_WEALTH,
  NEED_SAFETY,
  NEED_BELONGING,
  FOOD_DECAY_PER_TICK,
  REST_DECAY_PER_TICK,
  WEALTH_DECAY_PER_TICK,
  SAFETY_DECAY_PER_TICK,
  BELONGING_DECAY_PER_TICK,
} from "../economy";
import { ONT_FAMILY, type FamilyBirthBody } from "../protocols";
import type { Household } from "./household";
import type { HouseholdRegistry } from "./registry";
import type { LineageRegistry } from "../lineage";
import { crossoverGenomes } from "./genetics";
import {
  BIRTH_WINDOW_TICKS,
  BIRTH_CHANCE,
  BIRTH_FOOD_SECURITY_FRACTION,
  BIRTH_PERCAPITA_FOOD_TARGET,
  GESTATION_TICKS,
} from "./constants";

export interface ReproductionSystemOptions {
  birthWindowTicks?: number;
  birthChance?: number;
  foodSecurityFraction?: number;
  gestationTicks?: number;
  /** Per-capita food-regen target for the density-dependent birth brake (see
   *  BIRTH_PERCAPITA_FOOD_TARGET). */
  perCapitaFoodTarget?: number;
}

type ReproductionEntity = HollowEntity & {
  id: number;
  agent: NonNullable<HollowEntity["agent"]>;
  needs: NonNullable<HollowEntity["needs"]>;
  beliefs: NonNullable<HollowEntity["beliefs"]>;
  lifecycle: NonNullable<HollowEntity["lifecycle"]>;
  genome: NonNullable<HollowEntity["genome"]>;
  inventory: NonNullable<HollowEntity["inventory"]>;
  ownership: NonNullable<HollowEntity["ownership"]>;
};

export class HollowReproductionSystem implements System {
  readonly name = "HollowReproductionSystem";
  private readonly birthWindowTicks: number;
  private readonly birthChance: number;
  private readonly foodSecurityFraction: number;
  private readonly gestationTicks: number;
  private readonly perCapitaFoodTarget: number;
  /** Static town-wide food regen supply (sum of food-node regenPerTick) —
   *  computed once; node regen rates never change (world/resources.ts). */
  private readonly foodSupplyPerTick: number;

  constructor(
    private readonly world: World<HollowEntity>,
    private readonly bus: MessageBus,
    private readonly households: HouseholdRegistry,
    private readonly lineage: LineageRegistry,
    private readonly resources: ResourceWorld,
    private readonly reproductionRng: Rng,
    private readonly geneticsRng: Rng,
    opts: ReproductionSystemOptions = {},
  ) {
    this.birthWindowTicks = opts.birthWindowTicks ?? BIRTH_WINDOW_TICKS;
    this.birthChance = opts.birthChance ?? BIRTH_CHANCE;
    this.foodSecurityFraction = opts.foodSecurityFraction ?? BIRTH_FOOD_SECURITY_FRACTION;
    this.gestationTicks = opts.gestationTicks ?? GESTATION_TICKS;
    this.perCapitaFoodTarget = opts.perCapitaFoodTarget ?? BIRTH_PERCAPITA_FOOD_TARGET;
    this.foodSupplyPerTick = this.resources.nodes.reduce(
      (sum, node) => (node.kind === "food" ? sum + node.regenPerTick : sum),
      0,
    );
  }

  run(ctx: SimContext): void {
    const byId = new Map<number, ReproductionEntity>();
    for (const e of this.world.query(
      "agent",
      "needs",
      "beliefs",
      "lifecycle",
      "genome",
      "inventory",
      "ownership",
    )) {
      const entity = e as ReproductionEntity;
      byId.set(entity.id, entity);
    }

    // Density-dependent birth brake (the load-bearing population stabilizer —
    // see BIRTH_PERCAPITA_FOOD_TARGET). Per-capita food regen falls as the town
    // grows, throttling the effective birth chance continuously so the
    // population settles at a self-limiting plateau instead of exploding or
    // collapsing. `aliveCount` is this tick's living agent count (every living
    // agent carries the full component set queried into `byId`). Computed once
    // per tick, applied to every household's roll below.
    const aliveCount = byId.size;
    const perCapitaFood = this.foodSupplyPerTick / Math.max(1, aliveCount);
    const densityFactor = Math.max(0, Math.min(1, perCapitaFood / this.perCapitaFoodTarget));
    const effectiveBirthChance = this.birthChance * densityFactor;

    for (const household of this.households.all()) {
      if (household.pregnancy) {
        if (ctx.tick >= household.pregnancy.dueTick) {
          this.birth(household, byId, ctx.tick);
          household.pregnancy = null;
        }
        continue;
      }
      if (ctx.tick - household.lastBirthRollTick < this.birthWindowTicks) continue;
      household.lastBirthRollTick = ctx.tick;

      const a = byId.get(household.partnerA);
      const b = byId.get(household.partnerB);
      if (!a || !b) continue; // a partner despawned without the household dissolving (shouldn't happen)
      if (a.lifecycle.stage !== "adult" || b.lifecycle.stage !== "adult") continue;
      if (!this.foodSecure(a) || !this.foodSecure(b)) continue;

      if (this.reproductionRng.nextFloat() < effectiveBirthChance) {
        household.pregnancy = { dueTick: ctx.tick + this.gestationTicks };
      }
    }
  }

  private foodSecure(entity: ReproductionEntity): boolean {
    if (entity.beliefs.data.starving === true) return false;
    const food = entity.needs.byKind[NEED_FOOD];
    if (!food) return false;
    return needFraction(food) >= this.foodSecurityFraction;
  }

  private birth(household: Household, byId: Map<number, ReproductionEntity>, tick: number): void {
    const a = byId.get(household.partnerA);
    const b = byId.get(household.partnerB);
    if (!a || !b) return; // a partner died during gestation -- no birth

    const genome = crossoverGenomes(a.genome, b.genome, this.geneticsRng);
    const spawned = this.world.spawn({
      agent: { gx: a.agent.gx, gy: a.agent.gy, moveTarget: null, currentAction: "idle" },
      needs: {
        byKind: {
          [NEED_FOOD]: makeNeed({ decayPerTick: FOOD_DECAY_PER_TICK }),
          [NEED_REST]: makeNeed({ decayPerTick: REST_DECAY_PER_TICK }),
          [NEED_WEALTH]: makeNeed({ decayPerTick: WEALTH_DECAY_PER_TICK }),
          [NEED_SAFETY]: makeNeed({ decayPerTick: SAFETY_DECAY_PER_TICK }),
          [NEED_BELONGING]: makeNeed({ decayPerTick: BELONGING_DECAY_PER_TICK }),
        },
      },
      inventory: { goods: {} },
      ownership: { ownerId: 0 }, // fixed to the real id right below
      fsm: { current: "PERCEIVE", enteredTick: tick },
      beliefs: { data: {}, revision: 0 },
      desires: { data: {} },
      intentions: { queue: [] },
      personality: { kind: VILLAGER_KIND },
      inbox: { messages: [] },
      relationships: { byId: new Map() },
      communityId: null,
      genome,
      lifecycle: { birthTick: tick, ageTicks: 0, stage: "child" },
      householdId: household.id,
      // Lived skill LEVELS (chunk hollow-06a) — a newborn starts at 0, same
      // as a founder (population.ts) — see components/skills.ts's header.
      skills: makeSkills(),
    } satisfies HollowEntity);

    if (spawned.ownership && spawned.id !== undefined) {
      spawned.ownership.ownerId = spawned.id;
    }
    const childId = spawned.id;
    if (childId === undefined) return;

    this.households.addMember(household.id, childId);
    this.lineage.record({ id: childId, genome, parents: [a.id, b.id], birthTick: tick });

    const body: FamilyBirthBody = {
      householdId: household.id,
      childId,
      parentAId: a.id,
      parentBId: b.id,
      tick,
    };
    this.emit(ONT_FAMILY.BIRTH, body as unknown as Record<string, unknown>, tick);
  }

  private emit(ontology: string, body: Record<string, unknown>, tick: number): void {
    this.bus.send(
      { performative: PERFORMATIVE.INFORM, ontology, sender: "world", recipient: "broadcast", body },
      tick,
    );
  }
}
