import type { GameEntity } from "../../components";
import { recordReason } from "../../components";
import type { PlotWaterSense } from "../../systems/plot-sense";
import { REGIONS } from "../../world/regions";
import { isWithinReach } from "../../systems/proximity";
import { nearestWaterSource, nearestTile } from "./shared";
import type { WateringStyle } from "./shared";

export function deliberateRefillCan(farmer: GameEntity, planWaterCount: number): void {
  const can = farmer.inventory?.wateringCan;
  if (!can || !farmer.intentions || !farmer.farmer) return;

  if (can.charges >= planWaterCount && can.charges !== 0) return;

  const sense = farmer.beliefs?.data.plotWater as PlotWaterSense | undefined;
  const fountainTile = sense?.fountainTile;

  let nearestSourceTile: { x: number; y: number } | undefined;
  if (fountainTile) {
    nearestSourceTile = fountainTile;
  } else {
    const sourceRegionId = nearestWaterSource(farmer);
    if (sourceRegionId) {
      const def = REGIONS.find(r => r.id === sourceRegionId);
      if (def) nearestSourceTile = def.center;
    }
  }

  if (!nearestSourceTile) return;

  const nearSource = isWithinReach(farmer.transform, nearestSourceTile.x, nearestSourceTile.y);

  if (!nearSource) {
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

  farmer.intentions.queue.push({
    kind: "refill-can",
    data: {},
    priority: 0,
  });
  recordReason(farmer, `refill can (${can.charges}/${can.maxCharges} charges)`);
}

export function deliberateWatering(farmer: GameEntity, style: WateringStyle): void {
  const sense = farmer.beliefs?.data.plotWater as PlotWaterSense | undefined;
  if (!sense || sense.due <= 0) return;
  const urgent = sense.maxDrySoFar >= 2; 
  if (!urgent && sense.maxDrySoFar < style.dryThreshold) return;

  const cap = style.maxWaterPerDay ?? sense.due;
  const duePlots = sense.duePlots ?? [];
  const candidatePlots = duePlots.slice(0, cap);

  if (candidatePlots.length === 0) return;

  const transform = farmer.transform;

  const inReach = candidatePlots.filter(p => isWithinReach(transform, p.tileX, p.tileY));
  const outOfReach = candidatePlots.filter(p => !isWithinReach(transform, p.tileX, p.tileY));

  if (inReach.length > 0) {
    for (const p of inReach) {
      farmer.intentions!.queue.push({
        kind: "water",
        data: { tileX: p.tileX, tileY: p.tileY },
        priority: 0,
      });
    }
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
