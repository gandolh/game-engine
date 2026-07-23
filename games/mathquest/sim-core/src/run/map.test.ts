import { describe, it, expect } from "vitest";
import { createRng } from "@engine/core";
import { generateMap, zoneForRow, type MapNode, type RunMap, type Zone } from "./map";

/** M5 folklore theming's `ROW_COUNT` — duplicated as a literal here (mirrors `map.ts`'s own
 * `BOSS_NODE_GRADE` comment) so this test file has no dependency on the module's private const. */
const ROW_COUNT = 6;

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

// =================================================================================================
// M4c — the elite (hard-branch) gate (corpus/todos/2026-07-23-mathquest-M4c-persistent-mastery.md)
// =================================================================================================

describe("generateMap — M4c eliteUnlocked gate", () => {
  it("defaults to true: a bare generateMap(rng) call (no opts) always has an elite, unchanged from pre-M4c", () => {
    for (let seed = 1; seed <= 15; seed++) {
      const map = generateMap(createRng(seed).fork("map"));
      expect(map.nodes.some((n) => n.type === "elite")).toBe(true);
    }
  });

  it("eliteUnlocked:false -> NO elite node anywhere on the map", () => {
    for (let seed = 1; seed <= 15; seed++) {
      const map = generateMap(createRng(seed).fork("map"), { eliteUnlocked: false });
      expect(map.nodes.some((n) => n.type === "elite")).toBe(false);
    }
  });

  it("eliteUnlocked:false — the would-be elite column becomes a plain 'combat' node at the row's BASE grade (no +1 bump)", () => {
    for (let seed = 1; seed <= 15; seed++) {
      const unlocked = generateMap(createRng(seed).fork("map"), { eliteUnlocked: true });
      const gated = generateMap(createRng(seed).fork("map"), { eliteUnlocked: false });
      const eliteNode = unlocked.nodes.find((n) => n.type === "elite")!;
      const gatedSameSlot = gated.nodes.find((n) => n.row === eliteNode.row && n.col === eliteNode.col)!;
      expect(gatedSameSlot.type).toBe("combat");
      // Every OTHER node in the row is unaffected — only the elite slot itself changed.
      const rowBase = unlocked.nodes.filter((n) => n.row === eliteNode.row && n.type !== "elite");
      for (const n of rowBase) {
        const gatedSibling = gated.nodes.find((g) => g.row === n.row && g.col === n.col)!;
        expect(gatedSibling.type).toBe(n.type);
        expect(gatedSibling.grade).toBe(n.grade);
      }
      // Usually strictly less (no +1 bump while gated); equal only when the branch row's base
      // grade is ALREADY 4 (the elite's own +1 clamps back down to 4 too — see `clampGrade`).
      expect(gatedSameSlot.grade).toBeLessThanOrEqual(eliteNode.grade);
    }
  });

  it("eliteUnlocked:false still yields a fully valid, connected DAG (never soft-locks a run)", () => {
    for (let seed = 1; seed <= 15; seed++) {
      const map = generateMap(createRng(seed).fork("map"), { eliteUnlocked: false });
      for (const node of map.nodes) {
        if (node.type === "boss") expect(node.next.length).toBe(0);
        else expect(node.next.length).toBeGreaterThanOrEqual(1);
      }
      for (const startId of map.startIds) {
        expect(reachableFrom(map, startId).has(map.bossId)).toBe(true);
      }
    }
  });

  it("is a fork-INPUT change, not a fork-SEQUENCE change: eliteUnlocked:true and :false consume the SAME rng draws (identical maps outside the gated slot)", () => {
    for (let seed = 1; seed <= 10; seed++) {
      const unlocked = generateMap(createRng(seed).fork("map"), { eliteUnlocked: true });
      const gated = generateMap(createRng(seed).fork("map"), { eliteUnlocked: false });
      // Every node's row/col/next is identical between the two; only elite-slot type/grade differ.
      expect(unlocked.nodes.length).toBe(gated.nodes.length);
      for (let i = 0; i < unlocked.nodes.length; i++) {
        const u = unlocked.nodes[i]!;
        const g = gated.nodes[i]!;
        expect(g.id).toBe(u.id);
        expect(g.row).toBe(u.row);
        expect(g.col).toBe(u.col);
        expect(g.next).toEqual(u.next);
        if (u.type !== "elite") {
          expect(g.type).toBe(u.type);
          expect(g.grade).toBe(u.grade);
        }
      }
    }
  });

  it("same (seed, eliteUnlocked) -> byte-identical map (determinism holds with the new option too)", () => {
    for (const eliteUnlocked of [true, false]) {
      const a = generateMap(createRng(4).fork("map"), { eliteUnlocked });
      const b = generateMap(createRng(4).fork("map"), { eliteUnlocked });
      expect(a).toEqual(b);
    }
  });
});

// =================================================================================================
// M5 folklore theming, slice 1 (corpus/todos/2026-07-23-mathquest-M5-folklore-theming.md) — zone
// as a sim concept: `zoneForRow` + `MapNode.zone`.
// =================================================================================================

describe("zoneForRow", () => {
  it("returns 0/0/1/1/2/2 for rows 0..5 and 3 for the boss row (ROW_COUNT) — the thirds+boss split", () => {
    const expected: Zone[] = [0, 0, 1, 1, 2, 2];
    for (let row = 0; row < ROW_COUNT; row++) {
      expect(zoneForRow(row)).toBe(expected[row]);
    }
    expect(zoneForRow(ROW_COUNT)).toBe(3);
  });

  /** Pins `zoneForRow` to `client/src/ui/map-screen.ts`'s `zoneOfCol` — reproduced here (not
   * imported, sim-core has no dependency on the client) — for THIS map's fixed shape: 6 rows + 1
   * boss row = 7 "columns", `colsPerZone = ceil((colCount-1)/3) = ceil(6/3) = 2`. */
  it("agrees with the client's rows->thirds+boss column split for every row 0..ROW_COUNT", () => {
    const colCount = ROW_COUNT + 1; // 6 regular rows + 1 boss row, read as "columns" client-side
    const bossColIndex = colCount - 1;
    const colsPerZone = Math.max(1, Math.ceil((colCount - 1) / 3));
    const zoneOfCol = (i: number): number => (i >= bossColIndex ? 3 : Math.min(2, Math.floor(i / colsPerZone)));
    for (let row = 0; row <= ROW_COUNT; row++) {
      expect(zoneForRow(row)).toBe(zoneOfCol(row));
    }
  });
});

describe("generateMap — M5 folklore theming: MapNode.zone", () => {
  it("every node's zone === zoneForRow(node.row); the boss node is zone 3", () => {
    for (let seed = 1; seed <= 15; seed++) {
      const map = generateMap(createRng(seed).fork("map"));
      for (const node of map.nodes) {
        expect(node.zone).toBe(zoneForRow(node.row));
      }
      const boss = map.nodes.find((n) => n.id === map.bossId)!;
      expect(boss.zone).toBe(3);
    }
  });

  it("adding zone didn't disturb the connected-DAG invariants (reuses the existing helpers)", () => {
    for (let seed = 1; seed <= 10; seed++) {
      const map = generateMap(createRng(seed).fork("map"));
      for (const node of map.nodes) {
        if (node.type === "boss") expect(node.next.length).toBe(0);
        else expect(node.next.length).toBeGreaterThanOrEqual(1);
      }
      for (const startId of map.startIds) {
        expect(reachableFrom(map, startId).has(map.bossId)).toBe(true);
      }
    }
  });
});
