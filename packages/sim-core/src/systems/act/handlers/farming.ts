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

  let free: GameEntity | undefined;
  if (tileX !== undefined && tileY !== undefined) {
    if (!isWithinReach(farmer.transform, tileX, tileY)) return;
    free = ownedPlots.find((p) => p.plot!.tileX === tileX && p.plot!.tileY === tileY && p.plot!.state.kind === "empty");
  } else {
    free = ownedPlots.find((p) => p.plot!.state.kind === "empty");
  }

  if (free && farmer.inventory.seeds[crop] > 0) {
    farmer.inventory.seeds[crop] -= 1;
    free.plot!.state = {
      kind: "planted",
      crop,
      daysGrowing: 0,
      readyAtDay: day + GROWTH_DAYS[crop],
      weatherSum: 0,
      daysSinceWater: 0,
      wateredToday: true, // freshly-planted counts as watered
    } satisfies PlotState;
    grantSkillXp(farmer, "farming", 1);
  }
}

export function handleWater(
  farmer: ActingFarmer,
  intent: Intention,
  ownedPlots: GameEntity[],
): void {
  const can = farmer.inventory.wateringCan;
  if (can && can.charges <= 0) return;

  const tileX = intent.data.tileX as number | undefined;
  const tileY = intent.data.tileY as number | undefined;

  let target: GameEntity | undefined;
  if (tileX !== undefined && tileY !== undefined) {
    if (!isWithinReach(farmer.transform, tileX, tileY)) return;
    target = ownedPlots.find(
      (p) => p.plot!.tileX === tileX && p.plot!.tileY === tileY &&
             p.plot!.state.kind === "planted" &&
             (p.plot!.state as Extract<PlotState, { kind: "planted" }>).wateredToday !== true,
    );
  } else {
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
  if (farmer.id === undefined) return;
  const hoe = (farmer.inventory.tools ?? []).find(t => t.kind === "hoe" && t.durability > 0);
  if (!hoe) return;
  const tileX = intent.data.tileX as number;
  const tileY = intent.data.tileY as number;
  if (!isWithinReach(farmer.transform, tileX, tileY)) return;
  const occ = occupiedByOwner.get(farmer.id) ?? new Set();
  const tileKey = `${tileX},${tileY}`;
  if (occ.has(tileKey)) return;
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
  hoe.durability -= 1;
  if (hoe.durability <= 0) {
    const idx = (farmer.inventory.tools ?? []).indexOf(hoe);
    if (idx >= 0) farmer.inventory.tools!.splice(idx, 1);
  }
  occ.add(tileKey);
  occupiedByOwner.set(farmer.id, occ);
}
