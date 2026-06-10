import type { GameEntity } from "../../components";
import { recordReason } from "../../components";
import type { PlotWaterSense } from "../../systems/plot-sense";
import { REGIONS } from "../../world/regions";
import { isWithinReach } from "../../systems/proximity";
import { nearestWaterSource, nearestTile } from "./shared";
import type { WateringStyle } from "./shared";

/**
 * Check if the watering can needs a refill and queue a refill-can intent if so.
 * Must be called BEFORE deliberateWatering so the refill lands before water actions.
 *
 * brief (proximity) — prefers traveling to the fountain TILE (so the farmer is
 * adjacent to the fountain when the refill executes). Falls back to region travel
 * if the fountain tile isn't in beliefs.
 */
export function deliberateRefillCan(farmer: GameEntity, planWaterCount: number): void {
  const can = farmer.inventory?.wateringCan;
  if (!can || !farmer.intentions || !farmer.farmer) return;
  // If we plan to water more plots than remaining charges, refill first.
  if (can.charges >= planWaterCount && can.charges !== 0) return;

  // Resolve the nearest water-source TILE (home fountain or well center).
  const sense = farmer.beliefs?.data.plotWater as PlotWaterSense | undefined;
  const fountainTile = sense?.fountainTile;

  // Compute the nearest water-source tile: home fountain tile (from beliefs if
  // available) or the nearest well/home region center (fallback).
  let nearestSourceTile: { x: number; y: number } | undefined;
  if (fountainTile) {
    nearestSourceTile = fountainTile;
  } else {
    // Fallback: use the nearest water source region center (home or well).
    const sourceRegionId = nearestWaterSource(farmer);
    if (sourceRegionId) {
      const def = REGIONS.find(r => r.id === sourceRegionId);
      if (def) nearestSourceTile = def.center;
    }
  }

  if (!nearestSourceTile) return; // no water source known — skip

  const nearSource = isWithinReach(farmer.transform, nearestSourceTile.x, nearestSourceTile.y);

  if (!nearSource) {
    // Not adjacent to any water source — travel to the fountain tile; act next cycle.
    if (!farmer.intentions.queue.some(i => i.kind === "travel" && i.data.targetTile)) {
      farmer.intentions.queue.push({
        kind: "travel",
        data: { targetTile: { x: nearestSourceTile.x, y: nearestSourceTile.y } },
        priority: -1,
      });
    }
    recordReason(farmer, `travel to refill (${can.charges}/${can.maxCharges} charges)`);
    return;
  }

  // Adjacent to a water source — queue the refill action.
  farmer.intentions.queue.push({
    kind: "refill-can",
    data: {},
    priority: 0, // same as water — survival
  });
  recordReason(farmer, `refill can (${can.charges}/${can.maxCharges} charges)`);
}

export function deliberateWatering(farmer: GameEntity, style: WateringStyle): void {
  const sense = farmer.beliefs?.data.plotWater as PlotWaterSense | undefined;
  if (!sense || sense.due <= 0) return;
  // Only water once the driest plot has reached the personality's threshold,
  // EXCEPT always water if something is one day from wilting (grace - 1).
  const urgent = sense.maxDrySoFar >= 2; // grace is 2; at 2 dry days it's last chance
  if (!urgent && sense.maxDrySoFar < style.dryThreshold) return;

  const cap = style.maxWaterPerDay ?? sense.due;
  // duePlots is sorted (tileY, tileX) for determinism.
  const duePlots = sense.duePlots ?? [];
  const candidatePlots = duePlots.slice(0, cap);

  if (candidatePlots.length === 0) return;

  const transform = farmer.transform;

  // Split into: plots the farmer can reach NOW vs the rest.
  const inReach = candidatePlots.filter(p => isWithinReach(transform, p.tileX, p.tileY));
  const outOfReach = candidatePlots.filter(p => !isWithinReach(transform, p.tileX, p.tileY));

  if (inReach.length > 0) {
    // Enqueue a water intent for every reachable due plot so the farmer waters
    // the whole cluster in one ACT pass.
    for (const p of inReach) {
      farmer.intentions!.queue.push({
        kind: "water",
        data: { tileX: p.tileX, tileY: p.tileY },
        priority: 0,
      });
    }
    // If there are still unreachable due plots, queue travel toward the nearest one.
    if (outOfReach.length > 0) {
      const nearest = nearestTile(transform, outOfReach);
      if (nearest && !farmer.intentions!.queue.some(i => i.kind === "travel" && i.data.targetTile)) {
        farmer.intentions!.queue.push({
          kind: "travel",
          data: { targetTile: { x: nearest.tileX, y: nearest.tileY } },
          priority: -1,
        });
      }
    }
  } else {
    // No due plot is within reach — travel to the nearest one; act next cycle.
    const nearest = nearestTile(transform, candidatePlots);
    if (nearest && !farmer.intentions!.queue.some(i => i.kind === "travel" && i.data.targetTile)) {
      farmer.intentions!.queue.push({
        kind: "travel",
        data: { targetTile: { x: nearest.tileX, y: nearest.tileY } },
        priority: -1,
      });
    }
  }

  const count = inReach.length > 0 ? inReach.length : 0;
  if (count > 0 || candidatePlots.length > 0) {
    recordReason(
      farmer,
      `water ${count > 0 ? count : "→travel"}${count > 1 ? " plots" : count === 1 ? " plot" : ""}${urgent ? " (wilting!)" : ""}`,
    );
  }
}
