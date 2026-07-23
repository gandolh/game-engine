/**
 * Tests for the combat screen's retained @engine/ui tree (createCombatScreen). M2 additions
 * exercised here: choice buttons vs keypad by `problem.kind`, the teach card + Continue, and the
 * grade selector reflecting `snapshot.grade` (corpus/todos/2026-07-22-mathquest-M2-problem-
 * generators.md, Part B). No real surface — we assert the retained tree, mirroring
 * @citadel/client's build-bar.test.ts.
 */
import { describe, it, expect } from "vitest";
import type { ButtonNode, LabelNode, UINode } from "@engine/ui";
import { NO_LIFELINES, STARTING_LIFELINES, type CombatSnapshot, type LifelineCharges, type ProblemView } from "@mathquest/sim-core";
import { createCombatScreen, type CombatScreenActions } from "./combat-screen";
import { STRINGS } from "../strings";

/** Every `screen.refresh` call below defaults to the full starting kit unless a test overrides it
 * — mirrors a fresh run's `RunView.lifelines` (M4b). */
const DEFAULT_LIFELINES: LifelineCharges = STARTING_LIFELINES;

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
    enemy: { hp: 24, maxHp: 24, block: 0, name: "Zmeu pui", title: "puiul balaurului", intent: 6 },
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

interface Calls {
  chooseAction: string[];
  digits: number[];
  backspace: number;
  submit: number;
  submitChoice: number[];
  acknowledgeTeach: number;
  useLifeline: string[];
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
    useLifeline: [],
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
    useLifeline: (kind) => calls.useLifeline.push(kind),
    restart: () => {
      calls.restart++;
    },
  };
  return { screen: createCombatScreen(actions), calls };
}

describe("createCombatScreen — action menu / banner (unchanged M1 shapes)", () => {
  it("shows Attack/Heal/Shield only in await_action", () => {
    const { screen } = makeScreen();
    screen.refresh(baseSnapshot({ phase: "await_action" }), "", DEFAULT_LIFELINES);
    expect(buttons(screen.root).map((b) => b.label)).toEqual(
      expect.arrayContaining([STRINGS.actionLabel.attack, STRINGS.actionLabel.heal, STRINGS.actionLabel.shield]),
    );
    screen.refresh(baseSnapshot({ phase: "won" }), "", DEFAULT_LIFELINES);
    expect(buttons(screen.root).map((b) => b.label)).not.toContain(STRINGS.actionLabel.attack);
  });

  it("clicking Attack calls chooseAction('attack')", () => {
    const { screen, calls } = makeScreen();
    screen.refresh(baseSnapshot({ phase: "await_action" }), "", DEFAULT_LIFELINES);
    byLabel(screen.root, STRINGS.actionLabel.attack).onActivate?.();
    expect(calls.chooseAction).toEqual(["attack"]);
  });

  it("won/lost shows the banner text + a working Restart button", () => {
    const { screen, calls } = makeScreen();
    screen.refresh(baseSnapshot({ phase: "won" }), "", DEFAULT_LIFELINES);
    expect(labels(screen.root).map((l) => l.text)).toContain(STRINGS.won);
    byLabel(screen.root, STRINGS.restart).onActivate?.();
    expect(calls.restart).toBe(1);

    screen.refresh(baseSnapshot({ phase: "lost" }), "", DEFAULT_LIFELINES);
    expect(labels(screen.root).map((l) => l.text)).toContain(STRINGS.lost);
  });
});

describe("createCombatScreen — M2 mixed input: typed keypad vs choice buttons", () => {
  it("a typed problem renders the numeric keypad, no choice buttons", () => {
    const { screen } = makeScreen();
    const problem: ProblemView = { kind: "typed", topic: "addition", grade: 1, prompt: "3 + 4 = ?" };
    screen.refresh(baseSnapshot({ phase: "await_answer", problem }), "", DEFAULT_LIFELINES);
    const btnLabels = buttons(screen.root).map((b) => b.label);
    expect(btnLabels).toEqual(expect.arrayContaining(["0", "1", "2", "3", "4", "5", "6", "7", "8", "9"]));
    // 12 keypad buttons (10 digits + backspace + enter) + 3 lifeline buttons (M4b, always shown
    // alongside the problem panel in await_answer); no grade selector (M3), no action menu/choices.
    expect(buttons(screen.root).length).toBe(15);
  });

  it("a choice problem renders exactly problem.choices as buttons, no keypad", () => {
    const { screen } = makeScreen();
    const problem: ProblemView = {
      kind: "choice",
      topic: "comparison",
      grade: 2,
      prompt: "Compară: 5 și 9",
      choices: [">", "=", "<"],
      disabledChoices: [],
    };
    screen.refresh(baseSnapshot({ phase: "await_answer", problem, grade: 2 }), "", DEFAULT_LIFELINES);
    const btnLabels = buttons(screen.root).map((b) => b.label);
    expect(btnLabels).toEqual(expect.arrayContaining([">", "=", "<"]));
    expect(btnLabels).not.toContain("0"); // no keypad digit present
    // 3 choice buttons + 3 lifeline buttons (M4b, always shown alongside the problem panel in
    // await_answer); no grade selector (M3), no keypad, no action menu.
    expect(buttons(screen.root).length).toBe(6);
  });

  it("clicking a choice button submits ITS index (tracks the choice order shown)", () => {
    const { screen, calls } = makeScreen();
    const problem: ProblemView = {
      kind: "choice",
      topic: "comparison",
      grade: 1,
      prompt: "Compară: 5 și 9",
      choices: [">", "=", "<"],
      disabledChoices: [],
    };
    screen.refresh(baseSnapshot({ phase: "await_answer", problem }), "", DEFAULT_LIFELINES);
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
      disabledChoices: [],
    };
    screen.refresh(baseSnapshot({ phase: "await_answer", problem: choiceProblem }), "", DEFAULT_LIFELINES);
    expect(buttons(screen.root).map((b) => b.label)).toContain(">");

    const typedProblem: ProblemView = { kind: "typed", topic: "subtraction", grade: 1, prompt: "9 - 5 = ?" };
    screen.refresh(baseSnapshot({ phase: "await_answer", problem: typedProblem }), "", DEFAULT_LIFELINES);
    const btnLabels = buttons(screen.root).map((b) => b.label);
    expect(btnLabels).toContain("0");
    expect(btnLabels).not.toContain(">");
  });

  it("typed mode: digit/backspace/enter buttons call appendDigit/backspace/submit", () => {
    const { screen, calls } = makeScreen();
    const problem: ProblemView = { kind: "typed", topic: "addition", grade: 1, prompt: "3 + 4 = ?" };
    screen.refresh(baseSnapshot({ phase: "await_answer", problem }), "3", DEFAULT_LIFELINES);
    byLabel(screen.root, "7").onActivate?.();
    byLabel(screen.root, STRINGS.backspace).onActivate?.();
    byLabel(screen.root, STRINGS.submit).onActivate?.();
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
      DEFAULT_LIFELINES,
    );
    const text = labels(screen.root).map((l) => l.text);
    expect(text).toContain("7 + 8: 7 + 3 = 10, apoi + 5 = 15");
    expect(text).toContain(STRINGS.playerResultCue({ kind: "fizzle", action: "attack" }));
    expect(() => byLabel(screen.root, STRINGS.continueLabel)).not.toThrow();
    // No action menu, no problem panel while in "teach".
    expect(buttons(screen.root).map((b) => b.label)).not.toContain(STRINGS.actionLabel.attack);
  });

  it("clicking Continue calls acknowledgeTeach", () => {
    const { screen, calls } = makeScreen();
    screen.refresh(
      baseSnapshot({ phase: "teach", teach: "x", lastPlayer: { kind: "fizzle", action: "heal" } }),
      "",
      DEFAULT_LIFELINES,
    );
    byLabel(screen.root, STRINGS.continueLabel).onActivate?.();
    expect(calls.acknowledgeTeach).toBe(1);
  });
});

describe("createCombatScreen — grade readout (M3: read-only, no selector)", () => {
  it("shows the fight's fixed grade as text, with no grade BUTTONS anywhere", () => {
    const { screen } = makeScreen();
    screen.refresh(baseSnapshot({ grade: 1 }), "", DEFAULT_LIFELINES);
    expect(labels(screen.root).map((l) => l.text)).toContain(STRINGS.gradeReadout(1));
    expect(buttons(screen.root).map((b) => b.label)).not.toContain("I");

    screen.refresh(baseSnapshot({ grade: 3 }), "", DEFAULT_LIFELINES);
    expect(labels(screen.root).map((l) => l.text)).toContain(STRINGS.gradeReadout(3));
  });
});

// =================================================================================================
// M5 folklore theming (slice 1 of 3) — hero name + enemy epithet line
// =================================================================================================

describe("createCombatScreen — M5 folklore theming", () => {
  it("shows STRINGS.heroName ('Făt-Frumos'), never the old hardcoded 'Warrior' literal", () => {
    const { screen } = makeScreen();
    screen.refresh(baseSnapshot(), "", DEFAULT_LIFELINES);
    const text = labels(screen.root).map((l) => l.text);
    expect(text).toContain(STRINGS.heroName);
    expect(text).not.toContain("Warrior");
  });

  it("renders the enemy's epithet (snapshot.enemy.title) as its own label, rebound on refresh", () => {
    const { screen } = makeScreen();
    screen.refresh(baseSnapshot({ enemy: { hp: 24, maxHp: 24, block: 0, name: "Zmeu pui", title: "puiul balaurului", intent: 6 } }), "", DEFAULT_LIFELINES);
    expect(labels(screen.root).map((l) => l.text)).toContain("puiul balaurului");

    screen.refresh(baseSnapshot({ enemy: { hp: 26, maxHp: 26, block: 0, name: "Balaur", title: "balaurul cu multe capete", intent: 6 } }), "", DEFAULT_LIFELINES);
    const text = labels(screen.root).map((l) => l.text);
    expect(text).toContain("balaurul cu multe capete");
    expect(text).not.toContain("puiul balaurului");
  });
});

describe("createCombatScreen — refresh() change reporting", () => {
  it("reports true on the first refresh, false when nothing changed, true again on a real change", () => {
    const { screen } = makeScreen();
    expect(screen.refresh(baseSnapshot(), "", DEFAULT_LIFELINES)).toBe(true);
    expect(screen.refresh(baseSnapshot(), "", DEFAULT_LIFELINES)).toBe(false);
    expect(screen.refresh(baseSnapshot({ turn: 2 }), "", DEFAULT_LIFELINES)).toBe(true);
  });
});

// =================================================================================================
// M4b — lifeline bar / hint line / 50-50 rendering
// =================================================================================================

const typedProblemView: ProblemView = { kind: "typed", topic: "addition", grade: 1, prompt: "3 + 4 = ?" };
const choiceProblemView: ProblemView = {
  kind: "choice",
  topic: "comparison",
  grade: 1,
  prompt: "Compară: 5 și 9",
  choices: [">", "=", "<"],
  disabledChoices: [],
};

describe("createCombatScreen — M4b lifeline bar", () => {
  it("shows 3 lifeline buttons labelled with STRINGS.lifelineLabel, only in await_answer", () => {
    const { screen } = makeScreen();
    screen.refresh(baseSnapshot({ phase: "await_answer", problem: typedProblemView }), "", DEFAULT_LIFELINES);
    const btnLabels = buttons(screen.root).map((b) => b.label);
    expect(btnLabels).toContain(STRINGS.lifelineLabel("hint", 1));
    expect(btnLabels).toContain(STRINGS.lifelineLabel("fifty", 1));
    expect(btnLabels).toContain(STRINGS.lifelineLabel("skip", 1));

    screen.refresh(baseSnapshot({ phase: "await_action" }), "", DEFAULT_LIFELINES);
    expect(buttons(screen.root).map((b) => b.label)).not.toContain(STRINGS.lifelineLabel("hint", 1));
  });

  it("reflects the CURRENT charge count in each button's label", () => {
    const { screen } = makeScreen();
    const lifelines = { hint: 2, fifty: 0, skip: 1 };
    screen.refresh(baseSnapshot({ phase: "await_answer", problem: typedProblemView }), "", lifelines);
    const btnLabels = buttons(screen.root).map((b) => b.label);
    expect(btnLabels).toContain(STRINGS.lifelineLabel("hint", 2));
    expect(btnLabels).toContain(STRINGS.lifelineLabel("fifty", 0));
    expect(btnLabels).toContain(STRINGS.lifelineLabel("skip", 1));
  });

  it("clicking a lifeline button calls useLifeline(kind)", () => {
    const { screen, calls } = makeScreen();
    screen.refresh(baseSnapshot({ phase: "await_answer", problem: typedProblemView }), "", DEFAULT_LIFELINES);
    byLabel(screen.root, STRINGS.lifelineLabel("hint", 1)).onActivate?.();
    expect(calls.useLifeline).toEqual(["hint"]);
  });

  it("disables a lifeline button at 0 charges", () => {
    const { screen } = makeScreen();
    // A choice problem (not typed) so "fifty" isn't ALSO disabled by the typed-problem rule —
    // isolates the "0 charges" case from the "wrong input kind" case tested separately below.
    screen.refresh(
      baseSnapshot({ phase: "await_answer", problem: choiceProblemView }),
      "",
      { hint: 0, fifty: 1, skip: 1 },
    );
    expect(byLabel(screen.root, STRINGS.lifelineLabel("hint", 0)).state).toBe("disabled");
    expect(byLabel(screen.root, STRINGS.lifelineLabel("fifty", 1)).state).toBe("normal");
  });

  it("disables 'fifty' on a TYPED problem even with charges available", () => {
    const { screen } = makeScreen();
    screen.refresh(baseSnapshot({ phase: "await_answer", problem: typedProblemView }), "", DEFAULT_LIFELINES);
    expect(byLabel(screen.root, STRINGS.lifelineLabel("fifty", 1)).state).toBe("disabled");
  });

  it("enables 'fifty' on a CHOICE problem with charges available", () => {
    const { screen } = makeScreen();
    screen.refresh(baseSnapshot({ phase: "await_answer", problem: choiceProblemView }), "", DEFAULT_LIFELINES);
    expect(byLabel(screen.root, STRINGS.lifelineLabel("fifty", 1)).state).toBe("normal");
  });

  it("disables 'hint' once a hint was already used on the current problem (snapshot.hint !== null)", () => {
    const { screen } = makeScreen();
    screen.refresh(
      baseSnapshot({ phase: "await_answer", problem: typedProblemView, hint: "3+4: count on from 4" }),
      "",
      DEFAULT_LIFELINES,
    );
    expect(byLabel(screen.root, STRINGS.lifelineLabel("hint", 1)).state).toBe("disabled");
  });

  it("disables 'fifty' once already used on the current problem (disabledChoices non-empty)", () => {
    const { screen } = makeScreen();
    const problem: ProblemView = { ...choiceProblemView, disabledChoices: [1] };
    screen.refresh(baseSnapshot({ phase: "await_answer", problem }), "", DEFAULT_LIFELINES);
    expect(byLabel(screen.root, STRINGS.lifelineLabel("fifty", 1)).state).toBe("disabled");
  });

  it("all three lifeline buttons are disabled when NO_LIFELINES (a fresh depleted kit)", () => {
    const { screen } = makeScreen();
    screen.refresh(baseSnapshot({ phase: "await_answer", problem: typedProblemView }), "", NO_LIFELINES);
    expect(byLabel(screen.root, STRINGS.lifelineLabel("hint", 0)).state).toBe("disabled");
    expect(byLabel(screen.root, STRINGS.lifelineLabel("fifty", 0)).state).toBe("disabled");
    expect(byLabel(screen.root, STRINGS.lifelineLabel("skip", 0)).state).toBe("disabled");
  });
});

describe("createCombatScreen — M4b hint line", () => {
  it("shows the hint text (prefixed) when snapshot.hint is set, absent when null", () => {
    const { screen } = makeScreen();
    screen.refresh(
      baseSnapshot({ phase: "await_answer", problem: typedProblemView, hint: "3+4: count on from 4" }),
      "",
      DEFAULT_LIFELINES,
    );
    expect(labels(screen.root).map((l) => l.text)).toContain(`${STRINGS.hintPrefix} 3+4: count on from 4`);

    screen.refresh(baseSnapshot({ phase: "await_answer", problem: typedProblemView, hint: null }), "", DEFAULT_LIFELINES);
    expect(labels(screen.root).map((l) => l.text)).not.toContain(`${STRINGS.hintPrefix} 3+4: count on from 4`);
  });

  it("never shows a hint line outside await_answer (e.g. teach)", () => {
    const { screen } = makeScreen();
    screen.refresh(
      baseSnapshot({ phase: "teach", teach: "x", hint: null, lastPlayer: { kind: "fizzle", action: "attack" } }),
      "",
      DEFAULT_LIFELINES,
    );
    expect(labels(screen.root).map((l) => l.text).some((t) => t.startsWith(STRINGS.hintPrefix))).toBe(false);
  });
});

describe("createCombatScreen — M4b 50-50 choice rendering", () => {
  it("marks the disabled choice button's state='disabled', others stay 'normal'", () => {
    const { screen } = makeScreen();
    const problem: ProblemView = { ...choiceProblemView, disabledChoices: [1] };
    screen.refresh(baseSnapshot({ phase: "await_answer", problem }), "", DEFAULT_LIFELINES);
    expect(byLabel(screen.root, "=").state).toBe("disabled"); // index 1
    expect(byLabel(screen.root, ">").state).toBe("normal");
    expect(byLabel(screen.root, "<").state).toBe("normal");
  });

  it("no choice is disabled when disabledChoices is empty (the M4a baseline)", () => {
    const { screen } = makeScreen();
    screen.refresh(baseSnapshot({ phase: "await_answer", problem: choiceProblemView }), "", DEFAULT_LIFELINES);
    expect(byLabel(screen.root, ">").state).toBe("normal");
    expect(byLabel(screen.root, "=").state).toBe("normal");
    expect(byLabel(screen.root, "<").state).toBe("normal");
  });
});
