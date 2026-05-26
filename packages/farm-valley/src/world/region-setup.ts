import type { World } from "@engine/core";
import type { GameEntity } from "../components";
import { REGIONS, type RegionId, type RegionDef } from "./regions";

/** Village tile where the market wall lives. */
const MARKET_WALL_TILE = { x: 16, y: 16 } as const;
/** Village tile where the shopkeeper stands. */
const SHOPKEEPER_TILE = { x: 23, y: 23 } as const;

/** Personality → region assignment (Cora N, Atticus E, Hannah S, Otto W). */
const PERSONALITY_TO_REGION: Record<string, RegionId> = {
  conservative: "farm-cora",
  aggressive: "farm-atticus",
  hoarder: "farm-hannah",
  opportunist: "farm-otto",
};

export interface SetupRegionsResult {
  regionEntities: Map<RegionId, GameEntity>;
  plotEntities: GameEntity[];
}

/**
 * Spawn 5 region entities (one per REGIONS entry). For each farm region, lay
 * out 9 plots in a 3×3 grid centered in the region with the owning farmer's
 * id and the region id stamped on. For the village, ensure a market wall and
 * shopkeeper entity exist at fixed tiles, each with a Transform so they live
 * in world space (re-uses existing entities if already spawned by
 * `setupMarketShopFeature`, otherwise creates new ones).
 *
 * Each farmer's `currentRegion` is set to their assigned farm id and their
 * `transform` is moved to the farm center.
 */
export function setupRegions(
  world: World<GameEntity>,
  farmers: GameEntity[],
): SetupRegionsResult {
  const regionEntities = new Map<RegionId, GameEntity>();
  const plotEntities: GameEntity[] = [];

  // Assign farmers to regions by personality.
  const farmerByRegion = new Map<RegionId, GameEntity>();
  for (const farmer of farmers) {
    const kind = farmer.personality?.kind;
    if (typeof kind !== "string") continue;
    const regionId = PERSONALITY_TO_REGION[kind];
    if (regionId) farmerByRegion.set(regionId, farmer);
  }

  // Spawn region entities + farm plots.
  for (const def of REGIONS) {
    const farmer = def.kind === "farm" ? farmerByRegion.get(def.id) : undefined;
    const ownerId = farmer?.id;
    const regionEntity = world.spawn({
      region: {
        id: def.id,
        kind: def.kind,
        ownerId,
        bounds: def.bounds,
        center: def.center,
      } satisfies RegionDef,
    });
    regionEntities.set(def.id, regionEntity);

    if (def.kind === "farm" && farmer !== undefined && ownerId !== undefined) {
      // Place the farmer at the farm center, currentRegion = farm id.
      const { x, y } = def.center;
      farmer.transform = { x, y, prevX: x, prevY: y, rotation: 0 };
      if (farmer.farmer) farmer.farmer.currentRegion = def.id;

      // 3×3 grid of plots centered in the region. center ± 1 on each axis.
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          const tileX = def.center.x + dx;
          const tileY = def.center.y + dy;
          const plot = world.spawn({
            transform: {
              x: tileX,
              y: tileY,
              prevX: tileX,
              prevY: tileY,
              rotation: 0,
            },
            plot: {
              ownerId,
              regionId: def.id,
              tileX,
              tileY,
              state: { kind: "empty" },
            },
          });
          plotEntities.push(plot);
        }
      }
    }
  }

  // Village fixtures: market wall and shopkeeper. Re-use entities already
  // spawned by setupMarketShopFeature when present; otherwise create them.
  // Both transforms are in tile coords; the renderer converts to pixels.
  const wallTransform = {
    x: MARKET_WALL_TILE.x,
    y: MARKET_WALL_TILE.y,
    prevX: MARKET_WALL_TILE.x,
    prevY: MARKET_WALL_TILE.y,
    rotation: 0,
  };
  const wallSprite = {
    atlasId: "main",
    frame: "structure/market-wall",
    layer: 50,
    tintRgba: 0xffffffff,
  };
  let wall: GameEntity | undefined;
  for (const w of world.query("marketWall")) {
    wall = w;
    break;
  }
  if (wall) {
    wall.transform = wallTransform;
    wall.sprite = wallSprite;
  } else {
    world.spawn({
      marketWall: { isMarketWall: true },
      inbox: { messages: [] },
      transform: wallTransform,
      sprite: wallSprite,
    });
  }

  const shopTransform = {
    x: SHOPKEEPER_TILE.x,
    y: SHOPKEEPER_TILE.y,
    prevX: SHOPKEEPER_TILE.x,
    prevY: SHOPKEEPER_TILE.y,
    rotation: 0,
  };
  const shopSprite = {
    atlasId: "main",
    frame: "structure/shopkeeper",
    layer: 50,
    tintRgba: 0xffffffff,
  };
  let shopkeeper: GameEntity | undefined;
  for (const s of world.query("shopkeeper")) {
    shopkeeper = s;
    break;
  }
  if (shopkeeper) {
    shopkeeper.transform = shopTransform;
    shopkeeper.sprite = shopSprite;
  } else {
    world.spawn({
      shopkeeper: { isShopkeeper: true },
      inbox: { messages: [] },
      transform: shopTransform,
      sprite: shopSprite,
    });
  }

  return { regionEntities, plotEntities };
}
