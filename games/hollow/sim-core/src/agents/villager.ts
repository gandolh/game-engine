/**
 * "villager" — the single Hollow personality kind. Maps need pressure and
 * genome to a prioritized intention queue:
 *
 *   1. food need at/below SEEK_THRESHOLD_FRACTION → seek + consume a food node
 *   2. else rest need at/below REST_SEEK_THRESHOLD_FRACTION → rest in place
 *   3. else a genome-driven SOCIAL VERB (chunk hollow-06b, see
 *      `agents/social-verbs.ts`) if one scores above `SOCIAL_ACTION_MIN_SCORE`
 *   4. else → work the nearest material node (produces goods → wealth)
 *
 * The survival ladder (1-2) is UNCHANGED from hollow-03/05 and always wins —
 * social choice is only even consulted once neither fires. Two behavior
 * genes are wired directly into the ladder itself: `industriousness` shifts
 * the rest-seek threshold (chunk hollow-05, `restSeekThreshold` below); the
 * REST of the behavior genes (sociability/risk/aggression/loyalty/greed/
 * curiosity) drive the social-verb scoring in step 3 (chunk hollow-06b) —
 * see social-verbs.ts and social/deliberation-constants.ts for the exact
 * couplings.
 */
import { needFraction } from "@engine/core/agent";
import type { HollowEntity } from "../components";
import {
  NEED_FOOD,
  NEED_REST,
  SEEK_THRESHOLD_FRACTION,
  REST_SEEK_THRESHOLD_FRACTION,
} from "../economy";
import { INDUSTRIOUSNESS_REST_INFLUENCE } from "../family/constants";
import { registerPersonality, type HollowDeliberationContext } from "./registry";
import { chooseSocialAction, type SocialAgent } from "./social-verbs";

export const VILLAGER_KIND = "villager";

/**
 * The rest-seek threshold, shifted by the agent's `industriousness`
 * behavior gene (chunk hollow-05, family/constants.ts's
 * `INDUSTRIOUSNESS_REST_INFLUENCE`): a highly industrious agent (gene near
 * 1) tolerates a LOWER rest need before working on; a lazy agent (gene near
 * 0) seeks rest SOONER. Defensive for agents without a genome (e.g.
 * hand-built test harnesses) — falls back to the un-shifted baseline.
 */
function restSeekThreshold(agent: HollowEntity): number {
  const industriousness = agent.genome?.behavior["industriousness"];
  if (industriousness === undefined) return REST_SEEK_THRESHOLD_FRACTION;
  const factor = 1 - (industriousness - 0.5) * INDUSTRIOUSNESS_REST_INFLUENCE;
  return Math.max(0, Math.min(1, REST_SEEK_THRESHOLD_FRACTION * factor));
}

/**
 * Narrows a plain `HollowEntity` to `social-verbs.ts`'s `SocialAgent` shape
 * and runs `chooseSocialAction`, or returns `null` if the agent is missing
 * any hollow-06 component (genome/relationships/skills/inventory/id) — the
 * same defensive fallback convention as `restSeekThreshold` above, so a
 * hand-built test harness that predates hollow-06 still gets the pure
 * survival+work ladder instead of throwing.
 */
function tryChooseSocialAction(
  agent: HollowEntity,
  ctx: HollowDeliberationContext,
): ReturnType<typeof chooseSocialAction> {
  if (
    agent.id === undefined ||
    !agent.agent ||
    !agent.needs ||
    !agent.inventory ||
    !agent.genome ||
    !agent.relationships ||
    !agent.skills
  ) {
    return null;
  }
  return chooseSocialAction(agent as SocialAgent, ctx);
}

function villagerDeliberate(agent: HollowEntity, ctx: HollowDeliberationContext): void {
  const needs = agent.needs;
  const pos = agent.agent;
  const intentions = agent.intentions;
  if (!needs || !pos || !intentions) return;

  intentions.queue.length = 0;

  const food = needs.byKind[NEED_FOOD];
  if (food && needFraction(food) <= SEEK_THRESHOLD_FRACTION) {
    const node = ctx.resources.nearestNode("food", pos.gx, pos.gy);
    if (node) {
      intentions.queue.push({ kind: "seek_food", data: { nodeId: node.id }, priority: 100 });
      return;
    }
  }

  const rest = needs.byKind[NEED_REST];
  if (rest && needFraction(rest) <= restSeekThreshold(agent)) {
    intentions.queue.push({ kind: "rest", data: {}, priority: 80 });
    return;
  }

  // hollow-06b: genome-driven social-verb choice — only consulted once the
  // survival ladder above found nothing urgent (see this file's header).
  const social = tryChooseSocialAction(agent, ctx);
  if (social) {
    intentions.queue.push({ kind: social.kind, data: social.data, priority: 50 });
    return;
  }

  const workNode = ctx.resources.nearestNode("material", pos.gx, pos.gy);
  if (workNode) {
    intentions.queue.push({ kind: "work", data: { nodeId: workNode.id }, priority: 10 });
  }
}

registerPersonality(VILLAGER_KIND, villagerDeliberate);
