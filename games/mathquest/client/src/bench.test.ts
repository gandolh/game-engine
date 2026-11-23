import { describe, expect, it } from "vitest";
import { bootstrapMathquestSim, type GameSnapshot, type ProblemView } from "@mathquest/sim-core";
import { ACT_EVERY_TICKS, MATE_BENCH_SCENE, mateBenchMove, mateBenchScene, solveProblem } from "./bench";
import type { WorkerInbound } from "./worker/sim-worker";

const typed = (prompt: string): ProblemView => ({ kind: "typed", topic: "addition", grade: 2, prompt });

describe("solveProblem", () => {
  it("answers the three computations from the prompt", () => {
    expect(solveProblem(typed("12 + 30 = ?"))).toEqual({ kind: "typed", value: 42 });
    expect(solveProblem(typed("50 - 8 = ?"))).toEqual({ kind: "typed", value: 42 });
    expect(solveProblem(typed("6 × 7 = ?"))).toEqual({ kind: "typed", value: 42 });
  });

  it("picks the relation of a comparison in either locale", () => {
    const choice = (prompt: string): ProblemView => ({
      kind: "choice",
      topic: "comparison",
      grade: 1,
      prompt,
      choices: [">", "=", "<"],
      disabledChoices: [],
    });
    expect(solveProblem(choice("Compară: 3 și 9"))).toEqual({ kind: "choice", index: 2 });
    expect(solveProblem(choice("Compare: 9 and 3"))).toEqual({ kind: "choice", index: 0 });
    expect(solveProblem(choice("Compară: 4 și 4"))).toEqual({ kind: "choice", index: 1 });
  });

  it("gives up on a prompt it can't read", () => {
    expect(solveProblem(typed("?"))).toBeNull();
  });
});

describe("mateBenchMove", () => {
  const run = { reachableIds: [7, 8] } as unknown as GameSnapshot["run"];

  it("plays each screen through the game's own commands", () => {
    expect(mateBenchMove(null)).toBeNull();
    expect(mateBenchMove({ mode: "map", run })).toEqual({ type: "choose-node", id: 7 });
    const combat = (phase: string, problem: ProblemView | null): GameSnapshot =>
      ({ mode: "combat", run, combat: { phase, problem } }) as unknown as GameSnapshot;
    expect(mateBenchMove(combat("await_action", null))).toEqual({ type: "choose-action", action: "attack" });
    expect(mateBenchMove(combat("await_answer", typed("2 + 2 = ?")))).toEqual({
      type: "submit-answer",
      response: { kind: "typed", value: 4 },
    });
    expect(mateBenchMove(combat("teach", null))).toEqual({ type: "acknowledge-teach" });
    expect(mateBenchMove({ mode: "level_up", run, offers: [] })).toEqual({ type: "choose-level-up", index: 0 });
    expect(mateBenchMove({ mode: "loot", run, offers: [] })).toEqual({ type: "choose-loot", index: 0 });
    expect(mateBenchMove({ mode: "run_won", run })).toEqual({ type: "new-run" });
  });
});

describe("the bench loop", () => {
  it("plays the map, combat turns with answers and the loot screen, round and round", () => {
    const sim = bootstrapMathquestSim({ seed: 1 });
    const seen: string[] = [];
    for (let i = 0; i < 40; i += 1) {
      const snapshot = sim.getSnapshot();
      seen.push(snapshot.mode === "combat" ? `combat:${snapshot.combat.phase}` : snapshot.mode);
      const move = mateBenchMove(snapshot);
      if (move === null) throw new Error(`no move on ${seen.at(-1) ?? ""}`);
      if (move.type === "choose-node") sim.chooseNode(move.id);
      else if (move.type === "choose-action") sim.chooseAction(move.action);
      else if (move.type === "submit-answer") sim.submitAnswer(move.response);
      else if (move.type === "acknowledge-teach") sim.acknowledgeTeach();
      else if (move.type === "choose-level-up") sim.chooseLevelUp(move.index);
      else if (move.type === "choose-loot") sim.chooseLoot(move.index);
      else if (move.type === "new-run") sim.newRun();
    }
    // Every answer is right, so no teach screen; the loop comes back to the map more than once.
    expect(seen).not.toContain("combat:teach");
    expect(seen.filter((s) => s === "loot").length).toBeGreaterThan(2);
    expect(seen.filter((s) => s === "map").length).toBeGreaterThan(2);
    expect(seen).toContain("combat:await_answer");
  });
});

describe("mateBenchScene", () => {
  it("moves once every ACT_EVERY_TICKS display ticks, and not during the warm-up", () => {
    const posted: WorkerInbound[] = [];
    const scene = mateBenchScene(
      (msg) => posted.push(msg),
      () => ({ mode: "map", run: { reachableIds: [3] } as unknown as GameSnapshot["run"] }),
    );
    expect(scene.name).toBe(MATE_BENCH_SCENE);
    scene.warmUp?.();
    expect(posted).toHaveLength(0);
    for (let tick = 0; tick < ACT_EVERY_TICKS * 3; tick += 1) {
      scene.step(tick * 16, tick);
      // Each screen is drawn its whole share before the move that leaves it.
      expect(posted).toHaveLength(Math.floor((tick + 1) / ACT_EVERY_TICKS));
    }
    expect(scene.report?.()).toEqual({ screens: { map: ACT_EVERY_TICKS * 3 }, moves: 3 });
    expect(scene.mayEndAt?.(ACT_EVERY_TICKS * 3)).toBe(true);
    expect(scene.mayEndAt?.(ACT_EVERY_TICKS * 3 + 1)).toBe(false);
  });
});
