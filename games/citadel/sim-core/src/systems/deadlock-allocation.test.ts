/**
 * Wave 3.5 — the worker-allocation half of the pop-6-7 deadlock fix.
 *
 * The immigration trickle (immigration.test.ts) gets settlers to arrive, but on its own
 * it never escaped the real deadlock: a town at bread-carrying-capacity (one bakery feeds
 * ~6) that places a second bread line post-founding staffs the second FARM/MILL first
 * (gluttng grain/flour to 500+) and never the second BAKERY, and — the killer —
 * `removeOneVillager` dropped the NEWEST villager on starvation, so every settler sent to
 * staff the idle bakery was the one starvation culled next. Growth was always reversed.
 *
 * The fix, proven end-to-end (a headless drip that was pinned at pop 7/Village forever now
 * reaches Town), has two halves; this file guards the load-bearing one:
 *   - `removeOneVillager(state, p, { preferRedundant: true })` drops a REDUNDANT worker (one
 *     on a glutted-output producer), never the newest arrival — so the settler heading for
 *     the bakery survives. This is what makes the attractor recoverable (downside rule #9).
 */
import { describe, it, expect } from "vitest";
import { bootstrapSim } from "../sim-bootstrap";
import { removeOneVillager } from "../sim-state";
import { VillagerSystem } from "./villager-system";
import type { SimState, PlayerState } from "../sim-state";
import type { VillagerComponent } from "../entities/villager";

/** Spawn a connected, staffed producer of `type` at (x,y); returns the building id. */
function spawnProducer(state: SimState, type: string, x: number, y: number): number {
  const e = state.buildingWorld.spawn({ building: { type, x, y, w: 2, h: 2, ownerId: state.players[0]!.id } });
  state.buildingState.set(e.id!, { outputBuffer: 0, workerCount: 1, connected: true, productionTick: -1000, level: 1 });
  return e.id!;
}

/** Spawn a villager whose workplace is the tile (workX,workY); returns its id. */
function spawnWorkerAt(state: SimState, workX: number, workY: number): number {
  const p = state.players[0]!;
  const id = state.nextVillagerId++;
  const v: VillagerComponent = {
    id, ownerId: p.id,
    homeX: workX, homeY: workY, workX, workY, storeX: workX, storeY: workY,
    fsm: "work", pathX: [], pathY: [], pathStep: 0,
    carryGood: null, carryAmount: 0, ticksAtWork: 0,
  };
  state.villagerWorld.spawn({ villager: v });
  p.population++;
  return id;
}

function idsOf(state: SimState, p: PlayerState): number[] {
  const out: number[] = [];
  for (const e of state.villagerWorld.query("villager")) if (e.villager.ownerId === p.id) out.push(e.villager.id);
  return out.sort((a, b) => a - b);
}

describe("removeOneVillager — preferRedundant drops a glutted-producer worker, not the newest", () => {
  function setup(): { state: SimState; p: PlayerState; farmWorker: number; newestBakeryWorker: number } {
    const state = bootstrapSim({ seed: 0xd1, ticksPerDay: 20 }).state;
    const p = state.players[0]!;
    // A farm whose output (grain) is GLUTTED, and a bakery whose output (bread) is SCARCE.
    const farm = state.buildingWorld.spawn({ building: { type: "farm", x: 30, y: 30, w: 3, h: 3, ownerId: p.id } });
    state.buildingState.set(farm.id!, { outputBuffer: 0, workerCount: 1, connected: true, productionTick: -1000, level: 1 });
    spawnProducer(state, "bakery", 40, 40);
    p.stockpiles.grain = 500; // glutted  (threshold at pop 2 = 8×2 = 16)
    p.stockpiles.bread = 0;   // scarce
    // The farm worker is OLDER; the bakery worker is the NEWEST (highest id) — exactly the
    // arrival the old "drop the newest" rule would have culled.
    const farmWorker = spawnWorkerAt(state, 31, 31);         // inside the farm footprint
    const newestBakeryWorker = spawnWorkerAt(state, 41, 41); // inside the bakery footprint
    return { state, p, farmWorker, newestBakeryWorker };
  }

  it("drops the redundant farm worker (glutted grain), sparing the newest bakery arrival", () => {
    const { state, p, farmWorker, newestBakeryWorker } = setup();
    expect(removeOneVillager(state, p, { preferRedundant: true })).toBe(true);
    const remaining = idsOf(state, p);
    expect(remaining).not.toContain(farmWorker);       // the redundant one left
    expect(remaining).toContain(newestBakeryWorker);   // the bread arrival survived
    expect(p.population).toBe(1);
  });

  it("without the flag it still drops the NEWEST (unchanged default for disease/raids)", () => {
    const { state, p, farmWorker, newestBakeryWorker } = setup();
    expect(removeOneVillager(state, p)).toBe(true);
    const remaining = idsOf(state, p);
    expect(remaining).toContain(farmWorker);           // the older worker stayed
    expect(remaining).not.toContain(newestBakeryWorker); // the newest was culled
  });

  it("falls back to the newest when NO worker is on a glutted producer", () => {
    const { state, p, farmWorker, newestBakeryWorker } = setup();
    p.stockpiles.grain = 5; // un-glut it → nobody is redundant
    expect(removeOneVillager(state, p, { preferRedundant: true })).toBe(true);
    const remaining = idsOf(state, p);
    expect(remaining).toContain(farmWorker);
    expect(remaining).not.toContain(newestBakeryWorker); // newest, since none redundant
  });
});

describe("VillagerSystem — the glut-skip steers a new worker to the scarce bottleneck", () => {
  /**
   * A town with both a farm and a bakery already staffed (so both types are "staffed"),
   * plus an OPEN second farm and second bakery, connected. `assign` normally prefers the
   * primary producer (farm, tier 3) over the converter (bakery, tier 4). The glut-skip
   * flips that WHEN grain is glutted: the idle villager is steered past the redundant
   * second farm to the second bakery — the scarce-output bottleneck.
   */
  function town(grain: number): { state: SimState; farm2: number; bakery2: number } {
    const state = bootstrapSim({ seed: 0xd2, ticksPerDay: 20 }).state;
    const p = state.players[0]!;
    const mk = (type: string, x: number, y: number, w: number, h: number, workers: number): number => {
      const e = state.buildingWorld.spawn({ building: { type, x, y, w, h, ownerId: p.id } });
      state.buildingState.set(e.id!, { outputBuffer: 0, workerCount: workers, connected: true, productionTick: -1000, level: 1 });
      return e.id!;
    };
    mk("farm", 20, 20, 3, 3, 1);            // first farm — staffs the "farm" type
    const farm2 = mk("farm", 26, 20, 3, 3, 0);   // open second farm (grain producer)
    mk("bakery", 20, 26, 2, 2, 1);          // first bakery — staffs the "bakery" type
    const bakery2 = mk("bakery", 26, 26, 2, 2, 0); // open second bakery (bread bottleneck)
    p.stockpiles.grain = grain;
    p.stockpiles.bread = 0;
    p.population = 4;
    // One idle villager, homed next to the second farm (so distance can't explain the choice).
    state.villagerWorld.spawn({
      villager: {
        id: state.nextVillagerId++, ownerId: p.id,
        homeX: 27, homeY: 21, workX: 27, workY: 21, storeX: 27, storeY: 21,
        fsm: "idle", pathX: [], pathY: [], pathStep: 0, carryGood: null, carryAmount: 0, ticksAtWork: 0,
      },
    });
    new VillagerSystem(state).run({ tick: 0 });
    return { state, farm2, bakery2 };
  }

  it("with grain glutted, the villager staffs the second BAKERY, not the second farm", () => {
    const { state, farm2, bakery2 } = town(500);
    expect(state.buildingState.get(bakery2)!.workerCount).toBe(1);
    expect(state.buildingState.get(farm2)!.workerCount).toBe(0);
  });

  it("with grain NOT glutted, the normal tier order wins — it staffs the second farm", () => {
    const { state, farm2, bakery2 } = town(5);
    expect(state.buildingState.get(farm2)!.workerCount).toBe(1);
    expect(state.buildingState.get(bakery2)!.workerCount).toBe(0);
  });
});
