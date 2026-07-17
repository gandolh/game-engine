import type { GameEntity } from "../../components";
import { recordReason, DECORATION_RECIPE, MAX_DECORATION_BOOST } from "../../components";
import type { DecorationKind, FarmDecoration } from "../../components";
import { isWithinReach } from "../../systems/proximity";
import { tavernGatherTile, TAVERN_VISIT_PERIOD, festivalPodiumTile } from "./shared";
import { SHRINE_REGION_ID, getRegion } from "../../world/regions";
import { SHRINE_COOLDOWN_DAYS } from "../../systems/economy/ap";
import { sameComponent } from "../../world/connectivity";
import { RIVAL_CUTOFF } from "../../systems/rivalry";

export const COMBAT_ENABLED = true;

const FIGHT_AP_RESERVE = 30;

export function deliberateRivalChallenge(
  farmer: GameEntity,
  peerId: number,
  tick: number,
): void {
  if (!COMBAT_ENABLED) return;
  if (!farmer.farmer || farmer.id === undefined) return;
  if (farmer.farmer.chaseTarget) return; 
  const trust = farmer.trust?.byId.get(peerId) ?? 0.5;
  if (trust >= RIVAL_CUTOFF) return; 

  if ((farmer.ap?.current ?? 0) < FIGHT_AP_RESERVE) return;
  farmer.farmer.chaseTarget = { peerId, startTick: tick };
  recordReason(farmer, `pursue rival #${peerId} (trust ${trust.toFixed(2)})`);
}

export function deliberateDecoration(
  farmer: GameEntity,
  existingDecorations: FarmDecoration[],
  priority: number,
): void {
  if (!farmer.intentions || !farmer.resources || !farmer.farmer?.homeRegion) return;

  let totalBoost = 0;
  for (const d of existingDecorations) {
    if (d.ownerId === farmer.id) totalBoost += DECORATION_RECIPE[d.kind]?.yieldBoost ?? 0;
  }
  if (totalBoost >= MAX_DECORATION_BOOST) return;

  const wood = farmer.resources.wood;
  if (wood <= 0) return;

  const affordable = (Object.entries(DECORATION_RECIPE) as [DecorationKind, { woodCost: number; yieldBoost: number }][])
    .filter(([, r]) => wood >= r.woodCost)
    .sort((a, b) => b[1].yieldBoost / b[1].woodCost - a[1].yieldBoost / a[1].woodCost);

  if (affordable.length === 0) return;
  const best = affordable[0];
  if (!best) return;
  const [kind] = best;

  const inCarpentry = farmer.farmer.currentRegion === "carpentry";
  if (!inCarpentry) {
    farmer.intentions.queue.push({
      kind: "travel",
      data: { targetRegionId: "carpentry" },
      priority: priority + 1,
    });
  }
  farmer.intentions.queue.push({
    kind: "craft-decoration",
    data: { kind },
    priority,
  });
  recordReason(farmer, `craft ${kind} decoration (wood: ${wood})`);
}

export function deliberateEarlyVillageVisit(farmer: GameEntity, priority: number): void {
  if (!farmer.intentions || !farmer.farmer) return;
  const day = (farmer.beliefs?.data.currentDay as number | undefined) ?? 0;
  if (day > 1) return;
  if (farmer.farmer.currentRegion === "village") return;
  if (farmer.intentions.queue.some(i => i.kind === "travel" && i.data.targetRegionId === "village")) return;

  farmer.intentions.queue.push({
    kind: "travel",
    data: { targetRegionId: "village" },
    priority,
  });
  farmer.intentions.queue.push({
    kind: "read-offers",
    data: {},
    priority: priority + 1,
  });
  recordReason(farmer, "early village visit: scout market");
}

export function deliberateHireHelp(
  farmer: GameEntity,
  reserve: number,
  priority: number,
  travelPriority?: number,
): void {
  if (!farmer.intentions || !farmer.inventory || !farmer.farmer || !farmer.ap) return;
  const day = (farmer.beliefs?.data.currentDay as number | undefined) ?? 0;
  if (day === 0) return;
  if (farmer.farmer.helperHiredDay === day) return;

  const apFraction = farmer.ap.max > 0 ? farmer.ap.current / farmer.ap.max : 1;
  if (apFraction > 0.4) return;

  const HIRE_COST = 25; 
  if (farmer.inventory.gold - HIRE_COST < reserve) return;

  if (farmer.intentions.queue.some(i => i.kind === "hire-help")) return;
  if (farmer.farmer.currentRegion !== "village") return;
  void travelPriority; 

  farmer.intentions.queue.push({
    kind: "hire-help",
    data: {},
    priority,
  });
  recordReason(farmer, `hire day-helper at tavern (AP ${farmer.ap.current}/${farmer.ap.max}, gold ${farmer.inventory.gold})`);
}

export function deliberateShrineVisit(
  farmer: GameEntity,
  priority: number,
  travelPriority?: number,
): void {
  if (!farmer.intentions || !farmer.farmer || !farmer.ap || !farmer.beliefs) return;
  const day = (farmer.beliefs.data.currentDay as number | undefined) ?? 0;
  if (day === 0) return;
  const phase = farmer.beliefs.data.phase as string | undefined;
  if (phase !== "morning" && phase !== "work") return;
  const last = farmer.farmer.shrinePrayedDay;
  if (last !== undefined && day - last < SHRINE_COOLDOWN_DAYS) return;
  const apFraction = farmer.ap.max > 0 ? farmer.ap.current / farmer.ap.max : 1;
  if (apFraction > 0.55) return;
  const sense = farmer.beliefs.data.plotWater as import("../../systems/farming/plot-sense").PlotWaterSense | undefined;
  if (sense && sense.maxDrySoFar >= 2) return;
  if (farmer.intentions.queue.some((i) => i.kind === "pray-at-shrine")) return;

  if (farmer.farmer.aboard) return;
  if (farmer.transform) {
    const fx = Math.round(farmer.transform.x);
    const fy = Math.round(farmer.transform.y);
    const shrineCenter = getRegion(SHRINE_REGION_ID).center;
    if (!sameComponent(fx, fy, shrineCenter.x, shrineCenter.y)) return;
  }

  if (farmer.farmer.currentRegion !== SHRINE_REGION_ID) {
    const wanted = travelPriority ?? priority - 1;
    const existing = farmer.intentions.queue.find(
      (i) => i.kind === "travel" && i.data.targetRegionId === SHRINE_REGION_ID,
    );
    if (existing) {
      if (wanted < existing.priority) existing.priority = wanted;
    } else {
      farmer.intentions.queue.push({
        kind: "travel",
        data: { targetRegionId: SHRINE_REGION_ID },
        priority: wanted,
      });
    }
  }
  farmer.intentions.queue.push({
    kind: "pray-at-shrine",
    data: {},
    priority,
  });
  recordReason(farmer, `pray at shrine (AP ${farmer.ap.current}/${farmer.ap.max})`);
}

export function deliberateTavernGather(farmer: GameEntity, priority: number): void {
  if (!farmer.intentions || !farmer.farmer || !farmer.beliefs || !farmer.inventory) return;
  const phase = farmer.beliefs.data.phase as string | undefined;
  if (phase !== "morning" && phase !== "work") return;
  const day = (farmer.beliefs.data.currentDay as number | undefined) ?? 0;
  if (day === 0) return;
  const offset = ((farmer.id ?? 0) % TAVERN_VISIT_PERIOD);
  if (day % TAVERN_VISIT_PERIOD !== offset) return;
  if ((farmer.ap?.current ?? 0) < 40) return;
  const sense = farmer.beliefs.data.plotWater as import("../../systems/farming/plot-sense").PlotWaterSense | undefined;
  if (sense && sense.maxDrySoFar >= 2) return;
  const tavern = tavernGatherTile();
  if (isWithinReach(farmer.transform, tavern.x, tavern.y)) return;
  if (farmer.intentions.queue.some((i) => i.kind === "travel" && i.data.targetTile && i.data.tavernGather)) return;

  if (farmer.farmer.aboard) return;
  if (farmer.transform) {
    const fx = Math.round(farmer.transform.x);
    const fy = Math.round(farmer.transform.y);
    if (!sameComponent(fx, fy, tavern.x, tavern.y)) return;
  }

  farmer.intentions.queue.push({
    kind: "travel",
    data: { targetTile: { x: tavern.x, y: tavern.y }, tavernGather: true },
    priority,
  });
  recordReason(farmer, "visit the tavern (gathering beat)");
}

/**
 * Front-of-queue priority for festival attendance (2026-07-16 brief:
 * festival-day priority bump). Stays at the SAME -2 "front" tier as tavern
 * gather / harbor / greenhouse / pen travelPriority / deliberateSkilledNonFarm's
 * FRONT — `Array.prototype.sort` is stable, so among ties whichever intent was
 * PUSHED FIRST in the personality file's call order wins the queue-front slot.
 * That tie was the measured root cause of thin festival gatherings: on a
 * farmer's tavern-visit day, the tavern push (called just before festival in
 * every personality file) silently won the front slot every time. The fix is
 * ordering, not a lower number: every personality file now calls
 * `deliberateFestivalGather` BEFORE `deliberateTavernGather`, so festival wins
 * that specific tie.
 *
 * Deliberately did NOT go lower (e.g. -3, which would also out-rank
 * `deliberateSkilledNonFarm`'s FRONT=-2 fishing/coral/forage excursions) — a
 * flat "beats everything" bump measurably regressed
 * `coral-fishing.integration.test.ts` (a day-13 festival collision starved the
 * only coral trip that clears its 30-day window). Skilled excursions are
 * committed, high-value trips (see skilled.ts), not the "marginal chores" this
 * brief targets — tavern is the correct (and sufficient, per the measured
 * cause) target for the tie-break.
 */
export const FESTIVAL_FRONT_PRIORITY = -2;

/**
 * Per-personality festival temperament — a purely social knob, deliberately
 * NOT routed through skill-valuation.ts's economic g/AP model (this is not an
 * economic decision):
 * - `dryTolerance`: how much crop neglect (consecutive unwatered days) a
 *   farmer accepts before abandoning the festival for urgent watering.
 * - `staysEvening`: whether the farmer lingers at the podium into the evening
 *   phase (see `isLingeringAtFestival`) or heads home once evening starts —
 *   the "social personalities... stay longer" half of the brief.
 * The front-of-queue bump itself (`FESTIVAL_FRONT_PRIORITY`) is uniform — the
 * brief calls for a baseline that applies to everyone, with personality
 * flavor as a welcome extra, not a substitute.
 */
export const FESTIVAL_TEMPERAMENT: Record<string, { dryTolerance: number; staysEvening: boolean }> = {
  conservative: { dryTolerance: 2, staysEvening: false },
  hoarder: { dryTolerance: 2, staysEvening: false },
  aggressive: { dryTolerance: 3, staysEvening: true },
  opportunist: { dryTolerance: 3, staysEvening: true },
};
const DEFAULT_FESTIVAL_TEMPERAMENT = { dryTolerance: 2, staysEvening: false };

function festivalTemperament(farmer: GameEntity): { dryTolerance: number; staysEvening: boolean } {
  return FESTIVAL_TEMPERAMENT[farmer.personality?.kind ?? ""] ?? DEFAULT_FESTIVAL_TEMPERAMENT;
}

/**
 * True while a farmer should linger at the festival podium rather than being
 * pulled home for the night by `deliberateSleep` (misc.ts).
 *
 * Root cause this covers: `deliberateFestivalGather` only pushes a NEW travel
 * intent while the farmer is NOT yet at the podium — once arrived, it's a
 * no-op every re-deliberation (correctly; there's nothing further to queue).
 * But `deliberateSleep` fires on ANY idle re-deliberation during "work" or
 * "evening" phase and unconditionally pulls a farmer who isn't home back
 * toward `homeRegion`. Since re-deliberation happens virtually every idle
 * tick (see PerceiveSystem's WAIT_DAY→PERCEIVE flip), an arrived farmer was
 * evicted the SAME tick they arrived (or the moment evening phase began) —
 * the gathering was never actually visible. `deliberateSleep` calls this
 * before queuing "head home" and skips if it returns true.
 *
 * Multi-day (FESTIVAL_DAYS, 2026-07-17): `festivalToday` is written every day of
 * the window, so this returns true on day 2 as well — a farmer who reached the
 * plaza (typically by travelling in on day 1) keeps celebrating there rather
 * than being pulled home, honouring the same per-personality evening flavour.
 */
export function isLingeringAtFestival(farmer: GameEntity): boolean {
  if (!farmer.beliefs || !farmer.transform) return false;
  const festival = farmer.beliefs.data.festivalToday as
    | { name: string; contestCrop: string } | null | undefined;
  if (!festival) return false;
  const phase = farmer.beliefs.data.phase as string | undefined;
  if (phase === "evening" && !festivalTemperament(farmer).staysEvening) return false;
  if (phase !== "work" && phase !== "evening") return false;
  const podium = festivalPodiumTile();
  return isWithinReach(farmer.transform, podium.x, podium.y);
}

export function deliberateFestivalGather(farmer: GameEntity, priority: number): void {
  if (!farmer.intentions || !farmer.farmer || !farmer.beliefs) return;
  const festival = farmer.beliefs.data.festivalToday as
    | { name: string; contestCrop: string } | null | undefined;
  if (!festival) return;
  const phase = farmer.beliefs.data.phase as string | undefined;
  if (phase !== "morning" && phase !== "work") return;
  // NO AP gate here (deliberately removed — was `ap.current < 40`): travel
  // itself costs 0 AP (see AP_COST.travel), so requiring 40 AP of spare
  // capacity was a copy-paste of deliberateTavernGather's "is this luxury
  // worth it" heuristic, wrongly applied to a free trip. AP is spent down by
  // chores over the course of the day, so that gate was silently excluding
  // any farmer whose morning chores had already dropped them below 40 AP by
  // the time they reconsidered attending — the other measured cause of thin
  // gatherings (see probe-festival.ts).
  const dryTolerance = festivalTemperament(farmer).dryTolerance;
  const sense = farmer.beliefs.data.plotWater as import("../../systems/farming/plot-sense").PlotWaterSense | undefined;
  if (sense && sense.maxDrySoFar >= dryTolerance) return;
  const podium = festivalPodiumTile();
  if (isWithinReach(farmer.transform, podium.x, podium.y)) return;
  if (farmer.intentions.queue.some((i) => i.kind === "travel" && i.data.festivalGather)) return;

  if (farmer.farmer.aboard) return;
  if (farmer.transform) {
    const fx = Math.round(farmer.transform.x);
    const fy = Math.round(farmer.transform.y);
    if (!sameComponent(fx, fy, podium.x, podium.y)) return;
  }

  const held = farmer.inventory?.crops[festival.contestCrop as import("../../components").CropKind] ?? 0;

  farmer.intentions.queue.push({
    kind: "travel",
    data: { targetTile: { x: podium.x, y: podium.y }, festivalGather: true },
    priority,
  });
  recordReason(
    farmer,
    held > 0
      ? `${festival.name}: enter ${festival.contestCrop} (holding ${held})`
      : `${festival.name}: gather at the podium`,
  );
}

export function deliberateCommissionBuild(
  farmer: GameEntity,
  existingDecorations: FarmDecoration[],
  priority: number,
  travelPriority?: number,
): void {
  if (!farmer.intentions || !farmer.resources || !farmer.farmer?.homeRegion) return;

  let totalBoost = 0;
  for (const d of existingDecorations) {
    if (d.ownerId === farmer.id) totalBoost += DECORATION_RECIPE[d.kind]?.yieldBoost ?? 0;
  }
  if (totalBoost >= MAX_DECORATION_BOOST) return;

  const wood = farmer.resources.wood;
  if (wood <= 0) return;

  const affordable = (Object.entries(DECORATION_RECIPE) as [DecorationKind, { woodCost: number; yieldBoost: number }][])
    .filter(([, r]) => wood >= r.woodCost)
    .sort((a, b) => b[1].yieldBoost / b[1].woodCost - a[1].yieldBoost / a[1].woodCost);
  if (affordable.length === 0) return;
  const best = affordable[0];
  if (!best) return;
  const [kind] = best;

  if (farmer.intentions.queue.some(i => i.kind === "commission-build")) return;

  const inCarpentry = farmer.farmer.currentRegion === "carpentry";
  if (!inCarpentry) {
    const wanted = travelPriority ?? priority + 1;
    const existing = farmer.intentions.queue.find(i => i.kind === "travel" && i.data.targetRegionId === "carpentry");
    if (existing) {
      if (wanted < existing.priority) existing.priority = wanted;
    } else {
      farmer.intentions.queue.push({
        kind: "travel",
        data: { targetRegionId: "carpentry" },
        priority: wanted,
      });
    }
  }
  farmer.intentions.queue.push({
    kind: "commission-build",
    data: { kind },
    priority,
  });
  recordReason(farmer, `commission ${kind} at carpenter (wood: ${wood})`);
}
