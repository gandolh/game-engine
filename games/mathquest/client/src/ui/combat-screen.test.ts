/**
 * Tests for the combat screen's retained @engine/ui tree (createCombatScreen). M2 additions
 * exercised here: choice buttons vs keypad by `problem.kind`, the teach card + Continue, and the
 * grade selector reflecting `snapshot.grade` (corpus/todos/2026-07-22-mathquest-M2-problem-
 * generators.md, Part B). No real surface — we assert the retained tree, mirroring
 * @citadel/client's build-bar.test.ts.
 */
import { describe, it, expect } from "vitest";
import type { ButtonNode, LabelNode, UINode } from "@engine/ui";
import type { CombatSnapshot, ProblemView } from "@mathquest/sim-core";
import { createCombatScreen, type CombatScreenActions } from "./combat-screen";

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

function baseSnapshot(over: Partial<CombatSnapshot> = {}): CombatSnapshot {
  return {
    phase: "await_action",
    warrior: { hp: 30, maxHp: 30, block: 0 },
    enemy: { hp: 24, maxHp: 24, block: 0, name: "Zmeu pui", intent: 6 },
    problem: null,
    grade: 1,
    teach: null,
    turn: 1,
    lastPlayer: { kind: "none" },
    lastEnemy: { kind: "none" },
    ...over,
  };
}

interface Calls {
  chooseAction: string[];
  digits: number[];
  backspace: number;
  submit: number;
  submitChoice: number[];
  acknowledgeTeach: number;
  restart: number;
}

function makeScreen(): { screen: ReturnType<typeof createCombatScreen>; calls: Calls } {
  const calls: Calls = {
    chooseAction: [],
    digits: [],
    backspace: 0,
    submit: 0,
    submitChoice: [],
    acknowledgeTeach: 0,
    restart: 0,
  };
  const actions: CombatScreenActions = {
    chooseAction: (a) => calls.chooseAction.push(a),
    appendDigit: (d) => calls.digits.push(d),
    backspace: () => {
      calls.backspace++;
    },
    submit: () => {
      calls.submit++;
    },
    submitChoice: (i) => calls.submitChoice.push(i),
    acknowledgeTeach: () => {
      calls.acknowledgeTeach++;
    },
    restart: () => {
      calls.restart++;
    },
  };
  return { screen: createCombatScreen(actions), calls };
}

describe("createCombatScreen — action menu / banner (unchanged M1 shapes)", () => {
  it("shows Attack/Heal/Shield only in await_action", () => {
    const { screen } = makeScreen();
    screen.refresh(baseSnapshot({ phase: "await_action" }), "");
    expect(buttons(screen.root).map((b) => b.label)).toEqual(expect.arrayContaining(["Attack", "Heal", "Shield"]));
    screen.refresh(baseSnapshot({ phase: "won" }), "");
    expect(buttons(screen.root).map((b) => b.label)).not.toContain("Attack");
  });

  it("clicking Attack calls chooseAction('attack')", () => {
    const { screen, calls } = makeScreen();
    screen.refresh(baseSnapshot({ phase: "await_action" }), "");
    byLabel(screen.root, "Attack").onActivate?.();
    expect(calls.chooseAction).toEqual(["attack"]);
  });

  it("won/lost shows the banner text + a working Restart button", () => {
    const { screen, calls } = makeScreen();
    screen.refresh(baseSnapshot({ phase: "won" }), "");
    expect(labels(screen.root).map((l) => l.text)).toContain("Victory!");
    byLabel(screen.root, "Restart").onActivate?.();
    expect(calls.restart).toBe(1);

    screen.refresh(baseSnapshot({ phase: "lost" }), "");
    expect(labels(screen.root).map((l) => l.text)).toContain("Defeat");
  });
});

describe("createCombatScreen — M2 mixed input: typed keypad vs choice buttons", () => {
  it("a typed problem renders the numeric keypad, no choice buttons", () => {
    const { screen } = makeScreen();
    const problem: ProblemView = { kind: "typed", topic: "addition", grade: 1, prompt: "3 + 4 = ?" };
    screen.refresh(baseSnapshot({ phase: "await_answer", problem }), "");
    const btnLabels = buttons(screen.root).map((b) => b.label);
    expect(btnLabels).toEqual(expect.arrayContaining(["0", "1", "2", "3", "4", "5", "6", "7", "8", "9"]));
    // 12 keypad buttons (10 digits + backspace + enter); no grade selector (M3), no action menu/choices.
    expect(buttons(screen.root).length).toBe(12);
  });

  it("a choice problem renders exactly problem.choices as buttons, no keypad", () => {
    const { screen } = makeScreen();
    const problem: ProblemView = {
      kind: "choice",
      topic: "comparison",
      grade: 2,
      prompt: "Compară: 5 și 9",
      choices: [">", "=", "<"],
    };
    screen.refresh(baseSnapshot({ phase: "await_answer", problem, grade: 2 }), "");
    const btnLabels = buttons(screen.root).map((b) => b.label);
    expect(btnLabels).toEqual(expect.arrayContaining([">", "=", "<"]));
    expect(btnLabels).not.toContain("0"); // no keypad digit present
    // 3 choice buttons; no grade selector (M3), no keypad, no action menu.
    expect(buttons(screen.root).length).toBe(3);
  });

  it("clicking a choice button submits ITS index (tracks the choice order shown)", () => {
    const { screen, calls } = makeScreen();
    const problem: ProblemView = {
      kind: "choice",
      topic: "comparison",
      grade: 1,
      prompt: "Compară: 5 și 9",
      choices: [">", "=", "<"],
    };
    screen.refresh(baseSnapshot({ phase: "await_answer", problem }), "");
    byLabel(screen.root, "<").onActivate?.();
    expect(calls.submitChoice).toEqual([2]); // "<" sits at index 2 in this shuffle
  });

  it("switching FROM a choice problem TO a typed problem swaps the input area back to the keypad", () => {
    const { screen } = makeScreen();
    const choiceProblem: ProblemView = {
      kind: "choice",
      topic: "comparison",
      grade: 1,
      prompt: "Compară: 5 și 9",
      choices: [">", "=", "<"],
    };
    screen.refresh(baseSnapshot({ phase: "await_answer", problem: choiceProblem }), "");
    expect(buttons(screen.root).map((b) => b.label)).toContain(">");

    const typedProblem: ProblemView = { kind: "typed", topic: "subtraction", grade: 1, prompt: "9 - 5 = ?" };
    screen.refresh(baseSnapshot({ phase: "await_answer", problem: typedProblem }), "");
    const btnLabels = buttons(screen.root).map((b) => b.label);
    expect(btnLabels).toContain("0");
    expect(btnLabels).not.toContain(">");
  });

  it("typed mode: digit/backspace/enter buttons call appendDigit/backspace/submit", () => {
    const { screen, calls } = makeScreen();
    const problem: ProblemView = { kind: "typed", topic: "addition", grade: 1, prompt: "3 + 4 = ?" };
    screen.refresh(baseSnapshot({ phase: "await_answer", problem }), "3");
    byLabel(screen.root, "7").onActivate?.();
    byLabel(screen.root, "⌫").onActivate?.();
    byLabel(screen.root, "Enter").onActivate?.();
    expect(calls.digits).toEqual([7]);
    expect(calls.backspace).toBe(1);
    expect(calls.submit).toBe(1);
  });
});

describe("createCombatScreen — M2 teach card", () => {
  it("phase 'teach' shows the worked-step text + the fizzle cue + a Continue button", () => {
    const { screen } = makeScreen();
    screen.refresh(
      baseSnapshot({
        phase: "teach",
        teach: "7 + 8: 7 + 3 = 10, apoi + 5 = 15",
        lastPlayer: { kind: "fizzle", action: "attack" },
      }),
      "",
    );
    const text = labels(screen.root).map((l) => l.text);
    expect(text).toContain("7 + 8: 7 + 3 = 10, apoi + 5 = 15");
    expect(text).toContain("Fizzle!");
    expect(() => byLabel(screen.root, "Continue")).not.toThrow();
    // No action menu, no problem panel while in "teach".
    expect(buttons(screen.root).map((b) => b.label)).not.toContain("Attack");
  });

  it("clicking Continue calls acknowledgeTeach", () => {
    const { screen, calls } = makeScreen();
    screen.refresh(
      baseSnapshot({ phase: "teach", teach: "x", lastPlayer: { kind: "fizzle", action: "heal" } }),
      "",
    );
    byLabel(screen.root, "Continue").onActivate?.();
    expect(calls.acknowledgeTeach).toBe(1);
  });
});

describe("createCombatScreen — grade readout (M3: read-only, no selector)", () => {
  it("shows the fight's fixed grade as text, with no grade BUTTONS anywhere", () => {
    const { screen } = makeScreen();
    screen.refresh(baseSnapshot({ grade: 1 }), "");
    expect(labels(screen.root).map((l) => l.text)).toContain("Grade: I");
    expect(buttons(screen.root).map((b) => b.label)).not.toContain("I");

    screen.refresh(baseSnapshot({ grade: 3 }), "");
    expect(labels(screen.root).map((l) => l.text)).toContain("Grade: III");
  });
});

describe("createCombatScreen — refresh() change reporting", () => {
  it("reports true on the first refresh, false when nothing changed, true again on a real change", () => {
    const { screen } = makeScreen();
    expect(screen.refresh(baseSnapshot(), "")).toBe(true);
    expect(screen.refresh(baseSnapshot(), "")).toBe(false);
    expect(screen.refresh(baseSnapshot({ turn: 2 }), "")).toBe(true);
  });
});
