import type { Intention, MessageBus, World } from "@engine/core";
import type { With } from "@engine/core";
import type { GameEntity, AnimalKind, FruitKind } from "../../../components";
import {
  PEN_BUILD_COST,
  ANIMAL_BUY_COST,
  PEN_ANIMAL,
  TREE_PLANT_COST,
  CARE_TEND_BOOST,
  bankFruit,
  GREENHOUSE_BUILD_COST,
  GREENHOUSE_PLOT_COUNT,
} from "../../../economy";
import {
  DECORATION_RECIPE,
} from "../../../components";
import { REGIONS, ranchForFarm } from "../../../world/regions";
import {
  PERFORMATIVE,
} from "../../../protocols";
import { ONT_COMMISSION } from "../../../protocols/commission";
import {
  UPGRADE_PATH,
  UPGRADE_COST,
  UPGRADE_MATERIAL,
  HIRE_HELP_GOLD_COST,
} from "../constants";
import { maxApForDay, HELPER_AP_BOOST, HELPER_AP_MARGIN } from "../../ap";
import type { ActingFarmer } from "../types";

function sendBusMessage(
  bus: MessageBus,
  performative: string,
  ontology: string,
  senderId: number,
  recipientId: number | "broadcast",
  body: Record<string, unknown>,
  tick: number,
): void {
  bus.send(
    {
      performative,
      ontology,
      sender: senderId,
      recipient: recipientId,
      body,
    },
    tick,
  );
}

export function handleUpgradeTool(
  farmer: ActingFarmer,
  intent: Intention,
  blacksmithId: number | undefined,
): void {
  if (blacksmithId === undefined) return;
  const toolKind = intent.data.toolKind as import("../../../components").ToolKind;
  const tools = farmer.inventory.tools ?? [];
  const existing = tools
    .filter(t => t.kind === toolKind)
    .sort((a, b) => {
      const tierOrder: Record<import("../../../components").ToolTier, number> = { wooden: 0, stone: 1, iron: 2 };
      return tierOrder[b.tier] - tierOrder[a.tier];
    })[0];
  if (!existing) return;
  const nextTier = UPGRADE_PATH[existing.tier];
  if (!nextTier) return;
  const cost = UPGRADE_COST[nextTier] ?? 99;
  if (farmer.inventory.gold < cost) return;

  const material = UPGRADE_MATERIAL[nextTier];
  if (material) {
    const res = farmer.resources;
    if (!res || res[material.resource] < material.amount) return;
    res[material.resource] -= material.amount;
  }

  farmer.inventory.gold -= cost;
  const idx = tools.indexOf(existing);
  if (idx >= 0) tools[idx] = { kind: toolKind, tier: nextTier, durability: nextTier === "stone" ? 150 : 200 };
}

/** Location-gated to carpentry. Sends an order to CarpenterSystem; fulfillment is async. */
export function handleCommissionBuild(
  farmer: ActingFarmer,
  intent: Intention,
  bus: MessageBus | undefined,
  carpenterId: number | undefined,
  tick: number,
): void {
  if (!bus || farmer.id === undefined) return;
  if (farmer.farmer?.currentRegion !== "carpentry") return;
  if (carpenterId === undefined) return;
  const kind = intent.data.kind as import("../../../components").DecorationKind;
  const recipe = DECORATION_RECIPE[kind];
  if (!recipe) return;
  if (!farmer.resources || farmer.resources.wood < recipe.woodCost) return; // carpenter re-validates authoritatively
  sendBusMessage(
    bus,
    PERFORMATIVE.REQUEST,
    ONT_COMMISSION.BUILD,
    farmer.id,
    carpenterId,
    { kind } as unknown as Record<string, unknown>,
    tick,
  );
}

/** Same-day AP boost (pure, no RNG). Location-gated to village. Clamped to maxApForDay+HELPER_AP_MARGIN. */
export function handleHireHelp(farmer: ActingFarmer, day: number): void {
  if (farmer.farmer?.currentRegion !== "village") return;
  if (farmer.farmer.helperHiredDay === day) return;
  if (farmer.inventory.gold < HIRE_HELP_GOLD_COST) return;
  if (!farmer.ap) return;
  farmer.inventory.gold -= HIRE_HELP_GOLD_COST;
  const ceiling = maxApForDay(day) + HELPER_AP_MARGIN;
  farmer.ap.current = Math.min(farmer.ap.current + HELPER_AP_BOOST, ceiling);
  if (farmer.ap.current > farmer.ap.max) farmer.ap.max = farmer.ap.current; // preserve current ≤ max
  farmer.farmer.helperHiredDay = day;
}

/** Build a coop/barn at carpentry. Pen tile placed on an interior tile to avoid trapping the farmer. */
export function handleBuildPen(
  farmer: ActingFarmer,
  intent: Intention,
  world: World<GameEntity>,
): void {
  if (farmer.farmer?.currentRegion !== "carpentry") return;
  if (farmer.id === undefined || !farmer.farmer?.homeRegion) return;
  const penKind = intent.data.penKind as "coop" | "barn";
  const animalKind = intent.data.animal as AnimalKind;
  const recipe = PEN_BUILD_COST[penKind];
  if (!recipe) return;
  // Wood is an optional discount, not a hard gate.
  const res = farmer.resources;
  const useWood = !!res && res.wood >= recipe.woodCost;
  const goldDue = useWood ? recipe.goldCost - recipe.goldDiscount : recipe.goldCost;
  if (farmer.inventory.gold < goldDue) return;

  if (!PEN_ANIMAL[penKind].includes(animalKind)) return;

  let alreadyHas = false;
  for (const p of world.query("pen")) {
    if (p.pen.ownerId === farmer.id && p.pen.kind === penKind) { alreadyHas = true; break; }
  }
  if (alreadyHas) return;

  // Pens live on the farm's neighbouring RANCH island (the farmer crosses the bridge
  // to tend/collect). Fall back to the home farm if a farm somehow has no ranch.
  const homeRegion = farmer.farmer.homeRegion;
  const penRegion = ranchForFarm(homeRegion) ?? homeRegion;
  const regionDef = REGIONS.find(r => r.id === penRegion);
  if (!regionDef) return;

  const usedTiles = new Set<string>();
  for (const e of world.query("plot")) {
    if (e.plot.regionId === penRegion) usedTiles.add(`${e.plot.tileX},${e.plot.tileY}`);
  }
  for (const e of world.query("farmDecoration")) {
    if (e.farmDecoration.regionId === penRegion) usedTiles.add(`${e.farmDecoration.tileX},${e.farmDecoration.tileY}`);
  }
  for (const e of world.query("tileFeature")) {
    if (e.tileFeature.regionId === penRegion) usedTiles.add(`${e.tileFeature.tileX},${e.tileFeature.tileY}`);
  }
  for (const e of world.query("pen")) {
    if (e.pen.regionId === penRegion) usedTiles.add(`${e.pen.tileX},${e.pen.tileY}`);
  }
  for (const e of world.query("orchardTree")) {
    if (e.orchardTree.regionId === penRegion) usedTiles.add(`${e.orchardTree.tileX},${e.orchardTree.tileY}`);
  }

  // SOLID tile — must be interior (one in from every bound) to avoid severing the only walkable exit.
  usedTiles.add(`${farmer.transform?.x},${farmer.transform?.y}`);
  let placed = false;
  const b = regionDef.bounds;
  const innerMinX = Math.min(b.minX + 1, b.maxX);
  const innerMaxX = Math.max(b.maxX - 1, b.minX);
  const innerMinY = Math.min(b.minY + 1, b.maxY);
  const innerMaxY = Math.max(b.maxY - 1, b.minY);
  outer: for (let ty = innerMinY; ty <= innerMaxY; ty++) {
    for (let tx = innerMinX; tx <= innerMaxX; tx++) {
      if (usedTiles.has(`${tx},${ty}`)) continue;
      const frame = penKind === "coop" ? "structure/coop" : "structure/barn";
      world.spawn({
        transform: { x: tx, y: ty, prevX: tx, prevY: ty, rotation: 0 },
        sprite: { atlasId: "main", frame, layer: 30, tintRgba: 0xffffffff },
        pen: { kind: penKind, animal: animalKind, count: 0, care: 0.5, fedToday: false, tileX: tx, tileY: ty, regionId: penRegion, ownerId: farmer.id },
        solid: { isSolid: true, tileX: tx, tileY: ty },
      });
      if (useWood && res) res.wood -= recipe.woodCost;
      farmer.inventory.gold -= goldDue;
      placed = true;
      break outer;
    }
  }
  if (!placed) return;
}

/** Build a greenhouse at carpentry. Wood+stone are optional discount. One per farmer. Spawns SOLID entity + season-immune plots. */
export function handleBuildGreenhouse(
  farmer: ActingFarmer,
  _intent: Intention,
  world: World<GameEntity>,
): void {
  if (farmer.farmer?.currentRegion !== "carpentry") return;
  if (farmer.id === undefined || !farmer.farmer?.homeRegion) return;

  // Already has a greenhouse? One per farmer.
  for (const g of world.query("greenhouse")) {
    if (g.greenhouse.ownerId === farmer.id) return;
  }

  const recipe = GREENHOUSE_BUILD_COST;
  const res = farmer.resources;
  const useMaterials = !!res && res.wood >= recipe.woodCost && res.stone >= recipe.stoneCost;
  const goldDue = useMaterials ? recipe.goldCost - recipe.goldDiscount : recipe.goldCost;
  if (farmer.inventory.gold < goldDue) return;

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
  for (const e of world.query("pen")) {
    if (e.pen.regionId === homeRegion) usedTiles.add(`${e.pen.tileX},${e.pen.tileY}`);
  }
  for (const e of world.query("orchardTree")) {
    if (e.orchardTree.regionId === homeRegion) usedTiles.add(`${e.orchardTree.tileX},${e.orchardTree.tileY}`);
  }
  for (const e of world.query("fountain")) {
    if (e.fountain.regionId === homeRegion && e.transform) {
      usedTiles.add(`${Math.round(e.transform.x)},${Math.round(e.transform.y)}`);
    }
  }
  usedTiles.add(`${farmer.transform?.x},${farmer.transform?.y}`);

  // Interior tile (one in from every bound) — same SOLID-tile safety as pens.
  const b = regionDef.bounds;
  const innerMinX = Math.min(b.minX + 1, b.maxX);
  const innerMaxX = Math.max(b.maxX - 1, b.minX);
  const innerMinY = Math.min(b.minY + 1, b.maxY);
  const innerMaxY = Math.max(b.maxY - 1, b.minY);

  let structTile: { x: number; y: number } | null = null;
  outer: for (let ty = innerMinY; ty <= innerMaxY; ty++) {
    for (let tx = innerMinX; tx <= innerMaxX; tx++) {
      if (usedTiles.has(`${tx},${ty}`)) continue;
      structTile = { x: tx, y: ty };
      break outer;
    }
  }
  if (!structTile) return;

  usedTiles.add(`${structTile.x},${structTile.y}`);
  const plotTiles: Array<{ x: number; y: number }> = [];
  plot: for (let ty = innerMinY; ty <= innerMaxY; ty++) {
    for (let tx = innerMinX; tx <= innerMaxX; tx++) {
      if (usedTiles.has(`${tx},${ty}`)) continue;
      plotTiles.push({ x: tx, y: ty });
      usedTiles.add(`${tx},${ty}`);
      if (plotTiles.length >= GREENHOUSE_PLOT_COUNT) break plot;
    }
  }
  if (plotTiles.length === 0) return;

  if (useMaterials && res) { res.wood -= recipe.woodCost; res.stone -= recipe.stoneCost; }
  farmer.inventory.gold -= goldDue;
  world.spawn({
    transform: { x: structTile.x, y: structTile.y, prevX: structTile.x, prevY: structTile.y, rotation: 0 },
    sprite: { atlasId: "main", frame: "structure/greenhouse", layer: 30, tintRgba: 0xffffffff },
    greenhouse: { tileX: structTile.x, tileY: structTile.y, regionId: homeRegion, ownerId: farmer.id },
    solid: { isSolid: true, tileX: structTile.x, tileY: structTile.y },
  });
  for (const pt of plotTiles) {
    world.spawn({
      transform: { x: pt.x, y: pt.y, prevX: pt.x, prevY: pt.y, rotation: 0 },
      sprite: { atlasId: "main", frame: "tile/greenhouse-floor", layer: 5, tintRgba: 0xffffffff },
      plot: {
        ownerId: farmer.id,
        regionId: homeRegion,
        tileX: pt.x,
        tileY: pt.y,
        state: { kind: "empty" },
        greenhouse: true,
      },
    });
  }
}

/** Buy an animal; sold at village or carpentry. Requires matching pen. */
export function handleBuyAnimal(
  farmer: ActingFarmer,
  intent: Intention,
  world: World<GameEntity>,
): void {
  const region = farmer.farmer?.currentRegion;
  if (region !== "village" && region !== "carpentry") return;
  if (farmer.id === undefined) return;
  const animalKind = intent.data.animal as AnimalKind;
  const cost = ANIMAL_BUY_COST[animalKind];
  if (farmer.inventory.gold < cost) return;

  let penEntity: With<GameEntity, "pen"> | null = null;
  for (const p of world.query("pen")) {
    if (p.pen.ownerId === farmer.id && p.pen.animal === animalKind) {
      penEntity = p;
      break;
    }
  }
  if (!penEntity) return;

  farmer.inventory.gold -= cost;
  penEntity.pen.count += 1;
}

/** Set fedToday and boost care for the matching pen. */
export function handleTend(
  farmer: ActingFarmer,
  intent: Intention,
  world: World<GameEntity>,
): void {
  if (farmer.id === undefined) return;
  const penKind = intent.data.penKind as ("coop" | "barn") | undefined;

  let penEntity: With<GameEntity, "pen"> | null = null;
  for (const p of world.query("pen")) {
    if (p.pen.ownerId !== farmer.id) continue;
    if (penKind !== undefined && p.pen.kind !== penKind) continue;
    penEntity = p;
    break;
  }
  if (!penEntity) return;

  // Pens live on the farm's ranch island: the farmer must be ON the pen's region to
  // tend it (deliberateTendPens queues the bridge-crossing travel first). No-op when
  // not there yet — care decays until the farmer actually crosses over.
  if (farmer.farmer?.currentRegion !== penEntity.pen.regionId) return;

  penEntity.pen.fedToday = true;
  penEntity.pen.care = Math.min(1, penEntity.pen.care + CARE_TEND_BOOST);
}

/** Plant a fruit tree on a free farm tile. */
export function handlePlantTree(
  farmer: ActingFarmer,
  intent: Intention,
  world: World<GameEntity>,
): void {
  if (farmer.id === undefined || !farmer.farmer?.homeRegion) return;
  const fruitKind = intent.data.kind as FruitKind;
  const cost = TREE_PLANT_COST[fruitKind];
  if (farmer.inventory.gold < cost) return;

  const tileX = intent.data.tileX as number | undefined;
  const tileY = intent.data.tileY as number | undefined;
  if (tileX === undefined || tileY === undefined) return;

  const homeRegion = farmer.farmer.homeRegion;
  for (const e of world.query("orchardTree")) {
    if (e.orchardTree.tileX === tileX && e.orchardTree.tileY === tileY && e.orchardTree.regionId === homeRegion) return;
  }
  for (const e of world.query("plot")) {
    if (e.plot.tileX === tileX && e.plot.tileY === tileY && e.plot.regionId === homeRegion) return;
  }

  farmer.inventory.gold -= cost;
  world.spawn({
    transform: { x: tileX, y: tileY, prevX: tileX, prevY: tileY, rotation: 0 },
    sprite: { atlasId: "main", frame: "structure/fruit-tree-sapling", layer: 30, tintRgba: 0xffffffff },
    orchardTree: {
      kind: fruitKind,
      tileX,
      tileY,
      regionId: homeRegion,
      ownerId: farmer.id,
      daysGrown: 0,
      mature: false,
      lastHarvestDay: -1,
      fruitReady: 0,
    },
  });
}

/** Harvest ready fruit from the target (or first ready) mature orchard tree. */
export function handleHarvestFruit(
  farmer: ActingFarmer,
  intent: Intention,
  world: World<GameEntity>,
): void {
  if (farmer.id === undefined) return;
  const tileX = intent.data.tileX as number | undefined;
  const tileY = intent.data.tileY as number | undefined;

  let treeEntity: With<GameEntity, "orchardTree"> | null = null;
  for (const t of world.query("orchardTree")) {
    if (t.orchardTree.ownerId !== farmer.id) continue;
    if (!t.orchardTree.mature || t.orchardTree.fruitReady <= 0) continue;
    if (tileX !== undefined && t.orchardTree.tileX !== tileX) continue;
    if (tileY !== undefined && t.orchardTree.tileY !== tileY) continue;
    treeEntity = t;
    break;
  }
  if (!treeEntity) return;

  const tree = treeEntity.orchardTree;
  const qty = tree.fruitReady;
  tree.fruitReady = 0;
  bankFruit(farmer.inventory, tree.kind, qty, "normal");
}
