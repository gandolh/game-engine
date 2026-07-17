/**
 * HollowPerceiveSystem — Hollow's own minimal PERCEIVE-stage system (the
 * brief is explicit that Farm's Perceive/Act systems are farm-coupled and
 * Hollow needs its own). Two jobs, both "folding world/needs into beliefs":
 *
 *  1. Starvation bookkeeping — tracks consecutive ticks an agent's `food`
 *     need has sat at its minimum and, once that streak crosses
 *     `STARVATION_TICKS`, flips `beliefs.data.starving` and broadcasts an
 *     edge-triggered `ONT_STARVATION.ONSET` message. This is the scarcity →
 *     population-regulation MECHANISM only — no death, no despawn (hollow-05
 *     owns that; see protocols/starvation.ts).
 *  2. Re-arming deliberation — an agent that finished its last intention
 *     sits in "ACT" with an empty intentions queue (ActSystem pops the
 *     completed intention but does not itself flip state — see
 *     systems/act.ts's header comment for why). This system flips it back
 *     to "PERCEIVE" so the same tick's DeliberateSystem (which only looks at
 *     "PERCEIVE"-state agents) re-plans it, and ActSystem executes the new
 *     top intention later in the SAME tick.
 */
import type { SimContext, System, World, MessageBus } from "@engine/core";
import { PERFORMATIVE, needIsDepleted } from "@engine/core/agent";
import type { HollowEntity, HollowFsmState } from "../components";
import { NEED_FOOD, STARVATION_TICKS } from "../economy";
import { ONT_STARVATION, type StarvationOnsetBody } from "../protocols";

const PERCEIVE_STATE: HollowFsmState = "PERCEIVE";
const ACT_STATE: HollowFsmState = "ACT";

export class HollowPerceiveSystem implements System {
  readonly name = "HollowPerceiveSystem";

  constructor(
    private readonly world: World<HollowEntity>,
    private readonly bus: MessageBus,
  ) {}

  run(ctx: SimContext): void {
    for (const entity of this.world.query("needs", "fsm", "beliefs", "intentions")) {
      this.updateStarvation(entity, ctx);

      if (entity.fsm.current === ACT_STATE && entity.intentions.queue.length === 0) {
        entity.fsm.current = PERCEIVE_STATE;
      }
    }
  }

  private updateStarvation(
    entity: {
      id?: number;
      needs: NonNullable<HollowEntity["needs"]>;
      beliefs: NonNullable<HollowEntity["beliefs"]>;
    },
    ctx: SimContext,
  ): void {
    const food = entity.needs.byKind[NEED_FOOD];
    if (!food) return;

    const priorTicks = (entity.beliefs.data.foodDepletedTicks as number | undefined) ?? 0;
    const depletedTicks = needIsDepleted(food) ? priorTicks + 1 : 0;
    entity.beliefs.data.foodDepletedTicks = depletedTicks;

    const wasStarving = entity.beliefs.data.starving === true;
    const isStarving = depletedTicks >= STARVATION_TICKS;
    if (isStarving === wasStarving) return;

    entity.beliefs.data.starving = isStarving;
    entity.beliefs.revision += 1;

    if (isStarving && entity.id !== undefined) {
      const body: StarvationOnsetBody = { agentId: entity.id, tick: ctx.tick };
      this.bus.send(
        {
          performative: PERFORMATIVE.INFORM,
          ontology: ONT_STARVATION.ONSET,
          sender: entity.id,
          recipient: "broadcast",
          body: body as unknown as Record<string, unknown>,
        },
        ctx.tick,
      );
    }
  }
}
