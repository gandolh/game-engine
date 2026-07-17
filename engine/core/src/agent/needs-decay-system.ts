/**
 * NeedsDecaySystem — drains every need on every agent that carries a needs
 * component, once per tick. Decoupled from any fixed entity shape via a
 * `needsOf` accessor + the component key used to filter the world query, so a
 * game names its own needs component and the engine stays game-agnostic.
 *
 * Iteration over an agent's needs follows the Record's key insertion order,
 * which is stable — so the decay order is deterministic tick to tick.
 */

import type { SimContext, System } from "../sim";
import type { World, EngineEntity } from "../ecs";
import { decayNeed, type Needs } from "./needs";

export interface NeedsDecaySystemOptions<E extends EngineEntity> {
  /** Component key to filter agents by (e.g. "needs"). */
  component: keyof E & string;
  /** Extracts the Needs bag from an agent (usually `(a) => a.needs`). */
  needsOf: (agent: E) => Needs | undefined;
  /** System name (defaults to "NeedsDecaySystem"). */
  name?: string;
}

export function createNeedsDecaySystem<E extends EngineEntity>(
  world: World<E>,
  opts: NeedsDecaySystemOptions<E>,
): System {
  const { component, needsOf } = opts;
  const name = opts.name ?? "NeedsDecaySystem";
  return {
    name,
    run(_ctx: SimContext): void {
      for (const agent of world.query(component)) {
        const needs = needsOf(agent);
        if (!needs) continue;
        for (const kind of Object.keys(needs.byKind)) {
          decayNeed(needs.byKind[kind]!);
        }
      }
    },
  };
}
