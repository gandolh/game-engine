/**
 * "villager" — the single Hollow personality kind. Maps need pressure,
 * genome, and the day-cycle ROUTINE (chunk hollow-14c, re-textured by
 * hollow-14c-2's rare/private throttle) to a prioritized intention queue:
 *
 *   1. food need at/below SEEK_THRESHOLD_FRACTION → seek + consume a food node
 *   2. else rest need at/below REST_SEEK_THRESHOLD_FRACTION → rest in place
 *   3. else the day-cycle ROUTINE (`world/day-cycle.ts`'s `dayPhase`) branches
 *      by phase:
 *        - GATHER → path toward the hearth (`world/grid.ts`'s `HEARTH_TILE`)
 *          — the dusk convergence. Once there (arrived, nothing left to path
 *          toward), this is the town's ONE PUBLIC social window (chunk
 *          hollow-14c-2): an UNRESTRICTED (cross-family) social-verb attempt,
 *          still gated by the per-agent cooldown (below) — see step 4. If no
 *          verb fires, idle (nothing else queued this phase).
 *        - SLEEP → disperse toward the agent's home anchor (its community's
 *          territory centroid, or its own current tile if it's a loner —
 *          see `homeAnchor`) so it doesn't sleep on the hearth. Once there, a
 *          RESTRICTED (household/close-tie only) social-verb attempt, same
 *          cooldown gate — a quiet exchange before turning in, per the
 *          brief's "rare, private" instruction covering every phase but
 *          GATHER. If no verb fires, idle.
 *        - WORK / COMMUTE → a RESTRICTED social-verb attempt (same gate),
 *          falling back to work (step 5) if nothing fires — this is the
 *          brief's "day-to-day cooperation is rare and private" case: most
 *          of the day, most attempts are suppressed by the household/
 *          close-tie candidate filter and the cooldown, so the bulk of what
 *          used to be constant public helping simply doesn't fire anymore.
 *   4. RESTRICTED vs UNRESTRICTED social-verb attempt (chunk hollow-06b,
 *      `agents/social-verbs.ts`'s `chooseSocialAction`), gated by BOTH:
 *        - the per-agent cooldown (`SOCIAL_COOLDOWN_TICKS`,
 *          `HollowAgent.lastSocialActTick`) — an agent may INITIATE at most
 *          one social verb per that many ticks, tick arithmetic only, no
 *          `Rng` (chunk hollow-14c-2);
 *        - the day-phase gate above: GATHER passes `restrictToCloseTies:
 *          false` (the public window); WORK/COMMUTE/SLEEP pass `true` (the
 *          candidate set is filtered to household-mates + high-trust close
 *          ties — see social-verbs.ts's `isCloseTie`).
 *      Only fires if the winning verb also clears `SOCIAL_ACTION_MIN_SCORE`.
 *   5. else (WORK/COMMUTE only) → work the nearest material node (produces
 *      goods → wealth), OR the nearest FOOD node if the agent's
 *      leader-assigned `occupation.role` (chunk hollow-14b,
 *      components/occupation.ts) is "food-gatherer" — see
 *      `fallbackWorkNodeKind` below. GATHER/SLEEP never fall through to work
 *      — an agent that skips its one social roll there just idles in place
 *      (still AT the hearth/home), not wander off to a work node.
 *
 * The survival ladder (1-2) is UNCHANGED from hollow-03/05 and always wins —
 * everything below is only even consulted once neither fires (a hungry/
 * exhausted agent ignores the routine/social/work ladder entirely — survival
 * always interrupts it). Two behavior genes are wired directly into the
 * ladder itself: `industriousness` shifts the rest-seek threshold (chunk
 * hollow-05, `restSeekThreshold` below); the REST of the behavior genes
 * (sociability/risk/aggression/loyalty/greed/curiosity) drive the
 * social-verb scoring in step 4 (chunk hollow-06b) — see social-verbs.ts and
 * social/deliberation-constants.ts for the exact couplings.
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
import { SOCIAL_COOLDOWN_TICKS } from "../social/deliberation-constants";
import { dayPhase, HEARTH_TILE, GRAVEYARD_TILE } from "../world";
import { medicTreatsRemaining } from "../mortality";
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
 * Chunk hollow-14c-2's per-agent social-verb cooldown gate: `true` when the
 * agent is free to even ATTEMPT a social verb this tick — either it has
 * never initiated one (`lastSocialActTick === undefined`) or at least
 * `SOCIAL_COOLDOWN_TICKS` have elapsed since its last initiation. Pure tick
 * arithmetic (no `Rng`) over `HollowAgent.lastSocialActTick`
 * (components/agent.ts). Defensive `agent.agent` narrowing mirrors this
 * file's other helpers (a caller always has `pos` narrowed already, but this
 * is also called from `tryQueueSocialAction` below which re-checks).
 */
function offSocialCooldown(agent: HollowEntity, ctx: HollowDeliberationContext): boolean {
  const last = agent.agent?.lastSocialActTick;
  return last === undefined || ctx.tick - last >= SOCIAL_COOLDOWN_TICKS;
}

/**
 * Attempts ONE social-verb intention this tick, gated by BOTH the cooldown
 * above and `restrictToCloseTies` (chunk hollow-14c-2 — see this file's
 * header and social-verbs.ts's `ChooseSocialActionOptions`). On success,
 * queues the verb's intention AND stamps `lastSocialActTick` (marking the
 * cooldown from the moment of INITIATION, not consummation — see
 * components/agent.ts's field doc) before returning `true`; the caller
 * should stop deliberating this tick. Returns `false` (nothing queued, no
 * cooldown stamped) if the agent is on cooldown, is missing a hollow-06
 * component (see `tryChooseSocialAction`), or no verb clears
 * `SOCIAL_ACTION_MIN_SCORE` under the given restriction.
 */
function tryQueueSocialAction(
  agent: HollowEntity,
  ctx: HollowDeliberationContext,
  restrictToCloseTies: boolean,
): boolean {
  if (!offSocialCooldown(agent, ctx)) return false;
  const social = tryChooseSocialAction(agent, ctx, restrictToCloseTies);
  if (!social) return false;
  agent.intentions!.queue.push({ kind: social.kind, data: social.data, priority: 50 });
  agent.agent!.lastSocialActTick = ctx.tick;
  return true;
}

/**
 * Chunk hollow-14c's day-cycle ROUTINE for the GATHER/SLEEP phases,
 * reworked by hollow-14c-2 to also drive the social-verb attempt once the
 * agent has ARRIVED — see this file's header for the full step-3/4
 * narrative. Consulted after the survival ladder (steps 1-2); always
 * returns `true` for these two phases (WORK/COMMUTE never call this — see
 * `villagerDeliberate` below), having queued EITHER the routine "goto" (still
 * traveling), a social-verb intention (arrived, a roll succeeded), or
 * nothing at all (arrived, idling — no verb fired, and GATHER/SLEEP never
 * fall back to `work`).
 */
function applyGatherOrSleepRoutine(agent: HollowEntity, ctx: HollowDeliberationContext, phase: "gather" | "sleep"): true {
  const pos = agent.agent!;
  const intentions = agent.intentions!;
  const target = phase === "gather" ? HEARTH_TILE : homeAnchor(agent, ctx);

  if (pos.gx !== target.gx || pos.gy !== target.gy) {
    intentions.queue.push({ kind: "goto", data: { gx: target.gx, gy: target.gy }, priority: ROUTINE_GOTO_PRIORITY });
    return true;
  }

  // Arrived. GATHER is the town's one PUBLIC social window (unrestricted
  // candidates); SLEEP stays restricted to household/close ties like every
  // other non-GATHER phase (the brief's "rare, private" rule covers it too).
  // Either way: no `work` fallback here — a missed roll just means idling in
  // place (still at the hearth/home), not wandering off to a work node.
  tryQueueSocialAction(agent, ctx, /* restrictToCloseTies */ phase !== "gather");
  return true;
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
  restrictToCloseTies: boolean,
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
  return chooseSocialAction(agent as SocialAgent, ctx, { restrictToCloseTies });
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

/** Priority for the care-verb intentions (chunk hollow-15) — documentary only
 *  (nothing sorts the queue; a deliberator pushes at most one intention per
 *  tick), placed just below the routine "goto" band. */
const CARE_ACT_PRIORITY = 40;

function chebyshev(ax: number, ay: number, bx: number, by: number): number {
  return Math.max(Math.abs(ax - bx), Math.abs(ay - by));
}

/**
 * chunk hollow-15 grave-digger routine (WORK/COMMUTE only). If carrying a
 * body → head to the graveyard, bury on arrival. Otherwise → head to the
 * nearest unburied, un-carried corpse (`ctx.corpses`, ascending-id tie-break),
 * collect it on arrival. Returns `false` (nothing queued) only when there is
 * NOTHING to do — no body carried and no corpse anywhere — so the caller falls
 * through to ordinary work; otherwise returns `true` (queued a goto or a care
 * verb).
 */
function applyGraveDiggerRoutine(agent: HollowEntity, ctx: HollowDeliberationContext): boolean {
  const pos = agent.agent!;
  const intentions = agent.intentions!;

  if (pos.carryingCorpseId != null) {
    if (pos.gx !== GRAVEYARD_TILE.gx || pos.gy !== GRAVEYARD_TILE.gy) {
      intentions.queue.push({ kind: "goto", data: { gx: GRAVEYARD_TILE.gx, gy: GRAVEYARD_TILE.gy }, priority: ROUTINE_GOTO_PRIORITY });
    } else {
      intentions.queue.push({ kind: "bury_corpse", data: {}, priority: CARE_ACT_PRIORITY });
    }
    return true;
  }

  let target: { id: number; gx: number; gy: number } | null = null;
  let bestDist = Infinity;
  for (const corpse of ctx.corpses) {
    const d = chebyshev(pos.gx, pos.gy, corpse.gx, corpse.gy);
    if (d < bestDist) {
      bestDist = d;
      target = corpse;
    }
  }
  if (!target) return false; // no bodies to bury — fall through to normal work

  if (pos.gx !== target.gx || pos.gy !== target.gy) {
    intentions.queue.push({ kind: "goto", data: { gx: target.gx, gy: target.gy }, priority: ROUTINE_GOTO_PRIORITY });
  } else {
    intentions.queue.push({ kind: "collect_corpse", data: { corpseId: target.id }, priority: CARE_ACT_PRIORITY });
  }
  return true;
}

/**
 * chunk hollow-15 medic routine (WORK/COMMUTE only). If any daily treatment
 * budget is left, head to the nearest sick+untreated agent (`ctx.sick`) and
 * treat it once adjacent. Returns `false` (nothing queued) when out of daily
 * budget or there is no untreated patient — so the caller falls through to
 * ordinary work; otherwise `true`.
 */
function applyMedicRoutine(agent: HollowEntity, ctx: HollowDeliberationContext): boolean {
  const pos = agent.agent!;
  const intentions = agent.intentions!;
  const dayOfRun = dayPhase(ctx.tick, ctx.ticksPerDay).dayOfRun;
  if (medicTreatsRemaining(agent, dayOfRun, ctx.medicMaxTreatmentsPerDay) <= 0) return false;

  let target: { id: number; gx: number; gy: number } | null = null;
  let bestDist = Infinity;
  for (const patient of ctx.sick) {
    const d = chebyshev(pos.gx, pos.gy, patient.gx, patient.gy);
    if (d < bestDist) {
      bestDist = d;
      target = patient;
    }
  }
  if (!target) return false; // no untreated patients — fall through to normal work

  if (bestDist > 1) {
    intentions.queue.push({ kind: "goto", data: { gx: target.gx, gy: target.gy }, priority: ROUTINE_GOTO_PRIORITY });
  } else {
    intentions.queue.push({ kind: "treat", data: { patientId: target.id }, priority: CARE_ACT_PRIORITY });
  }
  return true;
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

  // The day-cycle routine (chunk hollow-14c, reworked hollow-14c-2) — only
  // consulted once the survival ladder above found nothing urgent (see this
  // file's header). GATHER/SLEEP: path to the hearth/home, then (arrived) at
  // most one social-verb roll — public/unrestricted at the hearth, private/
  // restricted at home — never falling back to `work`.
  const phase = dayPhase(ctx.tick, ctx.ticksPerDay).phase;
  if (phase === "gather" || phase === "sleep") {
    applyGatherOrSleepRoutine(agent, ctx, phase);
    return;
  }

  // WORK / COMMUTE — chunk hollow-15: a grave-digger/medic does its care duty
  // here (their "job", same slot ordinary roles work a node in). Each routine
  // returns false when there's nothing to do (no bodies / no patients / out of
  // daily budget), falling through to the ordinary social+work ladder below so
  // an idle care worker still contributes.
  const role = agent.occupation?.role;
  if (role === "grave-digger" && applyGraveDiggerRoutine(agent, ctx)) return;
  if (role === "medic" && applyMedicRoutine(agent, ctx)) return;

  // WORK / COMMUTE: chunk hollow-14c-2's "rare, private" rule — a RESTRICTED
  // (household/close-tie-only) social-verb attempt, gated by the same
  // cooldown, falling back to `work` (unchanged from hollow-03/14b) if
  // nothing fires.
  if (tryQueueSocialAction(agent, ctx, /* restrictToCloseTies */ true)) return;

  const workNode = ctx.resources.nearestNode(fallbackWorkNodeKind(agent), pos.gx, pos.gy);
  if (workNode) {
    intentions.queue.push({ kind: "work", data: { nodeId: workNode.id }, priority: 10 });
  }
}

registerPersonality(VILLAGER_KIND, villagerDeliberate);
