/**
 * MateQuest sim worker — extends the M0/M1 scaffold worker with the M2 command channel (teach +
 * re-queue + grade select). Mirrors `@citadel/client`'s `src/worker/sim-worker.ts` `self.onmessage`
 * command-channel shape (a Web-Worker solo sim, no server) and Hollow's equivalent worker.
 *
 * Drives `bootstrapMathquestSim()` at a fixed 20 Hz base cadence and posts a snapshot after each
 * paced tick (cheap — keeps the view fresh) AND immediately after every command, so the client
 * sees the combat resolution the instant it happens rather than waiting for the next tick.
 * `step()` itself never changes combat state (see `sim-bootstrap.ts`'s module doc) — the 20 Hz
 * real-time cadence is this transport's OWN pacing, never the sim's (determinism is load-bearing —
 * root CLAUDE.md).
 */
import { bootstrapMathquestSim } from "@mathquest/sim-core/sim-bootstrap";
import type { AnswerResponse, CombatAction, CombatSnapshot, Grade } from "@mathquest/sim-core/sim-bootstrap";

export interface WorkerInitMessage {
  type: "init";
  seed: number;
}

export interface WorkerChooseActionMessage {
  type: "choose-action";
  action: CombatAction;
}

/** M2: carries a full `AnswerResponse` (typed value OR choice index) — supersedes M1's `{value}`. */
export interface WorkerSubmitAnswerMessage {
  type: "submit-answer";
  response: AnswerResponse;
}

/** M2: advances past the teach card into the (deferred) enemy turn. */
export interface WorkerAcknowledgeTeachMessage {
  type: "acknowledge-teach";
}

/** M2: sets the player's chosen difficulty (I–IV). */
export interface WorkerSetGradeMessage {
  type: "set-grade";
  grade: Grade;
}

export type WorkerInbound =
  | WorkerInitMessage
  | WorkerChooseActionMessage
  | WorkerSubmitAnswerMessage
  | WorkerAcknowledgeTeachMessage
  | WorkerSetGradeMessage;

export type WorkerOutbound =
  | { type: "ready" }
  | { type: "snapshot"; snapshot: CombatSnapshot };

const BASE_TICK_HZ = 20;
const BASE_MS_PER_TICK = 1000 / BASE_TICK_HZ;

let intervalId: ReturnType<typeof setInterval> | null = null;
let sim: ReturnType<typeof bootstrapMathquestSim> | null = null;

function postSnapshot(): void {
  if (sim === null) return;
  const snapshot = sim.getSnapshot();
  self.postMessage({ type: "snapshot", snapshot } satisfies WorkerOutbound);
}

function startLoop(): void {
  if (intervalId !== null) clearInterval(intervalId);
  intervalId = setInterval(() => {
    if (sim === null) return;
    sim.step();
    postSnapshot();
  }, BASE_MS_PER_TICK);
}

self.onmessage = (event: MessageEvent<WorkerInbound>) => {
  const msg = event.data;
  switch (msg.type) {
    case "init": {
      sim = bootstrapMathquestSim({ seed: msg.seed });
      self.postMessage({ type: "ready" } satisfies WorkerOutbound);
      postSnapshot();
      startLoop();
      break;
    }
    case "choose-action": {
      sim?.chooseAction(msg.action);
      postSnapshot();
      break;
    }
    case "submit-answer": {
      sim?.submitAnswer(msg.response);
      postSnapshot();
      break;
    }
    case "acknowledge-teach": {
      sim?.acknowledgeTeach();
      postSnapshot();
      break;
    }
    case "set-grade": {
      sim?.setGrade(msg.grade);
      postSnapshot();
      break;
    }
  }
};
