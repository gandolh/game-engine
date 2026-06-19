/**
 * Citadel brief 10 — dynamic hauler rerouting.
 *
 * Verifies the lazy next-step detection + bounded deterministic replan added to
 * VillagerSystem: a villager whose immediate next path tile becomes non-walkable
 * mid-haul does NOT walk through the gap; it re-paths around (or HOLDS in place
 * if disconnected — never teleports). Replans drain FIFO-by-id under a per-tick
 * budget. Drives bootstrapSim directly (no browser/worker).
 *
 * Test scenarios block PURE road tiles (roadGrid only, not building footprint),
 * because villagerWalkable is true for either — zeroing roadGrid under a
 * building footprint tile would not change walkability.
 */
import { describe, it, expect } from "vitest";
import { bootstrapSim } from "../sim-bootstrap";
import type { CitadelCommand } from "../snapshot/index";
import { villagerPos } from "./villager-system";
import { villagerWalkable } from "../sim-state";
import type { SimState } from "../sim-state";
import type { VillagerComponent, VillagerFsm } from "../entities/villager";
import type { GoodType } from "../entities/building";
import { bfsPath } from "../world/pathfinder";

const SEED = 0xc17ade1;
const TICKS_PER_DAY = 20;
const MAX_DAYS = 100;

interface ScheduledCmd {
  atTick: number;
  cmd: CitadelCommand;
}

/** Build a horizontal road span [x0,x1] at row y. */
function roadRow(y: number, x0: number, x1: number): CitadelCommand {
  const tiles: Array<{ x: number; y: number }> = [];
  for (let x = x0; x <= x1; x++) tiles.push({ x, y });
  return { type: "placeRoad", payload: { tiles } };
}

function road(...tiles: Array<{ x: number; y: number }>): CitadelCommand {
  return { type: "placeRoad", payload: { tiles } };
}

/**
 * Connected farm→storehouse with a HOUSE (pioneer source) and a redundant
 * detour: the main bridge runs along row 10 (cols 13–17) and a parallel detour
 * runs along row 12 (cols 13–17) joined at x=13 and x=17. Blocking a single
 * pure-road tile on row 10 therefore still leaves a route (via row 12).
 */
function detourLayout(): ScheduledCmd[] {
  return [
    { atTick: 0, cmd: { type: "placeBuilding", payload: { buildingType: "storehouse", x: 10, y: 10 } } },
    { atTick: 0, cmd: { type: "placeBuilding", payload: { buildingType: "house", x: 10, y: 6 } } },
    { atTick: 0, cmd: roadRow(10, 13, 17) }, // main bridge row
    { atTick: 0, cmd: roadRow(12, 13, 17) }, // detour row
    { atTick: 0, cmd: road({ x: 13, y: 11 }, { x: 17, y: 11 }) }, // vertical joins
    { atTick: 0, cmd: road({ x: 11, y: 8 }, { x: 11, y: 9 }) }, // house→store link
    { atTick: 0, cmd: { type: "placeBuilding", payload: { buildingType: "farm", x: 18, y: 10 } } },
  ];
}

type Sim = ReturnType<typeof bootstrapSim>;

function makeSim(cmds: ScheduledCmd[]): { sim: Sim; pending: ScheduledCmd[]; tick: number } {
  const sim = bootstrapSim({ seed: SEED, ticksPerDay: TICKS_PER_DAY, maxDays: MAX_DAYS });
  return { sim, pending: [...cmds], tick: 0 };
}

function advanceTicks(ctx: { sim: Sim; pending: ScheduledCmd[]; tick: number }, n: number): void {
  for (let k = 0; k < n; k++) {
    while (ctx.pending.length > 0 && ctx.pending[0]!.atTick === ctx.tick) {
      ctx.sim.commands.enqueue(ctx.pending.shift()!.cmd);
    }
    ctx.sim.scheduler.tick({ tick: ctx.tick });
    ctx.tick++;
  }
}

function villagers(sim: Sim): VillagerComponent[] {
  const out: VillagerComponent[] = [];
  for (const e of sim.villagerWorld.query("villager")) out.push(e.villager);
  return out;
}

/** A road tile that is not part of a non-road building footprint. */
function isRoadTile(state: SimState, x: number, y: number): boolean {
  return state.roadGrid[y * state.width + x] === 1;
}

/**
 * Demolish a road tile the way the real `demolish` command does: roads are
 * tracked in BOTH roadGrid AND buildingTiles, so clearing only one leaves the
 * tile walkable. Remove from both → villagerWalkable becomes false.
 */
function blockTile(state: SimState, x: number, y: number): void {
  const idx = y * state.width + x;
  state.roadGrid[idx] = 0;
  state.buildingTiles.delete(idx);
}

/** Demolish every road tile in the world (both tracking structures). */
function wipeAllRoads(state: SimState): void {
  for (let i = 0; i < state.roadGrid.length; i++) {
    if (state.roadGrid[i] === 1) {
      state.roadGrid[i] = 0;
      state.buildingTiles.delete(i);
    }
  }
}

function pathSig(v: VillagerComponent): string {
  return v.pathX.join(",") + "|" + v.pathY.join(",");
}

/**
 * Spawn a villager directly into the world with a BFS path already installed
 * from `from` to `to`. This gives the budget/hold tests a deterministic,
 * controlled hauler population (immigration is gated by workplace slots, which
 * makes organically producing >8 simultaneous walkers awkward). Ids come from
 * state.nextVillagerId so they stay ascending and unique, matching production.
 */
function spawnHauler(
  state: SimState,
  opts: {
    fsm: VillagerFsm;
    from: { x: number; y: number };
    to: { x: number; y: number };
    carry?: { good: GoodType; amount: number };
    /** Explicit path (excludes start, like bfsPath). If omitted, a BFS route is computed. */
    path?: Array<{ x: number; y: number }>;
  },
): VillagerComponent {
  let path = opts.path;
  if (path === undefined) {
    const r = bfsPath(
      opts.from.x,
      opts.from.y,
      opts.to.x,
      opts.to.y,
      (tx, ty) => villagerWalkable(state, tx, ty),
      state.width,
      state.height,
    );
    if (r === null || r.length === 0) {
      throw new Error(`spawnHauler: no route from ${opts.from.x},${opts.from.y} to ${opts.to.x},${opts.to.y}`);
    }
    path = r;
  }
  const id = state.nextVillagerId++;
  const v: VillagerComponent = {
    id,
    homeX: opts.from.x,
    homeY: opts.from.y,
    workX: opts.to.x,
    workY: opts.to.y,
    storeX: opts.to.x,
    storeY: opts.to.y,
    fsm: opts.fsm,
    pathX: path.map((p) => p.x),
    pathY: path.map((p) => p.y),
    pathStep: 0,
    carryGood: opts.carry?.good ?? null,
    carryAmount: opts.carry?.amount ?? 0,
    ticksAtWork: 0,
  };
  state.villagerWorld.spawn({ villager: v });
  return v;
}

describe("Citadel brief 10 — hauler rerouting", () => {
  it("does not advance through a blocked next-step tile; re-paths around it", () => {
    const ctx = makeSim(detourLayout());
    // Tick until the active villager's immediate next step is a PURE road tile
    // on the main bridge row (so blocking it changes walkability and a detour
    // still exists).
    let hauler: VillagerComponent | undefined;
    for (let i = 0; i < TICKS_PER_DAY * 30 && hauler === undefined; i++) {
      advanceTicks(ctx, 1);
      hauler = villagers(ctx.sim).find((v) => {
        if (v.fsm !== "walkToWork" && v.fsm !== "haulToStore") return false;
        if (v.pathStep <= 0 || v.pathStep >= v.pathX.length - 1) return false;
        const nx = v.pathX[v.pathStep]!;
        const ny = v.pathY[v.pathStep]!;
        return ny === 10 && nx >= 13 && nx <= 17 && isRoadTile(ctx.sim.state, nx, ny);
      });
    }
    expect(hauler).toBeDefined();
    const v = hauler!;

    const nextX = v.pathX[v.pathStep]!;
    const nextY = v.pathY[v.pathStep]!;
    expect(villagerWalkable(ctx.sim.state, nextX, nextY)).toBe(true);
    const sigBefore = pathSig(v);
    const posBefore = villagerPos(v);

    // Demolish that pure-road tile under the hauler.
    blockTile(ctx.sim.state, nextX, nextY);

    // One tick: detection fires → hold this tick (does NOT step onto the gap);
    // the replan drains the same tick (well under budget) → new path installed.
    advanceTicks(ctx, 1);
    const posAfter = villagerPos(v);
    expect(posAfter).toEqual(posBefore); // held in place this tick
    expect(posAfter.x === nextX && posAfter.y === nextY).toBe(false); // never on the gap
    expect(villagerWalkable(ctx.sim.state, posAfter.x, posAfter.y)).toBe(true);

    const sigAfter = pathSig(v);
    expect(sigAfter).not.toEqual(sigBefore); // path was recomputed
    // The new path never routes through the blocked tile.
    for (let i = 0; i < v.pathX.length; i++) {
      expect(v.pathX[i] === nextX && v.pathY[i] === nextY).toBe(false);
    }
  });

  it("holds in place (no teleport) and keeps cargo when the target is fully disconnected", () => {
    // Controlled scenario: lay a long road row, then spawn a single hauler
    // carrying cargo, walking that row toward a store at the far end. Tick once
    // so it is genuinely mid-haul (pathStep>0), then wipe every road so its
    // target is unreachable. It must HOLD (never teleport) and keep cargo.
    const ctx = makeSim([
      { atTick: 0, cmd: { type: "placeBuilding", payload: { buildingType: "storehouse", x: 10, y: 14 } } },
      { atTick: 0, cmd: roadRow(13, 5, 32) }, // contiguous buildable strip for this seed
      { atTick: 0, cmd: road({ x: 11, y: 13 }) }, // link store footprint (rows 14-15) to the road
    ]);
    advanceTicks(ctx, 1); // process placement commands
    const store = ctx.sim.getBuildings().find((b) => b.type === "storehouse")!;
    const storeX = store.x + Math.floor(store.w / 2);
    const storeY = store.y + Math.floor(store.h / 2);
    // Spawn one hauler walking row 13 toward the store, carrying grain.
    const v = spawnHauler(ctx.sim.state, {
      fsm: "haulToStore",
      from: { x: 30, y: 13 },
      to: { x: storeX, y: storeY },
      carry: { good: "grain", amount: 7 },
    });
    advanceTicks(ctx, 2); // walk a couple road tiles → now mid-haul
    expect(v.pathStep).toBeGreaterThan(0);
    expect(v.pathStep).toBeLessThan(v.pathX.length - 1);
    const posBefore = villagerPos(v);

    // Fully disconnect: demolish every road tile (clear roadGrid + buildingTiles).
    wipeAllRoads(ctx.sim.state);

    advanceTicks(ctx, 5); // every replan fails (no route) → HOLD
    const posAfter = villagerPos(v);

    expect(posAfter.x === storeX && posAfter.y === storeY).toBe(false); // no teleport
    const drift = Math.abs(posAfter.x - posBefore.x) + Math.abs(posAfter.y - posBefore.y);
    expect(drift).toBeLessThanOrEqual(1); // held in place
    expect(v.carryGood).toBe("grain"); // cargo retained
    expect(v.carryAmount).toBe(7);
  });

  it("a full road wipe with no detour re-paths nobody (every flagged hauler holds)", () => {
    // Spawn many haulers along one road row, all heading to a far store. Break
    // the whole row: NO reroute is possible, so 0 paths change and nobody walks
    // onto the gap — over-budget haulers wait rather than stampede.
    // (roads kept within the contiguous buildable strip x=5..32 for this seed.)
    const ctx = makeSim([
      { atTick: 0, cmd: { type: "placeBuilding", payload: { buildingType: "storehouse", x: 5, y: 14 } } },
      { atTick: 0, cmd: roadRow(13, 5, 32) },
      { atTick: 0, cmd: road({ x: 6, y: 13 }) },
    ]);
    advanceTicks(ctx, 1);
    const store = ctx.sim.getBuildings().find((b) => b.type === "storehouse")!;
    const target = { x: store.x + Math.floor(store.w / 2), y: store.y + Math.floor(store.h / 2) };
    const haulers: VillagerComponent[] = [];
    for (let k = 0; k < 14; k++) {
      haulers.push(
        spawnHauler(ctx.sim.state, {
          fsm: "haulToStore",
          from: { x: 30 - k, y: 13 },
          to: target,
          carry: { good: "grain", amount: 1 },
        }),
      );
    }
    advanceTicks(ctx, 2); // all now mid-haul on the road
    const midHaul = haulers.filter((v) => v.pathStep > 0 && v.pathStep < v.pathX.length - 1);
    expect(midHaul.length).toBeGreaterThan(8); // > budget, so the cap is exercised
    const beforeSig = new Map<number, string>();
    const beforeStep = new Map<number, number>();
    const beforePos = new Map<number, string>();
    for (const v of midHaul) {
      beforeSig.set(v.id, pathSig(v));
      beforeStep.set(v.id, v.pathStep);
      const p = villagerPos(v);
      beforePos.set(v.id, `${p.x},${p.y}`);
    }

    for (let x = 5; x <= 32; x++) blockTile(ctx.sim.state, x, 13); // break the whole row

    advanceTicks(ctx, 1);

    // No reroute is possible (every hauler is isolated on the broken row), so:
    //  - no path is recomputed,
    //  - no hauler advances a step (it holds — does not stampede through the gap),
    //  - no hauler teleports to the store target.
    for (const v of midHaul) {
      expect(pathSig(v)).toBe(beforeSig.get(v.id)); // path untouched
      expect(v.pathStep).toBe(beforeStep.get(v.id)); // did not advance
      const p = villagerPos(v);
      expect(`${p.x},${p.y}`).toBe(beforePos.get(v.id)); // held exactly in place
      expect(p.x === target.x && p.y === target.y).toBe(false); // no teleport
    }
  });

  it("budget bounds successful replans to at most REPLAN_BUDGET_PER_TICK per tick", () => {
    // Main road row 13 with a parallel detour row 15 joined at both ends, so a
    // reroute always exists. Spawn many haulers on row 13, break the whole row
    // in one tick: many are flagged, but at most the budget (8) get a *successful*
    // path install in the single break tick; the rest wait for later ticks.
    // (roads kept within the contiguous buildable strip x=5..32 for this seed.)
    // Main row 13 + detour row 15 are joined by row-14 connectors at EVERY column,
    // so when row 13 is fully broken each hauler can still step down to the detour
    // locally (a hauler trapped between two broken row-13 tiles would have no route).
    const verticals: Array<{ x: number; y: number }> = [];
    for (let x = 5; x <= 32; x++) verticals.push({ x, y: 14 });
    const ctx = makeSim([
      { atTick: 0, cmd: { type: "placeBuilding", payload: { buildingType: "storehouse", x: 5, y: 16 } } },
      { atTick: 0, cmd: roadRow(13, 5, 32) }, // main
      { atTick: 0, cmd: roadRow(15, 5, 32) }, // detour
      { atTick: 0, cmd: { type: "placeRoad", payload: { tiles: verticals } } }, // row-14 connectors
    ]);
    advanceTicks(ctx, 1);
    const store = ctx.sim.getBuildings().find((b) => b.type === "storehouse")!;
    const target = { x: store.x + Math.floor(store.w / 2), y: store.y + Math.floor(store.h / 2) };
    // Give each hauler an EXPLICIT row-13 path (left to x=6, then down through the
    // store footprint). A natural BFS would shortcut onto the detour immediately;
    // we want them all genuinely on the main row so breaking it flags them all.
    function row13Path(fromX: number): Array<{ x: number; y: number }> {
      const p: Array<{ x: number; y: number }> = [];
      for (let x = fromX - 1; x >= 6; x--) p.push({ x, y: 13 });
      p.push({ x: 6, y: 14 }, { x: 6, y: 15 }, { x: 6, y: 16 }, { x: target.x, y: target.y });
      return p;
    }
    const haulers: VillagerComponent[] = [];
    for (let k = 0; k < 20; k++) {
      const fromX = 30 - k;
      haulers.push(
        spawnHauler(ctx.sim.state, {
          fsm: "haulToStore",
          from: { x: fromX, y: 13 },
          to: target,
          carry: { good: "grain", amount: 1 },
          path: row13Path(fromX),
        }),
      );
    }
    advanceTicks(ctx, 2); // all mid-haul on row 13
    const midHaul = haulers.filter((v) => v.pathStep > 0 && v.pathStep < v.pathX.length - 1);
    expect(midHaul.length).toBeGreaterThan(8);
    const before = new Map<number, string>();
    for (const v of midHaul) before.set(v.id, pathSig(v));

    for (let x = 5; x <= 32; x++) blockTile(ctx.sim.state, x, 13); // break the whole main row

    advanceTicks(ctx, 1);

    let changed = 0;
    for (const v of midHaul) if (pathSig(v) !== before.get(v.id)) changed++;
    // Hard cap: never more than REPLAN_BUDGET_PER_TICK (8) successful installs in
    // one tick, however many were flagged. (Detour exists, so each would succeed
    // absent the budget.)
    expect(changed).toBeGreaterThan(0); // the budget did get spent
    expect(changed).toBeLessThanOrEqual(8);
  });

  it("is deterministic: same seed + same scenario yields identical positions/paths", () => {
    function runScenario(): { positions: string; paths: string } {
      const ctx = makeSim(detourLayout());
      advanceTicks(ctx, TICKS_PER_DAY * 8);
      // Break a span of the main bridge row, then keep ticking through reroutes.
      for (let x = 13; x <= 17; x++) blockTile(ctx.sim.state, x, 10);
      advanceTicks(ctx, TICKS_PER_DAY * 4);
      const vs = villagers(ctx.sim).sort((a, b) => a.id - b.id);
      const positions = vs
        .map((v) => {
          const p = villagerPos(v);
          return `${v.id}:${p.x},${p.y},${v.fsm},${v.pathStep}`;
        })
        .join(";");
      const paths = vs.map((v) => `${v.id}:[${pathSig(v)}]`).join(";");
      return { positions, paths };
    }
    const a = runScenario();
    const b = runScenario();
    expect(b.positions).toEqual(a.positions);
    expect(b.paths).toEqual(a.paths);
  });
});
