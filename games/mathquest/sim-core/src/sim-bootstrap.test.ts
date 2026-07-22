import { describe, it, expect } from "vitest";
import { bootstrapMathquestSim } from "./sim-bootstrap";
import { ATTACK_DAMAGE, ENEMY_MAX_HP, WARRIOR_MAX_HP } from "./combat/constants";
import type { AnswerResponse, CombatSnapshot, ProblemView } from "./combat/types";

/** Parse the two numbers embedded in ANY problem's prompt (works across all four M2 topics). */
function numbersIn(text: string): number[] {
  return (text.match(/-?\d+/g) ?? []).map(Number);
}

/** Independently compute the CORRECT `AnswerResponse` for a `ProblemView` — never trusts the
 * sim's internal `answer`/`answerIndex` (which never crosses the boundary anyway). */
function correctResponseFor(view: ProblemView): AnswerResponse {
  const [x, y] = numbersIn(view.prompt);
  if (view.kind === "typed") {
    const value =
      view.topic === "addition" ? x! + y! : view.topic === "subtraction" ? x! - y! : x! * y!; // multiplication
    return { kind: "typed", value };
  }
  const relation = x! < y! ? "<" : x! > y! ? ">" : "=";
  const index = view.choices.indexOf(relation);
  return { kind: "choice", index };
}

/** A deliberately WRONG response derived from the correct one (never accidentally matches it). */
function wrongResponse(correct: AnswerResponse): AnswerResponse {
  if (correct.kind === "typed") return { kind: "typed", value: correct.value + 1_000_000 };
  return { kind: "choice", index: (correct.index + 1) % 3 };
}

/** Drive `chooseAction` + `submitAnswer` with the CORRECT answer for the pending problem. */
function actCorrectly(sim: ReturnType<typeof bootstrapMathquestSim>, action: "attack" | "heal" | "shield"): void {
  sim.chooseAction(action);
  const snap = sim.getSnapshot();
  expect(snap.phase).toBe("await_answer");
  expect(snap.problem).not.toBeNull();
  sim.submitAnswer(correctResponseFor(snap.problem!));
}

/** Drive `chooseAction` + `submitAnswer` with a deliberately WRONG answer, landing in `"teach"`. */
function actWrong(sim: ReturnType<typeof bootstrapMathquestSim>, action: "attack" | "heal" | "shield"): void {
  sim.chooseAction(action);
  const snap = sim.getSnapshot();
  sim.submitAnswer(wrongResponse(correctResponseFor(snap.problem!)));
}

/** Find a fresh sim (some seed in `[1, limit]`) whose FIRST problem is of the given `kind`. */
function findFirstProblemOfKind(
  kind: "typed" | "choice",
  limit = 200,
): { sim: ReturnType<typeof bootstrapMathquestSim>; view: ProblemView } {
  for (let seed = 1; seed <= limit; seed++) {
    const sim = bootstrapMathquestSim({ seed });
    sim.chooseAction("attack");
    const view = sim.getSnapshot().problem;
    if (view !== null && view.kind === kind) return { sim, view };
  }
  throw new Error(`no ${kind} problem found in ${limit} seeds — generator regression?`);
}

describe("bootstrapMathquestSim — combat loop (M2: generators + teach + re-queue + cue split)", () => {
  it("starts in await_action, grade 1, full HP, a telegraphed enemy intent, no pending problem", () => {
    const sim = bootstrapMathquestSim({ seed: 1 });
    const snap = sim.getSnapshot();
    expect(snap.phase).toBe("await_action");
    expect(snap.grade).toBe(1);
    expect(snap.warrior).toEqual({ hp: WARRIOR_MAX_HP, maxHp: WARRIOR_MAX_HP, block: 0 });
    expect(snap.enemy.hp).toBe(ENEMY_MAX_HP);
    expect(snap.enemy.intent).toBeGreaterThanOrEqual(5);
    expect(snap.enemy.intent).toBeLessThanOrEqual(8);
    expect(snap.problem).toBeNull();
    expect(snap.teach).toBeNull();
    expect(snap.turn).toBe(1);
    expect(snap.lastPlayer).toEqual({ kind: "none" });
    expect(snap.lastEnemy).toEqual({ kind: "none" });
  });

  it("chooseAction moves to await_answer and exposes a well-formed ProblemView for grade 1's topics", () => {
    const sim = bootstrapMathquestSim({ seed: 2 });
    sim.chooseAction("attack");
    const snap = sim.getSnapshot();
    expect(snap.phase).toBe("await_answer");
    expect(snap.problem).not.toBeNull();
    expect(["addition", "subtraction", "comparison"]).toContain(snap.problem!.topic); // grade 1 excludes ×
    expect(snap.problem!.grade).toBe(1);
    if (snap.problem!.kind === "choice") expect(snap.problem!.choices.length).toBe(3);
  });

  it("chooseAction is ignored outside await_action", () => {
    const sim = bootstrapMathquestSim({ seed: 3 });
    sim.chooseAction("attack");
    expect(sim.getSnapshot().phase).toBe("await_answer");
    const before = sim.getSnapshot().problem;
    sim.chooseAction("heal"); // no-op — still await_answer, same pending problem
    expect(sim.getSnapshot().phase).toBe("await_answer");
    expect(sim.getSnapshot().problem).toEqual(before);
  });

  it("submitAnswer is ignored outside await_answer", () => {
    const sim = bootstrapMathquestSim({ seed: 4 });
    expect(sim.getSnapshot().phase).toBe("await_action");
    sim.submitAnswer({ kind: "typed", value: 42 }); // no pending problem — must be a no-op
    const snap = sim.getSnapshot();
    expect(snap.phase).toBe("await_action");
    expect(snap.warrior.hp).toBe(WARRIOR_MAX_HP);
    expect(snap.enemy.hp).toBe(ENEMY_MAX_HP);
  });

  it("acknowledgeTeach is ignored outside the teach phase", () => {
    const sim = bootstrapMathquestSim({ seed: 5 });
    expect(sim.getSnapshot().phase).toBe("await_action");
    sim.acknowledgeTeach();
    expect(sim.getSnapshot().phase).toBe("await_action");
    expect(sim.getSnapshot().warrior.hp).toBe(WARRIOR_MAX_HP);
  });

  it("(1) a correct attack reduces enemy HP by ATTACK_DAMAGE (8)", () => {
    const sim = bootstrapMathquestSim({ seed: 5 });
    actCorrectly(sim, "attack");
    expect(sim.getSnapshot().enemy.hp).toBe(ENEMY_MAX_HP - ATTACK_DAMAGE);
  });

  it("(2) a wrong answer fizzles → teach phase with non-null teach, NO enemy damage yet", () => {
    const sim = bootstrapMathquestSim({ seed: 6 });
    actWrong(sim, "attack");
    const snap = sim.getSnapshot();
    expect(snap.phase).toBe("teach");
    expect(snap.teach).not.toBeNull();
    expect(snap.teach!.length).toBeGreaterThan(0);
    expect(snap.lastPlayer.kind).toBe("fizzle");
    expect(snap.enemy.hp).toBe(ENEMY_MAX_HP); // fizzle — the attack never landed
    expect(snap.warrior.hp).toBe(WARRIOR_MAX_HP); // enemy turn deferred — no hit yet
    expect(snap.problem).toBeNull(); // the missed problem left await_answer, not shown mid-teach
  });

  it("acknowledgeTeach() then applies the deferred enemy hit and clears teach", () => {
    const sim = bootstrapMathquestSim({ seed: 6 });
    const intent = sim.getSnapshot().enemy.intent;
    actWrong(sim, "attack");
    expect(sim.getSnapshot().phase).toBe("teach");
    sim.acknowledgeTeach();
    const after = sim.getSnapshot();
    expect(after.teach).toBeNull();
    expect(after.warrior.hp).toBe(WARRIOR_MAX_HP - intent); // the hit lands only now
    expect(after.lastEnemy).toEqual({ kind: "enemy_hit", amount: intent, blocked: 0 });
    expect(after.phase).toBe("await_action");
  });

  it("(re-queue) the missed problem returns UNCHANGED on a later turn", () => {
    const sim = bootstrapMathquestSim({ seed: 42 });
    sim.chooseAction("attack");
    const missed = sim.getSnapshot().problem!;
    sim.submitAnswer(wrongResponse(correctResponseFor(missed)));
    expect(sim.getSnapshot().phase).toBe("teach");
    sim.acknowledgeTeach();
    expect(sim.getSnapshot().phase).toBe("await_action"); // WARRIOR_MAX_HP (30) survives one 5-8 hit easily

    sim.chooseAction("attack");
    const requeued = sim.getSnapshot().problem!;
    expect(requeued).toEqual(missed); // the SAME problem (topic/grade/prompt[/choices]), not a fresh draw
  });

  it("(re-queue) a re-queued problem answered RIGHT is not re-queued again", () => {
    const sim = bootstrapMathquestSim({ seed: 42 });
    sim.chooseAction("attack");
    const missed = sim.getSnapshot().problem!;
    sim.submitAnswer(wrongResponse(correctResponseFor(missed)));
    sim.acknowledgeTeach();

    sim.chooseAction("attack");
    const requeued = sim.getSnapshot().problem!;
    expect(requeued).toEqual(missed);
    sim.submitAnswer(correctResponseFor(requeued)); // answer it correctly this time
    expect(sim.getSnapshot().lastPlayer.kind).toBe("landed");

    // Next turn's problem must NOT be the same missed problem again (queue was drained).
    if (sim.getSnapshot().phase === "await_action") {
      sim.chooseAction("attack");
      expect(sim.getSnapshot().problem).not.toEqual(missed);
    }
  });

  it("setGrade(3) shows grade:3 in the snapshot, and the NEXT problem carries grade:3", () => {
    const sim = bootstrapMathquestSim({ seed: 7 });
    sim.setGrade(3);
    expect(sim.getSnapshot().grade).toBe(3);
    sim.chooseAction("attack");
    expect(sim.getSnapshot().problem!.grade).toBe(3);
  });

  it("(cue split) a correct non-killing heal shows lastPlayer=landed AND lastEnemy=enemy_hit in the SAME snapshot", () => {
    const sim = bootstrapMathquestSim({ seed: 8 });
    actCorrectly(sim, "heal"); // heal never risks ending the fight early
    const snap = sim.getSnapshot();
    expect(snap.lastPlayer.kind).toBe("landed");
    if (snap.lastPlayer.kind === "landed") expect(snap.lastPlayer.action).toBe("heal");
    expect(snap.lastEnemy.kind).toBe("enemy_hit"); // the M1 overwrite bug is gone — both survive together
  });

  it("chooseAction resets lastEnemy to none so a stale enemy line doesn't linger into the next problem", () => {
    const sim = bootstrapMathquestSim({ seed: 8 });
    actCorrectly(sim, "heal");
    expect(sim.getSnapshot().lastEnemy.kind).toBe("enemy_hit");
    sim.chooseAction("attack");
    expect(sim.getSnapshot().lastEnemy).toEqual({ kind: "none" });
  });

  it("a correct multiple-choice comparison lands (no teach card)", () => {
    const { sim, view } = findFirstProblemOfKind("choice");
    if (view.kind !== "choice") throw new Error("expected a choice problem");
    expect(view.choices.length).toBe(3);
    sim.submitAnswer(correctResponseFor(view));
    const snap = sim.getSnapshot();
    expect(snap.lastPlayer.kind).toBe("landed");
    expect(snap.teach).toBeNull();
    expect(snap.phase).not.toBe("teach");
  });

  it("a wrong multiple-choice comparison shows the teach card", () => {
    const { sim, view } = findFirstProblemOfKind("choice");
    sim.submitAnswer(wrongResponse(correctResponseFor(view)));
    const snap = sim.getSnapshot();
    expect(snap.phase).toBe("teach");
    expect(snap.teach).not.toBeNull();
    expect(snap.lastPlayer.kind).toBe("fizzle");
  });

  it("the typed path still works end to end (addition/subtraction)", () => {
    const { sim, view } = findFirstProblemOfKind("typed");
    sim.submitAnswer(correctResponseFor(view));
    expect(sim.getSnapshot().lastPlayer.kind).toBe("landed");
  });

  it("(4a) enemy HP -> 0 ends the fight as won (no further enemy turn)", () => {
    const sim = bootstrapMathquestSim({ seed: 9 });
    // ENEMY_MAX_HP (24) / ATTACK_DAMAGE (8) = exactly 3 correct attacks.
    actCorrectly(sim, "attack");
    actCorrectly(sim, "attack");
    expect(sim.getSnapshot().phase).toBe("await_action"); // still going after 2 hits (24-16=8 left)
    actCorrectly(sim, "attack");
    const snap = sim.getSnapshot();
    expect(snap.phase).toBe("won");
    expect(snap.enemy.hp).toBe(0);
    expect(snap.lastPlayer).toEqual({ kind: "landed", action: "attack", amount: ATTACK_DAMAGE });
  });

  it("(4b) warrior HP -> 0 (via the teach-gated enemy turn) ends the fight as lost", () => {
    const sim = bootstrapMathquestSim({ seed: 10 });
    let snap: CombatSnapshot = sim.getSnapshot();
    let guard = 0;
    while (snap.phase !== "lost" && guard < 40) {
      if (snap.phase === "await_action") actWrong(sim, "attack");
      else if (snap.phase === "teach") sim.acknowledgeTeach();
      snap = sim.getSnapshot();
      guard += 1;
    }
    expect(snap.phase).toBe("lost");
    expect(snap.warrior.hp).toBe(0);
    expect(guard).toBeLessThan(40);
  });

  it("chooseAction/submitAnswer/acknowledgeTeach are no-ops once the fight is over", () => {
    const sim = bootstrapMathquestSim({ seed: 9 });
    actCorrectly(sim, "attack");
    actCorrectly(sim, "attack");
    actCorrectly(sim, "attack");
    expect(sim.getSnapshot().phase).toBe("won");
    sim.chooseAction("heal");
    expect(sim.getSnapshot().phase).toBe("won");
    sim.acknowledgeTeach();
    expect(sim.getSnapshot().phase).toBe("won");
  });

  it("(5) determinism: same seed + same scripted command sequence -> identical snapshot sequence", () => {
    const seed = 12345;
    const script: Array<{ action: "attack" | "heal" | "shield"; correct: boolean }> = [
      { action: "attack", correct: true },
      { action: "shield", correct: true },
      { action: "heal", correct: false },
      { action: "attack", correct: true },
      { action: "attack", correct: false },
      { action: "heal", correct: true },
      { action: "attack", correct: true },
    ];

    function run(): CombatSnapshot[] {
      const sim = bootstrapMathquestSim({ seed });
      const snapshots: CombatSnapshot[] = [sim.getSnapshot()];
      for (const step of script) {
        if (sim.getSnapshot().phase !== "await_action") break;
        sim.chooseAction(step.action);
        snapshots.push(sim.getSnapshot());
        const view = sim.getSnapshot().problem!;
        const correct = correctResponseFor(view);
        sim.submitAnswer(step.correct ? correct : wrongResponse(correct));
        snapshots.push(sim.getSnapshot());
        if (sim.getSnapshot().phase === "teach") {
          sim.acknowledgeTeach();
          snapshots.push(sim.getSnapshot());
        }
      }
      return snapshots;
    }

    const a = run();
    const b = run();
    expect(a.length).toBeGreaterThan(1);
    expect(a).toEqual(b);
  });

  it("determinism holds across setGrade + re-queue too (fuller script)", () => {
    const seed = 555;
    function run(): CombatSnapshot[] {
      const sim = bootstrapMathquestSim({ seed });
      const snapshots: CombatSnapshot[] = [sim.getSnapshot()];
      sim.setGrade(3);
      const actions: Array<"attack" | "heal" | "shield"> = ["attack", "heal", "attack", "shield", "attack"];
      const wrongFlags = [true, false, true, false, true];
      for (let i = 0; i < actions.length; i++) {
        if (sim.getSnapshot().phase !== "await_action") break;
        sim.chooseAction(actions[i]!);
        const view = sim.getSnapshot().problem!;
        const correct = correctResponseFor(view);
        sim.submitAnswer(wrongFlags[i] ? wrongResponse(correct) : correct);
        snapshots.push(sim.getSnapshot());
        if (sim.getSnapshot().phase === "teach") {
          sim.acknowledgeTeach();
          snapshots.push(sim.getSnapshot());
        }
      }
      return snapshots;
    }
    expect(run()).toEqual(run());
  });

  it("world and scheduler are freshly constructed per bootstrap call (no shared state leaks)", () => {
    const a = bootstrapMathquestSim({ seed: 1 });
    const b = bootstrapMathquestSim({ seed: 1 });
    expect(a.world).not.toBe(b.world);
    expect(a.scheduler).not.toBe(b.scheduler);
  });

  it("step() never mutates combat state (event-driven only)", () => {
    const sim = bootstrapMathquestSim({ seed: 11 });
    const before = sim.getSnapshot();
    for (let i = 0; i < 50; i++) sim.step();
    expect(sim.getSnapshot()).toEqual(before);
  });

  it("NEVER exposes answer/answerIndex on the projected snapshot, for both typed and choice problems", () => {
    let sawTyped = false;
    let sawChoice = false;
    for (let seed = 1; seed <= 60 && !(sawTyped && sawChoice); seed++) {
      const sim = bootstrapMathquestSim({ seed });
      sim.chooseAction("attack");
      const snap = sim.getSnapshot();
      const json = JSON.stringify(snap);
      expect(json).not.toContain('"answer"');
      expect(json).not.toContain('"answerIndex"');
      expect(Object.prototype.hasOwnProperty.call(snap.problem, "answer")).toBe(false);
      expect(Object.prototype.hasOwnProperty.call(snap.problem, "answerIndex")).toBe(false);
      if (snap.problem?.kind === "typed") sawTyped = true;
      if (snap.problem?.kind === "choice") sawChoice = true;

      // Also check the teach-phase snapshot (wrong answer) for the same leak.
      const wrong = sim.getSnapshot().problem!;
      sim.submitAnswer(wrongResponse(correctResponseFor(wrong)));
      const teachSnap = sim.getSnapshot();
      const teachJson = JSON.stringify(teachSnap);
      expect(teachJson).not.toContain('"answer"');
      expect(teachJson).not.toContain('"answerIndex"');
    }
    expect(sawTyped).toBe(true);
    expect(sawChoice).toBe(true);
  });
});
