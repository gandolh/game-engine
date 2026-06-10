/**
 * Farming action handlers: plant, water, till.
 * These are the core crop-growth-cycle actions performed on farm plots.
 */
import type { Intention } from "@engine/core";
import type { World } from "@engine/core";
import type { GameEntity, CropKind, PlotState } from "../../../components";
import { GROWTH_DAYS } from "../../../economy";
import { grantSkillXp } from "../../skills";
import { isWithinReach } from "../../proximity";
import { REGIONS } from "../../../world/regions";
import type { ActingFarmer } from "../types";

export function handlePlant(
  farmer: ActingFarmer,
  intent: Intention,
  ownedPlots: GameEntity[],
  day: number,
): void {
  const crop = intent.data.crop as CropKind;
  const tileX = intent.data.tileX as number | undefined;
  const tileY = intent.data.tileY as number | undefined;

  // brief (proximity) — if a specific tile was specified, guard with proximity
  // and act only on that plot. Fall back to "first empty" for backward compat.
  let free: GameEntity | undefined;
  if (tileX !== undefined && tileY !== undefined) {
    // Defensive proximity guard: skip if somehow out of reach.
    if (!isWithinReach(farmer.transform, tileX, tileY)) return;
    free = ownedPlots.find((p) => p.plot!.tileX === tileX && p.plot!.tileY === tileY && p.plot!.state.kind === "empty");
  } else {
    free = ownedPlots.find((p) => p.plot!.state.kind === "empty");
  }

  if (free && farmer.inventory.seeds[crop] > 0) {
    farmer.inventory.seeds[crop] -= 1;
    // Reset decay clock — this plot is being tended right now.
    free.plot!.state = {
      kind: "planted",
      crop,
      daysGrowing: 0,
      readyAtDay: day + GROWTH_DAYS[crop],
      weatherSum: 0,
      // brief 29 — freshly-planted soil counts as watered today.
      daysSinceWater: 0,
      wateredToday: true,
    } satisfies PlotState;
    // brief 43 — planting earns farming XP (the other half of farming is the
    // harvest grant in HarvestSystem).
    grantSkillXp(farmer, "farming", 1);
  }
}

export function handleWater(
  farmer: ActingFarmer,
  intent: Intention,
  ownedPlots: GameEntity[],
): void {
  // Watering consumes 1 charge from the watering can. If empty,
  // skip (agent should have queued a refill first).
  const can = farmer.inventory.wateringCan;
  if (can && can.charges <= 0) return;

  const tileX = intent.data.tileX as number | undefined;
  const tileY = intent.data.tileY as number | undefined;

  let target: GameEntity | undefined;
  if (tileX !== undefined && tileY !== undefined) {
    // brief (proximity) — defensive guard: skip if somehow out of reach.
    if (!isWithinReach(farmer.transform, tileX, tileY)) return;
    target = ownedPlots.find(
      (p) => p.plot!.tileX === tileX && p.plot!.tileY === tileY &&
             p.plot!.state.kind === "planted" &&
             (p.plot!.state as Extract<PlotState, { kind: "planted" }>).wateredToday !== true,
    );
  } else {
    // Legacy fallback: water the most-dry due plot (old behavior).
    target = ownedPlots
      .filter((p) => {
        const s = p.plot!.state;
        return s.kind === "planted" && s.wateredToday !== true;
      })
      .sort((a, b) => {
        const sa = a.plot!.state as Extract<PlotState, { kind: "planted" }>;
        const sb = b.plot!.state as Extract<PlotState, { kind: "planted" }>;
        return (sb.daysSinceWater ?? 0) - (sa.daysSinceWater ?? 0);
      })[0];
  }
  if (target) {
    const s = target.plot!.state as Extract<PlotState, { kind: "planted" }>;
    s.wateredToday = true;
    s.daysSinceWater = 0;
    if (can) can.charges -= 1;
  }
}

export function handleTill(
  farmer: ActingFarmer,
  intent: Intention,
  occupiedByOwner: Map<number, Set<string>>,
  world: World<GameEntity>,
): void {
  // Use hoe to create a new plot on a green farm tile.
  if (farmer.id === undefined) return;
  const hoe = (farmer.inventory.tools ?? []).find(t => t.kind === "hoe" && t.durability > 0);
  if (!hoe) return;
  const tileX = intent.data.tileX as number;
  const tileY = intent.data.tileY as number;
  // Strict proximity guard: farmer must be within 1 cell (Chebyshev) of the
  // target tile. TravelSystem moves farmers into position before acting.
  if (!isWithinReach(farmer.transform, tileX, tileY)) return;
  const occ = occupiedByOwner.get(farmer.id) ?? new Set();
  const tileKey = `${tileX},${tileY}`;
  if (occ.has(tileKey)) return; // already occupied
  // Spawn new plot entity
  world.spawn({
    transform: { x: tileX, y: tileY, prevX: tileX, prevY: tileY, rotation: 0 },
    plot: {
      ownerId: farmer.id,
      regionId: farmer.farmer?.currentRegion ?? (intent.data.regionId as string) as import("../../../world/regions").RegionId,
      tileX,
      tileY,
      state: { kind: "empty" },
    },
  });
  // Drain hoe durability
  hoe.durability -= 1;
  if (hoe.durability <= 0) {
    const idx = (farmer.inventory.tools ?? []).indexOf(hoe);
    if (idx >= 0) farmer.inventory.tools!.splice(idx, 1);
  }
  occ.add(tileKey);
  occupiedByOwner.set(farmer.id, occ);
}
