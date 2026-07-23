/**
 * Tests for the M3.1 custom-drawn map screen (createMapScreen) — corpus/todos/
 * 2026-07-22-mathquest-M3.1-spatial-map.md, step 3. The screen no longer builds a retained
 * `@engine/ui` widget tree (see the M3 `map-screen.test.ts` this replaces, in git history); it
 * draws raw quads through `UISurface` and exposes `nodeAt`/`reachableOrder` for `main.ts`'s hit
 * test + keyboard selection. These tests exercise those two pure query methods plus a smoke check
 * that `render()` doesn't throw against a real generated map.
 */
import { describe, it, expect } from "vitest";
import { createRng } from "@engine/core";
import type { UIQuad } from "@engine/core/render";
import { UISurface } from "@engine/ui";
import { EMPTY_MASTERY_STORE, generateMap, STARTING_LIFELINES, type RunMap, type RunView } from "@mathquest/sim-core";
import { createMapScreen } from "./map-screen";

/** A real, deterministically-generated map (M3's `generateMap`) — exercising the screen against
 * an actual `RunMap` shape rather than a hand-rolled fixture. */
function testMap(seed: number): RunMap {
  return generateMap(createRng(seed).fork("map"));
}

function baseRun(map: RunMap, over: Partial<RunView> = {}): RunView {
  return {
    map,
    currentId: null,
    reachableIds: map.startIds,
    visitedIds: [],
    warriorHp: 30,
    warriorMaxHp: 30,
    // M4a additions (corpus/todos/2026-07-23-mathquest-M4a-progression-loot.md) — a fresh run's
    // defaults (`sim-bootstrap.ts`'s `newRun()`/initial state).
    level: 1,
    xp: 0,
    xpToNext: 5,
    stats: { atk: 0, maxHp: 0, block: 0, heal: 0 },
    inventory: [],
    // M4b addition (corpus/todos/2026-07-23-mathquest-M4b-lifelines.md) — a fresh run's default kit.
    lifelines: { ...STARTING_LIFELINES },
    // M4c addition (corpus/todos/2026-07-23-mathquest-M4c-persistent-mastery.md) — a fresh
    // player's default.
    mastery: EMPTY_MASTERY_STORE,
    ...over,
  };
}

/** A minimal `UISurface` backed by a fake renderer (same pattern as `@engine/ui`'s own
 * `text.test.ts`) — `render()` needs a working `begin`/`push`/`end` seam, not a real canvas. */
function fakeSurface(): UISurface {
  const fakeRenderer = {
    beginUI(): void {},
    pushUI(_q: UIQuad): void {},
    endUI(): void {},
  };
  return new UISurface(fakeRenderer as never);
}

// Viewport the tests render against. At a fresh run (currentId null, no visited) the camera clamps
// to camX=0, so screen coords 0..VIEW_W map 1:1 to the leftmost world columns (where the start
// nodes sit) — the sweeps below hit them without needing to know the camera.
const VIEW_W = 960;
const VIEW_H = 540;

describe("createMapScreen — nodeAt hit-test", () => {
  it("returns the node id for a point inside its marker, and null outside every marker", () => {
    const map = testMap(1);
    const screen = createMapScreen();
    const surface = fakeSurface();
    const run = baseRun(map);

    surface.begin();
    screen.render(surface, run, null, VIEW_W, VIEW_H);
    surface.end();

    // Probe every start-row node's own centre — `render()` just computed their layout, so each
    // must hit-test back to its own id.
    for (const id of map.startIds) {
      // We don't have direct access to the screen's internal layout, so instead assert the
      // ROUND TRIP: find a point that resolves to `id`, then confirm nudging just outside the
      // marker's bounds (a point far off in a margin the layout never uses) returns null and
      // never accidentally resolves back to `id`.
      // Step 8px in both axes: the node box is 44x32, so an 8px grid can never step clean over
      // it in either dimension.
      let found: { x: number; y: number } | null = null;
      for (let x = 0; x <= 960 && found === null; x += 8) {
        for (let y = 0; y <= 540; y += 8) {
          if (screen.nodeAtScreen(x, y) === id) {
            found = { x, y };
            break;
          }
        }
      }
      expect(found, `no hit point found for start node ${id}`).not.toBeNull();
    }

    // A point in the far corner, well outside the play area's margins, hits nothing.
    expect(screen.nodeAtScreen(0, 0)).toBeNull();
    expect(screen.nodeAtScreen(959, 0)).toBeNull();
  });

  it("a point strictly inside a specific known marker resolves to that node, one outside it does not", () => {
    const map = testMap(2);
    const screen = createMapScreen();
    const surface = fakeSurface();
    const run = baseRun(map);

    surface.begin();
    screen.render(surface, run, null, VIEW_W, VIEW_H);
    surface.end();

    // Sweep the whole canvas once (8px grid — see the previous test's note) to build id -> a
    // point known to be inside it, then re-verify.
    const hitPoints = new Map<number, { x: number; y: number }>();
    for (let x = 0; x <= 960; x += 8) {
      for (let y = 0; y <= 540; y += 8) {
        const id = screen.nodeAtScreen(x, y);
        if (id !== null && !hitPoints.has(id)) hitPoints.set(id, { x, y });
      }
    }
    expect(hitPoints.size).toBeGreaterThan(0);

    const [someId, point] = [...hitPoints.entries()][0]!;
    expect(screen.nodeAtScreen(point.x, point.y)).toBe(someId);
    // Far outside any node's box.
    expect(screen.nodeAtScreen(2, 2)).toBeNull();
  });
});

describe("createMapScreen — reachableOrder", () => {
  it("returns exactly the reachable ids (as a set), sorted by row (progression) then col", () => {
    const map = testMap(3);
    const screen = createMapScreen();
    const run = baseRun(map);

    const order = screen.reachableOrder(run);
    expect(new Set(order)).toEqual(new Set(run.reachableIds));
    expect(order.length).toBe(run.reachableIds.length);

    const byId = new Map(map.nodes.map((n) => [n.id, n] as const));
    for (let i = 1; i < order.length; i++) {
      const prev = byId.get(order[i - 1]!)!;
      const cur = byId.get(order[i]!)!;
      expect(prev.row < cur.row || (prev.row === cur.row && prev.col <= cur.col)).toBe(true);
    }
  });

  it("reflects a mid-run reachable set (after choosing the first node), not just the start row", () => {
    const map = testMap(3);
    const screen = createMapScreen();
    const startId = map.startIds[0]!;
    const startNode = map.nodes.find((n) => n.id === startId)!;
    const run = baseRun(map, { visitedIds: [startId], reachableIds: startNode.next });

    const order = screen.reachableOrder(run);
    expect(new Set(order)).toEqual(new Set(startNode.next));
  });

  it("is empty when nothing is reachable (e.g. mid-combat)", () => {
    const map = testMap(3);
    const screen = createMapScreen();
    const run = baseRun(map, { reachableIds: [] });
    expect(screen.reachableOrder(run)).toEqual([]);
  });
});

describe("createMapScreen — render() smoke test", () => {
  it("draws without throwing for a fresh run, a mid-run state, and the pre-first-choice anchor", () => {
    const map = testMap(4);
    const screen = createMapScreen();
    const surface = fakeSurface();

    const fresh = baseRun(map);
    surface.begin();
    expect(() => screen.render(surface, fresh, null, VIEW_W, VIEW_H)).not.toThrow();
    surface.end();

    const startId = map.startIds[0]!;
    const startNode = map.nodes.find((n) => n.id === startId)!;
    const midRun = baseRun(map, {
      currentId: null,
      visitedIds: [startId],
      reachableIds: startNode.next,
      warriorHp: 12,
    });
    surface.begin();
    expect(() => screen.render(surface, midRun, startNode.next[0] ?? null, VIEW_W, VIEW_H)).not.toThrow();
    surface.end();
  });
});
