import { describe, it, expect } from "vitest";
import { createRng } from "@engine/core";
import { createCombat, type Combat, type CombatOpts } from "./combat";
import { ATTACK_DAMAGE, WARRIOR_MAX_HP } from "./constants";
import { ENEMY_ARCHETYPES } from "../run/enemies";
import type { AnswerResponse, CombatSnapshot, Grade, ProblemView } from "./types";

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
    expect(combat.result()).toEqual({ outcome: "won", warriorHp: snap.warrior.hp });
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
    expect(combat.result()).toEqual({ outcome: "lost", warriorHp: 0 });
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
