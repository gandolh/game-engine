/**
 * Seeding — spawns the starting population. Chunk hollow-03 scope only: a
 * single personality kind ("villager") and per-need decay-rate jitter drawn
 * from a seeded `Rng.fork`, NOT full genetics (no crossover, no appearance,
 * no aptitude — that's hollow-05). Positions and rate jitter are each drawn
 * from their own named fork so either can be re-derived/replayed
 * independently and neither draw order depends on population size in a
 * surprising way (each agent draws exactly one position pair and one jitter
 * value in a fixed loop order).
 *
 * Chunk hollow-04 additively seeds two more fields on every spawned agent:
 * an empty `relationships` ledger (trust accrues from proximity/shared
 * activity as the sim runs — see community/trust-accrual-system.ts) and
 * `communityId: null` (unaffiliated until the community system crystallizes
 * a cluster around it). Neither draws any randomness — both are fixed
 * starting values, not seeded state — so this doesn't disturb the existing
 * position/rate Rng forks or their draw order.
 */
import type { Rng, World } from "@engine/core";
import { makeNeed } from "@engine/core/agent";
import { GRID_SIZE } from "./world";
import type { HollowEntity } from "./components";
import { VILLAGER_KIND } from "./agents";
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
}

export function spawnPopulation(world: World<HollowEntity>, rng: Rng, opts: SpawnPopulationOptions): void {
  const positionRng = rng.fork("population-positions");
  const rateRng = rng.fork("population-rates");

  for (let i = 0; i < opts.population; i++) {
    const gx = positionRng.int(0, GRID_SIZE);
    const gy = positionRng.int(0, GRID_SIZE);
    const jitter = (): number => rateRng.range(DECAY_RATE_JITTER_MIN, DECAY_RATE_JITTER_MAX);

    const spawned = world.spawn({
      agent: { gx, gy, moveTarget: null },
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
    } satisfies HollowEntity);

    // Self-ownership (see components/ownership.ts) — needs the id `world.spawn`
    // just assigned, so it's set as a follow-up rather than in the literal above.
    if (spawned.ownership && spawned.id !== undefined) {
      spawned.ownership.ownerId = spawned.id;
    }
  }
}
