/**
 * Seeding — spawns the starting population. A single personality kind
 * ("villager") and per-need decay-rate jitter drawn from a seeded
 * `Rng.fork` (chunk hollow-03). Positions and rate jitter are each drawn
 * from their own named fork so either can be re-derived/replayed
 * independently and neither draw order depends on population size in a
 * surprising way (each agent draws exactly one position pair and one
 * jitter value in a fixed loop order).
 *
 * Chunk hollow-04 additively seeds two more fields on every spawned agent:
 * an empty `relationships` ledger and `communityId: null`. Neither draws
 * any randomness, so it doesn't disturb the position/rate forks.
 *
 * Chunk hollow-05 additively seeds a full genome, a `Lifecycle` (founders
 * start as ADULTS, `birthTick: 0`, a randomized starting `ageTicks`), and
 * `householdId: null`, plus a PERMANENT `LineageRegistry` record
 * (`parents: null` — founders are generation 0; see `lineage/registry.ts`).
 * Two more named forks, "population-genomes" and "population-lifecycle",
 * are drawn AFTER the existing "population-positions"/"population-rates"
 * forks in the SAME fixed per-agent loop order, so hollow-03/04's existing
 * draw order/values stay undisturbed.
 *
 * Chunk hollow-06a additively seeds a fresh, all-zero `skills` component
 * (components/skills.ts's `makeSkills()`) — lived state, not drawn from any
 * `Rng`, so it doesn't disturb any fork above either.
 *
 * Chunk hollow-12b additively seeds a fresh, empty `feud` component
 * (components/feud.ts's `makeFeud()`) — nobody starts holding a grudge
 * against anyone. Also no `Rng` draw.
 *
 * The starting age is drawn from only the FIRST HALF of the adult band
 * (`[childAdultTicks, childAdultTicks + (adultElderTicks-childAdultTicks)/2)`),
 * not the full band — a deliberate, load-bearing choice: it guarantees
 * (structurally, not just "probably") that every founder needs at least
 * half the adult band's width before it can become `elder`, which keeps
 * hollow-03/04's existing EXACT-population-count acceptance tests
 * (sim-bootstrap.scarcity.test.ts, sim-bootstrap.community.test.ts) valid —
 * see family/constants.ts's header for the full margin derivation.
 */
import type { Rng, World } from "@engine/core";
import { makeNeed } from "@engine/core/agent";
import { GRID_SIZE } from "./world";
import type { HollowEntity } from "./components";
import { makeSkills, makeFeud } from "./components";
import { VILLAGER_KIND } from "./agents";
import { randomGenome } from "./family/genetics";
import { STAGE_CHILD_ADULT_TICKS, STAGE_ADULT_ELDER_TICKS } from "./family/constants";
import type { LineageRegistry } from "./lineage";
import {
  DECAY_RATE_JITTER_MAX,
  DECAY_RATE_JITTER_MIN,
  FOOD_DECAY_PER_TICK,
  NEED_BELONGING,
  NEED_FOOD,
  NEED_REST,
  NEED_SAFETY,
  NEED_WEALTH,
  BELONGING_DECAY_PER_TICK,
  REST_DECAY_PER_TICK,
  SAFETY_DECAY_PER_TICK,
  WEALTH_DECAY_PER_TICK,
} from "./economy";

export interface SpawnPopulationOptions {
  population: number;
  /** Permanent ancestry record (chunk hollow-05) — every founder is
   *  recorded with `parents: null` so `LineageRegistry.areCloseKin` and
   *  `generationsOfDescent` see them as generation-0. Required (not
   *  optional) so a caller can't forget to thread it and silently lose
   *  founder ancestry. */
  lineage: LineageRegistry;
  /** Stage thresholds (family/constants.ts) used to pick each founder's
   *  randomized starting age within the ADULT band. Each defaults to its
   *  family/constants.ts constant; overridable for tests that want a
   *  specific/short adult band. */
  childAdultTicks?: number;
  adultElderTicks?: number;
}

export function spawnPopulation(world: World<HollowEntity>, rng: Rng, opts: SpawnPopulationOptions): void {
  const positionRng = rng.fork("population-positions");
  const rateRng = rng.fork("population-rates");
  // hollow-05 additions -- forked AFTER the two existing forks above so
  // hollow-03/04's draw order/values are undisturbed (see this file's header).
  const genomeRng = rng.fork("population-genomes");
  const lifecycleRng = rng.fork("population-lifecycle");

  const childAdultTicks = opts.childAdultTicks ?? STAGE_CHILD_ADULT_TICKS;
  const adultElderTicks = opts.adultElderTicks ?? STAGE_ADULT_ELDER_TICKS;
  // Only the FIRST HALF of the adult band (see this file's header for why) —
  // guard against a degenerate override (e.g. a test with an adult band
  // narrower than 2 ticks) rather than let `Rng.int` throw.
  const halfBandCeiling = Math.max(
    childAdultTicks + 1,
    childAdultTicks + Math.floor((adultElderTicks - childAdultTicks) / 2),
  );

  for (let i = 0; i < opts.population; i++) {
    const gx = positionRng.int(0, GRID_SIZE);
    const gy = positionRng.int(0, GRID_SIZE);
    const jitter = (): number => rateRng.range(DECAY_RATE_JITTER_MIN, DECAY_RATE_JITTER_MAX);
    const genome = randomGenome(genomeRng);
    const ageTicks = lifecycleRng.int(childAdultTicks, halfBandCeiling);

    const spawned = world.spawn({
      agent: { gx, gy, moveTarget: null, currentAction: "idle" },
      needs: {
        byKind: {
          [NEED_FOOD]: makeNeed({ decayPerTick: FOOD_DECAY_PER_TICK * jitter() }),
          [NEED_REST]: makeNeed({ decayPerTick: REST_DECAY_PER_TICK * jitter() }),
          [NEED_WEALTH]: makeNeed({ decayPerTick: WEALTH_DECAY_PER_TICK * jitter() }),
          // Static stubs (hollow-03 scope) — decayPerTick 0, so these never move.
          [NEED_SAFETY]: makeNeed({ decayPerTick: SAFETY_DECAY_PER_TICK }),
          [NEED_BELONGING]: makeNeed({ decayPerTick: BELONGING_DECAY_PER_TICK }),
        },
      },
      inventory: { goods: {} },
      ownership: { ownerId: 0 }, // fixed to the real id right below
      fsm: { current: "PERCEIVE", enteredTick: 0 },
      beliefs: { data: {}, revision: 0 },
      desires: { data: {} },
      intentions: { queue: [] },
      personality: { kind: VILLAGER_KIND },
      inbox: { messages: [] },
      relationships: { byId: new Map() },
      communityId: null,
      genome,
      lifecycle: { birthTick: 0, ageTicks, stage: "adult" },
      householdId: null,
      // Lived skill LEVELS (chunk hollow-06a) — every founder starts at 0
      // (nobody starts already good at anything, only heritably capable of
      // becoming good at it — see components/skills.ts's header). No `Rng`
      // draw, so this doesn't disturb the forks above.
      skills: makeSkills(),
      // Persistent grudge ledger (chunk hollow-12b) — every founder starts
      // with no grudge against anyone (components/feud.ts's `makeFeud()`).
      // No `Rng` draw, so this doesn't disturb the forks above either.
      feud: makeFeud(),
    } satisfies HollowEntity);

    // Self-ownership (see components/ownership.ts) — needs the id `world.spawn`
    // just assigned, so it's set as a follow-up rather than in the literal above.
    if (spawned.ownership && spawned.id !== undefined) {
      spawned.ownership.ownerId = spawned.id;
    }
    if (spawned.id !== undefined) {
      opts.lineage.record({ id: spawned.id, genome, parents: null, birthTick: 0 });
    }
  }
}
