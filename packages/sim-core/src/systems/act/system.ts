import type { SimContext, System, World, MessageBus, Rng } from "@engine/core";
import type { GameEntity } from "../../components";
import { actionTicks } from "./helpers";
import type { ActContext, ActingFarmer } from "./types";


import { handlePlant, handleWater, handleTill } from "./handlers/farming";
import {
  handleBuySeed,
  handleSellShopkeeper,
  handlePostOffer,
  handleReadOffers,
  handleBuyFromWall,
  handleAuctionBid,
  handleResaleBean,
  handleBuyTool,
  handleProcessCrop,
  handleSellProduct,
  handleSellFruit,
} from "./handlers/commerce";
import {
  handleChopTree,
  handleGatherBush,
  handleMineStone,
  handleRefillCan,
  handleCraftDecoration,
  handleForage,
} from "./handlers/resource";
import { handleFish } from "./handlers/fishing";
import { handleBoardBoat, handleFishCoral, handleReturnToShore } from "./handlers/coral";
import {
  handleUpgradeTool,
  handleCommissionBuild,
  handleHireHelp,
  handleBuildPen,
  handleBuildGreenhouse,
  handleBuyAnimal,
  handleTend,
  handlePlantTree,
  handleHarvestFruit,
} from "./handlers/build";
import { handleCommitContract, handleDeliverContract } from "./handlers/harbor";
import { handlePrayAtShrine } from "./handlers/shrine";

export class ActSystem implements System {
  readonly name = "ActSystem";

  /** Seeded RNG for fishing, mining, and forage seed-drops — never use Math.random() here (determinism). */
  private readonly fishRng: Rng;
  private readonly mineRng: Rng;
  private readonly forageRng: Rng;

  constructor(
    private readonly world: World<GameEntity>,
    rng: Rng,
    private readonly bus?: MessageBus,
  ) {
    this.fishRng = rng.fork("fish");
    this.mineRng = rng.fork("mine");
    this.forageRng = rng.fork("forage-seed");
  }

  private buildActContext(): ActContext {
    const plotsByOwner = new Map<number, GameEntity[]>();
    const occupiedByOwner = new Map<number, Set<string>>();

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
      for (const farmer of this.world.query("farmer")) {
        if (farmer.farmer.homeRegion === f.fountain.regionId && farmer.id !== undefined) {
          const key = `${tx},${ty}`;
          const s = occupiedByOwner.get(farmer.id) ?? new Set();
          s.add(key);
          occupiedByOwner.set(farmer.id, s);
        }
      }
    }

    const featuresByTile = new Map<string, GameEntity>();
    for (const f of this.world.query("tileFeature")) {
      featuresByTile.set(`${f.tileFeature.tileX},${f.tileFeature.tileY}`, f);
    }

    const fountainByRegion = new Map<string, GameEntity>();
    for (const f of this.world.query("fountain")) {
      fountainByRegion.set(f.fountain.regionId, f);
    }

    // Bubble spot tiles drift daily; BubbleSystem refreshes them each morning.
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

  private carpenterId(): number | undefined {
    for (const c of this.world.query("carpenter")) return c.id;
    return undefined;
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
            handleBuySeed(farmer, intent, this.bus, actCtx.shopkeeperId, ctx.tick);
            break;
          }
          case "plant": {
            handlePlant(farmer, intent, ownedPlots, day);
            break;
          }
          case "water": {
            handleWater(farmer, intent, ownedPlots);
            break;
          }
          case "sell-shopkeeper": {
            handleSellShopkeeper(farmer, intent);
            break;
          }
          case "post-offer": {
            handlePostOffer(farmer, intent, this.bus, actCtx.marketWallId, ctx.tick);
            break;
          }
          case "read-offers": {
            handleReadOffers(farmer, intent, this.bus, actCtx.marketWallId, ctx.tick);
            break;
          }
          case "buy-from-wall": {
            handleBuyFromWall(farmer, intent, this.bus, actCtx.marketWallId, ctx.tick);
            break;
          }
          case "auction-bid": {
            handleAuctionBid(farmer, intent, this.bus, actCtx.shopkeeperId, ctx.tick);
            break;
          }
          case "resale-bean": {
            handleResaleBean(farmer, intent, this.bus, actCtx.shopkeeperId, ctx.tick);
            break;
          }
          case "till": {
            handleTill(farmer, intent, actCtx.occupiedByOwner, this.world);
            break;
          }
          case "chop-tree": {
            handleChopTree(farmer, intent, actCtx.featuresByTile, this.world, this.forageRng);
            break;
          }
          case "gather-bush": {
            handleGatherBush(farmer, intent, actCtx.featuresByTile, this.world, this.forageRng);
            break;
          }
          case "mine-stone": {
            handleMineStone(farmer, intent, actCtx.featuresByTile, this.world, this.mineRng);
            break;
          }
          case "refill-can": {
            handleRefillCan(farmer, intent, actCtx.fountainByRegion);
            break;
          }
          case "buy-tool": {
            handleBuyTool(farmer, intent);
            break;
          }
          case "craft-decoration": {
            handleCraftDecoration(farmer, intent, this.world);
            break;
          }
          case "upgrade-tool": {
            handleUpgradeTool(farmer, intent, actCtx.blacksmithId);
            break;
          }
          case "commission-build": {
            handleCommissionBuild(farmer, intent, this.bus, this.carpenterId(), ctx.tick);
            break;
          }
          case "hire-help": {
            handleHireHelp(farmer, day);
            break;
          }
          case "process-crop": {
            handleProcessCrop(farmer, intent);
            break;
          }
          case "forage": {
            handleForage(farmer, day);
            break;
          }
          case "fish": {
            handleFish(farmer, actCtx.bubbleTiles, ctx.tick, this.fishRng);
            break;
          }
          case "board-boat": {
            handleBoardBoat(farmer);
            break;
          }
          case "fish-coral": {
            handleFishCoral(farmer, ctx.tick, this.fishRng, this.bus);
            break;
          }
          case "return-to-shore": {
            handleReturnToShore(farmer);
            break;
          }
          case "build-pen": {
            handleBuildPen(farmer, intent, this.world);
            break;
          }
          case "build-greenhouse": {
            handleBuildGreenhouse(farmer, intent, this.world);
            break;
          }
          case "buy-animal": {
            handleBuyAnimal(farmer, intent, this.world);
            break;
          }
          case "tend": {
            handleTend(farmer, intent, this.world);
            break;
          }
          case "plant-tree": {
            handlePlantTree(farmer, intent, this.world);
            break;
          }
          case "harvest-fruit": {
            handleHarvestFruit(farmer, intent, this.world);
            break;
          }
          case "sell-product": {
            handleSellProduct(farmer, intent);
            break;
          }
          case "sell-fruit": {
            handleSellFruit(farmer, intent);
            break;
          }
          case "commit-contract": {
            handleCommitContract(farmer, intent, this.bus, this.world, ctx.tick);
            break;
          }
          case "deliver-contract": {
            handleDeliverContract(farmer, intent);
            break;
          }
          case "pray-at-shrine": {
            handlePrayAtShrine(farmer, day);
            break;
          }
        }
      }

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
