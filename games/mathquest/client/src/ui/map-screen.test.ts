/**
 * Tests for the map screen's retained @engine/ui tree (createMapScreen). Mirrors
 * combat-screen.test.ts's walk/buttons/labels helpers — no real surface, we assert the retained
 * tree directly (corpus/todos/2026-07-22-mathquest-M3-map-and-runs.md, Part B's "a map snapshot
 * builds one button per node with reachable ones enabled").
 */
import { describe, it, expect } from "vitest";
import { createRng } from "@engine/core";
import type { ButtonNode, LabelNode, UINode } from "@engine/ui";
import { generateMap, type RunMap, type RunView } from "@mathquest/sim-core";
import { createMapScreen, type MapScreenActions } from "./map-screen";

function walk(node: UINode, out: UINode[] = []): UINode[] {
  out.push(node);
  for (const c of node.children) walk(c, out);
  return out;
}
function buttons(root: UINode): ButtonNode[] {
  return walk(root).filter((n): n is ButtonNode => n.kind === "button");
}
function labels(root: UINode): LabelNode[] {
  return walk(root).filter((n): n is LabelNode => n.kind === "label");
}

interface Calls {
  chooseNode: number[];
}

function makeScreen(): { screen: ReturnType<typeof createMapScreen>; calls: Calls } {
  const calls: Calls = { chooseNode: [] };
  const actions: MapScreenActions = { chooseNode: (id) => calls.chooseNode.push(id) };
  return { screen: createMapScreen(actions), calls };
}

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
    ...over,
  };
}

/** All non-boss nodes in the SAME (row asc, col asc) order `map-screen.ts` binds its grid slots
 * in, followed by the boss — matches `buttons(screen.root)`'s preorder exactly. */
function nodesInScreenOrder(map: RunMap) {
  const nonBoss = map.nodes.filter((n) => n.id !== map.bossId).slice();
  nonBoss.sort((a, b) => (a.row !== b.row ? a.row - b.row : a.col - b.col));
  const boss = map.nodes.find((n) => n.id === map.bossId)!;
  return [...nonBoss, boss];
}

describe("createMapScreen — one button per node, reachable enabled / others disabled", () => {
  it("builds exactly one button per node (non-boss + boss), reachable = state:normal, else disabled", () => {
    const map = testMap(1);
    const { screen } = makeScreen();
    const run = baseRun(map);
    screen.refresh(run);

    const ordered = nodesInScreenOrder(map);
    const btns = buttons(screen.root);
    expect(btns.length).toBe(ordered.length);

    const reachable = new Set(run.reachableIds);
    for (let i = 0; i < ordered.length; i++) {
      const node = ordered[i]!;
      const btn = btns[i]!;
      expect(btn.state).toBe(reachable.has(node.id) ? "normal" : "disabled");
    }
    // At least one reachable node exists (the start row) and at least one non-reachable (everyone else).
    expect(btns.some((b) => b.state === "normal")).toBe(true);
    expect(btns.some((b) => b.state === "disabled")).toBe(true);
  });

  it("clicking a REACHABLE node's button posts chooseNode with that node's id", () => {
    const map = testMap(1);
    const { screen, calls } = makeScreen();
    const run = baseRun(map);
    screen.refresh(run);

    const ordered = nodesInScreenOrder(map);
    const btns = buttons(screen.root);
    const firstReachableIndex = ordered.findIndex((n) => run.reachableIds.includes(n.id));
    expect(firstReachableIndex).toBeGreaterThanOrEqual(0);
    btns[firstReachableIndex]!.onActivate?.();
    expect(calls.chooseNode).toEqual([ordered[firstReachableIndex]!.id]);
  });

  it("a DISABLED (non-reachable) node's onActivate is still wired but its state signals non-interactive", () => {
    // The widget layer (not this screen) is responsible for suppressing activation on disabled
    // buttons (@engine/ui's input dispatcher/a11y mirror) — verify THIS screen at least marks it.
    const map = testMap(1);
    const { screen } = makeScreen();
    screen.refresh(baseRun(map));
    const ordered = nodesInScreenOrder(map);
    const btns = buttons(screen.root);
    const bossIndex = ordered.length - 1;
    expect(ordered[bossIndex]!.id).toBe(map.bossId);
    expect(btns[bossIndex]!.state).toBe("disabled"); // the boss is never reachable turn 1
  });

  it("relabels a visited node with the ✓ prefix", () => {
    const map = testMap(1);
    const { screen } = makeScreen();
    const startId = map.startIds[0]!;
    const startNode = map.nodes.find((n) => n.id === startId)!;
    const run = baseRun(map, { visitedIds: [startId], reachableIds: startNode.next });
    screen.refresh(run);
    const ordered = nodesInScreenOrder(map);
    const idx = ordered.findIndex((n) => n.id === startId);
    expect(buttons(screen.root)[idx]!.label.startsWith("✓ ")).toBe(true);
  });

  it("shows the warrior's persisted HP", () => {
    const map = testMap(1);
    const { screen } = makeScreen();
    screen.refresh(baseRun(map, { warriorHp: 17, warriorMaxHp: 30 }));
    expect(labels(screen.root).map((l) => l.text)).toContain("17/30");
  });

  it("refresh() reports true on first call, false when nothing changed", () => {
    const map = testMap(1);
    const { screen } = makeScreen();
    const run = baseRun(map);
    expect(screen.refresh(run)).toBe(true);
    expect(screen.refresh(run)).toBe(false);
    expect(screen.refresh(baseRun(map, { warriorHp: 5 }))).toBe(true);
  });

  it("re-refreshing with a DIFFERENT map (a fresh run) rebinds the grid to the new shape", () => {
    const map1 = testMap(1);
    const map2 = testMap(2);
    const { screen } = makeScreen();
    screen.refresh(baseRun(map1));
    const countBefore = buttons(screen.root).length;
    screen.refresh(baseRun(map2));
    const countAfter = buttons(screen.root).length;
    expect(countAfter).toBe(map2.nodes.length);
    expect(countBefore).toBe(map1.nodes.length);
  });
});
