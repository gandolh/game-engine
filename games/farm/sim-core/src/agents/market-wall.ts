import type { World, MessageBus, Rng } from "@engine/core";
import type { GameEntity } from "../components";
import { MarketSystem } from "../systems/economy/market";
import { WallTradeSystem } from "../systems/economy/wall-trade";
import { ShopkeeperSystem } from "../systems/shopkeeper";
import { AuctionSystem } from "../systems/auction";

export function spawnMarketWall(world: World<GameEntity>): GameEntity {
  return world.spawn({
    marketWall: { isMarketWall: true },
    inbox: { messages: [] },
  });
}

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
  /** Seller-side BUY_REQUEST consumer — must be scheduled in SNOOP (brief 98). */
  wallTradeSystem: WallTradeSystem;
  shopkeeperSystem: ShopkeeperSystem;
  auctionSystem: AuctionSystem;
}

export function setupMarketShopFeature(
  world: World<GameEntity>,
  bus: MessageBus,
  rng: Rng,
  ticksPerDay?: number,
): MarketShopFeature {
  const marketWall = spawnMarketWall(world);
  const shopkeeper = spawnShopkeeper(world);

  const marketSystem = new MarketSystem(
    bus,
    world,
    rng,
    ticksPerDay !== undefined ? { ticksPerDay } : {},
  );
  const wallTradeSystem = new WallTradeSystem(world, bus, marketSystem);
  const auctionSystem = new AuctionSystem(bus, world, rng);

  const shopkeeperSystem = new ShopkeeperSystem(
    bus,
    world,
    auctionSystem,
    ticksPerDay !== undefined
      ? { auctionDurationTicks: Math.round(ticksPerDay * 1.5) }
      : {},
  );

  return { marketWall, shopkeeper, marketSystem, wallTradeSystem, shopkeeperSystem, auctionSystem };
}
