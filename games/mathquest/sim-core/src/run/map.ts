/**
 * MateQuest M3 — the branching node map (corpus/todos/2026-07-22-mathquest-M3-map-and-runs.md,
 * Part A1). A run's topology is a deterministic connected DAG: 6 rows of 2-3 nodes (≈10-14
 * non-boss nodes) followed by a single boss row, with an easy/hard fork somewhere in the middle
 * (a branching row's harder node is marked `"elite"`) and at least one `"rest"` node.
 *
 * Determinism (root CLAUDE.md): `generateMap` consumes ONLY the `Rng` it's handed, forking a
 * fresh NAMED child for every independent decision (row sizes, which row branches/rests, each
 * node's outgoing edges, …) so the same seed always produces the exact same map. The caller
 * (`sim-bootstrap.ts`) is responsible for handing in a fresh fork per map generated
 * (`rng.fork("map")` for the first run, `rng.fork(`run:${n}`)` for every `newRun()` after).
 *
 * M4c (corpus/todos/2026-07-23-mathquest-M4c-persistent-mastery.md) adds an OPTIONAL
 * `opts.eliteUnlocked` (default `true`, so every pre-M4c call site/test stays byte-identical):
 * when `false`, the branch row's would-be `"elite"` column is emitted as a normal `"combat"` node
 * at the row's BASE grade instead — no hard fork at all, but the map stays exactly as valid a
 * connected DAG either way. This is a fork INPUT change, not a fork SEQUENCE change: the
 * `elite-col:${row}` fork is still consumed at the same point regardless of `eliteUnlocked`, only
 * its result is ignored when the gate is closed — see `sim-bootstrap.ts` for how the persistent
 * `MasteryStore` decides `eliteUnlocked`.
 */
import type { Rng } from "@engine/core";
import type { Grade } from "../combat/types";

/** A map node's kind. `"rest"` heals and has no fight; the other three map 1:1 onto
 * `run/enemies.ts`'s `EnemyKind`. */
export type NodeType = "combat" | "elite" | "rest" | "boss";

/**
 * M5 folklore theming (corpus/todos/2026-07-23-mathquest-M5-folklore-theming.md, slice 1 of 3) —
 * the map's four visual/thematic bands: 0 forest, 1 village, 2 mountains, 3 lair (boss-only). Pure
 * flavor — carries no stats of its own; `run/enemies.ts`'s `enemyFor` reads it to pick a
 * zone-flavored name/epithet, never a stat.
 */
export type Zone = 0 | 1 | 2 | 3;

/**
 * Deterministic function of `row` alone — no `Rng` involved, so the same map always yields the
 * same zone for the same row. MUST reproduce `client/src/ui/map-screen.ts`'s `zoneOfCol` exactly
 * for the current shape (`ROW_COUNT = 6` non-boss rows + one boss row): that function derives 4
 * zones from `colsPerZone = ceil((colCount-1)/3)` over 7 "columns" (6 rows + boss), which for this
 * map's fixed shape works out to EXACTLY rows 0-1 -> zone 0, 2-3 -> zone 1, 4-5 -> zone 2, and the
 * boss row -> zone 3 — the same thirds-plus-boss split hardcoded below. Pinned by a test in
 * `map.test.ts` that asserts the two agree for every row `0..ROW_COUNT`. If `ROW_COUNT` ever
 * changes, this function and `zoneOfCol` must be re-derived TOGETHER.
 */
export function zoneForRow(row: number): Zone {
  return row < 2 ? 0 : row < 4 ? 1 : row < 6 ? 2 : 3;
}

export interface MapNode {
  readonly id: number;
  readonly type: NodeType;
  /** 0 = first choosable row; the boss sits alone in row `ROW_COUNT` (the row past the last
   * regular row) — see the module's `ROW_COUNT`. */
  readonly row: number;
  /** Position within the row, for client layout (left-to-right reading order). */
  readonly col: number;
  /** Fight difficulty. Ignored for `"rest"` (no fight happens there). */
  readonly grade: Grade;
  /** M5: this node's visual/thematic zone — always `zoneForRow(row)`; purely additive, never
   * consulted by the DAG/edge logic below. */
  readonly zone: Zone;
  /** Node ids reachable from this node. Empty ONLY for the boss (the map's unique terminal). */
  readonly next: readonly number[];
}

export interface RunMap {
  readonly nodes: readonly MapNode[];
  /** Row-0 node ids — the very first choice a fresh run presents. */
  readonly startIds: readonly number[];
  readonly bossId: number;
}

/** 6 non-boss rows, per the brief. The boss occupies the row right after the last of these. */
const ROW_COUNT = 6;

/** Grade escalates with depth (brief A1): rows 0-1 -> grades 1-2, rows 2-3 -> 2-3, rows 4-5 ->
 * 3-4. A branching row's harder node bumps ABOVE this by +1 (capped at 4) — see `clampGrade`. */
const ROW_BASE_GRADE: readonly Grade[] = [1, 2, 2, 3, 3, 4];

/** The boss's fixed grade (matches `run/enemies.ts`'s `BOSS_GRADE`; duplicated as a literal here
 * to keep this module free of a `run/enemies.ts` dependency — the two are pinned together by
 * `map.test.ts`). */
const BOSS_NODE_GRADE: Grade = 4;

function clampGrade(g: number): Grade {
  return Math.max(1, Math.min(4, g)) as Grade;
}

/** Deterministic Fisher-Yates permutation of `[0, length)`, consuming ONLY `rng` (mirrors
 * `combat/generators.ts`'s `shuffledIndices`; duplicated locally so `run/map.ts` stays free of a
 * dependency on `combat/generators.ts`). */
function shuffledRange(length: number, rng: Rng): number[] {
  const idx = Array.from({ length }, (_, i) => i);
  for (let i = idx.length - 1; i > 0; i--) {
    const j = rng.int(0, i + 1);
    const tmp = idx[i]!;
    idx[i] = idx[j]!;
    idx[j] = tmp;
  }
  return idx;
}

/**
 * Generate a fresh, deterministic run map from `rng`. See the module doc for the determinism
 * contract and the M3 brief (Part A1) for the exact invariants this is required to hold:
 * connected DAG (every non-boss node has ≥1 `next`; every row r+1 node has ≥1 incoming from row
 * r; the boss is reachable from every start id); ≥1 branching row with a differing-grade/type
 * `"elite"` fork; ≥1 `"rest"` node in a middle row; escalating grades; boss grade 4.
 */
export function generateMap(rng: Rng, opts?: { readonly eliteUnlocked?: boolean }): RunMap {
  const eliteUnlocked = opts?.eliteUnlocked ?? true;
  // --- Row sizes: 6 rows of 2 nodes, 0-2 of them bumped to 3 — keeps the non-boss node count in
  // the brief's ≈10-14 band (12 + 0..2) while still varying the shape across seeds.
  const sizeRng = rng.fork("sizes");
  const extraRowCount = sizeRng.int(0, 3); // 0, 1, or 2 rows get a 3rd node
  const bumpedRows = new Set(shuffledRange(ROW_COUNT, sizeRng.fork("bumped")).slice(0, extraRowCount));
  const rowSizes: number[] = Array.from({ length: ROW_COUNT }, (_, r) => (bumpedRows.has(r) ? 3 : 2));

  // --- Branch row: the ONE row that carries the easy/hard fork — its hardest node becomes
  // `"elite"`. Every other row is plain `"combat"` at the row's base grade.
  const branchRow = rng.fork("branch-row").int(0, ROW_COUNT);

  // --- Rest rows: TWO of rows 1-4 get a `"rest"` node instead of a fight (the brief requires
  // "≥1" — two is a deliberate above-minimum choice: with `WARRIOR_MAX_HP` fixed at 30 by the
  // brief and ~6-7 sequential fights along any path to the boss, a single +REST_HEAL top-up
  // isn't enough HP budget for a full run to be winnable by careful play — see
  // corpus/todos/2026-07-22-mathquest-M3-map-and-runs.md's own "provisional/tunable" note on
  // enemy/rest balance). Never the SAME row as `branchRow`, so a row never has to carry BOTH
  // special columns — keeping "≥1 elite" and "≥1 rest" independently guaranteed every run.
  const restRowCandidates = [1, 2, 3, 4].filter((r) => r !== branchRow);
  const restRowOrder = shuffledRange(restRowCandidates.length, rng.fork("rest-rows"));
  const restRowCount = Math.min(2, restRowCandidates.length);
  const restRows = new Set(restRowOrder.slice(0, restRowCount).map((i) => restRowCandidates[i]!));

  const nodes: MapNode[] = [];
  const rowIds: number[][] = [];
  let nextId = 0;

  for (let row = 0; row < ROW_COUNT; row++) {
    const size = rowSizes[row]!;
    const base = ROW_BASE_GRADE[row]!;
    const eliteCol = row === branchRow ? rng.fork(`elite-col:${row}`).int(0, size) : -1;
    const restCol = restRows.has(row) ? rng.fork(`rest-col:${row}`).int(0, size) : -1;
    const ids: number[] = [];
    for (let col = 0; col < size; col++) {
      const id = nextId++;
      ids.push(id);
      let type: NodeType = "combat";
      let grade: Grade = base;
      if (col === restCol) {
        type = "rest";
      } else if (col === eliteCol && eliteUnlocked) {
        type = "elite";
        grade = clampGrade(base + 1);
      }
      // else (M4c, eliteUnlocked===false, col===eliteCol): stays plain "combat" at the row's base
      // grade — the `elite-col:${row}` fork above was still consumed (fork sequence unchanged),
      // its result just isn't ACTED on while the gate is closed.
      nodes.push({ id, type, row, col, grade, zone: zoneForRow(row), next: [] }); // `next` filled in below
    }
    rowIds.push(ids);
  }

  const bossId = nextId++;
  nodes.push({
    id: bossId,
    type: "boss",
    row: ROW_COUNT,
    col: 0,
    grade: BOSS_NODE_GRADE,
    zone: zoneForRow(ROW_COUNT), // always 3 (the lair) — the boss ignores zone anyway (one boss)
    next: [],
  });

  // --- Edges: every row-r node gets 1-2 outgoing edges into row r+1; a cover pass then wires any
  // row-r+1 node that ended up with NO incoming edge from a random row-r source, so every node
  // past row 0 always has ≥1 incoming and every non-boss node always has ≥1 outgoing (the
  // "connected DAG, boss reachable from every start" invariant).
  const nextOf = new Map<number, number[]>();
  for (const n of nodes) nextOf.set(n.id, []);

  for (let row = 0; row < ROW_COUNT - 1; row++) {
    const sources = rowIds[row]!;
    const targets = rowIds[row + 1]!;
    const covered = new Set<number>();
    for (const sourceId of sources) {
      const edgeRng = rng.fork(`edge:${sourceId}`);
      const k = Math.min(targets.length, edgeRng.int(1, 3)); // 1 or 2 outgoing edges
      const chosen = shuffledRange(targets.length, edgeRng.fork("targets")).slice(0, k);
      for (const ci of chosen) {
        const targetId = targets[ci]!;
        nextOf.get(sourceId)!.push(targetId);
        covered.add(targetId);
      }
    }
    for (const targetId of targets) {
      if (covered.has(targetId)) continue;
      const sourceId = sources[rng.fork(`cover:${targetId}`).int(0, sources.length)]!;
      nextOf.get(sourceId)!.push(targetId);
    }
  }
  // Every last-row node connects to the boss.
  for (const sourceId of rowIds[ROW_COUNT - 1]!) {
    nextOf.get(sourceId)!.push(bossId);
  }

  const finished: MapNode[] = nodes.map((n) => ({ ...n, next: nextOf.get(n.id)! }));

  return { nodes: finished, startIds: rowIds[0]!, bossId };
}
