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

export type With<E, K extends keyof E> = E & Required<Pick<E, K>>;

export class Query<E extends object, K extends keyof E = keyof E>
  implements Iterable<With<E, K>>
{
  readonly entities: With<E, K>[] = [];
  private readonly members = new Set<E>();

  constructor(readonly components: readonly K[]) {}

  matches(entity: E): boolean {
    for (const k of this.components) {
      if (entity[k] === undefined) return false;
    }
    return true;
  }

  evaluate(entity: E): void {
    const had = this.members.has(entity);
    const now = this.matches(entity);
    if (now && !had) {
      this.members.add(entity);
      this.entities.push(entity as With<E, K>);
    } else if (!now && had) {
      this.drop(entity);
    }
  }

  drop(entity: E): void {
    if (!this.members.delete(entity)) return;
    const idx = this.entities.indexOf(entity as With<E, K>);
    if (idx >= 0) this.entities.splice(idx, 1);
  }

  // Pooled scratch buffers: iteration takes a snapshot of `entities` at loop start,
  // so despawning mid-loop is safe. Steady-state iteration allocates no array
  // (pool grows only with concurrent/nested iteration depth).
  private readonly bufferPool: With<E, K>[][] = [];

  [Symbol.iterator](): Iterator<With<E, K>> {
    const src = this.entities;
    const n = src.length;
    const pool = this.bufferPool;
    const buf = pool.pop() ?? [];
    buf.length = n;
    for (let j = 0; j < n; j++) buf[j] = src[j]!;
    let i = 0;
    let released = false;
    const release = (): void => {
      if (released) return;
      released = true;
      buf.length = 0; // drop references before returning to the pool
      pool.push(buf);
    };
    return {
      next() {
        if (!released && i < n) {
          return { value: buf[i++]!, done: false };
        }
        release();
        return { value: undefined as unknown as With<E, K>, done: true };
      },
      return(value?: unknown) {
        release();
        return { value: value as With<E, K>, done: true };
      },
    };
  }
}

export class World<E extends EngineEntity = EngineEntity> {
  private readonly all = new Set<E>();
  private readonly queries = new Map<string, Query<E, keyof E>>();
  private nextId = 1;

  spawn(entity: E): E {
    const withId = entity as E & { id: number };
    if (withId.id === undefined) withId.id = this.nextId++;
    if (this.all.has(withId)) return withId;
    this.all.add(withId);
    for (const q of this.queries.values()) q.evaluate(withId);
    return withId;
  }

  despawn(entity: E): void {
    if (!this.all.delete(entity)) return;
    for (const q of this.queries.values()) q.drop(entity);
  }

  query<K extends keyof E>(...components: K[]): Query<E, K> {
    const key = [...components].sort().join("|");
    const cached = this.queries.get(key);
    if (cached) return cached as unknown as Query<E, K>;
    const q = new Query<E, K>(components);
    for (const e of this.all) q.evaluate(e);
    this.queries.set(key, q as unknown as Query<E, keyof E>);
    return q;
  }

  addComponent<K extends keyof E>(entity: E, key: K, value: E[K]): void {
    if (!this.all.has(entity)) return;
    entity[key] = value;
    for (const q of this.queries.values()) q.evaluate(entity);
  }

  removeComponent<K extends keyof E>(entity: E, key: K): void {
    if (!this.all.has(entity)) return;
    delete (entity as Record<string, unknown>)[key as string];
    for (const q of this.queries.values()) q.evaluate(entity);
  }
}
