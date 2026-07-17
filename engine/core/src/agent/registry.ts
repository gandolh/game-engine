/**
 * Generic kind-keyed registry — the `personality.kind → behavior` dispatch
 * pattern, so any game on the engine can key behavior (a deliberator fn, a
 * bundle of trade hooks, …) by a string kind.
 *
 * A registry is an isolated instance (not a module-global map) so two games can
 * each own their own set of kinds without colliding. Registering the same kind
 * twice throws — a duplicate is almost always a double side-effecting import.
 */

/** Context handed to a deliberator each time it runs. */
export interface DeliberationContext {
  tick: number;
}

/** A behavior function dispatched for one agent entity of a given kind. */
export type Deliberator<E, Ctx = DeliberationContext> = (agent: E, ctx: Ctx) => void;

/** A registry mapping a string kind to a value of type `V`. */
export interface Registry<V> {
  register(kind: string, value: V): void;
  get(kind: string): V | undefined;
  has(kind: string): boolean;
}

export function createRegistry<V>(label = "Entry"): Registry<V> {
  const map = new Map<string, V>();
  return {
    register(kind, value) {
      if (map.has(kind)) {
        throw new Error(`${label} already registered: ${kind}`);
      }
      map.set(kind, value);
    },
    get(kind) {
      return map.get(kind);
    },
    has(kind) {
      return map.has(kind);
    },
  };
}

/** A registry of per-kind deliberator functions (the FSM deliberate case). */
export type PersonalityRegistry<E, Ctx = DeliberationContext> = Registry<Deliberator<E, Ctx>>;

export function createPersonalityRegistry<E, Ctx = DeliberationContext>(): PersonalityRegistry<
  E,
  Ctx
> {
  return createRegistry<Deliberator<E, Ctx>>("Personality");
}
