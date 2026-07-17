/**
 * HollowActSystem — Hollow's own minimal ACT-stage system (see
 * systems/perceive.ts's header for why Farm's Perceive/Act can't be reused).
 * Executes the top intention of every agent currently in the "ACT" state:
 *
 *  - "seek_food" / "work": step one tile toward the intention's resource
 *    node (deterministic grid stepping — see `stepToward`, no pathfinder for
 *    M1 per the brief). Once arrived, harvest one tick's worth from the
 *    node into `inventory.goods`, then immediately consume what was just
 *    harvested to replenish the matching need. The intention completes
 *    (popped off the queue) once the need is full or the node came up dry
 *    this tick — otherwise it stays queued and keeps harvesting next tick.
 *  - "rest": no node, no movement — replenishes the `rest` need in place
 *    each tick until full.
 *
 * IMPORTANT: on completion this system pops the intention but does NOT
 * flip `fsm.current` back to "PERCEIVE" itself — that happens in
 * `HollowPerceiveSystem`, which runs at the START of the next tick (before
 * DeliberateSystem). That ordering (perceive re-arms → deliberate re-plans
 * → act executes, all in one tick) is why the scheduler order in
 * sim-bootstrap.ts is PERCEIVE → DELIBERATE → ACT, not ACT → PERCEIVE.
 */
import type { SimContext, System, World, Intention } from "@engine/core";
import { replenishNeed } from "@engine/core/agent";
import type { HollowAgent, HollowEntity, HollowFsmState } from "../components";
import { addGoods, takeGoods } from "../components";
import {
  FOOD_HARVEST_PER_TICK,
  FOOD_VALUE_PER_UNIT,
  GOOD_FOOD,
  GOOD_MATERIALS,
  MATERIAL_HARVEST_PER_TICK,
  NEED_FOOD,
  NEED_REST,
  NEED_WEALTH,
  REST_RECOVER_PER_TICK,
  WEALTH_PER_MATERIAL_UNIT,
} from "../economy";
import type { ResourceWorld } from "../world";

const ACT_STATE: HollowFsmState = "ACT";

type ActingAgent = HollowEntity & {
  agent: HollowAgent;
  needs: NonNullable<HollowEntity["needs"]>;
  inventory: NonNullable<HollowEntity["inventory"]>;
  intentions: NonNullable<HollowEntity["intentions"]>;
};

/** Steps `agent` one tile toward (targetGx, targetGy); returns true once arrived. */
function stepToward(agent: HollowAgent, targetGx: number, targetGy: number): boolean {
  if (agent.gx === targetGx && agent.gy === targetGy) {
    agent.moveTarget = null;
    return true;
  }
  agent.moveTarget = { gx: targetGx, gy: targetGy };
  agent.gx += Math.sign(targetGx - agent.gx);
  agent.gy += Math.sign(targetGy - agent.gy);
  return false;
}

export class HollowActSystem implements System {
  readonly name = "HollowActSystem";

  constructor(
    private readonly world: World<HollowEntity>,
    private readonly resources: ResourceWorld,
  ) {}

  run(_ctx: SimContext): void {
    for (const entity of this.world.query("agent", "needs", "inventory", "fsm", "intentions")) {
      if (entity.fsm.current !== ACT_STATE) continue;
      const intention = entity.intentions.queue[0];
      if (!intention) continue; // re-armed by HollowPerceiveSystem next tick

      switch (intention.kind) {
        case "seek_food":
          this.runSeekFood(entity as ActingAgent, intention);
          break;
        case "work":
          this.runWork(entity as ActingAgent, intention);
          break;
        case "rest":
          this.runRest(entity as ActingAgent);
          break;
        default:
          // Unknown intention kind — drop it rather than stall the agent.
          entity.intentions.queue.shift();
      }
    }
  }

  private runSeekFood(entity: ActingAgent, intention: Intention): void {
    const node = this.resources.getNode(intention.data.nodeId as number);
    if (!node) {
      entity.intentions.queue.shift();
      return;
    }
    if (!stepToward(entity.agent, node.gx, node.gy)) return; // still travelling

    const harvested = this.resources.harvest(node.id, FOOD_HARVEST_PER_TICK);
    addGoods(entity.inventory, GOOD_FOOD, harvested);
    const consumed = takeGoods(entity.inventory, GOOD_FOOD, harvested);

    const food = entity.needs.byKind[NEED_FOOD];
    if (food) replenishNeed(food, consumed * FOOD_VALUE_PER_UNIT);

    const full = food ? food.value >= food.max : true;
    if (full || harvested === 0) entity.intentions.queue.shift();
  }

  private runWork(entity: ActingAgent, intention: Intention): void {
    const node = this.resources.getNode(intention.data.nodeId as number);
    if (!node) {
      entity.intentions.queue.shift();
      return;
    }
    if (!stepToward(entity.agent, node.gx, node.gy)) return; // still travelling

    const harvested = this.resources.harvest(node.id, MATERIAL_HARVEST_PER_TICK);
    addGoods(entity.inventory, GOOD_MATERIALS, harvested);
    const consumed = takeGoods(entity.inventory, GOOD_MATERIALS, harvested);

    const wealth = entity.needs.byKind[NEED_WEALTH];
    if (wealth) replenishNeed(wealth, consumed * WEALTH_PER_MATERIAL_UNIT);

    const full = wealth ? wealth.value >= wealth.max : true;
    if (full || harvested === 0) entity.intentions.queue.shift();
  }

  private runRest(entity: ActingAgent): void {
    const rest = entity.needs.byKind[NEED_REST];
    if (rest) replenishNeed(rest, REST_RECOVER_PER_TICK);
    const full = rest ? rest.value >= rest.max : true;
    if (full) entity.intentions.queue.shift();
  }
}
