/**
 * "villager" — the single Hollow personality kind. Maps need pressure,
 * genome, and (chunk hollow-14c) the day-cycle ROUTINE to a prioritized
 * intention queue:
 *
 *   1. food need at/below SEEK_THRESHOLD_FRACTION → seek + consume a food node
 *   2. else rest need at/below REST_SEEK_THRESHOLD_FRACTION → rest in place
 *   3. else the day-cycle ROUTINE (chunk hollow-14c, `world/day-cycle.ts`'s
 *      `dayPhase`) gates movement:
 *        - GATHER → path toward the hearth (`world/grid.ts`'s `HEARTH_TILE`)
 *          — the dusk convergence. Once there, idle (co-presence; nothing
 *          further queued THIS phase — see `routineIntention` below).
 *        - SLEEP → disperse toward the agent's home anchor (its community's
 *          territory centroid, or its own current tile if it's a loner —
 *          see `homeAnchor`) so it doesn't sleep on the hearth. Once there,
 *          idle.
 *        - WORK / COMMUTE → no special routing here; falls through to steps
 *          4-5 below UNCHANGED (a "commute" is just the start of that same
 *          work-node pathing — see the brief's "keep simple" note).
 *   4. else a genome-driven SOCIAL VERB (chunk hollow-06b, see
 *      `agents/social-verbs.ts`) if one scores above `SOCIAL_ACTION_MIN_SCORE`
 *   5. else → work the nearest material node (produces goods → wealth), OR
 *      the nearest FOOD node if the agent's leader-assigned `occupation.role`
 *      (chunk hollow-14b, components/occupation.ts) is "food-gatherer" — see
 *      `fallbackWorkNodeKind` below.
 *
 * The survival ladder (1-2) is UNCHANGED from hollow-03/05 and always wins —
 * everything below, including the hollow-14c routine, is only even
 * consulted once neither fires (a hungry/exhausted agent ignores the
 * gathering/going-home routine entirely — survival always interrupts it).
 * Two behavior genes are wired directly into the ladder itself:
 * `industriousness` shifts the rest-seek threshold (chunk hollow-05,
 * `restSeekThreshold` below); the REST of the behavior genes (sociability/
 * risk/aggression/loyalty/greed/curiosity) drive the social-verb scoring in
 * step 4 (chunk hollow-06b) — see social-verbs.ts and
 * social/deliberation-constants.ts for the exact couplings.
 *
 * hollow-14c does NOT gate step 4/5 by phase or relationship (rare/private
 * interaction + hearth-only cross-family mixing is chunk hollow-14c-2) — the
 * existing social-verb/work behavior during WORK/COMMUTE is byte-identical
 * to pre-hollow-14c.
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
import { dayPhase, HEARTH_TILE } from "../world";
import { registerPersonality, type HollowDeliberationContext } from "./registry";
import { chooseSocialAction, type SocialAgent } from "./social-verbs";

/** Priority for the hollow-14c routine's GATHER/SLEEP movement intention
 *  ("goto") — purely documentary (see systems/act.ts: nothing sorts the
 *  queue by priority, every deliberator ever pushes at most one intention
 *  per tick), placed between the social-verb (50) and food/rest (80/100)
 *  bands so its RELATIVE ranking still reads correctly if that ever
 *  changes. */
const ROUTINE_GOTO_PRIORITY = 60;

/**
 * The agent's SLEEP-phase "go home" anchor (chunk hollow-14c): its
 * community's territory centroid if it's a member, or its own CURRENT tile
 * if it's a loner (an unaffiliated agent has nowhere to disperse TO — it
 * just stays put, per the brief's "just idle/stay (loners)" instruction).
 * Deliberately NOT a per-agent home-tile concept (the brief is explicit:
 * there is no per-agent home tile in the sim, home positions are render-only
 * — do not add heavy home-tile bookkeeping) — `Community.territory` is the
 * only "home region" concept sim-core already has.
 */
function homeAnchor(agent: HollowEntity, ctx: HollowDeliberationContext): { gx: number; gy: number } {
  const pos = agent.agent!;
  const communityId = agent.communityId ?? null;
  const community = communityId != null ? ctx.communities.get(communityId) : undefined;
  if (!community || community.territory.length === 0) {
    return { gx: pos.gx, gy: pos.gy };
  }
  let sumX = 0;
  let sumY = 0;
  for (const tile of community.territory) {
    sumX += tile.gx;
    sumY += tile.gy;
  }
  return { gx: Math.round(sumX / community.territory.length), gy: Math.round(sumY / community.territory.length) };
}

/**
 * Chunk hollow-14c's day-cycle ROUTINE gate: consulted after the survival
 * ladder (steps 1-2) and before the social-verb/work ladder (steps 4-5) —
 * see this file's header. Returns `true` if it queued a routine intention
 * (GATHER/SLEEP movement, or nothing — already there, idling) and the
 * caller should stop deliberating this tick; `false` (WORK/COMMUTE) means
 * "fall through to the unchanged social-verb/work ladder".
 */
function applyRoutine(agent: HollowEntity, ctx: HollowDeliberationContext): boolean {
  const pos = agent.agent!;
  const intentions = agent.intentions!;
  const phase = dayPhase(ctx.tick, ctx.ticksPerDay).phase;

  if (phase === "gather") {
    if (pos.gx !== HEARTH_TILE.gx || pos.gy !== HEARTH_TILE.gy) {
      intentions.queue.push({
        kind: "goto",
        data: { gx: HEARTH_TILE.gx, gy: HEARTH_TILE.gy },
        priority: ROUTINE_GOTO_PRIORITY,
      });
    }
    // else: already at the hearth — idle in place (co-presence); nothing
    // queued, so ACT does nothing and the agent just stands there this tick.
    return true;
  }

  if (phase === "sleep") {
    const anchor = homeAnchor(agent, ctx);
    if (pos.gx !== anchor.gx || pos.gy !== anchor.gy) {
      intentions.queue.push({ kind: "goto", data: { gx: anchor.gx, gy: anchor.gy }, priority: ROUTINE_GOTO_PRIORITY });
    }
    return true;
  }

  return false; // "work" | "commute" — unchanged ladder handles it
}

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

/**
 * hollow-14b: which resource-node KIND the fallback `work` step (step 4,
 * below) targets, biased by the agent's leader-assigned `occupation.role`.
 * A food-gatherer works a FOOD node (see systems/act.ts's `runWorkFood`);
 * every other role — including "unassigned" (the default before the JOBS
 * assignment pass has ever run) and a missing `occupation` altogether
 * (hand-built test harnesses) — falls back to "material", byte-identical to
 * pre-hollow-14b behavior.
 */
function fallbackWorkNodeKind(agent: HollowEntity): "food" | "material" {
  return agent.occupation?.role === "food-gatherer" ? "food" : "material";
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

  // hollow-14c: the day-cycle routine (GATHER→hearth, SLEEP→home) — only
  // consulted once the survival ladder above found nothing urgent (see this
  // file's header). Returns `true` (having queued a routine "goto", or
  // nothing if already there) for GATHER/SLEEP; `false` for WORK/COMMUTE,
  // which fall through to the unchanged social-verb/work ladder below.
  if (applyRoutine(agent, ctx)) return;

  // hollow-06b: genome-driven social-verb choice — only consulted once the
  // survival ladder above found nothing urgent (see this file's header).
  const social = tryChooseSocialAction(agent, ctx);
  if (social) {
    intentions.queue.push({ kind: social.kind, data: social.data, priority: 50 });
    return;
  }

  const workNode = ctx.resources.nearestNode(fallbackWorkNodeKind(agent), pos.gx, pos.gy);
  if (workNode) {
    intentions.queue.push({ kind: "work", data: { nodeId: workNode.id }, priority: 10 });
  }
}

registerPersonality(VILLAGER_KIND, villagerDeliberate);
