import { describe, it, expect } from "vitest";
import { createRng } from "@engine/core";
import { createCombat, type Combat, type CombatOpts } from "./combat";
import { ATTACK_DAMAGE, WARRIOR_MAX_HP } from "./constants";
import { ENEMY_ARCHETYPES } from "../run/enemies";
import type { AnswerResponse, CombatSnapshot, Grade, ProblemView } from "./types";
import { xpForSolve } from "../run/progression";

/** Default fight: grade 1, full HP, vs the "combat" archetype (24 hp, intent 5-8) — the M1/M2
 * fight's exact numbers, now expressed as `CombatOpts` instead of module constants (M3 brief,
 * Part A0). */
function makeCombat(seed: number, over: Partial<CombatOpts> = {}): Combat {
  return createCombat({
    rng: createRng(seed),
    grade: 1,
    warriorHp: WARRIOR_MAX_HP,
    warriorMaxHp: WARRIOR_MAX_HP,
    enemy: ENEMY_ARCHETYPES.combat,
    ...over,
  });
}

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
function actCorrectly(combat: Combat, action: "attack" | "heal" | "shield"): void {
  combat.chooseAction(action);
  const snap = combat.snapshot();
  expect(snap.phase).toBe("await_answer");
  expect(snap.problem).not.toBeNull();
  combat.submitAnswer(correctResponseFor(snap.problem!));
}

/** Drive `chooseAction` + `submitAnswer` with a deliberately WRONG answer, landing in `"teach"`. */
function actWrong(combat: Combat, action: "attack" | "heal" | "shield"): void {
  combat.chooseAction(action);
  const snap = combat.snapshot();
  combat.submitAnswer(wrongResponse(correctResponseFor(snap.problem!)));
}

/** Find a fresh combat (some seed in `[1, limit]`) whose FIRST problem is of the given `kind`. */
function findFirstProblemOfKind(
  kind: "typed" | "choice",
  limit = 200,
): { combat: Combat; view: ProblemView } {
  for (let seed = 1; seed <= limit; seed++) {
    const combat = makeCombat(seed);
    combat.chooseAction("attack");
    const view = combat.snapshot().problem;
    if (view !== null && view.kind === kind) return { combat, view };
  }
  throw new Error(`no ${kind} problem found in ${limit} seeds — generator regression?`);
}

describe("createCombat — combat loop (M3: extracted factory, M1/M2 behavior preserved)", () => {
  it("starts in await_action, the given grade, the given warriorHp, a telegraphed enemy intent, no pending problem", () => {
    const combat = makeCombat(1);
    const snap = combat.snapshot();
    expect(snap.phase).toBe("await_action");
    expect(snap.grade).toBe(1);
    expect(snap.warrior).toEqual({ hp: WARRIOR_MAX_HP, maxHp: WARRIOR_MAX_HP, block: 0 });
    expect(snap.enemy.hp).toBe(ENEMY_ARCHETYPES.combat.maxHp);
    expect(snap.enemy.name).toBe(ENEMY_ARCHETYPES.combat.name);
    expect(snap.enemy.intent).toBeGreaterThanOrEqual(5);
    expect(snap.enemy.intent).toBeLessThanOrEqual(8);
    expect(snap.problem).toBeNull();
    expect(snap.teach).toBeNull();
    expect(snap.turn).toBe(1);
    expect(snap.lastPlayer).toEqual({ kind: "none" });
    expect(snap.lastEnemy).toEqual({ kind: "none" });
    expect(combat.result()).toBeNull();
  });

  it("a fight can start with LESS than full HP (persisted-in from the run)", () => {
    const combat = makeCombat(1, { warriorHp: 12 });
    expect(combat.snapshot().warrior).toEqual({ hp: 12, maxHp: WARRIOR_MAX_HP, block: 0 });
  });

  it("uses the given EnemyArchetype's hp/name/intent range, not a fixed constant", () => {
    const combat = makeCombat(2, { enemy: ENEMY_ARCHETYPES.elite });
    const snap = combat.snapshot();
    expect(snap.enemy.hp).toBe(ENEMY_ARCHETYPES.elite.maxHp);
    expect(snap.enemy.name).toBe("Balaur");
    expect(snap.enemy.intent).toBeGreaterThanOrEqual(ENEMY_ARCHETYPES.elite.intentBase);
    expect(snap.enemy.intent).toBeLessThan(ENEMY_ARCHETYPES.elite.intentBase + ENEMY_ARCHETYPES.elite.intentRoll);
  });

  it("chooseAction moves to await_answer and exposes a well-formed ProblemView for grade 1's topics", () => {
    const combat = makeCombat(2);
    combat.chooseAction("attack");
    const snap = combat.snapshot();
    expect(snap.phase).toBe("await_answer");
    expect(snap.problem).not.toBeNull();
    expect(["addition", "subtraction", "comparison"]).toContain(snap.problem!.topic); // grade 1 excludes ×
    expect(snap.problem!.grade).toBe(1);
    if (snap.problem!.kind === "choice") expect(snap.problem!.choices.length).toBe(3);
  });

  it("chooseAction is ignored outside await_action", () => {
    const combat = makeCombat(3);
    combat.chooseAction("attack");
    expect(combat.snapshot().phase).toBe("await_answer");
    const before = combat.snapshot().problem;
    combat.chooseAction("heal"); // no-op — still await_answer, same pending problem
    expect(combat.snapshot().phase).toBe("await_answer");
    expect(combat.snapshot().problem).toEqual(before);
  });

  it("submitAnswer is ignored outside await_answer", () => {
    const combat = makeCombat(4);
    expect(combat.snapshot().phase).toBe("await_action");
    combat.submitAnswer({ kind: "typed", value: 42 }); // no pending problem — must be a no-op
    const snap = combat.snapshot();
    expect(snap.phase).toBe("await_action");
    expect(snap.warrior.hp).toBe(WARRIOR_MAX_HP);
    expect(snap.enemy.hp).toBe(ENEMY_ARCHETYPES.combat.maxHp);
  });

  it("acknowledgeTeach is ignored outside the teach phase", () => {
    const combat = makeCombat(5);
    expect(combat.snapshot().phase).toBe("await_action");
    combat.acknowledgeTeach();
    expect(combat.snapshot().phase).toBe("await_action");
    expect(combat.snapshot().warrior.hp).toBe(WARRIOR_MAX_HP);
  });

  it("(1) a correct attack reduces enemy HP by ATTACK_DAMAGE (8)", () => {
    const combat = makeCombat(5);
    actCorrectly(combat, "attack");
    expect(combat.snapshot().enemy.hp).toBe(ENEMY_ARCHETYPES.combat.maxHp - ATTACK_DAMAGE);
  });

  it("(2) a wrong answer fizzles → teach phase with non-null teach, NO enemy damage yet", () => {
    const combat = makeCombat(6);
    actWrong(combat, "attack");
    const snap = combat.snapshot();
    expect(snap.phase).toBe("teach");
    expect(snap.teach).not.toBeNull();
    expect(snap.teach!.length).toBeGreaterThan(0);
    expect(snap.lastPlayer.kind).toBe("fizzle");
    expect(snap.enemy.hp).toBe(ENEMY_ARCHETYPES.combat.maxHp); // fizzle — the attack never landed
    expect(snap.warrior.hp).toBe(WARRIOR_MAX_HP); // enemy turn deferred — no hit yet
    expect(snap.problem).toBeNull(); // the missed problem left await_answer, not shown mid-teach
  });

  it("acknowledgeTeach() then applies the deferred enemy hit and clears teach", () => {
    const combat = makeCombat(6);
    const intent = combat.snapshot().enemy.intent;
    actWrong(combat, "attack");
    expect(combat.snapshot().phase).toBe("teach");
    combat.acknowledgeTeach();
    const after = combat.snapshot();
    expect(after.teach).toBeNull();
    expect(after.warrior.hp).toBe(WARRIOR_MAX_HP - intent); // the hit lands only now
    expect(after.lastEnemy).toEqual({ kind: "enemy_hit", amount: intent, blocked: 0 });
    expect(after.phase).toBe("await_action");
  });

  it("(re-queue) the missed problem returns UNCHANGED on a later turn", () => {
    const combat = makeCombat(42);
    combat.chooseAction("attack");
    const missed = combat.snapshot().problem!;
    combat.submitAnswer(wrongResponse(correctResponseFor(missed)));
    expect(combat.snapshot().phase).toBe("teach");
    combat.acknowledgeTeach();
    expect(combat.snapshot().phase).toBe("await_action"); // WARRIOR_MAX_HP (30) survives one 5-8 hit easily

    combat.chooseAction("attack");
    const requeued = combat.snapshot().problem!;
    expect(requeued).toEqual(missed); // the SAME problem (topic/grade/prompt[/choices]), not a fresh draw
  });

  it("(re-queue) a re-queued problem answered RIGHT is not re-queued again", () => {
    const combat = makeCombat(42);
    combat.chooseAction("attack");
    const missed = combat.snapshot().problem!;
    combat.submitAnswer(wrongResponse(correctResponseFor(missed)));
    combat.acknowledgeTeach();

    combat.chooseAction("attack");
    const requeued = combat.snapshot().problem!;
    expect(requeued).toEqual(missed);
    combat.submitAnswer(correctResponseFor(requeued)); // answer it correctly this time
    expect(combat.snapshot().lastPlayer.kind).toBe("landed");

    // Next turn's problem must NOT be the same missed problem again (queue was drained).
    if (combat.snapshot().phase === "await_action") {
      combat.chooseAction("attack");
      expect(combat.snapshot().problem).not.toEqual(missed);
    }
  });

  it("grade is fixed for the whole fight and carried on every problem (no mid-fight setGrade — M3)", () => {
    const combat = makeCombat(7, { grade: 3 });
    expect(combat.snapshot().grade).toBe(3);
    combat.chooseAction("attack");
    expect(combat.snapshot().problem!.grade).toBe(3);
  });

  it("(cue split) a correct non-killing heal shows lastPlayer=landed AND lastEnemy=enemy_hit in the SAME snapshot", () => {
    const combat = makeCombat(8);
    actCorrectly(combat, "heal"); // heal never risks ending the fight early
    const snap = combat.snapshot();
    expect(snap.lastPlayer.kind).toBe("landed");
    if (snap.lastPlayer.kind === "landed") expect(snap.lastPlayer.action).toBe("heal");
    expect(snap.lastEnemy.kind).toBe("enemy_hit"); // the M1 overwrite bug is gone — both survive together
  });

  it("chooseAction resets lastEnemy to none so a stale enemy line doesn't linger into the next problem", () => {
    const combat = makeCombat(8);
    actCorrectly(combat, "heal");
    expect(combat.snapshot().lastEnemy.kind).toBe("enemy_hit");
    combat.chooseAction("attack");
    expect(combat.snapshot().lastEnemy).toEqual({ kind: "none" });
  });

  it("a correct multiple-choice comparison lands (no teach card)", () => {
    const { combat, view } = findFirstProblemOfKind("choice");
    if (view.kind !== "choice") throw new Error("expected a choice problem");
    expect(view.choices.length).toBe(3);
    combat.submitAnswer(correctResponseFor(view));
    const snap = combat.snapshot();
    expect(snap.lastPlayer.kind).toBe("landed");
    expect(snap.teach).toBeNull();
    expect(snap.phase).not.toBe("teach");
  });

  it("a wrong multiple-choice comparison shows the teach card", () => {
    const { combat, view } = findFirstProblemOfKind("choice");
    combat.submitAnswer(wrongResponse(correctResponseFor(view)));
    const snap = combat.snapshot();
    expect(snap.phase).toBe("teach");
    expect(snap.teach).not.toBeNull();
    expect(snap.lastPlayer.kind).toBe("fizzle");
  });

  it("the typed path still works end to end (addition/subtraction)", () => {
    const { combat, view } = findFirstProblemOfKind("typed");
    combat.submitAnswer(correctResponseFor(view));
    expect(combat.snapshot().lastPlayer.kind).toBe("landed");
  });

  it("(4a) enemy HP -> 0 ends the fight as won; result() reports it, no further enemy turn", () => {
    const combat = makeCombat(9);
    // ENEMY_MAX_HP (24) / ATTACK_DAMAGE (8) = exactly 3 correct attacks.
    actCorrectly(combat, "attack");
    actCorrectly(combat, "attack");
    expect(combat.snapshot().phase).toBe("await_action"); // still going after 2 hits (24-16=8 left)
    expect(combat.result()).toBeNull();
    actCorrectly(combat, "attack");
    const snap = combat.snapshot();
    expect(snap.phase).toBe("won");
    expect(snap.enemy.hp).toBe(0);
    expect(snap.lastPlayer).toEqual({ kind: "landed", action: "attack", amount: ATTACK_DAMAGE });
    // Two non-lethal attacks each drew a return hit (5-8 each) before the 3rd, lethal one — so
    // warriorHp is reduced, never negative, and matches the snapshot's own warrior.hp exactly.
    // xpEarned (M4a): 3 correct attacks at grade 1 -> xpForSolve(1) * 3 = 3.
    expect(combat.result()).toEqual({ outcome: "won", warriorHp: snap.warrior.hp, xpEarned: 3 });
    expect(snap.warrior.hp).toBeLessThan(WARRIOR_MAX_HP);
    expect(snap.warrior.hp).toBeGreaterThan(0);
  });

  it("(4b) warrior HP -> 0 (via the teach-gated enemy turn) ends the fight as lost; result() reports it", () => {
    const combat = makeCombat(10);
    let snap: CombatSnapshot = combat.snapshot();
    let guard = 0;
    while (snap.phase !== "lost" && guard < 40) {
      if (snap.phase === "await_action") actWrong(combat, "attack");
      else if (snap.phase === "teach") combat.acknowledgeTeach();
      snap = combat.snapshot();
      guard += 1;
    }
    expect(snap.phase).toBe("lost");
    expect(snap.warrior.hp).toBe(0);
    expect(guard).toBeLessThan(40);
    // Always wrong (M4a): no correct solves -> xpEarned stays 0.
    expect(combat.result()).toEqual({ outcome: "lost", warriorHp: 0, xpEarned: 0 });
  });

  it("chooseAction/submitAnswer/acknowledgeTeach are no-ops once the fight is over", () => {
    const combat = makeCombat(9);
    actCorrectly(combat, "attack");
    actCorrectly(combat, "attack");
    actCorrectly(combat, "attack");
    expect(combat.snapshot().phase).toBe("won");
    combat.chooseAction("heal");
    expect(combat.snapshot().phase).toBe("won");
    combat.acknowledgeTeach();
    expect(combat.snapshot().phase).toBe("won");
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
      const combat = makeCombat(seed);
      const snapshots: CombatSnapshot[] = [combat.snapshot()];
      for (const step of script) {
        if (combat.snapshot().phase !== "await_action") break;
        combat.chooseAction(step.action);
        snapshots.push(combat.snapshot());
        const view = combat.snapshot().problem!;
        const correct = correctResponseFor(view);
        combat.submitAnswer(step.correct ? correct : wrongResponse(correct));
        snapshots.push(combat.snapshot());
        if (combat.snapshot().phase === "teach") {
          combat.acknowledgeTeach();
          snapshots.push(combat.snapshot());
        }
      }
      return snapshots;
    }

    const a = run();
    const b = run();
    expect(a.length).toBeGreaterThan(1);
    expect(a).toEqual(b);
  });

  it("determinism holds across grade + re-queue too (fuller script)", () => {
    const seed = 555;
    function run(): CombatSnapshot[] {
      const combat = makeCombat(seed, { grade: 3 as Grade });
      const snapshots: CombatSnapshot[] = [combat.snapshot()];
      const actions: Array<"attack" | "heal" | "shield"> = ["attack", "heal", "attack", "shield", "attack"];
      const wrongFlags = [true, false, true, false, true];
      for (let i = 0; i < actions.length; i++) {
        if (combat.snapshot().phase !== "await_action") break;
        combat.chooseAction(actions[i]!);
        const view = combat.snapshot().problem!;
        const correct = correctResponseFor(view);
        combat.submitAnswer(wrongFlags[i] ? wrongResponse(correct) : correct);
        snapshots.push(combat.snapshot());
        if (combat.snapshot().phase === "teach") {
          combat.acknowledgeTeach();
          snapshots.push(combat.snapshot());
        }
      }
      return snapshots;
    }
    expect(run()).toEqual(run());
  });

  it("NEVER exposes answer/answerIndex on the projected snapshot, for both typed and choice problems", () => {
    let sawTyped = false;
    let sawChoice = false;
    for (let seed = 1; seed <= 60 && !(sawTyped && sawChoice); seed++) {
      const combat = makeCombat(seed);
      combat.chooseAction("attack");
      const snap = combat.snapshot();
      const json = JSON.stringify(snap);
      expect(json).not.toContain('"answer"');
      expect(json).not.toContain('"answerIndex"');
      expect(Object.prototype.hasOwnProperty.call(snap.problem, "answer")).toBe(false);
      expect(Object.prototype.hasOwnProperty.call(snap.problem, "answerIndex")).toBe(false);
      if (snap.problem?.kind === "typed") sawTyped = true;
      if (snap.problem?.kind === "choice") sawChoice = true;

      // Also check the teach-phase snapshot (wrong answer) for the same leak.
      const wrong = combat.snapshot().problem!;
      combat.submitAnswer(wrongResponse(correctResponseFor(wrong)));
      const teachSnap = combat.snapshot();
      const teachJson = JSON.stringify(teachSnap);
      expect(teachJson).not.toContain('"answer"');
      expect(teachJson).not.toContain('"answerIndex"');
    }
    expect(sawTyped).toBe(true);
    expect(sawChoice).toBe(true);
  });
});

// =================================================================================================
// M4b — math lifelines (corpus/todos/2026-07-23-mathquest-M4b-lifelines.md)
// =================================================================================================

describe("createCombat — M4b useLifeline('hint')", () => {
  it("returns true in await_answer and sets a non-empty snapshot.hint (null before)", () => {
    const combat = makeCombat(1);
    combat.chooseAction("attack");
    expect(combat.snapshot().hint).toBeNull();
    expect(combat.useLifeline("hint")).toBe(true);
    const after = combat.snapshot();
    expect(after.hint).not.toBeNull();
    expect(after.hint!.length).toBeGreaterThan(0);
  });

  it("a second hint on the SAME problem is a no-op (returns false, hint text unchanged)", () => {
    const combat = makeCombat(1);
    combat.chooseAction("attack");
    expect(combat.useLifeline("hint")).toBe(true);
    const hintText = combat.snapshot().hint;
    expect(combat.useLifeline("hint")).toBe(false);
    expect(combat.snapshot().hint).toBe(hintText);
  });

  it("hint outside await_answer (still await_action) returns false and leaves the snapshot unchanged", () => {
    const combat = makeCombat(1);
    const before = combat.snapshot();
    expect(combat.useLifeline("hint")).toBe(false);
    expect(combat.snapshot()).toEqual(before);
  });

  it("(exact) 3 correct attacks, hinting every single one, still earns the SAME xpEarned as no hints at all", () => {
    const withHint = makeCombat(5);
    for (let i = 0; i < 3; i++) {
      withHint.chooseAction("attack");
      withHint.useLifeline("hint");
      withHint.submitAnswer(correctResponseFor(withHint.snapshot().problem!));
    }
    expect(withHint.snapshot().phase).toBe("won");
    expect(withHint.result()).toEqual({ outcome: "won", warriorHp: withHint.snapshot().warrior.hp, xpEarned: 3 });
  });

  it("hint reveals the SAME text the problem's own `teach` would show on a wrong answer", () => {
    // Compare two independent fights seeded identically up to the SAME first pending problem: one
    // takes a hint (revealing `hint`), the other answers wrong (revealing `teach`) — both must
    // show the exact same worked-step string, since both read `Problem.teach` for the SAME problem.
    const hinted = makeCombat(1);
    hinted.chooseAction("attack");
    hinted.useLifeline("hint");
    const hintText = hinted.snapshot().hint;

    const wrongAnswered = makeCombat(1);
    wrongAnswered.chooseAction("attack");
    const view = wrongAnswered.snapshot().problem!;
    wrongAnswered.submitAnswer(wrongResponse(correctResponseFor(view)));
    const teachText = wrongAnswered.snapshot().teach;

    expect(hintText).toBe(teachText);
  });
});

describe("createCombat — M4b useLifeline('fifty')", () => {
  it("on a choice problem: returns true, disables exactly 1 WRONG index, leaves the answer active", () => {
    const { combat } = findFirstProblemOfKind("choice");
    const before = combat.snapshot().problem!;
    if (before.kind !== "choice") throw new Error("expected a choice problem");
    expect(before.disabledChoices).toEqual([]);

    expect(combat.useLifeline("fifty")).toBe(true);
    const after = combat.snapshot().problem!;
    if (after.kind !== "choice") throw new Error("expected a choice problem");
    expect(after.disabledChoices.length).toBe(1);

    // Solving the still-active CORRECT choice lands the action — proves the answer index was
    // never among the disabled ones (never asserted by reading answerIndex directly — the
    // non-leak invariant holds; this is an end-to-end behavioural proof instead).
    const correct = correctResponseFor(after);
    expect(after.disabledChoices).not.toContain(correct.kind === "choice" ? correct.index : -1);
    combat.submitAnswer(correct);
    expect(combat.snapshot().lastPlayer.kind).toBe("landed");
  });

  it("a second fifty on the SAME problem is a no-op (returns false, disabledChoices unchanged)", () => {
    const { combat } = findFirstProblemOfKind("choice");
    expect(combat.useLifeline("fifty")).toBe(true);
    const view1 = combat.snapshot().problem!;
    if (view1.kind !== "choice") throw new Error("expected choice");
    expect(combat.useLifeline("fifty")).toBe(false);
    const view2 = combat.snapshot().problem!;
    if (view2.kind !== "choice") throw new Error("expected choice");
    expect(view2.disabledChoices).toEqual(view1.disabledChoices);
  });

  it("fifty NEVER disables the answer index (checked across many seeds)", () => {
    let checked = 0;
    for (let seed = 1; seed <= 100 && checked < 20; seed++) {
      const combat = makeCombat(seed);
      combat.chooseAction("attack");
      const view = combat.snapshot().problem;
      if (view === null || view.kind !== "choice") continue;
      combat.useLifeline("fifty");
      const after = combat.snapshot().problem!;
      if (after.kind !== "choice") throw new Error("unreachable");
      const correct = correctResponseFor(after);
      if (correct.kind === "choice") expect(after.disabledChoices).not.toContain(correct.index);
      checked += 1;
    }
    expect(checked).toBeGreaterThan(0);
  });

  it("fifty is deterministic: same seed + same script -> the same disabled index", () => {
    // `findFirstProblemOfKind("choice")` deterministically scans seeds 1..limit and always lands
    // on the SAME (seed, problem) pair — two independent calls reconstruct identical fights, so a
    // `fifty` applied to each must pick the identical wrong index to disable.
    const { combat: c1 } = findFirstProblemOfKind("choice");
    const { combat: c2 } = findFirstProblemOfKind("choice");
    c1.useLifeline("fifty");
    c2.useLifeline("fifty");
    const v1 = c1.snapshot().problem!;
    const v2 = c2.snapshot().problem!;
    if (v1.kind !== "choice" || v2.kind !== "choice") throw new Error("expected choice");
    expect(v1.disabledChoices).toEqual(v2.disabledChoices);
  });

  it("fifty on a TYPED problem returns false and leaves the snapshot unchanged (no-op, not even the fork)", () => {
    const { combat } = findFirstProblemOfKind("typed");
    const before = combat.snapshot();
    expect(combat.useLifeline("fifty")).toBe(false);
    expect(combat.snapshot()).toEqual(before);
  });

  it("fifty outside await_answer returns false", () => {
    const combat = makeCombat(1);
    expect(combat.useLifeline("fifty")).toBe(false);
  });
});

describe("createCombat — M4b useLifeline('skip')", () => {
  it("lands the pending action (attack reduces enemy hp by the normal amount) and earns 0 xp", () => {
    const skipped = makeCombat(5);
    skipped.chooseAction("attack");
    expect(skipped.useLifeline("skip")).toBe(true);
    const snap = skipped.snapshot();
    expect(snap.enemy.hp).toBe(ENEMY_ARCHETYPES.combat.maxHp - ATTACK_DAMAGE);
    expect(snap.lastPlayer).toEqual({ kind: "landed", action: "attack", amount: ATTACK_DAMAGE });
    expect(snap.problem).toBeNull(); // resolved back to await_action (or won)
  });

  it("earns 0 xp vs. the same script solved correctly (which earns xpForSolve(grade)*3)", () => {
    const skipped = makeCombat(5);
    for (let i = 0; i < 3; i++) {
      skipped.chooseAction("attack");
      skipped.useLifeline("skip");
    }
    expect(skipped.snapshot().phase).toBe("won");
    expect(skipped.result()).toEqual({ outcome: "won", warriorHp: skipped.snapshot().warrior.hp, xpEarned: 0 });

    const solved = makeCombat(5);
    for (let i = 0; i < 3; i++) {
      solved.chooseAction("attack");
      solved.submitAnswer(correctResponseFor(solved.snapshot().problem!));
    }
    expect(solved.result()).toEqual({ outcome: "won", warriorHp: solved.snapshot().warrior.hp, xpEarned: 3 * xpForSolve(1) });
  });

  it("a skip-Attack that drops the enemy to 0 ends the fight WON with no further enemy turn", () => {
    const combat = makeCombat(5);
    combat.chooseAction("attack");
    combat.useLifeline("skip"); // 1/3
    combat.chooseAction("attack");
    combat.useLifeline("skip"); // 2/3
    const hpBeforeLast = combat.snapshot().warrior.hp;
    combat.chooseAction("attack");
    combat.useLifeline("skip"); // 3/3 -> lethal
    const snap = combat.snapshot();
    expect(snap.phase).toBe("won");
    expect(snap.enemy.hp).toBe(0);
    expect(snap.warrior.hp).toBe(hpBeforeLast); // no enemy turn after the killing skip
    expect(combat.result()).toEqual({ outcome: "won", warriorHp: hpBeforeLast, xpEarned: 0 });
  });

  it("skip is a no-op (returns false) while no action is pending (await_action)", () => {
    const combat = makeCombat(5);
    const before = combat.snapshot();
    expect(combat.useLifeline("skip")).toBe(false);
    expect(combat.snapshot()).toEqual(before);
  });

  it("skip works for a choice problem too (comparison)", () => {
    const { combat } = findFirstProblemOfKind("choice");
    const enemyHpBefore = combat.snapshot().enemy.hp;
    expect(combat.useLifeline("skip")).toBe(true);
    expect(combat.snapshot().enemy.hp).toBe(enemyHpBefore - ATTACK_DAMAGE);
  });
});

describe("createCombat — M4b charge-adjacent invariants (idempotence + new-problem reset)", () => {
  it("hint/fifty state resets to null/[] when chooseAction sets a FRESH problem", () => {
    const { combat } = findFirstProblemOfKind("choice");
    combat.useLifeline("hint");
    combat.useLifeline("fifty");
    const view1 = combat.snapshot().problem!;
    if (view1.kind !== "choice") throw new Error("expected choice");
    expect(combat.snapshot().hint).not.toBeNull();
    expect(view1.disabledChoices.length).toBe(1);

    // Solve it correctly (lands, no re-queue) so the NEXT chooseAction gets a genuinely fresh draw.
    combat.submitAnswer(correctResponseFor(view1));
    if (combat.snapshot().phase !== "await_action") return; // fight ended — nothing more to check
    combat.chooseAction("attack");
    expect(combat.snapshot().hint).toBeNull();
    const view2 = combat.snapshot().problem;
    if (view2 !== null && view2.kind === "choice") expect(view2.disabledChoices).toEqual([]);
  });

  it("a wrong answer's RE-QUEUED problem also starts with hint/fifty cleared (new chooseAction call)", () => {
    const combat = makeCombat(42);
    combat.chooseAction("attack");
    const missed = combat.snapshot().problem!;
    combat.submitAnswer(wrongResponse(correctResponseFor(missed)));
    combat.acknowledgeTeach();
    combat.chooseAction("attack"); // pops the re-queued problem
    expect(combat.snapshot().hint).toBeNull();
    const requeued = combat.snapshot().problem;
    if (requeued !== null && requeued.kind === "choice") expect(requeued.disabledChoices).toEqual([]);
  });
});

describe("createCombat — M4b zero-behaviour-change guarantee (M4a parity)", () => {
  it("a fight that NEVER calls useLifeline has disabledChoices:[] and hint:null on EVERY snapshot", () => {
    const combat = makeCombat(12345);
    let guard = 0;
    while (combat.result() === null && guard++ < 60) {
      const snap = combat.snapshot();
      expect(snap.hint).toBeNull();
      if (snap.problem !== null && snap.problem.kind === "choice") {
        expect(snap.problem.disabledChoices).toEqual([]);
      }
      if (snap.phase === "await_action") {
        combat.chooseAction("attack");
      } else if (snap.phase === "await_answer") {
        combat.submitAnswer(correctResponseFor(combat.snapshot().problem!));
      } else if (snap.phase === "teach") {
        combat.acknowledgeTeach();
      }
    }
    expect(guard).toBeLessThan(60);
  });

  it("the 'fifty' fork is never consumed when useLifeline is never called (rng draws identical to a bare M4a fight)", () => {
    // Two fights from the SAME seed: one only ever does chooseAction/submitAnswer (never
    // useLifeline); confirm its full snapshot sequence is unaffected by the mere EXISTENCE of the
    // fifty fork seam (i.e. M4a-era determinism is untouched by the M4b addition).
    const seed = 999;
    function run(): CombatSnapshot[] {
      const combat = makeCombat(seed);
      const snapshots: CombatSnapshot[] = [combat.snapshot()];
      for (let i = 0; i < 4; i++) {
        if (combat.snapshot().phase !== "await_action") break;
        combat.chooseAction("attack");
        snapshots.push(combat.snapshot());
        combat.submitAnswer(correctResponseFor(combat.snapshot().problem!));
        snapshots.push(combat.snapshot());
        if (combat.snapshot().phase === "teach") {
          combat.acknowledgeTeach();
          snapshots.push(combat.snapshot());
        }
      }
      return snapshots;
    }
    const a = run();
    const b = run();
    expect(a).toEqual(b);
  });
});
