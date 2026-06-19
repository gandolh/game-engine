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

export interface FsmState<S extends string = string> {
  current: S;
  enteredTick: number;
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
