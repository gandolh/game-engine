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
 * "work"'s material yield is scaled by the agent's `material` SKILL LEVEL
 * (chunk hollow-06a, components/skills.ts) — see `SKILL_YIELD_BONUS`'s
 * derivation in social/constants.ts — and a successful (non-dry) work tick
 * practices that skill toward its heritable aptitude CAP
 * (`genome.aptitude["material"]`). Food harvest is deliberately left
 * unaffected (see social/constants.ts's header for why). Social verbs
 * (gift/share/help_labor/teach/trade/steal/sabotage/rumor/attack — chunk
 * hollow-06a) are NOT handled here: they're a sibling system,
 * `HollowSocialActSystem` (social/act-system.ts), registered in the same
 * "ACT" stage right after this one. This system's `default` case below
 * whitelists their kinds through untouched (rather than dropping them as
 * "unrecognized") so a multi-tick social verb isn't clobbered before that
 * system gets to finish it.
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
import { addGoods, takeGoods, GENE_MAX, practiceSkill } from "../components";
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
import { SOCIAL_VERB_KINDS, SKILL_MATERIAL, SKILL_YIELD_BONUS, PRACTICE_RATE } from "../social/constants";

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
          // Social verbs (chunk hollow-06a) belong to the sibling
          // HollowSocialActSystem, registered right after this system in
          // the same "ACT" stage — leave them queued (don't drop) so a
          // multi-tick verb (e.g. help_labor's travel) isn't clobbered
          // before that system finishes it. Anything ELSE unrecognized is
          // still dropped, as before, so a genuinely bad intention can't
          // stall an agent forever.
          if (!SOCIAL_VERB_KINDS.has(intention.kind)) {
            entity.intentions.queue.shift();
          }
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

    // Skill-scaled yield (chunk hollow-06a) — see this file's header and
    // social/constants.ts's SKILL_YIELD_BONUS derivation. Food harvest
    // (runSeekFood, above) is deliberately NOT given this treatment.
    const skillLevel = entity.skills?.byKind[SKILL_MATERIAL] ?? 0;
    const yieldMultiplier = 1 + SKILL_YIELD_BONUS * skillLevel;
    const harvested = this.resources.harvest(node.id, MATERIAL_HARVEST_PER_TICK * yieldMultiplier);
    addGoods(entity.inventory, GOOD_MATERIALS, harvested);
    const consumed = takeGoods(entity.inventory, GOOD_MATERIALS, harvested);

    const wealth = entity.needs.byKind[NEED_WEALTH];
    if (wealth) replenishNeed(wealth, consumed * WEALTH_PER_MATERIAL_UNIT);

    // Practice: a successful (non-dry) work tick nudges the skill toward
    // its heritable aptitude cap (GENE_MAX if no genome — defensive for
    // hand-built test harnesses).
    if (harvested > 0 && entity.skills) {
      const cap = entity.genome?.aptitude[SKILL_MATERIAL] ?? GENE_MAX;
      practiceSkill(entity.skills, cap, SKILL_MATERIAL, PRACTICE_RATE);
    }

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
