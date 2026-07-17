/**
 * "villager" — the single Hollow personality kind for chunk hollow-03.
 * Maps need pressure straight to a prioritized intention queue:
 *
 *   1. food need at/below SEEK_THRESHOLD_FRACTION → seek + consume a food node
 *   2. else rest need at/below REST_SEEK_THRESHOLD_FRACTION → rest in place
 *   3. else → work the nearest material node (produces goods → wealth)
 *
 * No social/antagonistic verbs (hollow-06) and no genome-driven variety
 * beyond the per-agent decay-rate jitter applied at seeding time
 * (population.ts) — every agent runs this same, simple priority ladder.
 */
import { needFraction } from "@engine/core/agent";
import type { HollowEntity } from "../components";
import {
  NEED_FOOD,
  NEED_REST,
  SEEK_THRESHOLD_FRACTION,
  REST_SEEK_THRESHOLD_FRACTION,
} from "../economy";
import { registerPersonality, type HollowDeliberationContext } from "./registry";

export const VILLAGER_KIND = "villager";

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
  if (rest && needFraction(rest) <= REST_SEEK_THRESHOLD_FRACTION) {
    intentions.queue.push({ kind: "rest", data: {}, priority: 80 });
    return;
  }

  const workNode = ctx.resources.nearestNode("material", pos.gx, pos.gy);
  if (workNode) {
    intentions.queue.push({ kind: "work", data: { nodeId: workNode.id }, priority: 10 });
  }
}

registerPersonality(VILLAGER_KIND, villagerDeliberate);
