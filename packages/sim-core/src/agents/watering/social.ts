import type { GameEntity } from "../../components";
import { recordReason, DECORATION_RECIPE, MAX_DECORATION_BOOST } from "../../components";
import type { DecorationKind, FarmDecoration } from "../../components";
import { isWithinReach } from "../../systems/proximity";
import { TAVERN_GATHER_TILE, TAVERN_VISIT_PERIOD, FESTIVAL_PODIUM_TILE } from "./shared";
import { SHRINE_REGION_ID, getRegion } from "../../world/regions";
import { SHRINE_COOLDOWN_DAYS } from "../../systems/ap";
import { sameComponent } from "../../world/connectivity";
import { RIVAL_CUTOFF } from "../../systems/rivalry";

/**
 * Combat capability flag. The combat subsystem (ChaseSystem + CombatSystem) is built
 * (build-order goal #2). When true, deliberateRivalChallenge() lets an AI begin a
 * street-fight pursuit of a rival.
 */
export const COMBAT_ENABLED = true;

/** AP a farmer keeps in reserve before it will start a fight (fighting competes with farming). */
const FIGHT_AP_RESERVE = 30;

/**
 * Fight-inclination hook. When my directional trust toward a known rival peer is below
 * the rival cutoff, begin a street-fight CHASE (one-sided — no mutual agreement). The
 * ChaseSystem pursues + issues the CHALLENGE on contact. Governors: skip if already
 * chasing, if AP is below the fight reserve (farming wins), or if the peer isn't a rival.
 * Pure reads → deterministic.
 */
export function deliberateRivalChallenge(
  farmer: GameEntity,
  peerId: number,
  tick: number,
): void {
  if (!COMBAT_ENABLED) return;
  if (!farmer.farmer || farmer.id === undefined) return;
  if (farmer.farmer.chaseTarget) return; // already pursuing someone
  const trust = farmer.trust?.byId.get(peerId) ?? 0.5;
  if (trust >= RIVAL_CUTOFF) return; // not a rival in my eyes
  // AP-reserve gate: don't pick a fight if it would starve the farming day.
  if ((farmer.ap?.current ?? 0) < FIGHT_AP_RESERVE) return;
  farmer.farmer.chaseTarget = { peerId, startTick: tick };
  recordReason(farmer, `pursue rival #${peerId} (trust ${trust.toFixed(2)})`);
}

/** Queue craft-decoration when wood is available and boost cap not reached. */
export function deliberateDecoration(
  farmer: GameEntity,
  existingDecorations: FarmDecoration[],
  priority: number,
): void {
  if (!farmer.intentions || !farmer.resources || !farmer.farmer?.homeRegion) return;

  // Check current total boost for this farmer.
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

/** Queue a village visit on day 0–1 so farmers see market prices and reach position to sell day 2. */
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

/**
 * Hire a day-helper at the tavern when AP-starved (≤40% left) AND gold above reserve + hire cost.
 * Only fires if already in the village — no special cross-map trip.
 */
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

  const HIRE_COST = 25; // mirrors HIRE_HELP_GOLD_COST in act.ts
  if (farmer.inventory.gold - HIRE_COST < reserve) return;

  if (farmer.intentions.queue.some(i => i.kind === "hire-help")) return;
  if (farmer.farmer.currentRegion !== "village") return;
  void travelPriority; // kept for call-site symmetry; hire is in-village only

  farmer.intentions.queue.push({
    kind: "hire-help",
    data: {},
    priority,
  });
  recordReason(farmer, `hire day-helper at tavern (AP ${farmer.ap.current}/${farmer.ap.max}, gold ${farmer.inventory.gold})`);
}

/**
 * Visit the shrine for a small AP top-up. Opportunist only. Gated on: off-cooldown,
 * morning/work phase, AP ≤ 55% of max, no wilting plots, same land component as the
 * shrine (skips farmers aboard a boat or stranded on a disconnected island), and not
 * currently mid-boat-trip. Commits a winning travel leg.
 * Deterministic: pure read of day / phase / AP fraction / region / plot-sense /
 * connectivity-map lookup.
 */
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
  const sense = farmer.beliefs.data.plotWater as import("../../systems/plot-sense").PlotWaterSense | undefined;
  if (sense && sense.maxDrySoFar >= 2) return;
  if (farmer.intentions.queue.some((i) => i.kind === "pray-at-shrine")) return;

  // Reachability guard: skip if aboard a boat or on a disconnected land pocket.
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

/**
 * Periodic tavern visit (every TAVERN_VISIT_PERIOD days, staggered by entity id).
 * Pure flavor; AP-free travel; morning/work phase only. Gated to the same land
 * component as the tavern and not mid-boat-trip (replaces the old "gated to the
 * village" claim — it is now gated by same-land-component + not-aboard).
 */
export function deliberateTavernGather(farmer: GameEntity, priority: number): void {
  if (!farmer.intentions || !farmer.farmer || !farmer.beliefs || !farmer.inventory) return;
  const phase = farmer.beliefs.data.phase as string | undefined;
  if (phase !== "morning" && phase !== "work") return;
  const day = (farmer.beliefs.data.currentDay as number | undefined) ?? 0;
  if (day === 0) return;
  const offset = ((farmer.id ?? 0) % TAVERN_VISIT_PERIOD);
  if (day % TAVERN_VISIT_PERIOD !== offset) return;
  if ((farmer.ap?.current ?? 0) < 40) return;
  const sense = farmer.beliefs.data.plotWater as import("../../systems/plot-sense").PlotWaterSense | undefined;
  if (sense && sense.maxDrySoFar >= 2) return;
  if (isWithinReach(farmer.transform, TAVERN_GATHER_TILE.x, TAVERN_GATHER_TILE.y)) return;
  if (farmer.intentions.queue.some((i) => i.kind === "travel" && i.data.targetTile && i.data.tavernGather)) return;

  // Reachability guard: skip if aboard a boat or on a disconnected land pocket.
  if (farmer.farmer.aboard) return;
  if (farmer.transform) {
    const fx = Math.round(farmer.transform.x);
    const fy = Math.round(farmer.transform.y);
    if (!sameComponent(fx, fy, TAVERN_GATHER_TILE.x, TAVERN_GATHER_TILE.y)) return;
  }

  farmer.intentions.queue.push({
    kind: "travel",
    data: { targetTile: { x: TAVERN_GATHER_TILE.x, y: TAVERN_GATHER_TILE.y }, tavernGather: true },
    priority,
  });
  recordReason(farmer, "visit the tavern (gathering beat)");
}

/**
 * Travel to the festival podium on a festival day (morning/work phase, AP ≥ 40, no
 * wilting). AP-free; contest judged from end-of-day inventory by FestivalSystem. Gated
 * to the same land component as the podium and not mid-boat-trip (same-land-component +
 * not-aboard guard, mirroring deliberateTavernGather).
 */
export function deliberateFestivalGather(farmer: GameEntity, priority: number): void {
  if (!farmer.intentions || !farmer.farmer || !farmer.beliefs) return;
  const festival = farmer.beliefs.data.festivalToday as
    | { name: string; contestCrop: string } | null | undefined;
  if (!festival) return;
  const phase = farmer.beliefs.data.phase as string | undefined;
  if (phase !== "morning" && phase !== "work") return;
  if ((farmer.ap?.current ?? 0) < 40) return;
  const sense = farmer.beliefs.data.plotWater as import("../../systems/plot-sense").PlotWaterSense | undefined;
  if (sense && sense.maxDrySoFar >= 2) return;
  if (isWithinReach(farmer.transform, FESTIVAL_PODIUM_TILE.x, FESTIVAL_PODIUM_TILE.y)) return;
  if (farmer.intentions.queue.some((i) => i.kind === "travel" && i.data.festivalGather)) return;

  // Reachability guard: skip if aboard a boat or on a disconnected land pocket.
  if (farmer.farmer.aboard) return;
  if (farmer.transform) {
    const fx = Math.round(farmer.transform.x);
    const fy = Math.round(farmer.transform.y);
    if (!sameComponent(fx, fy, FESTIVAL_PODIUM_TILE.x, FESTIVAL_PODIUM_TILE.y)) return;
  }

  const held = farmer.inventory?.crops[festival.contestCrop as import("../../components").CropKind] ?? 0;

  farmer.intentions.queue.push({
    kind: "travel",
    data: { targetTile: { x: FESTIVAL_PODIUM_TILE.x, y: FESTIVAL_PODIUM_TILE.y }, festivalGather: true },
    priority,
  });
  recordReason(
    farmer,
    held > 0
      ? `${festival.name}: enter ${festival.contestCrop} (holding ${held})`
      : `${festival.name}: gather at the podium`,
  );
}

/** Commission a decoration at the carpenter on a commit day (boost not maxed, wood on hand). Commits a winning carpentry-travel leg. */
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
