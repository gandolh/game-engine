import type { Intention, Rng, World } from "@engine/core";
import type { GameEntity, DecorationKind } from "../../../components";
import {
  DECORATION_RECIPE,
  MAX_DECORATION_BOOST,
} from "../../../components";
import { grantSkillXp, foragingGoldMultiplier, miningRarityBonus } from "../../skills";
import { isWithinReach } from "../../proximity";
import { REGIONS } from "../../../world/regions";
import { seasonForDay } from "../../../protocols/weather";
import { FORAGE_ZONES, STONE_IRON_CHANCE, STONE_GEODE_CHANCE } from "../constants";
import { pickWeightedSeed, TREE_SEED_CHANCE } from "../seed-drops";
import type { ActingFarmer } from "../types";

export function handleChopTree(
  farmer: ActingFarmer,
  intent: Intention,
  featuresByTile: Map<string, GameEntity>,
  world: World<GameEntity>,
  forageRng: Rng,
): void {
  if (farmer.id === undefined) return;
  const axe = (farmer.inventory.tools ?? []).find(t => t.kind === "axe" && t.durability > 0);
  if (!axe) return;
  const tileX = intent.data.tileX as number;
  const tileY = intent.data.tileY as number;
  if (!isWithinReach(farmer.transform, tileX, tileY)) return;
  const feat = featuresByTile.get(`${tileX},${tileY}`);
  if (!feat || !feat.tileFeature || feat.tileFeature.kind !== "tree") return;
  if (!farmer.resources) farmer.resources = { wood: 0, stone: 0, ironOre: 0, geodes: 0 };
  farmer.resources.wood += 2;

  if (forageRng.nextFloat() < TREE_SEED_CHANCE) {
    farmer.inventory.seeds[pickWeightedSeed(forageRng)] += 1;
  }
  world.despawn(feat);
  featuresByTile.delete(`${tileX},${tileY}`);
  axe.durability -= 1;
  if (axe.durability <= 0) {
    const idx = (farmer.inventory.tools ?? []).indexOf(axe);
    if (idx >= 0) farmer.inventory.tools!.splice(idx, 1);
  }
}

export function handleGatherBush(
  farmer: ActingFarmer,
  intent: Intention,
  featuresByTile: Map<string, GameEntity>,
  world: World<GameEntity>,
  forageRng: Rng,
): void {
  if (farmer.id === undefined) return;
  const tileX = intent.data.tileX as number;
  const tileY = intent.data.tileY as number;
  if (!isWithinReach(farmer.transform, tileX, tileY)) return;
  const feat = featuresByTile.get(`${tileX},${tileY}`);
  if (!feat || !feat.tileFeature || feat.tileFeature.kind !== "bush") return;
  farmer.inventory.seeds[pickWeightedSeed(forageRng)] += 1;
  grantSkillXp(farmer, "foraging", 1);
  world.despawn(feat);
  featuresByTile.delete(`${tileX},${tileY}`);
}

export function handleMineStone(
  farmer: ActingFarmer,
  intent: Intention,
  featuresByTile: Map<string, GameEntity>,
  world: World<GameEntity>,
  mineRng: Rng,
): void {
  if (farmer.id === undefined) return;
  const pick = (farmer.inventory.tools ?? []).find(t => t.kind === "pickaxe" && t.durability > 0);
  if (!pick) return;
  const tileX = intent.data.tileX as number;
  const tileY = intent.data.tileY as number;
  if (!isWithinReach(farmer.transform, tileX, tileY)) return;
  const feat = featuresByTile.get(`${tileX},${tileY}`);
  if (!feat || !feat.tileFeature || feat.tileFeature.kind !== "stone") return;
  if (!farmer.resources) farmer.resources = { wood: 0, stone: 0, ironOre: 0, geodes: 0 };

  const mineBonus = miningRarityBonus(farmer.skills?.mining ?? 0);
  const geodeChance = STONE_GEODE_CHANCE + mineBonus * 0.5;
  const ironChance = STONE_IRON_CHANCE + mineBonus * 0.5;
  const roll = mineRng.nextFloat();
  if (roll < geodeChance) {
    farmer.resources.geodes += 1;
  } else if (roll < geodeChance + ironChance) {
    farmer.resources.ironOre += 1;
  } else {
    farmer.resources.stone += 1;
  }
  grantSkillXp(farmer, "mining", 1);
  world.despawn(feat);
  featuresByTile.delete(`${tileX},${tileY}`);
  pick.durability -= 1;
  if (pick.durability <= 0) {
    const idx = (farmer.inventory.tools ?? []).indexOf(pick);
    if (idx >= 0) farmer.inventory.tools!.splice(idx, 1);
  }
}

export function handleRefillCan(
  farmer: ActingFarmer,
  _intent: Intention,
  fountainByRegion: Map<string, GameEntity>,
): void {

  const can = farmer.inventory.wateringCan;
  if (!can) return;

  const homeRegion = farmer.farmer?.homeRegion;

  const sourceTiles: Array<{ tileX: number; tileY: number }> = [];

  if (homeRegion) {
    const homeFountain = fountainByRegion.get(homeRegion);
    if (homeFountain?.transform) {
      sourceTiles.push({
        tileX: Math.round(homeFountain.transform.x),
        tileY: Math.round(homeFountain.transform.y),
      });
    }
  }

  for (const wellId of ["well-north", "well-south"] as const) {
    const wellRegion = REGIONS.find(r => r.id === wellId);
    if (wellRegion) {
      sourceTiles.push({ tileX: wellRegion.center.x, tileY: wellRegion.center.y });
    }
  }

  const adjacent = sourceTiles.some(s => isWithinReach(farmer.transform, s.tileX, s.tileY));
  if (!adjacent) return;

  can.charges = can.maxCharges;
}

export function handleCraftDecoration(
  farmer: ActingFarmer,
  intent: Intention,
  world: World<GameEntity>,
): void {
  if (farmer.id === undefined || !farmer.farmer?.homeRegion) return;
  const kind = intent.data.kind as DecorationKind;
  const recipe = DECORATION_RECIPE[kind];
  if (!recipe) return;
  const res = farmer.resources;
  if (!res || res.wood < recipe.woodCost) return;

  let existingBoost = 0;
  for (const e of world.query("farmDecoration")) {
    if (e.farmDecoration.ownerId === farmer.id) {
      existingBoost += DECORATION_RECIPE[e.farmDecoration.kind]?.yieldBoost ?? 0;
    }
  }
  if (existingBoost >= MAX_DECORATION_BOOST) return;

  const homeRegion = farmer.farmer.homeRegion;
  const regionDef = REGIONS.find(r => r.id === homeRegion);
  if (!regionDef) return;

  const usedTiles = new Set<string>();
  for (const e of world.query("plot")) {
    if (e.plot.regionId === homeRegion) usedTiles.add(`${e.plot.tileX},${e.plot.tileY}`);
  }
  for (const e of world.query("farmDecoration")) {
    if (e.farmDecoration.regionId === homeRegion) usedTiles.add(`${e.farmDecoration.tileX},${e.farmDecoration.tileY}`);
  }
  for (const e of world.query("tileFeature")) {
    if (e.tileFeature.regionId === homeRegion) usedTiles.add(`${e.tileFeature.tileX},${e.tileFeature.tileY}`);
  }
  for (const e of world.query("fountain")) {
    if (e.fountain.regionId === homeRegion && e.transform) {
      usedTiles.add(`${Math.round(e.transform.x)},${Math.round(e.transform.y)}`);
    }
  }

  let placed = false;
  const b = regionDef.bounds;
  outer: for (let ty = b.minY; ty <= b.maxY; ty++) {
    for (let tx = b.minX; tx <= b.maxX; tx++) {
      if (usedTiles.has(`${tx},${ty}`)) continue;
      world.spawn({
        transform: { x: tx, y: ty, prevX: tx, prevY: ty, rotation: 0 },
        sprite: { atlasId: "main", frame: `decoration/${kind}`, layer: 20, tintRgba: 0xffffffff },
        farmDecoration: { kind, tileX: tx, tileY: ty, regionId: homeRegion, ownerId: farmer.id },
      });
      res.wood -= recipe.woodCost;
      placed = true;
      break outer;
    }
  }
  if (!placed) return;
}

export function handleForage(farmer: ActingFarmer, day: number): void {
  const region = farmer.farmer?.currentRegion;
  if (!region) return;
  const zone = FORAGE_ZONES[region];
  if (!zone) return;
  if (seasonForDay(day) !== zone.season) return; 

  const mult = foragingGoldMultiplier(farmer.skills?.foraging ?? 0);
  farmer.inventory.gold += Math.round(zone.reward * mult);
  grantSkillXp(farmer, "foraging", 1);
}
