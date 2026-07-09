import { describe, it, expect } from "vitest";
import { bootstrapSim } from "../sim-bootstrap";
import type { World } from "@engine/core";
import type { GameEntity } from "../components";
import {
  WORLD_WIDTH,
  regionAt,
  isWalkable,
  getRegion,
  HARBOR_DOCK_TILE,
  HARBOR_BOARD_TILE,
} from "../world/regions";
import { CORAL_REEFS } from "../world/coral";
import { BRIDGE_SET } from "./geometry";
import {
  computeInteriorDecor,
  MIN_SPACING,
  THEME_TABLE,
} from "./interior-decor";

const TILE = 16;
const key = (x: number, y: number): number => y * WORLD_WIDTH + x;
const toTile = (px: number): number => Math.floor(px / TILE);

function bootWorld(): World<GameEntity> {
  return bootstrapSim({ seed: 0xc0ffee, ticksPerDay: 1200, maxDays: 1 }).world;
}

function functionalTiles(world: World<GameEntity>): Set<number> {
  const forbidden = new Set<number>();
  for (const e of world.query("plot")) forbidden.add(key(e.plot.tileX, e.plot.tileY));
  for (const e of world.query("solid")) forbidden.add(key(e.solid.tileX, e.solid.tileY));
  for (const e of world.query("workNpc"))
    for (const st of e.workNpc.stations) forbidden.add(key(st.tileX, st.tileY));
  for (const e of world.query("home"))
    if (e.transform) forbidden.add(key(toTile(e.transform.x), toTile(e.transform.y)));
  for (const e of world.query("fountain"))
    if (e.transform) forbidden.add(key(toTile(e.transform.x), toTile(e.transform.y)));
  forbidden.add(key(HARBOR_DOCK_TILE.x, HARBOR_DOCK_TILE.y));
  forbidden.add(key(HARBOR_BOARD_TILE.x, HARBOR_BOARD_TILE.y));
  for (const reef of CORAL_REEFS) forbidden.add(key(reef.dock.x, reef.dock.y));
  return forbidden;
}

describe("interior décor scatter", () => {
  it("zero décor tiles overlap any functional tile", () => {
    const world = bootWorld();
    const forbidden = functionalTiles(world);
    const decor = computeInteriorDecor(world);
    for (const d of decor) {
      expect(forbidden.has(key(d.tx, d.ty))).toBe(false);

      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          expect(BRIDGE_SET.has(key(d.tx + dx, d.ty + dy))).toBe(false);
        }
      }
    }
  });

  it("every décor tile is inside its themed region and walkable", () => {
    const world = bootWorld();
    const decor = computeInteriorDecor(world);
    expect(decor.length).toBeGreaterThan(0);
    for (const d of decor) {
      const region = regionAt(d.tx, d.ty);
      expect(region).not.toBeNull();
      expect(isWalkable(d.tx, d.ty)).toBe(true);
      expect(getRegion(region!).theme).toBeDefined();
    }
  });

  it("deterministic: two computeInteriorDecor calls on fresh worlds are identical", () => {
    const a = computeInteriorDecor(bootWorld());
    const b = computeInteriorDecor(bootWorld());
    expect(a.length).toBe(b.length);
    for (let i = 0; i < a.length; i++) {
      expect(a[i]).toEqual(b[i]);
    }
  });

  it("only uses frames present in the theme table", () => {
    const world = bootWorld();
    const decor = computeInteriorDecor(world);

    const allowed = new Set<string>(
      Object.values(THEME_TABLE).flatMap((e) => e.frames),
    );
    for (const d of decor) expect(allowed.has(d.frame)).toBe(true);
  });

  it("blue-noise: no two décor tiles within Chebyshev MIN_SPACING", () => {
    const world = bootWorld();
    const decor = computeInteriorDecor(world);
    // Collect violations and assert once: an `expect` per pair makes this
    // O(n²) matcher calls, which alone pushed the test past the 5s timeout.
    const tooClose: string[] = [];
    for (let i = 0; i < decor.length; i++) {
      for (let j = i + 1; j < decor.length; j++) {
        const a = decor[i]!;
        const b = decor[j]!;
        const cheby = Math.max(Math.abs(a.tx - b.tx), Math.abs(a.ty - b.ty));
        if (cheby < MIN_SPACING) {
          tooClose.push(`(${a.tx},${a.ty})–(${b.tx},${b.ty}) cheby=${cheby}`);
        }
      }
    }
    expect(tooClose).toEqual([]);
  });
});
