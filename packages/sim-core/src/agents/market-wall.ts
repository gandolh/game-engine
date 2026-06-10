import type { World, MessageBus, Rng } from "@engine/core";
import type { GameEntity } from "../components";
import { MarketSystem } from "../systems/market";
import { ShopkeeperSystem } from "../systems/shopkeeper";
import { AuctionSystem } from "../systems/auction";

/**
 * Spawn the Market Wall entity. The bulletin board itself has no offer
 * state on the entity — offers are owned by `MarketSystem.offersById`
 * (chosen path: store-in-system, not store-on-entity).
 */
export function spawnMarketWall(world: World<GameEntity>): GameEntity {
  return world.spawn({
    marketWall: { isMarketWall: true },
    inbox: { messages: [] },
  });
}

/**
 * Spawn the Shopkeeper NPC entity. Handlers run inside `ShopkeeperSystem`
 * and `AuctionSystem`, both of which drain this entity's inbox.
 */
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
 * Public entry point: spawns the wall + shopkeeper, constructs the three
 * systems with mutual references (Shopkeeper triggers auctions via the
 * AuctionSystem directly + broadcasts AUCTION_CFP on the bus for farmer
 * awareness). Caller adds the systems to the scheduler.
 *
 * Order in the scheduler should be: market, shopkeeper, auction.
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
  // brief 27 — keep the auction open across the next day's work phases so the
  // (now phase-gated) farmers get deliberation cycles to bid. ~1.5 days; falls
  // back to the system default when ticksPerDay isn't supplied (e.g. tests).
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
