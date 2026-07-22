import { describe, it, expect } from "vitest";
import { createRng } from "@engine/core";
import { generateMap, type MapNode, type RunMap } from "./map";

function byId(map: RunMap): Map<number, MapNode> {
  return new Map(map.nodes.map((n) => [n.id, n]));
}

/** Every id reachable from `from` by following `next` (BFS), INCLUDING `from` itself. */
function reachableFrom(map: RunMap, from: number): Set<number> {
  const nodes = byId(map);
  const seen = new Set<number>([from]);
  const queue = [from];
  while (queue.length > 0) {
    const id = queue.shift()!;
    for (const next of nodes.get(id)!.next) {
      if (!seen.has(next)) {
        seen.add(next);
        queue.push(next);
      }
    }
  }
  return seen;
}

describe("generateMap — determinism", () => {
  it("the SAME seed produces an IDENTICAL map", () => {
    const a = generateMap(createRng(1).fork("map"));
    const b = generateMap(createRng(1).fork("map"));
    expect(a).toEqual(b);
  });

  it("DIFFERENT seeds produce DIFFERENT maps (not a constant map)", () => {
    const a = generateMap(createRng(1).fork("map"));
    const b = generateMap(createRng(2).fork("map"));
    expect(a).not.toEqual(b);
  });
});

describe("generateMap — shape", () => {
  it("has 10-14 non-boss nodes plus exactly one boss", () => {
    for (let seed = 1; seed <= 20; seed++) {
      const map = generateMap(createRng(seed).fork("map"));
      const nonBoss = map.nodes.filter((n) => n.type !== "boss");
      expect(nonBoss.length).toBeGreaterThanOrEqual(10);
      expect(nonBoss.length).toBeLessThanOrEqual(14);
      const bosses = map.nodes.filter((n) => n.type === "boss");
      expect(bosses.length).toBe(1);
      expect(bosses[0]!.id).toBe(map.bossId);
    }
  });

  it("startIds are exactly the row-0 node ids", () => {
    const map = generateMap(createRng(3).fork("map"));
    const row0Ids = map.nodes.filter((n) => n.row === 0).map((n) => n.id);
    expect([...map.startIds].sort((x, y) => x - y)).toEqual([...row0Ids].sort((x, y) => x - y));
  });
});

describe("generateMap — connected DAG", () => {
  for (let seed = 1; seed <= 15; seed++) {
    it(`seed ${seed}: every non-boss node has >=1 next; boss is the unique terminal node`, () => {
      const map = generateMap(createRng(seed).fork("map"));
      for (const node of map.nodes) {
        if (node.type === "boss") {
          expect(node.next.length).toBe(0);
        } else {
          expect(node.next.length).toBeGreaterThanOrEqual(1);
        }
      }
      const terminals = map.nodes.filter((n) => n.next.length === 0);
      expect(terminals).toEqual([map.nodes.find((n) => n.id === map.bossId)]);
    });

    it(`seed ${seed}: every row r+1 node has >=1 incoming edge from row r`, () => {
      const map = generateMap(createRng(seed).fork("map"));
      const incoming = new Set<number>();
      for (const node of map.nodes) for (const next of node.next) incoming.add(next);
      for (const node of map.nodes) {
        if (node.row === 0) continue; // row 0 is the start — no incoming required
        expect(incoming.has(node.id)).toBe(true);
      }
    });

    it(`seed ${seed}: the boss is reachable from EVERY start id`, () => {
      const map = generateMap(createRng(seed).fork("map"));
      for (const startId of map.startIds) {
        expect(reachableFrom(map, startId).has(map.bossId)).toBe(true);
      }
    });
  }
});

describe("generateMap — difficulty", () => {
  it("grades escalate with depth: each row's MINIMUM grade is non-decreasing, and the boss is grade 4", () => {
    for (let seed = 1; seed <= 15; seed++) {
      const map = generateMap(createRng(seed).fork("map"));
      const rows = [...new Set(map.nodes.filter((n) => n.type !== "boss").map((n) => n.row))].sort(
        (a, b) => a - b,
      );
      let prevMin = 0;
      for (const row of rows) {
        const minGrade = Math.min(...map.nodes.filter((n) => n.row === row).map((n) => n.grade));
        expect(minGrade).toBeGreaterThanOrEqual(prevMin);
        prevMin = minGrade;
      }
      const boss = map.nodes.find((n) => n.id === map.bossId)!;
      expect(boss.grade).toBe(4);
    }
  });

  it("has >=1 branching row (>=2 nodes with differing grade/type) and >=1 elite node overall", () => {
    for (let seed = 1; seed <= 15; seed++) {
      const map = generateMap(createRng(seed).fork("map"));
      const elites = map.nodes.filter((n) => n.type === "elite");
      expect(elites.length).toBeGreaterThanOrEqual(1);

      const rows = [...new Set(map.nodes.map((n) => n.row))];
      const hasBranchingRow = rows.some((row) => {
        const inRow = map.nodes.filter((n) => n.row === row);
        if (inRow.length < 2) return false;
        const distinct = new Set(inRow.map((n) => `${n.type}:${n.grade}`));
        return distinct.size >= 2;
      });
      expect(hasBranchingRow).toBe(true);
    }
  });

  it("elite grade is its row's base grade + 1, capped at 4", () => {
    for (let seed = 1; seed <= 15; seed++) {
      const map = generateMap(createRng(seed).fork("map"));
      for (const elite of map.nodes.filter((n) => n.type === "elite")) {
        const siblingCombat = map.nodes.find((n) => n.row === elite.row && n.type === "combat");
        if (siblingCombat !== undefined) {
          expect(elite.grade).toBe(Math.min(4, siblingCombat.grade + 1));
        }
        expect(elite.grade).toBeGreaterThanOrEqual(1);
        expect(elite.grade).toBeLessThanOrEqual(4);
      }
    }
  });

  it("has >=1 rest node (in fact exactly 2 — see run/enemies.ts's balance note), in rows 1-4", () => {
    for (let seed = 1; seed <= 15; seed++) {
      const map = generateMap(createRng(seed).fork("map"));
      const rests = map.nodes.filter((n) => n.type === "rest");
      expect(rests.length).toBeGreaterThanOrEqual(1);
      const restRows = new Set(rests.map((r) => r.row));
      expect(restRows.size).toBe(2); // 2 distinct rows get a rest — a deliberate above-minimum choice
      for (const rest of rests) {
        expect(rest.row).toBeGreaterThanOrEqual(1);
        expect(rest.row).toBeLessThanOrEqual(4);
      }
    }
  });

  it("a rest row and a branching(elite) row never collide on the SAME row (both invariants hold independently)", () => {
    for (let seed = 1; seed <= 30; seed++) {
      const map = generateMap(createRng(seed).fork("map"));
      const restRows = new Set(map.nodes.filter((n) => n.type === "rest").map((n) => n.row));
      const eliteRows = new Set(map.nodes.filter((n) => n.type === "elite").map((n) => n.row));
      for (const r of restRows) expect(eliteRows.has(r)).toBe(false);
    }
  });
});
