import type { SimContext, System, World, MessageBus, Intention, With, Rng } from "@engine/core";
import { REGIONS, isWalkable, isFishingIsle } from "../../world/regions";
import type { GameEntity, CropKind, PlotState, ToolKind, ToolTier, DecorationKind, FishKind, AnimalKind, FruitKind } from "../../components";
import {
  TOOL_PRICE,
  DECORATION_RECIPE,
  MAX_DECORATION_BOOST,
  FISH_KINDS,
  FISH_VALUE,
  FISH_MIN_TICKS,
  FISH_MAX_TICKS,
  FISH_WEIGHTS_CALM,
  FISH_WEIGHTS_BUBBLE,
} from "../../components";
import {
  PEN_BUILD_COST,
  ANIMAL_BUY_COST,
  PEN_ANIMAL,
  ANIMAL_PRODUCT,
  PRODUCT_SELL_PRICE,
  TREE_PLANT_COST,
  FRUIT_SELL_PRICE,
  CARE_TEND_BOOST,
  bankFruit,
  QUALITY_MULTIPLIER,
  totalProductCount,
  totalFruitCount,
  GREENHOUSE_BUILD_COST,
  GREENHOUSE_PLOT_COUNT,
} from "../../economy";
import {
  grantSkillXp,
  foragingGoldMultiplier,
  fishingRarityBonus,
  miningRarityBonus,
} from "../skills";
import {
  PERFORMATIVE,
  ONT_MARKET,
  type PostOfferBody,
  type ReadOffersBody,
  type BuyRequestBody,
} from "../../protocols";
import {
  ONT_SHOP,
  type ShopSellBody,
  type AuctionBidBody,
  type ResaleBeanBody,
} from "../../protocols/shop";
import { ONT_COMMISSION } from "../../protocols/commission";
import { ONT_HARBOR } from "../../protocols/harbor";
import type { HarborContract } from "../../protocols/harbor";
import { seasonForDay, type Season } from "../../protocols/weather";
import { isWithinReach } from "../proximity";
// brief 41 — import economy constants (SELL_PRICE / GROWTH_DAYS now live in economy.ts).
import { CROP_SELL_PRICE as SELL_PRICE, GROWTH_DAYS } from "../../economy";
import {
  MILL_PRICE,
  MILL_BATCH,
  FORAGE_ZONES,
  STONE_IRON_CHANCE,
  STONE_GEODE_CHANCE,
  UPGRADE_PATH,
  UPGRADE_COST,
  UPGRADE_MATERIAL,
  HIRE_HELP_GOLD_COST,
} from "./constants";
import { actionTicks, applyFishingRarityBonus } from "./helpers";
import type { ActingFarmer, ActContext } from "./types";

export class ActSystem implements System {
  readonly name = "ActSystem";

  /**
   * Seeded RNG channel for fishing outcomes (catch time + which fish). Forked
   * once from the sim rng so fishing stays deterministic; falls back to an
   * unseeded channel only when ActSystem is constructed without an rng (legacy
   * tests). Mining uses its own forked `mineRng` channel for the same reason
   * (the old raw Math.random() broke determinism once brief 44 made agents
   * mine ore to feed the now-validating blacksmith — see corpus log 2026-06-05).
   */
  private readonly fishRng: Rng | null;
  private readonly mineRng: Rng | null;

  constructor(
    private readonly world: World<GameEntity>,
    private readonly bus?: MessageBus,
    rng?: Rng,
  ) {
    this.fishRng = rng ? rng.fork("fish") : null;
    this.mineRng = rng ? rng.fork("mine") : null;
  }

  private buildActContext(): ActContext {
    const plotsByOwner = new Map<number, GameEntity[]>();
    const occupiedByOwner = new Map<number, Set<string>>();

    // Single pass over plots — builds both plotsByOwner and occupiedByOwner.
    for (const plot of this.world.query("plot")) {
      const arr = plotsByOwner.get(plot.plot.ownerId) ?? [];
      arr.push(plot);
      plotsByOwner.set(plot.plot.ownerId, arr);

      const key = `${plot.plot.tileX},${plot.plot.tileY}`;
      const s = occupiedByOwner.get(plot.plot.ownerId) ?? new Set();
      s.add(key);
      occupiedByOwner.set(plot.plot.ownerId, s);
    }

    for (const f of this.world.query("fountain")) {
      if (!f.transform) continue;
      const tx = Math.round(f.transform.x);
      const ty = Math.round(f.transform.y);
      // Find owner via region
      for (const farmer of this.world.query("farmer")) {
        if (farmer.farmer.homeRegion === f.fountain.regionId && farmer.id !== undefined) {
          const key = `${tx},${ty}`;
          const s = occupiedByOwner.get(farmer.id) ?? new Set();
          s.add(key);
          occupiedByOwner.set(farmer.id, s);
        }
      }
    }

    // Tile features (trees/stones) indexed by tile key
    const featuresByTile = new Map<string, GameEntity>();
    for (const f of this.world.query("tileFeature")) {
      featuresByTile.set(`${f.tileFeature.tileX},${f.tileFeature.tileY}`, f);
    }

    // Fountains indexed by regionId
    const fountainByRegion = new Map<string, GameEntity>();
    for (const f of this.world.query("fountain")) {
      fountainByRegion.set(f.fountain.regionId, f);
    }

    // Bubble spot tiles (transient; drift daily around the fishing isle).
    const bubbleTiles = new Set<string>();
    for (const f of this.world.query("fishingSpot")) {
      bubbleTiles.add(`${f.fishingSpot.tileX},${f.fishingSpot.tileY}`);
    }

    let blacksmithId: number | undefined;
    for (const b of this.world.query("blacksmith")) {
      blacksmithId = b.id;
      break;
    }

    let marketWallId: number | undefined;
    for (const w of this.world.query("marketWall")) {
      marketWallId = w.id;
      break;
    }

    let shopkeeperId: number | undefined;
    for (const s of this.world.query("shopkeeper")) {
      shopkeeperId = s.id;
      break;
    }

    return { plotsByOwner, occupiedByOwner, featuresByTile, fountainByRegion, bubbleTiles, blacksmithId, marketWallId, shopkeeperId };
  }

  private sendIntentMessage(
    performative: string,
    ontology: string,
    senderId: number,
    recipientId: number | "broadcast",
    body: Record<string, unknown>,
    tick: number,
  ): void {
    this.bus!.send(
      {
        performative,
        ontology,
        sender: senderId,
        recipient: recipientId,
        body: body as unknown as Record<string, unknown>,
      },
      tick,
    );
  }

  private handleBuySeed(
    farmer: ActingFarmer,
    intent: Intention,
    shopkeeperId: number | undefined,
    tick: number,
  ): void {
    if (!this.bus || shopkeeperId === undefined || farmer.id === undefined) return;
    const body: ShopSellBody = {
      item: "seed",
      crop: intent.data.crop as CropKind,
      quantity: (intent.data.quantity as number) ?? 1,
    };
    this.sendIntentMessage(
      PERFORMATIVE.REQUEST,
      ONT_SHOP.SELL,
      farmer.id,
      shopkeeperId,
      body as unknown as Record<string, unknown>,
      tick,
    );
  }

  private handlePlant(
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

  private handleWater(farmer: ActingFarmer, intent: Intention, ownedPlots: GameEntity[]): void {
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

  private handleSellShopkeeper(
    farmer: ActingFarmer,
    intent: Intention,
  ): void {
    const crop = intent.data.crop as CropKind;
    const qty = (intent.data.quantity as number) ?? 0;
    const available = Math.min(qty, farmer.inventory.crops[crop]);
    if (available <= 0) return;

    // brief 41 — quality-weighted sell price. Deduct crops by quality tier
    // (best first: gold, silver, normal) and pay the quality-weighted price.
    const basePrice = SELL_PRICE[crop];
    const quality = farmer.inventory.cropQuality;
    if (quality?.[crop]) {
      const q = quality[crop]!;
      let remaining = available;
      // Sell in quality order: gold first (highest value), then silver, then normal.
      for (const [tier, mult] of [["gold", QUALITY_MULTIPLIER.gold], ["silver", QUALITY_MULTIPLIER.silver], ["normal", QUALITY_MULTIPLIER.normal]] as const) {
        if (remaining <= 0) break;
        const take = Math.min(remaining, q[tier]);
        if (take > 0) {
          farmer.inventory.gold += Math.round(basePrice * mult * take);
          q[tier] -= take;
          remaining -= take;
        }
      }
      farmer.inventory.crops[crop] -= available;
    } else {
      // Legacy path: no quality breakdown — sell all as Normal.
      farmer.inventory.crops[crop] -= available;
      farmer.inventory.gold += SELL_PRICE[crop] * available;
    }
  }

  private handlePostOffer(
    farmer: ActingFarmer,
    intent: Intention,
    marketWallId: number | undefined,
    tick: number,
  ): void {
    if (!this.bus || marketWallId === undefined || farmer.id === undefined) return;
    const body: PostOfferBody = {
      offer: {
        sellerId: farmer.id,
        crop: intent.data.crop as CropKind,
        quantity: intent.data.quantity as number,
        pricePerUnit: intent.data.pricePerUnit as number,
      },
    };
    this.sendIntentMessage(
      PERFORMATIVE.INFORM,
      ONT_MARKET.POST_OFFER,
      farmer.id,
      marketWallId,
      body as unknown as Record<string, unknown>,
      tick,
    );
  }

  private handleReadOffers(
    farmer: ActingFarmer,
    intent: Intention,
    marketWallId: number | undefined,
    tick: number,
  ): void {
    if (!this.bus || marketWallId === undefined || farmer.id === undefined) return;
    const filter = intent.data.filter as ReadOffersBody["filter"] | undefined;
    const body: ReadOffersBody = filter === undefined ? {} : { filter };
    this.sendIntentMessage(
      PERFORMATIVE.REQUEST,
      ONT_MARKET.READ_OFFERS,
      farmer.id,
      marketWallId,
      body as unknown as Record<string, unknown>,
      tick,
    );
  }

  private handleBuyFromWall(
    farmer: ActingFarmer,
    intent: Intention,
    marketWallId: number | undefined,
    tick: number,
  ): void {
    if (!this.bus || marketWallId === undefined || farmer.id === undefined) return;
    const body: BuyRequestBody = {
      offerId: intent.data.offerId as string,
      buyerId: farmer.id,
      pricePerUnit: intent.data.pricePerUnit as number,
      quantity: (intent.data.quantity as number) ?? 1,
    };
    this.sendIntentMessage(
      PERFORMATIVE.PROPOSE,
      ONT_MARKET.BUY_REQUEST,
      farmer.id,
      marketWallId,
      body as unknown as Record<string, unknown>,
      tick,
    );
  }

  private handleAuctionBid(
    farmer: ActingFarmer,
    intent: Intention,
    shopkeeperId: number | undefined,
    tick: number,
  ): void {
    // brief 24 — send a sealed bid to the shopkeeper (auctioneer). The
    // AuctionSystem drains AUCTION_BID from the shop inbox each tick.
    if (!this.bus || shopkeeperId === undefined || farmer.id === undefined) return;
    const body: AuctionBidBody = {
      auctionId: intent.data.auctionId as string,
      bidderId: farmer.id,
      amount: (intent.data.amount as number) ?? 0,
    };
    this.sendIntentMessage(
      PERFORMATIVE.PROPOSE,
      ONT_SHOP.AUCTION_BID,
      farmer.id,
      shopkeeperId,
      body as unknown as Record<string, unknown>,
      tick,
    );
  }

  private handleResaleBean(
    farmer: ActingFarmer,
    intent: Intention,
    shopkeeperId: number | undefined,
    tick: number,
  ): void {
    // brief 24 — resell won golden beans to the shop at a premium.
    if (!this.bus || shopkeeperId === undefined || farmer.id === undefined) return;
    const body: ResaleBeanBody = {
      quantity: (intent.data.quantity as number) ?? 1,
    };
    this.sendIntentMessage(
      PERFORMATIVE.REQUEST,
      ONT_SHOP.RESALE_BEAN,
      farmer.id,
      shopkeeperId,
      body as unknown as Record<string, unknown>,
      tick,
    );
  }

  private handleTill(
    farmer: ActingFarmer,
    intent: Intention,
    occupiedByOwner: Map<number, Set<string>>,
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
    this.world.spawn({
      transform: { x: tileX, y: tileY, prevX: tileX, prevY: tileY, rotation: 0 },
      plot: {
        ownerId: farmer.id,
        regionId: farmer.farmer?.currentRegion ?? (intent.data.regionId as string) as import("../../world/regions").RegionId,
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

  private handleChopTree(
    farmer: ActingFarmer,
    intent: Intention,
    featuresByTile: Map<string, GameEntity>,
  ): void {
    if (farmer.id === undefined) return;
    const axe = (farmer.inventory.tools ?? []).find(t => t.kind === "axe" && t.durability > 0);
    if (!axe) return;
    const tileX = intent.data.tileX as number;
    const tileY = intent.data.tileY as number;
    // Strict proximity guard: farmer must be within 1 cell (Chebyshev) of the
    // target tile. TravelSystem moves farmers into position before acting.
    if (!isWithinReach(farmer.transform, tileX, tileY)) return;
    const feat = featuresByTile.get(`${tileX},${tileY}`);
    if (!feat || !feat.tileFeature || feat.tileFeature.kind !== "tree") return;
    // Award wood
    if (!farmer.resources) farmer.resources = { wood: 0, stone: 0, ironOre: 0, geodes: 0 };
    farmer.resources.wood += 2;
    // Remove feature entity
    this.world.despawn(feat);
    featuresByTile.delete(`${tileX},${tileY}`);
    // Drain axe
    axe.durability -= 1;
    if (axe.durability <= 0) {
      const idx = (farmer.inventory.tools ?? []).indexOf(axe);
      if (idx >= 0) farmer.inventory.tools!.splice(idx, 1);
    }
  }

  private handleMineStone(
    farmer: ActingFarmer,
    intent: Intention,
    featuresByTile: Map<string, GameEntity>,
  ): void {
    if (farmer.id === undefined) return;
    const pick = (farmer.inventory.tools ?? []).find(t => t.kind === "pickaxe" && t.durability > 0);
    if (!pick) return;
    const tileX = intent.data.tileX as number;
    const tileY = intent.data.tileY as number;
    // Strict proximity guard: farmer must be within 1 cell (Chebyshev) of the
    // target tile. TravelSystem moves farmers into position before acting.
    if (!isWithinReach(farmer.transform, tileX, tileY)) return;
    const feat = featuresByTile.get(`${tileX},${tileY}`);
    if (!feat || !feat.tileFeature || feat.tileFeature.kind !== "stone") return;
    if (!farmer.resources) farmer.resources = { wood: 0, stone: 0, ironOre: 0, geodes: 0 };
    // Random drops. brief 43 — mining skill widens the geode/iron bands (a master
    // miner pulls more valuable drops). The roll uses the forked `mineRng` so the
    // drop is deterministic (falls back to Math.random only for legacy rng-less
    // tests); the skill SHIFT is a pure function of mining XP.
    const mineBonus = miningRarityBonus(farmer.skills?.mining ?? 0);
    const geodeChance = STONE_GEODE_CHANCE + mineBonus * 0.5;
    const ironChance = STONE_IRON_CHANCE + mineBonus * 0.5;
    const roll = this.mineRng ? this.mineRng.nextFloat() : Math.random();
    if (roll < geodeChance) {
      farmer.resources.geodes += 1;
    } else if (roll < geodeChance + ironChance) {
      farmer.resources.ironOre += 1;
    } else {
      farmer.resources.stone += 1;
    }
    // brief 43 — mining the rock earns mining XP.
    grantSkillXp(farmer, "mining", 1);
    this.world.despawn(feat);
    featuresByTile.delete(`${tileX},${tileY}`);
    // Drain pickaxe
    pick.durability -= 1;
    if (pick.durability <= 0) {
      const idx = (farmer.inventory.tools ?? []).indexOf(pick);
      if (idx >= 0) farmer.inventory.tools!.splice(idx, 1);
    }
  }

  private handleRefillCan(farmer: ActingFarmer, intent: Intention, fountainByRegion: Map<string, GameEntity>): void {
    // Refill watering can — only valid when adjacent (Chebyshev ≤ 1) to a
    // water source tile: the home fountain or a well center.
    // TravelSystem moves the farmer to the fountain tile before this executes.
    const can = farmer.inventory.wateringCan;
    if (!can) return;

    const homeRegion = farmer.farmer?.homeRegion;

    // Build the list of candidate water-source tiles: home fountain + wells.
    const sourceTiles: Array<{ tileX: number; tileY: number }> = [];

    // Home fountain (fountain entity on the farm)
    if (homeRegion) {
      const homeFountain = fountainByRegion.get(homeRegion);
      if (homeFountain?.transform) {
        sourceTiles.push({
          tileX: Math.round(homeFountain.transform.x),
          tileY: Math.round(homeFountain.transform.y),
        });
      }
    }

    // Wells (well-north and well-south): use their region center from REGIONS.
    for (const wellId of ["well-north", "well-south"] as const) {
      const wellRegion = REGIONS.find(r => r.id === wellId);
      if (wellRegion) {
        sourceTiles.push({ tileX: wellRegion.center.x, tileY: wellRegion.center.y });
      }
    }

    // Strict proximity guard: farmer must be within 1 cell of at least one source.
    const adjacent = sourceTiles.some(s => isWithinReach(farmer.transform, s.tileX, s.tileY));
    if (!adjacent) return;

    can.charges = can.maxCharges;
  }

  private handleBuyTool(
    farmer: ActingFarmer,
    intent: Intention,
  ): void {
    // Buy a wooden tool from the shopkeeper. Must be at the village
    // (where the shopkeeper stands) — deliberateBuyTool queues a
    // travel-to-village intent first; this guard ensures the purchase
    // doesn't resolve back on the farm if the travel hasn't completed.
    if (farmer.farmer?.currentRegion !== "village") return;
    const toolKind = intent.data.toolKind as ToolKind;
    const tier: ToolTier = "wooden";
    const price = TOOL_PRICE[tier];
    if (farmer.inventory.gold < price) return;
    farmer.inventory.gold -= price;
    if (!farmer.inventory.tools) farmer.inventory.tools = [];
    farmer.inventory.tools.push({ kind: toolKind, tier, durability: 100 });
  }

  private handleCraftDecoration(
    farmer: ActingFarmer,
    intent: Intention,
  ): void {
    // Craft a farm decoration at the carpentry workshop.
    // Consumes wood from ResourceInventory, places a FarmDecoration entity
    // on a free tile in the farmer's farm. Boosts crop yield permanently.
    if (farmer.id === undefined || !farmer.farmer?.homeRegion) return;
    const kind = intent.data.kind as DecorationKind;
    const recipe = DECORATION_RECIPE[kind];
    if (!recipe) return;
    const res = farmer.resources;
    if (!res || res.wood < recipe.woodCost) return;

    // Cap total boost: sum existing decorations for this farmer's farm.
    let existingBoost = 0;
    for (const e of this.world.query("farmDecoration")) {
      if (e.farmDecoration.ownerId === farmer.id) {
        existingBoost += DECORATION_RECIPE[e.farmDecoration.kind]?.yieldBoost ?? 0;
      }
    }
    if (existingBoost >= MAX_DECORATION_BOOST) return; // already maxed

    // Find a free tile in the farm (not occupied by plot/fountain/feature).
    const homeRegion = farmer.farmer.homeRegion;
    const regionDef = REGIONS.find(r => r.id === homeRegion);
    if (!regionDef) return;

    const usedTiles = new Set<string>();
    for (const e of this.world.query("plot")) {
      if (e.plot.regionId === homeRegion) usedTiles.add(`${e.plot.tileX},${e.plot.tileY}`);
    }
    for (const e of this.world.query("farmDecoration")) {
      if (e.farmDecoration.regionId === homeRegion) usedTiles.add(`${e.farmDecoration.tileX},${e.farmDecoration.tileY}`);
    }
    for (const e of this.world.query("tileFeature")) {
      if (e.tileFeature.regionId === homeRegion) usedTiles.add(`${e.tileFeature.tileX},${e.tileFeature.tileY}`);
    }
    for (const e of this.world.query("fountain")) {
      if (e.fountain.regionId === homeRegion && e.transform) {
        usedTiles.add(`${Math.round(e.transform.x)},${Math.round(e.transform.y)}`);
      }
    }

    let placed = false;
    const b = regionDef.bounds;
    outer: for (let ty = b.minY; ty <= b.maxY; ty++) {
      for (let tx = b.minX; tx <= b.maxX; tx++) {
        if (usedTiles.has(`${tx},${ty}`)) continue;
        this.world.spawn({
          transform: { x: tx, y: ty, prevX: tx, prevY: ty, rotation: 0 },
          sprite: { atlasId: "main", frame: `decoration/${kind}`, layer: 20, tintRgba: 0xffffffff },
          farmDecoration: { kind, tileX: tx, tileY: ty, regionId: homeRegion, ownerId: farmer.id },
        });
        res.wood -= recipe.woodCost;
        placed = true;
        break outer;
      }
    }
    if (!placed) return; // no free tile
  }

  private handleUpgradeTool(
    farmer: ActingFarmer,
    intent: Intention,
    blacksmithId: number | undefined,
  ): void {
    // Upgrade a tool at the blacksmith.
    if (blacksmithId === undefined) return;
    const toolKind = intent.data.toolKind as ToolKind;
    const tools = farmer.inventory.tools ?? [];
    // Find the best existing tool of this kind (highest tier, lowest durability first for upgrade)
    const existing = tools
      .filter(t => t.kind === toolKind)
      .sort((a, b) => {
        const tierOrder: Record<ToolTier, number> = { wooden: 0, stone: 1, iron: 2 };
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
  private handleCommissionBuild(
    farmer: ActingFarmer,
    intent: Intention,
    tick: number,
  ): void {
    if (!this.bus || farmer.id === undefined) return;
    if (farmer.farmer?.currentRegion !== "carpentry") return;
    const carpenterId = this.carpenterId();
    if (carpenterId === undefined) return;
    const kind = intent.data.kind as DecorationKind;
    const recipe = DECORATION_RECIPE[kind];
    if (!recipe) return;
    // Local pre-check so we don't fire a doomed order (the carpenter re-validates
    // and escrows authoritatively).
    if (!farmer.resources || farmer.resources.wood < recipe.woodCost) return;
    this.sendIntentMessage(
      PERFORMATIVE.REQUEST,
      ONT_COMMISSION.BUILD,
      farmer.id,
      carpenterId,
      { kind } as unknown as Record<string, unknown>,
      tick,
    );
  }

  /**
   * brief 44 — hire a day-helper at the tavern. A money sink + catch-up
   * mechanic: an AP-starved, gold-rich farmer pays gold for a temporary AP boost
   * (applied at the next morning wake via `helperHiredDay`, see PerceiveSystem).
   * Location-gated to the village (where the tavern stands) and once per day.
   */
  private handleHireHelp(farmer: ActingFarmer, day: number): void {
    if (farmer.farmer?.currentRegion !== "village") return;
    if (farmer.farmer.helperHiredDay === day) return; // already hired today
    if (farmer.inventory.gold < HIRE_HELP_GOLD_COST) return;
    farmer.inventory.gold -= HIRE_HELP_GOLD_COST;
    farmer.farmer.helperHiredDay = day;
  }

  private carpenterId(): number | undefined {
    for (const c of this.world.query("carpenter")) return c.id;
    return undefined;
  }

  /**
   * brief 46 — commit to an open harbor contract. The farmer must be at the
   * harbor AND the contract must be open AND not already committed by someone
   * else AND the farmer's reputation must meet the minimum. Marks the contract
   * as committed on the board and sets the farmer's committedContract field.
   */
  private handleCommitContract(
    farmer: ActingFarmer,
    intent: Intention,
    tick: number,
  ): void {
    if (!this.bus || farmer.id === undefined) return;
    if (farmer.farmer?.currentRegion !== "harbor") return;
    // Already have a committed contract.
    if (farmer.farmer.committedContract !== undefined) return;

    const contractId = intent.data.contractId as string;
    const board = this.findHarborBoard();
    if (!board?.harborBoard) return;

    const contract = board.harborBoard.openContracts.find((c) => c.id === contractId);
    if (!contract) return;
    if (board.harborBoard.committed.has(contractId)) return; // already taken
    // Reputation gate.
    const rep = farmer.farmer.harborReputation ?? 0;
    if (rep < contract.minReputation) return;

    // Commit.
    board.harborBoard.committed.set(contractId, farmer.id);
    farmer.farmer.committedContract = contract;

    this.bus.send(
      {
        performative: "inform",
        ontology: ONT_HARBOR.CONTRACT_COMMITTED,
        sender: farmer.id,
        recipient: "broadcast",
        body: {
          contractId,
          farmerId: farmer.id,
          farmerName: farmer.farmer.name,
        } as Record<string, unknown>,
      },
      tick,
    );
  }

  /**
   * brief 46 — deliver a committed contract. The farmer must be at the harbor,
   * have a committed contract, and have the goods. HarborSystem resolves the
   * payout on the same tick (it runs after ActSystem reads deliveries). Here
   * we just queue the intent; the actual resolution is in HarborSystem which
   * fires each tick. Nothing is done in act.ts except consuming the AP.
   * (The real delivery logic is in HarborSystem.attemptDeliveries which fires
   * every tick when the farmer is at the harbor with goods.)
   */
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  private handleDeliverContract(_farmer: ActingFarmer, _intent: Intention): void {
    // Delivery is handled automatically by HarborSystem every tick when the
    // farmer is at the harbor with sufficient goods. This intent just pays AP
    // and signals the farmer is consciously heading to deliver.
  }

  private findHarborBoard(): GameEntity | undefined {
    for (const e of this.world.query("harborBoard")) return e;
    return undefined;
  }

  private handleProcessCrop(
    farmer: ActingFarmer,
    intent: Intention,
  ): void {
    // Mill raw crops into goods at a premium — only at the mill region.
    // Converts up to MILL_BATCH units of one crop into gold at MILL_PRICE
    // (higher than the shopkeeper's buy price; the gradient justifies the
    // trip). Mirrors the location-gated pattern of buy-tool/craft.
    if (farmer.farmer?.currentRegion !== "mill") return;
    const crop = intent.data.crop as CropKind;
    if (!(crop in MILL_PRICE)) return;
    const have = farmer.inventory.crops[crop];
    const taken = Math.min(MILL_BATCH, have);
    if (taken <= 0) return;
    farmer.inventory.crops[crop] -= taken;
    farmer.inventory.gold += MILL_PRICE[crop] * taken;
  }

  private handleForage(farmer: ActingFarmer, day: number): void {
    // Forage a seasonal zone — only rewards in the zone's season. The
    // season is derived from the farmer's perceived currentDay, so the
    // lock is real game logic (out of season = no reward).
    const region = farmer.farmer?.currentRegion;
    if (!region) return;
    const zone = FORAGE_ZONES[region];
    if (!zone) return;
    if (seasonForDay(day) !== zone.season) return; // out of season — no reward
    // brief 43 — foraging skill multiplies the reward (gentle, compounding) and
    // the forage earns foraging XP.
    const mult = foragingGoldMultiplier(farmer.skills?.foraging ?? 0);
    farmer.inventory.gold += Math.round(zone.reward * mult);
    grantSkillXp(farmer, "foraging", 1);
  }

  /**
   * Fish from the fishing isle. Requirements: the farmer holds a fishing rod,
   * stands ON a `fishing-isle` tile, and is adjacent (Chebyshev ≤ 1) to an
   * OCEAN tile (the shoreline) to cast into. The catch tilts on whether that
   * water is churning: casting next to a **bubble** spot uses the rarer
   * `FISH_WEIGHTS_BUBBLE` odds, otherwise calm-water `FISH_WEIGHTS_CALM`
   * (mostly minnows). On success it lands one of minnow/bass/salmon (1/3/5
   * gold), banked directly + tallied in `inventory.fish`. The rod has no
   * durability. The reward is awarded now (deterministic on the seed); a random
   * 5–30 s busy window on `busyUntilTick` keeps the angler occupied so a trip
   * costs in-day time as well as 1 AP.
   */
  private handleFish(
    farmer: ActingFarmer,
    bubbleTiles: ReadonlySet<string>,
    tick: number,
  ): void {
    const rod = (farmer.inventory.tools ?? []).find((t) => t.kind === "fishing-rod");
    if (!rod || !farmer.transform) return;
    // Must be standing on a fishing isle.
    if (!isFishingIsle(farmer.farmer?.currentRegion ?? null)) return;

    const fx = Math.round(farmer.transform.x);
    const fy = Math.round(farmer.transform.y);
    // Find an adjacent ocean tile (the shore the rod casts into). Prefer the
    // 4-neighbours; any non-walkable neighbour is open water.
    const NEIGHBOURS = [
      { dx: 1, dy: 0 }, { dx: -1, dy: 0 }, { dx: 0, dy: 1 }, { dx: 0, dy: -1 },
    ];
    let castX: number | null = null;
    let castY: number | null = null;
    let nearBubble = false;
    for (const { dx, dy } of NEIGHBOURS) {
      const ox = fx + dx;
      const oy = fy + dy;
      if (isWalkable(ox, oy)) continue; // not open water
      // First open-water neighbour becomes the cast target; if any adjacent
      // water tile is a bubble, the whole cast counts as a bubble cast.
      if (castX === null) { castX = ox; castY = oy; }
      if (bubbleTiles.has(`${ox},${oy}`)) nearBubble = true;
    }
    if (castX === null) return; // no open water to cast into

    // Weighted catch: rarer odds next to a bubble, calm odds otherwise.
    // brief 43 — fishing skill reallocates a fraction of the minnow weight toward
    // bass+salmon (a pure function of fishing XP), so a master angler lands rarer
    // fish more often. The pick itself stays on the forked seeded fish rng.
    const baseWeights = nearBubble ? FISH_WEIGHTS_BUBBLE : FISH_WEIGHTS_CALM;
    const weights = applyFishingRarityBonus(baseWeights, fishingRarityBonus(farmer.skills?.fishing ?? 0));
    const fish = this.pickWeightedFish(weights);
    const busyTicks = this.fishRng
      ? this.fishRng.int(FISH_MIN_TICKS, FISH_MAX_TICKS + 1)
      : FISH_MIN_TICKS + Math.floor(Math.random() * (FISH_MAX_TICKS - FISH_MIN_TICKS + 1));

    if (!farmer.inventory.fish) farmer.inventory.fish = { minnow: 0, bass: 0, salmon: 0 };
    farmer.inventory.fish[fish] += 1;
    farmer.inventory.gold += FISH_VALUE[fish];
    // brief 43 — a cast earns fishing XP.
    grantSkillXp(farmer, "fishing", 1);

    if (farmer.farmer) farmer.farmer.busyUntilTick = tick + busyTicks;
  }

  /** Draw a fish kind by [minnow,bass,salmon] weights. Deterministic via the
   *  forked fish rng; falls back to Math.random when rng-less (legacy tests). */
  private pickWeightedFish(weights: Record<FishKind, number>): FishKind {
    const total = FISH_KINDS.reduce((s, k) => s + weights[k], 0);
    const r = (this.fishRng ? this.fishRng.nextFloat() : Math.random()) * total;
    let acc = 0;
    for (const k of FISH_KINDS) {
      acc += weights[k];
      if (r < acc) return k;
    }
    return FISH_KINDS[FISH_KINDS.length - 1]!;
  }

  // ── brief 42 livestock + orchard handlers ────────────────────────────────

  /**
   * Build a pen (coop or barn) at the carpentry workshop. Requires:
   *   - farmer at carpentry region
   *   - enough wood + gold per PEN_BUILD_COST
   * Spawns a Pen entity on the farmer's farm at a free tile.
   */
  private handleBuildPen(farmer: ActingFarmer, intent: Intention): void {
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
    for (const p of this.world.query("pen")) {
      if (p.pen.ownerId === farmer.id && p.pen.kind === penKind) { alreadyHas = true; break; }
    }
    if (alreadyHas) return; // one pen per kind per farmer

    const homeRegion = farmer.farmer.homeRegion;
    const regionDef = REGIONS.find(r => r.id === homeRegion);
    if (!regionDef) return;

    // Find a free tile on the farm.
    const usedTiles = new Set<string>();
    for (const e of this.world.query("plot")) {
      if (e.plot.regionId === homeRegion) usedTiles.add(`${e.plot.tileX},${e.plot.tileY}`);
    }
    for (const e of this.world.query("farmDecoration")) {
      if (e.farmDecoration.regionId === homeRegion) usedTiles.add(`${e.farmDecoration.tileX},${e.farmDecoration.tileY}`);
    }
    for (const e of this.world.query("tileFeature")) {
      if (e.tileFeature.regionId === homeRegion) usedTiles.add(`${e.tileFeature.tileX},${e.tileFeature.tileY}`);
    }
    for (const e of this.world.query("pen")) {
      if (e.pen.regionId === homeRegion) usedTiles.add(`${e.pen.tileX},${e.pen.tileY}`);
    }
    for (const e of this.world.query("orchardTree")) {
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
        this.world.spawn({
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
  private handleBuildGreenhouse(farmer: ActingFarmer, _intent: Intention): void {
    if (farmer.farmer?.currentRegion !== "carpentry") return;
    if (farmer.id === undefined || !farmer.farmer?.homeRegion) return;

    // Already has a greenhouse? One per farmer.
    for (const g of this.world.query("greenhouse")) {
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
    for (const e of this.world.query("plot")) {
      if (e.plot.regionId === homeRegion) usedTiles.add(`${e.plot.tileX},${e.plot.tileY}`);
    }
    for (const e of this.world.query("farmDecoration")) {
      if (e.farmDecoration.regionId === homeRegion) usedTiles.add(`${e.farmDecoration.tileX},${e.farmDecoration.tileY}`);
    }
    for (const e of this.world.query("tileFeature")) {
      if (e.tileFeature.regionId === homeRegion) usedTiles.add(`${e.tileFeature.tileX},${e.tileFeature.tileY}`);
    }
    for (const e of this.world.query("pen")) {
      if (e.pen.regionId === homeRegion) usedTiles.add(`${e.pen.tileX},${e.pen.tileY}`);
    }
    for (const e of this.world.query("orchardTree")) {
      if (e.orchardTree.regionId === homeRegion) usedTiles.add(`${e.orchardTree.tileX},${e.orchardTree.tileY}`);
    }
    for (const e of this.world.query("fountain")) {
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
    this.world.spawn({
      transform: { x: structTile.x, y: structTile.y, prevX: structTile.x, prevY: structTile.y, rotation: 0 },
      sprite: { atlasId: "main", frame: "structure/greenhouse", layer: 30, tintRgba: 0xffffffff },
      greenhouse: { tileX: structTile.x, tileY: structTile.y, regionId: homeRegion, ownerId: farmer.id },
      solid: { isSolid: true, tileX: structTile.x, tileY: structTile.y },
    });
    for (const pt of plotTiles) {
      this.world.spawn({
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
   * The carpenter is where pens are built (and where brief 44 will craft them), so
   * letting it also stock starter livestock means a patient farmer builds the coop
   * and buys the first birds in ONE trip. Without this, at low ticks/day the second
   * cross-map village round-trip (after the carpentry build trip) eats so many
   * in-game days that animals were never actually bought in a 100-day run.
   */
  private handleBuyAnimal(farmer: ActingFarmer, intent: Intention): void {
    const region = farmer.farmer?.currentRegion;
    if (region !== "village" && region !== "carpentry") return;
    if (farmer.id === undefined) return;
    const animalKind = intent.data.animal as AnimalKind;
    const cost = ANIMAL_BUY_COST[animalKind];
    if (farmer.inventory.gold < cost) return;

    // Find the farmer's matching pen.
    let penEntity: With<GameEntity, "pen"> | null = null;
    for (const p of this.world.query("pen")) {
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
  private handleTend(farmer: ActingFarmer, intent: Intention): void {
    if (farmer.id === undefined) return;
    const penKind = intent.data.penKind as ("coop" | "barn") | undefined;

    // Find the pen to tend (by kind if specified, else first untended).
    let penEntity: With<GameEntity, "pen"> | null = null;
    for (const p of this.world.query("pen")) {
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
  private handlePlantTree(farmer: ActingFarmer, intent: Intention): void {
    if (farmer.id === undefined || !farmer.farmer?.homeRegion) return;
    const fruitKind = intent.data.kind as FruitKind;
    const cost = TREE_PLANT_COST[fruitKind];
    if (farmer.inventory.gold < cost) return;

    const tileX = intent.data.tileX as number | undefined;
    const tileY = intent.data.tileY as number | undefined;
    if (tileX === undefined || tileY === undefined) return;

    const homeRegion = farmer.farmer.homeRegion;
    // Check tile is free.
    for (const e of this.world.query("orchardTree")) {
      if (e.orchardTree.tileX === tileX && e.orchardTree.tileY === tileY && e.orchardTree.regionId === homeRegion) return;
    }
    for (const e of this.world.query("plot")) {
      if (e.plot.tileX === tileX && e.plot.tileY === tileY && e.plot.regionId === homeRegion) return;
    }

    farmer.inventory.gold -= cost;
    this.world.spawn({
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
   * Banks fruit into inventory (Normal quality — upgrade path is Part C).
   */
  private handleHarvestFruit(farmer: ActingFarmer, intent: Intention): void {
    if (farmer.id === undefined) return;
    const tileX = intent.data.tileX as number | undefined;
    const tileY = intent.data.tileY as number | undefined;

    // Find the target tree (by tile if given, else first ready tree).
    let treeEntity: With<GameEntity, "orchardTree"> | null = null;
    for (const t of this.world.query("orchardTree")) {
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

  /**
   * Sell all held products of a given kind to the shopkeeper (village).
   */
  private handleSellProduct(farmer: ActingFarmer, intent: Intention): void {
    if (farmer.farmer?.currentRegion !== "village") return;
    const productKind = intent.data.kind as import("../../components").ProductKind;
    const q = farmer.inventory.products?.[productKind];
    if (!q) return;
    const base = PRODUCT_SELL_PRICE[productKind];
    const total = q.normal * base * QUALITY_MULTIPLIER.normal
      + q.silver * base * QUALITY_MULTIPLIER.silver
      + q.gold   * base * QUALITY_MULTIPLIER.gold;
    farmer.inventory.gold += Math.round(total);
    farmer.inventory.products![productKind] = { normal: 0, silver: 0, gold: 0 };
  }

  /**
   * Sell all held fruit of a given kind to the shopkeeper (village).
   */
  private handleSellFruit(farmer: ActingFarmer, intent: Intention): void {
    if (farmer.farmer?.currentRegion !== "village") return;
    const fruitKind = intent.data.kind as FruitKind;
    const q = farmer.inventory.fruit?.[fruitKind];
    if (!q) return;
    const base = FRUIT_SELL_PRICE[fruitKind];
    const total = q.normal * base * QUALITY_MULTIPLIER.normal
      + q.silver * base * QUALITY_MULTIPLIER.silver
      + q.gold   * base * QUALITY_MULTIPLIER.gold;
    farmer.inventory.gold += Math.round(total);
    farmer.inventory.fruit![fruitKind] = { normal: 0, silver: 0, gold: 0 };
  }

  run(ctx: SimContext): void {
    const farmers = this.world.query("fsm", "intentions", "inventory");
    const actCtx = this.buildActContext();

    for (const farmer of farmers) {
      if (farmer.fsm.current !== "ACT") continue;

      const intentions = farmer.intentions.queue;
      const day = (farmer.beliefs?.data.currentDay as number | undefined) ?? 0;
      const ownedPlots = farmer.id !== undefined ? actCtx.plotsByOwner.get(farmer.id) ?? [] : [];

      for (const intent of intentions) {
        switch (intent.kind) {
          case "buy-seed": {
            this.handleBuySeed(farmer, intent, actCtx.shopkeeperId, ctx.tick);
            break;
          }
          case "plant": {
            this.handlePlant(farmer, intent, ownedPlots, day);
            break;
          }
          case "water": {
            this.handleWater(farmer, intent, ownedPlots);
            break;
          }
          case "sell-shopkeeper": {
            this.handleSellShopkeeper(farmer, intent);
            break;
          }
          case "post-offer": {
            this.handlePostOffer(farmer, intent, actCtx.marketWallId, ctx.tick);
            break;
          }
          case "read-offers": {
            this.handleReadOffers(farmer, intent, actCtx.marketWallId, ctx.tick);
            break;
          }
          case "buy-from-wall": {
            this.handleBuyFromWall(farmer, intent, actCtx.marketWallId, ctx.tick);
            break;
          }
          case "auction-bid": {
            this.handleAuctionBid(farmer, intent, actCtx.shopkeeperId, ctx.tick);
            break;
          }
          case "resale-bean": {
            this.handleResaleBean(farmer, intent, actCtx.shopkeeperId, ctx.tick);
            break;
          }
          case "till": {
            this.handleTill(farmer, intent, actCtx.occupiedByOwner);
            break;
          }
          case "chop-tree": {
            this.handleChopTree(farmer, intent, actCtx.featuresByTile);
            break;
          }
          case "mine-stone": {
            this.handleMineStone(farmer, intent, actCtx.featuresByTile);
            break;
          }
          case "refill-can": {
            this.handleRefillCan(farmer, intent, actCtx.fountainByRegion);
            break;
          }
          case "buy-tool": {
            this.handleBuyTool(farmer, intent);
            break;
          }
          case "craft-decoration": {
            this.handleCraftDecoration(farmer, intent);
            break;
          }
          case "upgrade-tool": {
            this.handleUpgradeTool(farmer, intent, actCtx.blacksmithId);
            break;
          }
          case "commission-build": {
            this.handleCommissionBuild(farmer, intent, ctx.tick);
            break;
          }
          case "hire-help": {
            this.handleHireHelp(farmer, day);
            break;
          }
          case "process-crop": {
            this.handleProcessCrop(farmer, intent);
            break;
          }
          case "forage": {
            this.handleForage(farmer, day);
            break;
          }
          case "fish": {
            this.handleFish(farmer, actCtx.bubbleTiles, ctx.tick);
            break;
          }
          case "build-pen": {
            this.handleBuildPen(farmer, intent);
            break;
          }
          case "build-greenhouse": {
            this.handleBuildGreenhouse(farmer, intent);
            break;
          }
          case "buy-animal": {
            this.handleBuyAnimal(farmer, intent);
            break;
          }
          case "tend": {
            this.handleTend(farmer, intent);
            break;
          }
          case "plant-tree": {
            this.handlePlantTree(farmer, intent);
            break;
          }
          case "harvest-fruit": {
            this.handleHarvestFruit(farmer, intent);
            break;
          }
          case "sell-product": {
            this.handleSellProduct(farmer, intent);
            break;
          }
          case "sell-fruit": {
            this.handleSellFruit(farmer, intent);
            break;
          }
          case "commit-contract": {
            this.handleCommitContract(farmer, intent, ctx.tick);
            break;
          }
          case "deliver-contract": {
            this.handleDeliverContract(farmer, intent);
            break;
          }
        }
      }

      // Compute total work time for physical actions in this batch.
      // Set busyUntilTick so the farmer pauses before the next deliberation.
      const tools = farmer.inventory?.tools ?? [];
      const totalCost = intentions.reduce((sum, i) => sum + actionTicks(i.kind, tools), 0);
      if (totalCost > 0 && farmer.farmer) {
        farmer.farmer.busyUntilTick = ctx.tick + totalCost;
      }

      intentions.length = 0;
      farmer.fsm.current = "FINISH_DAY";
    }
  }
}
