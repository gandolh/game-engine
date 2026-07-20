/**
 * "villager" — the single Hollow personality kind for chunk hollow-03.
 * Maps need pressure straight to a prioritized intention queue:
 *
 *   1. food need at/below SEEK_THRESHOLD_FRACTION → seek + consume a food node
 *   2. else rest need at/below REST_SEEK_THRESHOLD_FRACTION → rest in place
 *   3. else → work the nearest material node (produces goods → wealth)
 *
 * No social/antagonistic verbs (hollow-06). One behavior gene IS wired in
 * (chunk hollow-05, "genome must not be dead data"): `industriousness`
 * shifts the effective rest-seek threshold — see `restSeekThreshold` below.
 * Every other genome effect is left for later briefs.
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

  const workNode = ctx.resources.nearestNode("material", pos.gx, pos.gy);
  if (workNode) {
    intentions.queue.push({ kind: "work", data: { nodeId: workNode.id }, priority: 10 });
  }
}

registerPersonality(VILLAGER_KIND, villagerDeliberate);
