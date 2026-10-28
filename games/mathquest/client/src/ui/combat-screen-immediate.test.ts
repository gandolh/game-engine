/**
 * The immediate-mode combat prototype (research spec 2026-10-27, `?imgui`) against the retained
 * screen it shadows. The main check diffs the two TREES after the same refresh, for every phase:
 * same kinds, order, layout props, texts, colours, scales and button states. If they agree, the
 * layout, the render and the a11y mirror (which read only the tree) agree too.
 */
import { describe, it, expect } from "vitest";
import { MIN_VIEWPORT, assertFitsViewport, computeLayout } from "@engine/ui";
import type { ButtonNode, UINode } from "@engine/ui";
import { STARTING_LIFELINES, type CombatSnapshot, type LifelineCharges, type ProblemView } from "@mathquest/sim-core";
import { createCombatScreen, type CombatScreen, type CombatScreenActions } from "./combat-screen";
import { createImmediateCombatScreen } from "./combat-screen-immediate";
import { STRINGS_RO as STRINGS } from "../strings";
import { MATE_THEME } from "../render/mate-theme";

function baseSnapshot(over: Partial<CombatSnapshot> = {}): CombatSnapshot {
  return {
    phase: "await_action",
    warrior: { hp: 30, maxHp: 30, block: 0 },
    enemy: { hp: 24, maxHp: 24, block: 0, name: "Zmeu pui", title: "puiul balaurului", sprite: "dragon", intent: 6 },
    problem: null,
    grade: 1,
    teach: null,
    hint: null,
    turn: 1,
    lastPlayer: { kind: "none" },
    lastEnemy: { kind: "none" },
    ...over,
  };
}

const TYPED: ProblemView = { kind: "typed", topic: "subtraction", grade: 1, prompt: "5 − 2 = ?" };
const CHOICE: ProblemView = {
  kind: "choice",
  topic: "comparison",
  grade: 1,
  prompt: "Compară: 10 și 7",
  choices: ["<", "=", ">"],
  disabledChoices: [1],
};

/** Everything the layout, the renderer and the a11y mirror read from a node — never its id. */
function shape(n: UINode): unknown {
  const base = { kind: n.kind, layout: n.layout, children: n.children.map(shape) };
  switch (n.kind) {
    case "label":
      return { ...base, text: n.text, color: n.color, scale: n.scale, maxWidth: n.maxWidth };
    case "button":
      return { ...base, label: n.label, state: n.state, scale: n.scale };
    case "panel":
    case "box":
      return { ...base, background: n.background };
    default:
      return base;
  }
}

function walk(node: UINode, out: UINode[] = []): UINode[] {
  out.push(node);
  for (const c of node.children) walk(c, out);
  return out;
}
function byLabel(root: UINode, text: string): ButtonNode {
  const b = walk(root).find((x): x is ButtonNode => x.kind === "button" && x.label === text);
  if (b === undefined) throw new Error(`no button "${text}"`);
  return b;
}

function recorder(): { actions: CombatScreenActions; log: string[] } {
  const log: string[] = [];
  return {
    log,
    actions: {
      chooseAction: (a) => log.push(`action:${a}`),
      appendDigit: (d) => log.push(`digit:${d}`),
      backspace: () => log.push("backspace"),
      submit: () => log.push("submit"),
      submitChoice: (i) => log.push(`choice:${i}`),
      acknowledgeTeach: () => log.push("teach"),
      useLifeline: (k) => log.push(`lifeline:${k}`),
      restart: () => log.push("restart"),
    },
  };
}

const PHASES: Array<[string, CombatSnapshot, string, LifelineCharges]> = [
  ["await_action", baseSnapshot(), "", STARTING_LIFELINES],
  ["await_answer, typed, empty buffer", baseSnapshot({ phase: "await_answer", problem: TYPED }), "", STARTING_LIFELINES],
  ["await_answer, typed, with hint", baseSnapshot({ phase: "await_answer", problem: TYPED, hint: "Scade întâi." }), "12", STARTING_LIFELINES],
  ["await_answer, choice, 50-50 used", baseSnapshot({ phase: "await_answer", problem: CHOICE }), "", { hint: 0, fifty: 1, skip: 2 }],
  ["teach", baseSnapshot({ phase: "teach", teach: "5 − 2: numără înapoi." }), "", STARTING_LIFELINES],
  ["won", baseSnapshot({ phase: "won", enemy: { ...baseSnapshot().enemy, hp: 0 } }), "", STARTING_LIFELINES],
  ["lost", baseSnapshot({ phase: "lost", warrior: { hp: 0, maxHp: 30, block: 0 } }), "", STARTING_LIFELINES],
];

describe("immediate combat prototype — same tree as the retained screen", () => {
  it.each(PHASES)("%s", (_name, snap, typed, lifelines) => {
    const retained = createCombatScreen(recorder().actions, STRINGS);
    const immediate = createImmediateCombatScreen(recorder().actions, STRINGS);
    retained.refresh(snap, typed, lifelines);
    immediate.refresh(snap, typed, lifelines);
    expect(shape(immediate.root)).toEqual(shape(retained.root));
  });

  it("stays the same tree across a whole fight's phase sequence on ONE instance of each", () => {
    const retained = createCombatScreen(recorder().actions, STRINGS);
    const immediate = createImmediateCombatScreen(recorder().actions, STRINGS);
    for (const [, snap, typed, lifelines] of PHASES) {
      retained.refresh(snap, typed, lifelines);
      immediate.refresh(snap, typed, lifelines);
      expect(shape(immediate.root)).toEqual(shape(retained.root));
    }
  });
});

describe("immediate combat prototype — what IMGUI changes", () => {
  it("a click is delivered on the NEXT refresh (the IMGUI contract), exactly once", () => {
    const { actions, log } = recorder();
    const screen = createImmediateCombatScreen(actions, STRINGS);
    const snap = baseSnapshot();
    screen.refresh(snap, "", STARTING_LIFELINES);
    byLabel(screen.root, STRINGS.actionLabel.attack).onActivate?.();
    expect(log).toEqual([]);
    screen.refresh(snap, "", STARTING_LIFELINES);
    expect(log).toEqual(["action:attack"]);
    screen.refresh(snap, "", STARTING_LIFELINES);
    expect(log).toEqual(["action:attack"]);
  });

  it("node objects survive frames and phase swaps (dispatcher focus, presses and mirror ids depend on it)", () => {
    const screen = createImmediateCombatScreen(recorder().actions, STRINGS);
    screen.refresh(baseSnapshot(), "", STARTING_LIFELINES);
    const root = screen.root;
    const attack = byLabel(root, STRINGS.actionLabel.attack);
    screen.refresh(baseSnapshot({ phase: "await_answer", problem: TYPED }), "", STARTING_LIFELINES);
    screen.refresh(baseSnapshot(), "", STARTING_LIFELINES);
    expect(screen.root).toBe(root);
    expect(byLabel(screen.root, STRINGS.actionLabel.attack)).toBe(attack);
  });

  it("refresh reports a change only when something changed", () => {
    const screen = createImmediateCombatScreen(recorder().actions, STRINGS);
    const snap = baseSnapshot();
    expect(screen.refresh(snap, "", STARTING_LIFELINES)).toBe(true); // first frame
    expect(screen.refresh(snap, "", STARTING_LIFELINES)).toBe(false);
    expect(screen.refresh(baseSnapshot({ turn: 2 }), "", STARTING_LIFELINES)).toBe(true);
  });

  it("a typed problem fits MIN_VIEWPORT (playtest-01), like the retained screen", () => {
    const screen = createImmediateCombatScreen(recorder().actions, STRINGS);
    screen.refresh(baseSnapshot({ phase: "await_answer", problem: TYPED, hint: "Scade întâi până la 10." }), "12", STARTING_LIFELINES);
    computeLayout(screen.root, 0, 0, MATE_THEME, { width: MIN_VIEWPORT.width, height: MIN_VIEWPORT.height });
    assertFitsViewport(screen.root, MIN_VIEWPORT, { what: "MateQuest immediate combat (typed problem)" });
  });

  it("the shared CombatScreen interface holds for both shapes", () => {
    const shapes: CombatScreen[] = [
      createCombatScreen(recorder().actions, STRINGS),
      createImmediateCombatScreen(recorder().actions, STRINGS),
    ];
    for (const s of shapes) expect(typeof s.refresh).toBe("function");
  });
});
