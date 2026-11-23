export interface Transform {
  x: number;
  y: number;
  prevX: number;
  prevY: number;
  rotation: number;
}

export interface Sprite {
  atlasId: string;
  frame: string;
  layer: number;
  tintRgba: number;
}

/**
 * An agent's state machine position. `enteredTick` is the tick the agent entered `current`: it is set at spawn
 * and moves only through {@link enterState}, which is the one writer. The fields are readonly so the type
 * refuses a direct assignment.
 */
export interface FsmState<S extends string = string> {
  readonly current: S;
  readonly enteredTick: number;
}

/**
 * The one writer of {@link FsmState}. Sets `current` to `next`; `enteredTick` becomes `tick` only when `next`
 * differs from `current`, so writing the state an agent is already in keeps its age true.
 */
export function enterState<S extends string>(fsm: FsmState<S>, next: S, tick: number): void {
  // The narrow cast is the only place that may write the readonly fields.
  const writable = fsm as { current: S; enteredTick: number };
  if (writable.current !== next) writable.enteredTick = tick;
  writable.current = next;
}

export interface Beliefs {
  data: Record<string, unknown>;
  revision: number;
}

export interface Desires {
  data: Record<string, unknown>;
}

export interface Intention {
  kind: string;
  data: Record<string, unknown>;
  priority: number;
}

export interface Intentions {
  queue: Intention[];
}

export interface Personality {
  kind: string;
}

export interface AgentInbox {
  messages: AgentMessage[];
}

export interface AgentMessage {
  performative: string;
  ontology: string;
  sender: number | "world";
  body: Record<string, unknown>;
  tickIssued: number;
}
