import { describe, it, expect } from "vitest";
import { bootstrapMathquestSim } from "./sim-bootstrap";
import { ATTACK_DAMAGE, ENEMY_MAX_HP, SHIELD_BLOCK, WARRIOR_MAX_HP } from "./combat/constants";
import type { CombatSnapshot } from "./combat/types";

/** Drive `chooseAction` + `submitAnswer` with the CORRECT answer for the pending problem. */
function actCorrectly(sim: ReturnType<typeof bootstrapMathquestSim>, action: "attack" | "heal" | "shield"): void {
  sim.chooseAction(action);
  const snap = sim.getSnapshot();
  expect(snap.phase).toBe("await_answer");
  expect(snap.prompt).not.toBeNull();
  // The M1 problem is hardcoded "a + b = ?" — parse the two operands out of the prompt text so
  // the test never needs to see the private `Problem.answer` (which never crosses the snapshot
  // boundary anyway — see the dedicated test below).
  const match = snap.prompt!.match(/(\d+) \+ (\d+)/);
  expect(match).not.toBeNull();
  const [, a, b] = match!;
  sim.submitAnswer(Number(a) + Number(b));
}

/** Drive `chooseAction` + `submitAnswer` with a deliberately WRONG answer. */
function actWrong(sim: ReturnType<typeof bootstrapMathquestSim>, action: "attack" | "heal" | "shield"): void {
  sim.chooseAction(action);
  // -1 can never equal a sum of two operands in [2,9] (min sum is 4), so this is always wrong.
  sim.submitAnswer(-1);
}

describe("bootstrapMathquestSim — M1 combat loop", () => {
  it("starts in await_action with full HP and a telegraphed enemy intent", () => {
    const sim = bootstrapMathquestSim({ seed: 1 });
    const snap = sim.getSnapshot();
    expect(snap.phase).toBe("await_action");
    expect(snap.warrior).toEqual({ hp: WARRIOR_MAX_HP, maxHp: WARRIOR_MAX_HP, block: 0 });
    expect(snap.enemy.hp).toBe(ENEMY_MAX_HP);
    expect(snap.enemy.maxHp).toBe(ENEMY_MAX_HP);
    expect(snap.enemy.intent).toBeGreaterThanOrEqual(5);
    expect(snap.enemy.intent).toBeLessThanOrEqual(8);
    expect(snap.prompt).toBeNull();
    expect(snap.turn).toBe(1);
    expect(snap.last).toEqual({ kind: "none" });
  });

  it("chooseAction moves to await_answer and exposes only the prompt, never the answer", () => {
    const sim = bootstrapMathquestSim({ seed: 2 });
    sim.chooseAction("attack");
    const snap = sim.getSnapshot();
    expect(snap.phase).toBe("await_answer");
    expect(snap.prompt).toMatch(/^\d+ \+ \d+ = \?$/);
    // The snapshot's own type has no `answer` field — assert the raw object doesn't smuggle one
    // in anyway (e.g. via an accidental spread of the internal Problem).
    expect(Object.prototype.hasOwnProperty.call(snap, "answer")).toBe(false);
    expect(JSON.stringify(snap)).not.toContain('"answer"');
  });

  it("chooseAction is ignored outside await_action", () => {
    const sim = bootstrapMathquestSim({ seed: 3 });
    sim.chooseAction("attack");
    expect(sim.getSnapshot().phase).toBe("await_answer");
    const promptBefore = sim.getSnapshot().prompt;
    sim.chooseAction("heal"); // should be a no-op — still await_answer, same pending problem
    expect(sim.getSnapshot().phase).toBe("await_answer");
    expect(sim.getSnapshot().prompt).toBe(promptBefore);
  });

  it("submitAnswer is ignored outside await_answer", () => {
    const sim = bootstrapMathquestSim({ seed: 4 });
    expect(sim.getSnapshot().phase).toBe("await_action");
    sim.submitAnswer(42); // no pending problem — must be a no-op
    const snap = sim.getSnapshot();
    expect(snap.phase).toBe("await_action");
    expect(snap.warrior.hp).toBe(WARRIOR_MAX_HP);
    expect(snap.enemy.hp).toBe(ENEMY_MAX_HP);
  });

  it("(1) a correct attack reduces enemy HP by ATTACK_DAMAGE (8)", () => {
    const sim = bootstrapMathquestSim({ seed: 5 });
    actCorrectly(sim, "attack");
    const snap = sim.getSnapshot();
    expect(snap.enemy.hp).toBe(ENEMY_MAX_HP - ATTACK_DAMAGE);
  });

  it("(2) a wrong answer fizzles (no enemy HP change) and the enemy still hits on its turn", () => {
    const sim = bootstrapMathquestSim({ seed: 6 });
    const before = sim.getSnapshot();
    const intent = before.enemy.intent;
    actWrong(sim, "attack");
    const after = sim.getSnapshot();
    // Fizzle: the attack never landed — enemy HP is untouched.
    expect(after.enemy.hp).toBe(ENEMY_MAX_HP);
    // But the enemy turn still ran: warrior HP dropped by exactly the telegraphed intent
    // (no block was up), and the fight is still going (didn't die from one hit at these values).
    expect(after.warrior.hp).toBe(WARRIOR_MAX_HP - intent);
    expect(after.phase).toBe("await_action");
    expect(after.last).toEqual({ kind: "enemy_hit", amount: intent, blocked: 0 });
  });

  it("(3) shield absorbs the next enemy hit", () => {
    const sim = bootstrapMathquestSim({ seed: 7 });
    const intentBeforeShield = sim.getSnapshot().enemy.intent;
    actCorrectly(sim, "shield");
    const afterShield = sim.getSnapshot();
    // SHIELD_BLOCK (8) covers the whole 5..8 intent range, so the warrior takes no damage and
    // the hit is reported as fully blocked.
    expect(afterShield.warrior.hp).toBe(WARRIOR_MAX_HP);
    expect(afterShield.warrior.block).toBe(0); // consumed after the enemy turn
    expect(afterShield.last).toEqual({ kind: "enemy_hit", amount: 0, blocked: intentBeforeShield });
    expect(afterShield.phase).toBe("await_action");
  });

  it("shield's block does not carry over to a SECOND enemy turn", () => {
    const sim = bootstrapMathquestSim({ seed: 8 });
    actCorrectly(sim, "shield"); // absorbs turn 1's hit fully
    const hpAfterShield = sim.getSnapshot().warrior.hp;
    expect(hpAfterShield).toBe(WARRIOR_MAX_HP);
    const intent2 = sim.getSnapshot().enemy.intent;
    actWrong(sim, "attack"); // fizzle — no block this time, block is 0 (consumed last turn)
    const after = sim.getSnapshot();
    expect(after.warrior.hp).toBe(hpAfterShield - intent2);
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
    // The killing blow ended the fight before any enemy turn ran, so `last` is the landed hit,
    // not an enemy_hit.
    expect(snap.last).toEqual({ kind: "landed", action: "attack", amount: ATTACK_DAMAGE });
  });

  it("(4b) warrior HP -> 0 ends the fight as lost", () => {
    const sim = bootstrapMathquestSim({ seed: 10 });
    let snap: CombatSnapshot = sim.getSnapshot();
    let guard = 0;
    // Repeatedly fizzle (never block/heal) until the warrior dies — WARRIOR_MAX_HP (30) / the
    // enemy's 5..8-damage intent guarantees death within ~4-6 turns; guard against an infinite
    // loop if the model is ever wrong.
    while (snap.phase === "await_action" && guard < 20) {
      actWrong(sim, "attack");
      snap = sim.getSnapshot();
      guard += 1;
    }
    expect(snap.phase).toBe("lost");
    expect(snap.warrior.hp).toBe(0);
    expect(guard).toBeLessThan(20);
  });

  it("chooseAction/submitAnswer are no-ops once the fight is over", () => {
    const sim = bootstrapMathquestSim({ seed: 9 });
    actCorrectly(sim, "attack");
    actCorrectly(sim, "attack");
    actCorrectly(sim, "attack");
    expect(sim.getSnapshot().phase).toBe("won");
    sim.chooseAction("heal");
    expect(sim.getSnapshot().phase).toBe("won"); // still won — chooseAction ignored in a terminal phase
  });

  it("(5) determinism: two sims, same seed, same scripted command sequence -> identical snapshot sequence", () => {
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
        const prompt = sim.getSnapshot().prompt!;
        const match = prompt.match(/(\d+) \+ (\d+)/)!;
        const correctAnswer = Number(match[1]) + Number(match[2]);
        sim.submitAnswer(step.correct ? correctAnswer : correctAnswer + 1000);
        snapshots.push(sim.getSnapshot());
      }
      return snapshots;
    }

    const a = run();
    const b = run();
    expect(a.length).toBeGreaterThan(1);
    expect(a).toEqual(b);
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
});
