/**
 * Build & livestock action handlers: build-pen, build-greenhouse, buy-animal,
 * tend, plant-tree, harvest-fruit, upgrade-tool, commission-build, hire-help.
 */
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
import { REGIONS } from "../../../world/regions";
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

// ---------------------------------------------------------------------------
// Internal helper: thin wrapper so handlers don't each inline bus.send
// ---------------------------------------------------------------------------
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
  // Upgrade a tool at the blacksmith.
  if (blacksmithId === undefined) return;
  const toolKind = intent.data.toolKind as import("../../../components").ToolKind;
  const tools = farmer.inventory.tools ?? [];
  // Find the best existing tool of this kind (highest tier, lowest durability first for upgrade)
  const existing = tools
    .filter(t => t.kind === toolKind)
    .sort((a, b) => {
      const tierOrder: Record<import("../../../components").ToolTier, number> = { wooden: 0, stone: 1, iron: 2 };
      return tierOrder[b.tier] - tierOrder[a.tier]; // highest tier first
    })[0];
  if (!existing) return;
  // Enforce tier order: wooden→stone→iron, one step at a time.
  const nextTier = UPGRADE_PATH[existing.tier];
  if (!nextTier) return; // already max
  const cost = UPGRADE_COST[nextTier] ?? 99;
  if (farmer.inventory.gold < cost) return;

  // brief 44 — the blacksmith VALIDATES: it consumes ore in addition to gold.
  // wooden→stone burns raw stone; stone→iron burns iron ore. Reject (no
  // mutation) if the farmer lacks the materials — no more assume-success.
  const material = UPGRADE_MATERIAL[nextTier];
  if (material) {
    const res = farmer.resources;
    if (!res || res[material.resource] < material.amount) return; // missing materials
    res[material.resource] -= material.amount;
  }

  farmer.inventory.gold -= cost;
  // Replace tool with upgraded version (full durability)
  const idx = tools.indexOf(existing);
  if (idx >= 0) {
    tools[idx] = { kind: toolKind, tier: nextTier, durability: nextTier === "stone" ? 150 : 200 };
  }
}

/**
 * brief 44 — commission a build at the carpenter. Unlike the old instant
 * `craft-decoration`, this SENDS an order message to the carpenter NPC, which
 * (CarpenterSystem) validates it, escrows the wood, builds over a build-time,
 * and DELIVERS the structure. The agent only places the order — fulfillment is
 * a system. Location-gated: the farmer must be AT carpentry (its deliberate
 * helper queues a carpentry travel leg first).
 */
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
  // Local pre-check so we don't fire a doomed order (the carpenter re-validates
  // and escrows authoritatively).
  if (!farmer.resources || farmer.resources.wood < recipe.woodCost) return;
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

/**
 * brief 44 — hire a day-helper at the tavern. A gold sink + catch-up mechanic:
 * an AP-starved, gold-rich farmer pays gold for a quick hired hand (a rallying
 * round at the tavern) that puts them back to work SAME-DAY. The AP boost lands
 * immediately, here, at hire time — not the morning after.
 *
 * Bounded so it stays a catch-up sink, never pay-to-win (see
 * project_leader_runaway): `ap.current` is topped up by HELPER_AP_BOOST but
 * clamped to `maxApForDay(day) + HELPER_AP_MARGIN`, so a rich leader can't buy
 * same-day dominance. `ap.max` is nudged up only if the clamped current would
 * otherwise exceed it (keeps the current ≤ max invariant when the margin bites).
 *
 * Location-gated to the village (where the tavern stands). `helperHiredDay`
 * remains the once-per-day cooldown marker even though the effect is now
 * immediate. Pure function of sim state: no RNG, no Math.random/Date.now.
 */
export function handleHireHelp(farmer: ActingFarmer, day: number): void {
  if (farmer.farmer?.currentRegion !== "village") return;
  if (farmer.farmer.helperHiredDay === day) return; // already hired today
  if (farmer.inventory.gold < HIRE_HELP_GOLD_COST) return;
  if (!farmer.ap) return; // no AP component → nothing to boost
  farmer.inventory.gold -= HIRE_HELP_GOLD_COST;
  // Same-day AP boost, clamped so it can't snowball past ~one sane day's worth.
  const ceiling = maxApForDay(day) + HELPER_AP_MARGIN;
  farmer.ap.current = Math.min(farmer.ap.current + HELPER_AP_BOOST, ceiling);
  // Preserve current ≤ max if the margin pushed current above the day ceiling.
  if (farmer.ap.current > farmer.ap.max) farmer.ap.max = farmer.ap.current;
  farmer.farmer.helperHiredDay = day; // once-per-day cooldown marker
}

/**
 * Build a pen (coop or barn) at the carpentry workshop. Requires:
 *   - farmer at carpentry region
 *   - enough wood + gold per PEN_BUILD_COST
 * Spawns a Pen entity on the farmer's farm at a free tile.
 */
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
  // brief 42 (deliberation fix) — pens are gold-funded; wood is an optional
  // discount, not a hard gate (see PEN_BUILD_COST). If the farmer has the wood
  // they spend it for a cheaper build; otherwise they pay full gold.
  const res = farmer.resources;
  const useWood = !!res && res.wood >= recipe.woodCost;
  const goldDue = useWood ? recipe.goldCost - recipe.goldDiscount : recipe.goldCost;
  if (farmer.inventory.gold < goldDue) return;

  // Validate animal kind is compatible with pen kind.
  if (!PEN_ANIMAL[penKind].includes(animalKind)) return;

  // Already has a pen of this kind?
  let alreadyHas = false;
  for (const p of world.query("pen")) {
    if (p.pen.ownerId === farmer.id && p.pen.kind === penKind) { alreadyHas = true; break; }
  }
  if (alreadyHas) return; // one pen per kind per farmer

  const homeRegion = farmer.farmer.homeRegion;
  const regionDef = REGIONS.find(r => r.id === homeRegion);
  if (!regionDef) return;

  // Find a free tile on the farm.
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

  // A pen tile is SOLID, so placing it on the farmer's current tile (trapping
  // her) or on a farm-edge tile (which can sever the only walkable route off
  // the farm) strands the farmer with "no path" faults. Place on an INTERIOR
  // tile (one in from every bound) and never on the farmer's standing tile.
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
        pen: { kind: penKind, animal: animalKind, count: 0, care: 0.5, fedToday: false, tileX: tx, tileY: ty, regionId: homeRegion, ownerId: farmer.id },
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

/**
 * brief 43 — build a greenhouse at the carpentry workshop. Requires:
 *   - farmer at carpentry region
 *   - enough gold per GREENHOUSE_BUILD_COST (wood+stone are an optional
 *     discount, never a hard gate — same lesson as brief 42's pens).
 * Spawns one SOLID Greenhouse entity on an INTERIOR farm tile (never the
 * farmer's standing tile or a farm-edge tile, which could trap her), plus a
 * small block of season-immune greenhouse plots on the open tiles around it.
 * One greenhouse per farmer.
 */
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

  // Collect occupied tiles on the farm (plots, decorations, features, pens,
  // orchards, fountain) plus the farmer's standing tile, so the structure and
  // its plots never overlap something or trap the farmer.
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

  // Place the glasshouse on an INTERIOR tile (one in from every bound) so it
  // can't sever the only walkable route off the farm (same care as pens).
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
  if (!structTile) return; // no free interior tile

  // Reserve the structure tile, then find GREENHOUSE_PLOT_COUNT free plot tiles
  // (interior, never the structure tile / used tiles) for the season-immune
  // plots. If we can't find enough open plot tiles, abort (don't half-build).
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
  if (plotTiles.length === 0) return; // no room for any greenhouse plot

  // Commit: pay, spawn the SOLID glasshouse + the greenhouse plots.
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

/**
 * Buy an animal and add it to the matching pen.
 *
 * brief 42 (deliberation fix) — sold at the VILLAGE shopkeeper OR the CARPENTER.
 */
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

  // Find the farmer's matching pen.
  let penEntity: With<GameEntity, "pen"> | null = null;
  for (const p of world.query("pen")) {
    if (p.pen.ownerId === farmer.id && p.pen.animal === animalKind) {
      penEntity = p;
      break;
    }
  }
  if (!penEntity) return; // need to build pen first

  farmer.inventory.gold -= cost;
  penEntity.pen.count += 1;
}

/**
 * Tend the pen on the farmer's farm. Sets fedToday=true and boosts care.
 */
export function handleTend(
  farmer: ActingFarmer,
  intent: Intention,
  world: World<GameEntity>,
): void {
  if (farmer.id === undefined) return;
  const penKind = intent.data.penKind as ("coop" | "barn") | undefined;

  // Find the pen to tend (by kind if specified, else first untended).
  let penEntity: With<GameEntity, "pen"> | null = null;
  for (const p of world.query("pen")) {
    if (p.pen.ownerId !== farmer.id) continue;
    if (penKind !== undefined && p.pen.kind !== penKind) continue;
    penEntity = p;
    break;
  }
  if (!penEntity) return;

  penEntity.pen.fedToday = true;
  penEntity.pen.care = Math.min(1, penEntity.pen.care + CARE_TEND_BOOST);
}

/**
 * Plant a fruit tree on a free tile of the farmer's farm.
 * Costs gold from TREE_PLANT_COST. Creates an OrchardTree entity.
 */
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
  // Check tile is free.
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

/**
 * Harvest ready fruit from the nearest mature orchard tree on the farmer's farm.
 * Banks fruit into inventory (Normal quality).
 */
export function handleHarvestFruit(
  farmer: ActingFarmer,
  intent: Intention,
  world: World<GameEntity>,
): void {
  if (farmer.id === undefined) return;
  const tileX = intent.data.tileX as number | undefined;
  const tileY = intent.data.tileY as number | undefined;

  // Find the target tree (by tile if given, else first ready tree).
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
