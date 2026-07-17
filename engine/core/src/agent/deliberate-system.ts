/**
 * Generic PERCEIVE → ACT deliberation loop for BDI agents. Once per tick, for
 * every full BDI agent sitting in the "perceive" state, it looks up the
 * deliberator registered for the agent's personality kind, runs it (which fills
 * the intention queue), then advances the agent to the "act" state. Agents with
 * no registered deliberator have their intention queue cleared.
 *
 * What stays in the game: the meaning of the fsm states, how/when agents return
 * to "perceive", and the ACT-side scheduling (busy timers, day phases). Those
 * are game-specific and NOT part of this kernel. This system only owns the
 * registry-driven perceive→act dispatch.
 */

import type { SimContext, System } from "../sim";
import type { World, EngineEntity, With } from "../ecs";
import type { FsmState } from "../ecs/components";
import type { DeliberationContext, PersonalityRegistry } from "./registry";

/** The fsm state-string union of an agent entity (a game's fsm state type). */
type FsmStateOf<E extends EngineEntity> =
  NonNullable<E["fsm"]> extends FsmState<infer S> ? S : string;

/** An agent that has passed the full-BDI query filter. */
type DeliberativeAgent<E extends EngineEntity> = With<
  E,
  "fsm" | "personality" | "intentions" | "beliefs" | "desires"
>;

export interface DeliberateSystemOptions<E extends EngineEntity, Ctx = DeliberationContext> {
  /** Where `personality.kind` deliberators are looked up. */
  registry: PersonalityRegistry<E, Ctx>;
  /** State an agent must be in to be deliberated (e.g. "PERCEIVE"). */
  perceiveState: FsmStateOf<E>;
  /** State an agent is advanced to after deliberation (e.g. "ACT"). */
  actState: FsmStateOf<E>;
  /** Optional per-agent skip (e.g. skip a human-controlled agent). */
  shouldSkip?: (agent: DeliberativeAgent<E>) => boolean;
  /** Builds the context passed to each deliberator. Defaults to `{ tick }`. */
  makeContext?: (ctx: SimContext) => Ctx;
  /** System name (defaults to "DeliberateSystem"). */
  name?: string;
}

export function createDeliberateSystem<E extends EngineEntity, Ctx = DeliberationContext>(
  world: World<E>,
  opts: DeliberateSystemOptions<E, Ctx>,
): System {
  const { registry, perceiveState, actState, shouldSkip } = opts;
  const makeContext =
    opts.makeContext ?? ((ctx: SimContext): Ctx => ({ tick: ctx.tick }) as unknown as Ctx);
  const name = opts.name ?? "DeliberateSystem";

  return {
    name,
    run(ctx: SimContext): void {
      const agents = world.query("fsm", "personality", "intentions", "beliefs", "desires");
      for (const agent of agents) {
        // The query guarantees these components are present; the `!` is needed
        // only because Required<Pick<E, …>> can't strip `undefined` from a
        // generic type parameter's index access.
        const fsm = agent.fsm!;
        if (fsm.current !== perceiveState) continue;
        if (shouldSkip?.(agent)) continue;

        const fn = registry.get(agent.personality!.kind);
        if (fn) {
          fn(agent, makeContext(ctx));
        } else {
          agent.intentions!.queue.length = 0;
        }
        fsm.current = actState;
      }
    },
  };
}
