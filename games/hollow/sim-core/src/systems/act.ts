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
 *  - "goto" (chunk hollow-14c): the day-cycle ROUTINE's bare movement
 *    intention (GATHER-phase hearth convergence, SLEEP-phase home
 *    dispersal — see agents/villager.ts's `applyRoutine`) — `stepToward`
 *    with no node/harvest side effect at all, completing the instant it
 *    arrives. See `runGoto` below.
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
import { SOCIAL_VERB_KINDS, SKILL_MATERIAL, SKILL_FOOD, SKILL_YIELD_BONUS, PRACTICE_RATE } from "../social/constants";
import { JOBS_PRODUCTION_SURPLUS_FRACTION, JOBS_FOOD_WORK_SESSION_TARGET } from "../jobs/constants";
import { CARE_ACT_KINDS } from "../mortality";

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
        case "goto":
          this.runGoto(entity as ActingAgent, intention);
          break;
        default:
          // Social verbs (chunk hollow-06a) belong to the sibling
          // HollowSocialActSystem, registered right after this system in
          // the same "ACT" stage — leave them queued (don't drop) so a
          // multi-tick verb (e.g. help_labor's travel) isn't clobbered
          // before that system finishes it. Anything ELSE unrecognized is
          // still dropped, as before, so a genuinely bad intention can't
          // stall an agent forever.
          // chunk hollow-15: the grave-digger/medic care intentions
          // (collect_corpse/bury_corpse/treat) belong to the sibling
          // HollowCareActSystem, also registered after this one in the "ACT"
          // stage — whitelist them through too, same rationale as the social
          // verbs above.
          if (!SOCIAL_VERB_KINDS.has(intention.kind) && !CARE_ACT_KINDS.has(intention.kind)) {
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
    if (!stepToward(entity.agent, node.gx, node.gy)) {
      entity.agent.currentAction = "walk"; // render-only (chunk hollow-09a)
      return;
    }

    const harvested = this.resources.harvest(node.id, FOOD_HARVEST_PER_TICK);
    addGoods(entity.inventory, GOOD_FOOD, harvested);
    const consumed = takeGoods(entity.inventory, GOOD_FOOD, harvested);
    // Render-only (chunk hollow-09a) — foraging and eating are fused into
    // this one ACT-tick, so "eat" is the coarse label for the visible
    // outcome (as opposed to "work"'s material harvest below).
    entity.agent.currentAction = "eat";

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
    if (!stepToward(entity.agent, node.gx, node.gy)) {
      entity.agent.currentAction = "walk"; // render-only (chunk hollow-09a)
      return;
    }
    entity.agent.currentAction = "work"; // render-only (chunk hollow-09a)

    // hollow-14b: a food-gatherer's fallback work choice (agents/villager.ts)
    // can target a FOOD node — a genuinely separate production path (see
    // `runWorkFood` below), since this material path's harvest-straight-to-
    // need-and-consume mechanic doesn't generalize to food (there's no
    // "food need" analog to convert into here; food need replenishment stays
    // exclusively `runSeekFood`'s job). Everything below this branch is
    // byte-identical to pre-hollow-14b behavior.
    if (node.kind === "food") {
      this.runWorkFood(entity, node.id);
      return;
    }

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

    // hollow-14b: a material-gatherer/crafter ADDITIONALLY banks a bounded
    // fraction of this tick's harvest as literal, un-consumed inventory
    // surplus, layered ON TOP of the unchanged wealth-need conversion above
    // — the production→stockpile seam the jobs feature needs (see
    // jobs/constants.ts's JOBS_PRODUCTION_SURPLUS_FRACTION header). An agent
    // with no `occupation` (or any other role) never takes this branch, so
    // its behavior/tests stay byte-identical to pre-hollow-14b.
    if (harvested > 0 && (entity.occupation?.role === "material-gatherer" || entity.occupation?.role === "crafter")) {
      addGoods(entity.inventory, GOOD_MATERIALS, harvested * JOBS_PRODUCTION_SURPLUS_FRACTION);
    }

    const full = wealth ? wealth.value >= wealth.max : true;
    if (full || harvested === 0) entity.intentions.queue.shift();
  }

  /**
   * hollow-14b's food-production path: harvests a FOOD node's stock,
   * skill-scaled by the (previously-unused — see social/constants.ts's
   * `SKILL_FOOD` header) "food" aptitude skill, and banks it as literal,
   * un-consumed inventory surplus — this agent's own hunger is NEVER
   * touched here (that stays exclusively `runSeekFood`'s job on the
   * survival ladder). Completes once the node comes up dry OR the banked
   * surplus reaches `JOBS_FOOD_WORK_SESSION_TARGET` (mirrors material
   * work's own "complete when the need is full" rule — a session must end
   * SOMEWHERE so the agent periodically re-plans instead of working one
   * node forever).
   */
  private runWorkFood(entity: ActingAgent, nodeId: number): void {
    const skillLevel = entity.skills?.byKind[SKILL_FOOD] ?? 0;
    const yieldMultiplier = 1 + SKILL_YIELD_BONUS * skillLevel;
    const harvested = this.resources.harvest(nodeId, FOOD_HARVEST_PER_TICK * yieldMultiplier);
    addGoods(entity.inventory, GOOD_FOOD, harvested);

    if (harvested > 0 && entity.skills) {
      const cap = entity.genome?.aptitude[SKILL_FOOD] ?? GENE_MAX;
      practiceSkill(entity.skills, cap, SKILL_FOOD, PRACTICE_RATE);
    }

    const banked = entity.inventory.goods[GOOD_FOOD] ?? 0;
    if (harvested === 0 || banked >= JOBS_FOOD_WORK_SESSION_TARGET) entity.intentions.queue.shift();
  }

  private runRest(entity: ActingAgent): void {
    entity.agent.currentAction = "rest"; // render-only (chunk hollow-09a)
    const rest = entity.needs.byKind[NEED_REST];
    if (rest) replenishNeed(rest, REST_RECOVER_PER_TICK);
    const full = rest ? rest.value >= rest.max : true;
    if (full) entity.intentions.queue.shift();
  }

  /**
   * hollow-14c's day-cycle ROUTINE movement — GATHER-phase convergence on
   * the hearth and SLEEP-phase dispersal to a home anchor (agents/
   * villager.ts's `applyRoutine`/`homeAnchor`) both queue this same "goto"
   * intention, a bare `stepToward` with no node/harvest side effect (unlike
   * "seek_food"/"work" above). Completes (pops) the instant it arrives —
   * `villager.ts` only ever pushes this when NOT already there, but the
   * arrival check is repeated here defensively (harmless no-op movement +
   * immediate completion if it's ever pushed already-arrived).
   */
  private runGoto(entity: ActingAgent, intention: Intention): void {
    const gx = intention.data.gx as number;
    const gy = intention.data.gy as number;
    if (!stepToward(entity.agent, gx, gy)) {
      entity.agent.currentAction = "walk"; // render-only (chunk hollow-09a)
      return;
    }
    entity.agent.currentAction = "idle"; // render-only (chunk hollow-09a) — arrived, co-presence/home
    entity.intentions.queue.shift();
  }
}
