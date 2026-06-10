import type { World, MessageBus, Rng } from "@engine/core";
import type { GameEntity } from "../components";
import { MarketSystem } from "../systems/market";
import { ShopkeeperSystem } from "../systems/shopkeeper";
import { AuctionSystem } from "../systems/auction";

/** Spawn the Market Wall entity. Offer state lives in MarketSystem.offersById, not on the entity. */
export function spawnMarketWall(world: World<GameEntity>): GameEntity {
  return world.spawn({
    marketWall: { isMarketWall: true },
    inbox: { messages: [] },
  });
}

/** Spawn the Shopkeeper NPC entity. ShopkeeperSystem and AuctionSystem drain its inbox. */
export function spawnShopkeeper(world: World<GameEntity>): GameEntity {
  return world.spawn({
    shopkeeper: { isShopkeeper: true },
    inbox: { messages: [] },
  });
}

export interface MarketShopFeature {
  marketWall: GameEntity;
  shopkeeper: GameEntity;
  marketSystem: MarketSystem;
  shopkeeperSystem: ShopkeeperSystem;
  auctionSystem: AuctionSystem;
}

/**
 * Spawns the wall + shopkeeper and constructs MarketSystem, ShopkeeperSystem, AuctionSystem.
 * Scheduler order: market → shopkeeper → auction.
 */
export function setupMarketShopFeature(
  world: World<GameEntity>,
  bus: MessageBus,
  rng: Rng,
  ticksPerDay?: number,
): MarketShopFeature {
  const marketWall = spawnMarketWall(world);
  const shopkeeper = spawnShopkeeper(world);

  const marketSystem = new MarketSystem(bus, world, rng);
  const auctionSystem = new AuctionSystem(bus, world, rng);
  // Auction duration ~1.5 days so phase-gated farmers get deliberation cycles to bid.
  const shopkeeperSystem = new ShopkeeperSystem(
    bus,
    world,
    auctionSystem,
    ticksPerDay !== undefined
      ? { auctionDurationTicks: Math.round(ticksPerDay * 1.5) }
      : {},
  );

  return { marketWall, shopkeeper, marketSystem, shopkeeperSystem, auctionSystem };
}
