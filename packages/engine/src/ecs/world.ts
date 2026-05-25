import { World as MiniplexWorld } from "miniplex";
import type {
  Transform,
  Sprite,
  FsmState,
  Beliefs,
  Desires,
  Intentions,
  Personality,
  AgentInbox,
} from "./components";

export interface EngineEntity {
  id?: number;
  transform?: Transform;
  sprite?: Sprite;
  fsm?: FsmState;
  beliefs?: Beliefs;
  desires?: Desires;
  intentions?: Intentions;
  personality?: Personality;
  inbox?: AgentInbox;
  [key: string]: unknown;
}

export type Entity<E extends EngineEntity = EngineEntity> = E;

export class World<E extends EngineEntity = EngineEntity> {
  readonly inner: MiniplexWorld<E>;
  private nextId = 1;

  constructor() {
    this.inner = new MiniplexWorld<E>();
  }

  spawn(entity: E): E {
    const withId = entity as E & { id: number };
    if (withId.id === undefined) withId.id = this.nextId++;
    this.inner.add(withId);
    return withId;
  }

  despawn(entity: E): void {
    this.inner.remove(entity);
  }

  query<K extends keyof E>(...components: K[]) {
    return this.inner.with(...components);
  }
}
