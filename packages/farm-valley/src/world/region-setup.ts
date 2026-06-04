import type { World } from "@engine/core";
import type { GameEntity } from "../components";
import { REGIONS, AUCTION_PODIUM_TILE, NOTICE_BOARD_TILE, type RegionId, type RegionDef } from "./regions";

/** Fountain is placed at the top-left corner of each farm (minX+1, minY+1). */
function fountainTile(bounds: RegionDef["bounds"]): { x: number; y: number } {
  return { x: bounds.minX + 1, y: bounds.minY + 1 };
}

/** Spawn a batch of static decorative props (sprite + transform only). Layer 40
 *  sits below NPCs/farmers (50/100) so the worker can stand in front of them. */
function placeProps(
  world: World<GameEntity>,
  props: ReadonlyArray<{ x: number; y: number; frame: string }>,
): void {
  for (const p of props) {
    world.spawn({
      transform: { x: p.x, y: p.y, prevX: p.x, prevY: p.y, rotation: 0 },
      sprite: { atlasId: "main", frame: p.frame, layer: 40, tintRgba: 0xffffffff },
    });
  }
}

/** Blacksmith NPC tile within the blacksmith region (SE, shifted +12 with the
 *  east cluster when the world widened for Pip's farm). */
const BLACKSMITH_TILE = { x: 45, y: 32 } as const;

/** Village tile where the market wall lives. */
const MARKET_WALL_TILE = { x: 16, y: 16 } as const;
/** Village tile where the shopkeeper stands. */
const SHOPKEEPER_TILE = { x: 23, y: 23 } as const;

/** Personality → region assignment (Cora N, Atticus far-E, Hannah S, Otto W, Pip E-center). */
const PERSONALITY_TO_REGION: Record<string, RegionId> = {
  conservative: "farm-cora",
  aggressive: "farm-atticus",
  hoarder: "farm-hannah",
  opportunist: "farm-otto",
  pip: "farm-pip",
};

export interface SetupRegionsResult {
  regionEntities: Map<RegionId, GameEntity>;
  plotEntities: GameEntity[];
  fountainEntities: GameEntity[];
  auctionPodiumEntity: GameEntity;
  noticeBoardEntity: GameEntity;
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
  const fountainEntities: GameEntity[] = [];

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
      // 2×2 grid of plots, each separated from its neighbours by at least 2
      // empty cells. Offsets {-2, +1} put plot tiles 3 apart on each axis (a
      // 2-cell gap between them), staying centered in the 12×12 farm.
      const PLOT_OFFSETS = [-2, 1] as const;

      // Place the farmer at the farm center, currentRegion = farm id. The
      // player (Pip) starts standing on its own first plot instead of the bare
      // center tile, so the spectator sees it right where it can till/plant.
      const start = farmer.player
        ? { x: def.center.x + PLOT_OFFSETS[0], y: def.center.y + PLOT_OFFSETS[0] }
        : def.center;
      farmer.transform = {
        x: start.x,
        y: start.y,
        prevX: start.x,
        prevY: start.y,
        rotation: 0,
      };
      if (farmer.farmer) farmer.farmer.currentRegion = def.id;

      for (const dy of PLOT_OFFSETS) {
        for (const dx of PLOT_OFFSETS) {
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

      // Fountain at top-left corner of the farm.
      const ft = fountainTile(def.bounds);
      const fountain = world.spawn({
        transform: { x: ft.x, y: ft.y, prevX: ft.x, prevY: ft.y, rotation: 0 },
        sprite: { atlasId: "main", frame: "structure/fountain", layer: 40, tintRgba: 0xffffffff },
        fountain: { isFountain: true, regionId: def.id as RegionId },
      });
      fountainEntities.push(fountain);

      // Home (farmhouse) at bottom-right corner of the farm.
      if (ownerId !== undefined) {
        const hx = def.bounds.maxX - 1;
        const hy = def.bounds.maxY - 1;
        world.spawn({
          transform: { x: hx, y: hy, prevX: hx, prevY: hy, rotation: 0 },
          sprite: { atlasId: "main", frame: "structure/home", layer: 40, tintRgba: 0xffffffff },
          home: { isHome: true, regionId: def.id as RegionId, ownerId },
        });
      }
    }

    // Blacksmith NPC + forge props. The NPC patrols anvil → oven → quench.
    if (def.id === "blacksmith") {
      placeProps(world, [
        { x: 44, y: 31, frame: "structure/forge-oven" },
        { x: 46, y: 31, frame: "structure/tool-rack" },
        { x: 46, y: 33, frame: "structure/anvil" },
        { x: 48, y: 32, frame: "structure/quench-tub" },
      ]);
      world.spawn({
        transform: {
          x: BLACKSMITH_TILE.x,
          y: BLACKSMITH_TILE.y,
          prevX: BLACKSMITH_TILE.x,
          prevY: BLACKSMITH_TILE.y,
          rotation: 0,
        },
        sprite: { atlasId: "main", frame: "structure/blacksmith", layer: 50, tintRgba: 0xffffffff },
        blacksmith: { isBlacksmith: true },
        inbox: { messages: [] },
        workNpc: {
          idlePose: "npc/blacksmith/idle",
          stations: [
            // Stand below the anvil, face up, hammer.
            { tileX: 46, tileY: 34, facing: "up", flipX: false, pose: "npc/blacksmith/hammer" },
            // Tend the oven (stand below it, face up, no swing pose).
            { tileX: 44, tileY: 32, facing: "up", flipX: false, pose: null },
            // Quench at the tub (stand left of it, face side/right).
            { tileX: 47, tileY: 32, facing: "side", flipX: false, pose: null },
          ],
          stationIndex: 0,
          phase: "working",
          timer: 90,
          poseFrame: null,
          facing: "up",
          flipX: false,
        },
      });
    }

    // Carpenter NPC + workshop props. The NPC patrols workbench → sawhorse.
    if (def.id === "carpentry") {
      const cx = def.center.x;
      const cy = def.center.y;
      placeProps(world, [
        { x: 3, y: 3, frame: "structure/workbench" },
        { x: 6, y: 3, frame: "structure/sawhorse" },
        { x: 2, y: 6, frame: "structure/log-pile" },
        { x: 6, y: 6, frame: "structure/plank-stack" },
      ]);
      world.spawn({
        transform: { x: cx, y: cy, prevX: cx, prevY: cy, rotation: 0 },
        sprite: { atlasId: "main", frame: "structure/carpenter", layer: 50, tintRgba: 0xffffffff },
        carpenter: { isCarpenter: true },
        inbox: { messages: [] },
        workNpc: {
          idlePose: "npc/carpenter/idle",
          stations: [
            // Saw at the workbench (stand below, face up).
            { tileX: 3, tileY: 4, facing: "up", flipX: false, pose: "npc/carpenter/saw" },
            // Saw the log on the sawhorse (stand below, face up).
            { tileX: 6, tileY: 4, facing: "up", flipX: false, pose: "npc/carpenter/saw" },
            // Inspect the log pile (stand right of it, face side/left).
            { tileX: 3, tileY: 6, facing: "side", flipX: true, pose: null },
          ],
          stationIndex: 0,
          phase: "working",
          timer: 90,
          poseFrame: null,
          facing: "up",
          flipX: false,
        },
      });
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

  // ── Auction podium — town square center ─────────────────────────────────────
  const auctionPodiumEntity = world.spawn({
    transform: {
      x: AUCTION_PODIUM_TILE.x,
      y: AUCTION_PODIUM_TILE.y,
      prevX: AUCTION_PODIUM_TILE.x,
      prevY: AUCTION_PODIUM_TILE.y,
      rotation: 0,
    },
    sprite: { atlasId: "main", frame: "structure/auction-podium", layer: 45, tintRgba: 0xffffffff },
    auctionPodium: { isAuctionPodium: true },
    inbox: { messages: [] },
  });

  // ── Notice board — west edge of town square ──────────────────────────────────
  const noticeBoardEntity = world.spawn({
    transform: {
      x: NOTICE_BOARD_TILE.x,
      y: NOTICE_BOARD_TILE.y,
      prevX: NOTICE_BOARD_TILE.x,
      prevY: NOTICE_BOARD_TILE.y,
      rotation: 0,
    },
    sprite: { atlasId: "main", frame: "structure/notice-board", layer: 45, tintRgba: 0xffffffff },
    noticeBoard: { isNoticeBoard: true },
    inbox: { messages: [] },
  });

  // ── Mill NPC ──────────────────────────────────────────────────────────────────
  const millRegion = REGIONS.find((r) => r.id === "mill");
  if (millRegion) {
    const mx = millRegion.center.x;
    const my = millRegion.center.y;
    world.spawn({
      transform: { x: mx, y: my, prevX: mx, prevY: my, rotation: 0 },
      sprite: { atlasId: "main", frame: "structure/mill", layer: 50, tintRgba: 0xffffffff },
      mill: { isMill: true },
      inbox: { messages: [] },
    });
  }

  // ── Wells (one near each quarry) ─────────────────────────────────────────────
  for (const id of ["well-north", "well-south"] as const) {
    const r = REGIONS.find((reg) => reg.id === id);
    if (r) {
      world.spawn({
        transform: { x: r.center.x, y: r.center.y, prevX: r.center.x, prevY: r.center.y, rotation: 0 },
        sprite: { atlasId: "main", frame: "structure/well", layer: 45, tintRgba: 0xffffffff },
        well: { isWell: true, regionId: id },
      });
    }
  }

  // ── Seasonal zone markers (mushroom grove + ice pond) ─────────────────────────
  // A single decorative entity marks each seasonal zone so spectators can read it.
  for (const [id, frame] of [
    ["mushroom-grove", "structure/mushroom-marker"],
    ["ice-pond",       "structure/ice-marker"],
  ] as const) {
    const r = REGIONS.find((reg) => reg.id === id);
    if (r) {
      world.spawn({
        transform: { x: r.center.x, y: r.center.y, prevX: r.center.x, prevY: r.center.y, rotation: 0 },
        sprite: { atlasId: "main", frame, layer: 40, tintRgba: 0xffffffff },
      });
    }
  }

  return { regionEntities, plotEntities, fountainEntities, auctionPodiumEntity, noticeBoardEntity };
}
