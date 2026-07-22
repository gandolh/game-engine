/**
 * MateQuest sim worker — M3 extends the M0-M2 scaffold worker's command channel from a single
 * fight (`choose-action`/`submit-answer`/`acknowledge-teach`/`set-grade`) to a full RUN
 * (`init`/`choose-node`/`choose-action`/`submit-answer`/`acknowledge-teach`/`new-run`) — see
 * corpus/todos/2026-07-22-mathquest-M3-map-and-runs.md, Part B. `set-grade` is GONE: difficulty
 * now comes from the chosen map node, not a manual selector. Mirrors `@citadel/client`'s
 * `src/worker/sim-worker.ts` `self.onmessage` command-channel shape (a Web-Worker solo sim, no
 * server) and Hollow's equivalent worker.
 *
 * Drives `bootstrapMathquestSim()` at a fixed 20 Hz base cadence and posts a snapshot after each
 * paced tick (cheap — keeps the view fresh) AND immediately after every command, so the client
 * sees the run's resolution the instant it happens rather than waiting for the next tick.
 * `step()` itself never changes run/combat state (see `sim-bootstrap.ts`'s module doc) — the
 * 20 Hz real-time cadence is this transport's OWN pacing, never the sim's (determinism is
 * load-bearing — root CLAUDE.md).
 */
import { bootstrapMathquestSim } from "@mathquest/sim-core/sim-bootstrap";
import type { AnswerResponse, CombatAction, GameSnapshot } from "@mathquest/sim-core/sim-bootstrap";

export interface WorkerInitMessage {
  type: "init";
  seed: number;
}

/** M3: choose a map node (a fight, or a rest) — replaces M1/M2's implicit single fight. */
export interface WorkerChooseNodeMessage {
  type: "choose-node";
  id: number;
}

export interface WorkerChooseActionMessage {
  type: "choose-action";
  action: CombatAction;
}

/** Carries a full `AnswerResponse` (typed value OR choice index). */
export interface WorkerSubmitAnswerMessage {
  type: "submit-answer";
  response: AnswerResponse;
}

/** Advances past the teach card into the (deferred) enemy turn. */
export interface WorkerAcknowledgeTeachMessage {
  type: "acknowledge-teach";
}

/** M3: starts a fresh run (new map, full HP) after `"run_won"`/`"run_lost"` — replaces M1/M2's
 * `"init"`-with-the-same-seed restart. */
export interface WorkerNewRunMessage {
  type: "new-run";
}

export type WorkerInbound =
  | WorkerInitMessage
  | WorkerChooseNodeMessage
  | WorkerChooseActionMessage
  | WorkerSubmitAnswerMessage
  | WorkerAcknowledgeTeachMessage
  | WorkerNewRunMessage;

export type WorkerOutbound =
  | { type: "ready" }
  | { type: "snapshot"; snapshot: GameSnapshot };

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
    case "choose-node": {
      sim?.chooseNode(msg.id);
      postSnapshot();
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
    case "new-run": {
      sim?.newRun();
      postSnapshot();
      break;
    }
  }
};
