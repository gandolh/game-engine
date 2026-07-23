/**
 * Tests for the run-over screen's retained @engine/ui tree (createRunOverScreen). Mirrors
 * combat-screen.test.ts's walk/buttons/labels helpers (corpus/todos/2026-07-22-mathquest-M3-map-
 * and-runs.md, Part B's "a run_won snapshot builds the banner + New-run button").
 */
import { describe, it, expect } from "vitest";
import { createRng } from "@engine/core";
import type { ButtonNode, LabelNode, UINode } from "@engine/ui";
import { EMPTY_MASTERY_STORE, generateMap, STARTING_LIFELINES, type RunView } from "@mathquest/sim-core";
import { createRunOverScreen, type RunOverScreenActions } from "./run-over-screen";

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
function byLabel(root: UINode, text: string): ButtonNode {
  const b = buttons(root).find((x) => x.label === text);
  if (b === undefined) throw new Error(`no button "${text}"`);
  return b;
}

function testRun(over: Partial<RunView> = {}): RunView {
  const map = generateMap(createRng(1).fork("map"));
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
    // player's default (mastery survives death, so a real run would NOT reset this to empty on
    // every refresh — but a bare fixture with nothing else specified starts from empty, same as a
    // fresh install).
    mastery: EMPTY_MASTERY_STORE,
    ...over,
  };
}

describe("createRunOverScreen", () => {
  it("run_won builds the 'Ai învins!' banner + a New run button", () => {
    let calls = 0;
    const actions: RunOverScreenActions = { newRun: () => calls++ };
    const screen = createRunOverScreen(actions);
    screen.refresh("run_won", testRun());
    expect(labels(screen.root).map((l) => l.text)).toContain("Ai învins!");
    byLabel(screen.root, "Rulare nouă").onActivate?.();
    expect(calls).toBe(1);
  });

  it("run_lost builds the 'Ai pierdut' banner + a New run button", () => {
    const actions: RunOverScreenActions = { newRun: () => {} };
    const screen = createRunOverScreen(actions);
    screen.refresh("run_lost", testRun());
    expect(labels(screen.root).map((l) => l.text)).toContain("Ai pierdut");
    expect(() => byLabel(screen.root, "Rulare nouă")).not.toThrow();
  });

  it("shows a summary line with the visited count and final HP", () => {
    const actions: RunOverScreenActions = { newRun: () => {} };
    const screen = createRunOverScreen(actions);
    screen.refresh("run_lost", testRun({ visitedIds: [0, 1, 2], warriorHp: 0, warriorMaxHp: 30 }));
    expect(labels(screen.root).map((l) => l.text).some((t) => t.includes("3") && t.includes("0/30"))).toBe(true);
  });

  it("refresh() reports true on first call, false when nothing changed, true when the mode flips", () => {
    const actions: RunOverScreenActions = { newRun: () => {} };
    const screen = createRunOverScreen(actions);
    const run = testRun();
    expect(screen.refresh("run_won", run)).toBe(true);
    expect(screen.refresh("run_won", run)).toBe(false);
    expect(screen.refresh("run_lost", run)).toBe(true);
  });

  // M4c: mastery readout (corpus/todos/2026-07-23-mathquest-M4c-persistent-mastery.md).
  it("shows one line per topic with its correct/attempts and tier — e.g. Adunare: 12/15 · Nivel 2", () => {
    const actions: RunOverScreenActions = { newRun: () => {} };
    const screen = createRunOverScreen(actions);
    const run = testRun({
      mastery: {
        ...EMPTY_MASTERY_STORE,
        topics: { ...EMPTY_MASTERY_STORE.topics, addition: { correct: 12, attempts: 15 } },
      },
    });
    screen.refresh("run_won", run);
    const text = labels(screen.root).map((l) => l.text);
    expect(text.some((t) => t.includes("Adunare") && t.includes("12/15") && t.includes("Nivel 1"))).toBe(true);
  });

  it("the mastery readout is IDENTICAL on run_lost as run_won for the SAME store (mastery survives death)", () => {
    const actions: RunOverScreenActions = { newRun: () => {} };
    const wonScreen = createRunOverScreen(actions);
    const lostScreen = createRunOverScreen(actions);
    const run = testRun({
      mastery: {
        ...EMPTY_MASTERY_STORE,
        topics: { ...EMPTY_MASTERY_STORE.topics, comparison: { correct: 20, attempts: 25 } },
      },
    });
    wonScreen.refresh("run_won", run);
    lostScreen.refresh("run_lost", run);
    const masteryLine = (root: typeof wonScreen.root): string | undefined =>
      labels(root).map((l) => l.text).find((t) => t.includes("Comparare"));
    expect(masteryLine(wonScreen.root)).toBe(masteryLine(lostScreen.root));
    expect(masteryLine(wonScreen.root)).toContain("20/25");
  });
});
