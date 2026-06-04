import type { SimContext, System, World, MessageBus, Intention, With } from "@engine/core";
import { REGIONS } from "../world/regions";
import type { GameEntity, CropKind, PlotState, ToolKind, ToolTier, DecorationKind } from "../components";
import { TOOL_PRICE, DECORATION_RECIPE, MAX_DECORATION_BOOST } from "../components";
import {
  PERFORMATIVE,
  ONT_MARKET,
  ONT_CNP,
  type PostOfferBody,
  type ReadOffersBody,
  type BuyRequestBody,
  type CnpTaskBody,
} from "../protocols";
import {
  ONT_SHOP,
  type ShopSellBody,
  type AuctionBidBody,
  type ResaleBeanBody,
} from "../protocols/shop";
import { seasonForDay, type Season } from "../protocols/weather";
const SELL_PRICE: Record<CropKind, number> = { radish: 8, wheat: 14, pumpkin: 35 };
const GROWTH_DAYS: Record<CropKind, number> = { radish: 2, wheat: 4, pumpkin: 7 };

/**
 * Mill processing price per crop unit — the gold a farmer earns by milling raw
 * crops into goods at the mill. Set above the shopkeeper's buy price
 * (radish 5 / wheat 8 / pumpkin 22) to create an economic gradient: the mill
 * pays more, but it costs a trip + 2 AP. This is what makes the mill a real
 * choice rather than a prop.
 */
const MILL_PRICE: Record<CropKind, number> = { radish: 8, wheat: 13, pumpkin: 33 };
/** Crops processed per `process-crop` action. */
const MILL_BATCH = 5;

/**
 * Seasonal foraging zones: each is only productive in its season. Foraging in
 * the right zone + right season yields gold; out of season (or wrong zone) it's
 * a no-op. This is the seasonal "lock" — enforced here, not in pathfinding, so
 * the zones stay walkable year-round but only reward in-season.
 */
const FORAGE_ZONES: Record<string, { season: Season; reward: number }> = {
  "mushroom-grove": { season: "autumn", reward: 18 }, // truffles in autumn
  "ice-pond":       { season: "winter", reward: 22 }, // ice-fishing in winter
};

/**
 * Physical-action time cost in ticks (at 20 Hz).
 * Wooden=60t(3s), stone=40t(2s), iron=20t(1s) per the brief.
 * Social / travel actions are instant (0).
 */
import { TOOL_WORK_TICKS } from "../components";

function actionTicks(kind: string, tools: import("../components").Tool[]): number {
  const physicalActions = new Set(["plant","water","till","chop-tree","mine-stone","harvest","refill-can"]);
  if (!physicalActions.has(kind)) return 0;
  // Pick the best relevant tool for the action.
  let toolKind: import("../components").ToolKind | null = null;
  if (kind === "till") toolKind = "hoe";
  else if (kind === "chop-tree") toolKind = "axe";
  else if (kind === "mine-stone") toolKind = "pickaxe";
  else toolKind = "hoe"; // plant/water/harvest — hoe is the reference
  const tierOrder: Record<string, number> = { wooden: 0, stone: 1, iron: 2 };
  const best = tools
    .filter(t => t.kind === toolKind && t.durability > 0)
    .sort((a, b) => (tierOrder[b.tier] ?? 0) - (tierOrder[a.tier] ?? 0))[0];
  const tier = (best?.tier ?? "wooden") as import("../components").ToolTier;
  return TOOL_WORK_TICKS[tier];
}

/** Stone drop table: [ironOre chance, geode chance]. Rest is plain stone. */
const STONE_IRON_CHANCE  = 0.20;
const STONE_GEODE_CHANCE = 0.10;

/** Upgrade path: wooden → stone → iron. */
const UPGRADE_PATH: Record<ToolTier, ToolTier | null> = {
  wooden: "stone",
  stone:  "iron",
  iron:   null,
};

/** Gold cost to upgrade at blacksmith (per tier of destination). */
const UPGRADE_COST: Partial<Record<ToolTier, number>> = {
  stone: 15,
  iron:  25,
};

/**
 * A farmer currently being processed by run(): narrowed to the components the
 * run() query guarantees (`query("fsm", "intentions", "inventory")`), so the
 * extracted handlers can read these fields without re-guarding for undefined.
 */
type ActingFarmer = With<GameEntity, "fsm" | "intentions" | "inventory">;

interface ActContext {
  plotsByOwner: Map<number, GameEntity[]>;
  occupiedByOwner: Map<number, Set<string>>;
  featuresByTile: Map<string, GameEntity>;
  fountainByRegion: Map<string, GameEntity>;
  blacksmithId: number | undefined;
  marketWallId: number | undefined;
  shopkeeperId: number | undefined;
}

export class ActSystem implements System {
  readonly name = "ActSystem";

  constructor(
    private readonly world: World<GameEntity>,
    private readonly bus?: MessageBus,
  ) {}

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

    return { plotsByOwner, occupiedByOwner, featuresByTile, fountainByRegion, blacksmithId, marketWallId, shopkeeperId };
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
    const free = ownedPlots.find((p) => p.plot!.state.kind === "empty");
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
    }
  }

  private handleWater(farmer: ActingFarmer, ownedPlots: GameEntity[]): void {
    // Watering consumes 1 charge from the watering can. If empty,
    // skip (agent should have queued a refill first).
    const can = farmer.inventory.wateringCan;
    if (can && can.charges <= 0) return;
    const due = ownedPlots
      .filter((p) => {
        const s = p.plot!.state;
        return s.kind === "planted" && s.wateredToday !== true;
      })
      .sort((a, b) => {
        const sa = a.plot!.state as Extract<PlotState, { kind: "planted" }>;
        const sb = b.plot!.state as Extract<PlotState, { kind: "planted" }>;
        return (sb.daysSinceWater ?? 0) - (sa.daysSinceWater ?? 0);
      })[0];
    if (due) {
      const s = due.plot!.state as Extract<PlotState, { kind: "planted" }>;
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
    if (available > 0) {
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

  private handleCnpInitiate(
    farmer: ActingFarmer,
    intent: Intention,
    tick: number,
  ): void {
    if (!this.bus || farmer.id === undefined) return;
    const body: CnpTaskBody = {
      taskId: `${farmer.id}-${tick}`,
      initiatorId: farmer.id,
      buyCrop: intent.data.crop as CropKind,
      quantity: intent.data.quantity as number,
      maxPricePerUnit: intent.data.maxPricePerUnit as number,
      deadlineTick: tick + ((intent.data.deadlineTicks as number) ?? 2),
    };
    this.sendIntentMessage(
      PERFORMATIVE.CFP,
      ONT_CNP.TASK,
      farmer.id,
      "broadcast",
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
    const occ = occupiedByOwner.get(farmer.id) ?? new Set();
    const tileKey = `${tileX},${tileY}`;
    if (occ.has(tileKey)) return; // already occupied
    // Spawn new plot entity
    this.world.spawn({
      transform: { x: tileX, y: tileY, prevX: tileX, prevY: tileY, rotation: 0 },
      plot: {
        ownerId: farmer.id,
        regionId: farmer.farmer?.currentRegion ?? (intent.data.regionId as string) as import("../world/regions").RegionId,
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
    const feat = featuresByTile.get(`${tileX},${tileY}`);
    if (!feat || !feat.tileFeature || feat.tileFeature.kind !== "stone") return;
    if (!farmer.resources) farmer.resources = { wood: 0, stone: 0, ironOre: 0, geodes: 0 };
    // Random drops
    const roll = Math.random();
    if (roll < STONE_GEODE_CHANCE) {
      farmer.resources.geodes += 1;
    } else if (roll < STONE_GEODE_CHANCE + STONE_IRON_CHANCE) {
      farmer.resources.ironOre += 1;
    } else {
      farmer.resources.stone += 1;
    }
    this.world.despawn(feat);
    featuresByTile.delete(`${tileX},${tileY}`);
    // Drain pickaxe
    pick.durability -= 1;
    if (pick.durability <= 0) {
      const idx = (farmer.inventory.tools ?? []).indexOf(pick);
      if (idx >= 0) farmer.inventory.tools!.splice(idx, 1);
    }
  }

  private handleRefillCan(farmer: ActingFarmer): void {
    // Refill watering can — only valid at a water source: the farmer's
    // own farm (home fountain) or a well (well-north/well-south).
    // Without this guard the can refilled anywhere (mid-road, forest…),
    // making the wells and fountains pointless.
    const can = farmer.inventory.wateringCan;
    if (!can) return;
    const region = farmer.farmer?.currentRegion;
    const atWaterSource =
      region === "well-north" ||
      region === "well-south" ||
      region === farmer.farmer?.homeRegion;
    if (!atWaterSource) return;
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
    const nextTier = UPGRADE_PATH[existing.tier];
    if (!nextTier) return; // already max
    const cost = UPGRADE_COST[nextTier] ?? 99;
    if (farmer.inventory.gold < cost) return;
    farmer.inventory.gold -= cost;
    // Replace tool with upgraded version (full durability)
    const idx = tools.indexOf(existing);
    if (idx >= 0) {
      tools[idx] = { kind: toolKind, tier: nextTier, durability: nextTier === "stone" ? 150 : 200 };
    }
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
    farmer.inventory.gold += zone.reward;
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
            this.handleWater(farmer, ownedPlots);
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
          case "cnp-initiate": {
            this.handleCnpInitiate(farmer, intent, ctx.tick);
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
            this.handleRefillCan(farmer);
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
          case "process-crop": {
            this.handleProcessCrop(farmer, intent);
            break;
          }
          case "forage": {
            this.handleForage(farmer, day);
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
