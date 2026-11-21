/**
 * `?bench`: MateQuest's fixed benchmark scene (corpus brief 06). A reading only compares with another
 * taken the same way, so the scene is the same every time: the fixed seed, an empty mastery store (and
 * nothing saved), the default locale, and one loop played through the game's own commands: the map, a
 * combat turn answered, the level-up and loot screens, the map again. It runs in production builds too
 * (brief 07 runs it on the deployed games, from a phone), and it implies `?profile`.
 *
 * The run: a 3 s warm-up on the map, then the profile is reset and 30 s are sampled. At the end
 * `window.__benchResult` holds the brief-05 export plus the scene name, and a button saves it.
 *
 * The player answers every problem right, from the prompt on screen (the snapshot carries no answer).
 * It acts on the last of every `ACT_EVERY_TICKS` display ticks, so each screen is drawn for the same
 * number of frames whatever the frame rate, and the run ends on a whole screen (it can run up to
 * `ACT_EVERY_TICKS` ticks past 30 s). The map draws about ten times the quads of the other screens, so
 * a run cut partway into one would move the means with the frame rate.
 */
import { DebugOverlay, downloadProfile, type FrameProfile, type GameEngineProfile } from "@engine/core";
import type { AnswerResponse, GameSnapshot, ProblemView } from "@mathquest/sim-core";
import type { WorkerInbound } from "./worker/sim-worker";

/** The warm-up before sampling starts. */
export const BENCH_WARMUP_MS = 3_000;
/** The sampled run. */
export const BENCH_RUN_MS = 30_000;

/** What `window.__benchResult` holds: the profile export and the scene that produced it. */
export interface BenchResult extends GameEngineProfile {
  scene: string;
  /** What the scene itself counted, when it counts anything (MateQuest's screens). */
  sceneReport?: Record<string, unknown>;
}

declare global {
  interface Window {
    __benchResult?: BenchResult;
  }
}

/** Whether the page asked for the bench scene: `?bench` in its URL. */
export function benchRequested(search: string = typeof location !== "undefined" ? location.search : ""): boolean {
  return new URLSearchParams(search).has("bench");
}

export interface BenchScene {
  readonly name: string;
  /** Drives the scene `tMs` into the sampled run; `tick` counts the display ticks sampled so far. */
  step(tMs: number, tick: number): void;
  /** Runs each display tick of the warm-up. Without it the warm-up holds `step(0, 0)`. */
  warmUp?(): void;
  /** Puts back what the scene changed, once the run ends. */
  end?(): void;
  /** What the scene counted over the sampled run, added to the result. */
  report?(): Record<string, unknown>;
  /**
   * Whether the run may end before sampling display tick `tick`. Without it the run ends at 30 s; with it
   * the run goes on to the first tick it allows, so a scene of screens can end on a whole screen.
   */
  mayEndAt?(tick: number): boolean;
}

/**
 * Runs `scene` against `profile`: the warm-up, a reset, the sampled run, then `window.__benchResult` and
 * `onDone` (by default, a button that saves the result). The frame source and the end are seams for tests.
 */
export function runBench(
  profile: FrameProfile,
  scene: BenchScene,
  requestFrame: (cb: (ts: number) => void) => void = (cb) => requestAnimationFrame(cb),
  onDone: (result: BenchResult) => void = offerDownload,
): void {
  let startTs: number | null = null;
  let sampling = false;
  let tick = 0;
  const frame = (ts: number): void => {
    startTs ??= ts;
    const elapsed = ts - startTs;
    if (elapsed < BENCH_WARMUP_MS) {
      if (scene.warmUp !== undefined) scene.warmUp();
      else scene.step(0, 0);
      requestFrame(frame);
      return;
    }
    if (!sampling) {
      sampling = true;
      profile.reset();
    }
    const t = elapsed - BENCH_WARMUP_MS;
    if (t < BENCH_RUN_MS || scene.mayEndAt?.(tick) === false) {
      scene.step(t, tick);
      tick += 1;
      requestFrame(frame);
      return;
    }
    scene.end?.();
    const result: BenchResult = { ...profile.exportProfile(), scene: scene.name };
    const report = scene.report?.();
    if (report !== undefined) result.sceneReport = report;
    window.__benchResult = result;
    onDone(result);
  };
  requestFrame(frame);
}

/** Shows a button that saves the result as a JSON download (on a phone, where there is no console). */
function offerDownload(result: BenchResult): void {
  const overlay = new DebugOverlay(document.body, { corner: "top-right" });
  overlay.addButton("⤓ Save bench result", () => downloadProfile(result, "bench"));
}

/** Display ticks between two moves: half a second at 60 Hz. */
export const ACT_EVERY_TICKS = 30;

/** The scene name a MateQuest result carries. */
export const MATE_BENCH_SCENE = "mathquest-map-combat-loot-loop";

/** The right answer to a problem, read off its prompt, or `null` for a prompt it can't read. */
export function solveProblem(problem: ProblemView): AnswerResponse | null {
  if (problem.kind === "typed") {
    const m = /(\d+)\s*([+\-×])\s*(\d+)/.exec(problem.prompt);
    if (m === null) return null;
    const a = Number(m[1]);
    const b = Number(m[3]);
    const value = m[2] === "+" ? a + b : m[2] === "-" ? a - b : a * b;
    return { kind: "typed", value };
  }
  // "Compară: a și b" / "Compare: a and b": the choices are the relations.
  const m = /(\d+)\D+(\d+)/.exec(problem.prompt);
  if (m === null) return null;
  const a = Number(m[1]);
  const b = Number(m[2]);
  const relation = a < b ? "<" : a > b ? ">" : "=";
  const index = problem.choices.indexOf(relation);
  return index < 0 ? null : { kind: "choice", index };
}

/** The player's next command for the screen in `snapshot`, or `null` to wait. */
export function mateBenchMove(snapshot: GameSnapshot | null): WorkerInbound | null {
  if (snapshot === null) return null;
  switch (snapshot.mode) {
    case "map": {
      const id = snapshot.run.reachableIds[0];
      return id === undefined ? { type: "new-run" } : { type: "choose-node", id };
    }
    case "combat": {
      const combat = snapshot.combat;
      if (combat.phase === "await_action") return { type: "choose-action", action: "attack" };
      if (combat.phase === "teach") return { type: "acknowledge-teach" };
      if (combat.phase === "await_answer" && combat.problem !== null) {
        const response = solveProblem(combat.problem);
        return response === null ? null : { type: "submit-answer", response };
      }
      return null;
    }
    case "level_up":
      return { type: "choose-level-up", index: 0 };
    case "loot":
      return { type: "choose-loot", index: 0 };
    case "run_won":
    case "run_lost":
      return { type: "new-run" };
  }
}

/** MateQuest's scene: one move every `ACT_EVERY_TICKS` display ticks, the map held through the warm-up. */
export function mateBenchScene(post: (msg: WorkerInbound) => void, latest: () => GameSnapshot | null): BenchScene {
  /** Display ticks sampled on each screen, and the moves made: a run's mix, to compare two runs by. */
  const screens: Record<string, number> = {};
  let moves = 0;
  return {
    name: MATE_BENCH_SCENE,
    warmUp: () => {},
    step: (_tMs, tick) => {
      const snapshot = latest();
      const screen = snapshot === null ? "none" : snapshot.mode;
      screens[screen] = (screens[screen] ?? 0) + 1;
      if ((tick + 1) % ACT_EVERY_TICKS !== 0) return;
      const move = mateBenchMove(snapshot);
      if (move === null) return;
      post(move);
      moves += 1;
    },
    report: () => ({ screens: { ...screens }, moves }),
    mayEndAt: (tick) => tick % ACT_EVERY_TICKS === 0,
  };
}
