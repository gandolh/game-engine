import type { World } from "@engine/core";
import type { GameEntity } from "../../components";
import { REGIONS, ROADS, AUCTION_PODIUM_TILE, NOTICE_BOARD_TILE, HARBOR_BOARD_TILE, HARBOR_DOCK_TILE, scaleAroundNearestIsland, snapPropToLand, regionAt, type RegionId, type RegionDef } from "../regions";
import { BLACKSMITH_TILE, MARKET_WALL_TILE, SHOPKEEPER_TILE } from "./tiles";
import { fountainTile, placeProps, placeFootprint, setReservedSolidTiles } from "./placement";
import { PLOT_OFFSETS, forcedCoreTiles } from "./anchors";

type Station = { tileX: number; tileY: number; facing: "up" | "down" | "side"; flipX: boolean; pose: string | null };
// Work-NPC stations are FUNCTIONAL (agents path to them, see proximity/act).
// They MUST sit on organic-mask land; snapping would silently relocate the
// worker. forcedCoreTiles already pins region centers, but station tiles are
// off-center — so we assert land here and throw loudly if the mask carved one
// out (a real bug to fix in anchors.ts, not to paper over).
// Mutable reserved-tile set (string "x,y") shared with placement.ts so props
// never drop a solid on a functional tile. Seeded from forcedCoreTiles + the
// scaled station tiles below.
const RESERVED = new Set<string>();

function scaleStations(stations: readonly Station[]): Station[] {
  return stations.map((s) => {
    // Ride the station to its island's generated position, then snap onto that
    // island's land. With seed-generated islands (brief 93) a station's authored
    // offset can fall outside the (possibly smaller / carved) island, so we snap
    // into the nearest region's land rather than asserting — the station stays in
    // its region, never on ocean.
    const ridden = scaleAroundNearestIsland({ x: s.tileX, y: s.tileY });
    const { x, y } = snapPropToLand(ridden);
    RESERVED.add(`${x},${y}`); // never let a prop block this station
    return { ...s, tileX: x, tileY: y };
  });
}

export interface SetupRegionsResult {
  regionEntities: Map<RegionId, GameEntity>;
  plotEntities: GameEntity[];
  fountainEntities: GameEntity[];
  auctionPodiumEntity: GameEntity;
  noticeBoardEntity: GameEntity;
  harborBoardEntity: GameEntity;
}

export function setupRegions(
  world: World<GameEntity>,
  farmers: GameEntity[],
): SetupRegionsResult {
  const regionEntities = new Map<RegionId, GameEntity>();
  const plotEntities: GameEntity[] = [];
  const fountainEntities: GameEntity[] = [];

  // Seed the reserved-tile set from every region's forced-core tiles (plots,
  // home, fountain, cottage, dock anchors) so decorative props never drop a
  // solid on a functional tile. scaleStations adds station tiles as it runs.
  // placement.ts holds the live reference, so later mutations are visible.
  RESERVED.clear();
  for (const def of REGIONS) {
    for (const t of forcedCoreTiles(def)) RESERVED.add(`${t.x},${t.y}`);
  }
  // Bridge tiles (+1 halo) must never get a solid — a 2-wide bridge severed by a
  // prop would disconnect the world (brief 93).
  for (const road of ROADS) {
    for (let y = road.minY - 1; y <= road.maxY + 1; y++) {
      for (let x = road.minX - 1; x <= road.maxX + 1; x++) {
        RESERVED.add(`${x},${y}`);
      }
    }
  }
  setReservedSolidTiles(RESERVED);

  const farmerByRegion = new Map<RegionId, GameEntity>();
  for (const farmer of farmers) {
    const regionId = farmer.farmer?.homeRegion;
    if (regionId) farmerByRegion.set(regionId as RegionId, farmer);
  }

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

      const ft = fountainTile(def.bounds);
      const fountain = world.spawn({
        transform: { x: ft.x, y: ft.y, prevX: ft.x, prevY: ft.y, rotation: 0 },
        sprite: { atlasId: "main", frame: "structure/fountain", layer: 40, tintRgba: 0xffffffff },
        fountain: { isFountain: true, regionId: def.id as RegionId },
      });
      fountainEntities.push(fountain);

      if (ownerId !== undefined) {
        const hx = def.bounds.maxX - 1;
        const hy = def.bounds.maxY - 1;

        world.spawn({
          transform: { x: hx, y: hy, prevX: hx, prevY: hy, rotation: 0 },
          home: { isHome: true, regionId: def.id as RegionId, ownerId },
        });
      }
    }

    if (def.id === "blacksmith") {
      placeProps(world, [
        { x: 97, y: 79, frame: "structure/forge-oven" },
        { x: 100, y: 79, frame: "structure/tool-rack" },
        { x: 99, y: 81, frame: "structure/anvil" },
        { x: 101, y: 80, frame: "structure/quench-tub" },
        { x: 97, y: 81, frame: "structure/coal-pile" },
        { x: 98, y: 83, frame: "structure/grindstone" },
        { x: 101, y: 82, frame: "structure/ingot-rack" },
        { x: 100, y: 83, frame: "structure/anvil" },
      ]);

      placeFootprint(world, [
        { x: 99, y: 76 }, { x: 100, y: 76 },
        { x: 99, y: 77 }, { x: 100, y: 77 },
        { x: 99, y: 78 }, { x: 100, y: 78 },
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
          stations: scaleStations([

            { tileX: 99, tileY: 82, facing: "up", flipX: false, pose: "npc/blacksmith/hammer" },

            { tileX: 97, tileY: 80, facing: "up", flipX: false, pose: null },

            { tileX: 100, tileY: 80, facing: "side", flipX: false, pose: null },
          ]),
          stationIndex: 0,
          phase: "working",
          timer: 90,
          poseFrame: null,
          facing: "up",
          flipX: false,
        },
      });
    }

    if (def.id === "carpentry") {
      const cx = def.center.x;
      const cy = def.center.y;
      placeProps(world, [
        { x: 63, y: 78, frame: "structure/workbench" },
        { x: 65, y: 77, frame: "structure/sawhorse" },
        { x: 64, y: 77, frame: "structure/lumber-rack" },
        { x: 64, y: 84, frame: "structure/log-pile" },
        { x: 66, y: 84, frame: "structure/plank-stack" },
        { x: 64, y: 85, frame: "structure/sawpit" },
        { x: 66, y: 85, frame: "structure/shavings-pile" },
        { x: 67, y: 85, frame: "structure/log-pile" },
      ]);

      placeFootprint(world, [
        { x: 59, y: 76 }, { x: 60, y: 76 },
        { x: 59, y: 77 }, { x: 60, y: 77 },
        { x: 59, y: 78 }, { x: 60, y: 78 },
      ]);
      world.spawn({
        transform: { x: cx, y: cy, prevX: cx, prevY: cy, rotation: 0 },
        sprite: { atlasId: "main", frame: "structure/carpenter", layer: 50, tintRgba: 0xffffffff },
        carpenter: { isCarpenter: true },
        inbox: { messages: [] },
        workNpc: {
          idlePose: "npc/carpenter/idle",
          stations: scaleStations([

            { tileX: 63, tileY: 79, facing: "up", flipX: false, pose: "npc/carpenter/saw" },

            { tileX: 65, tileY: 78, facing: "up", flipX: false, pose: "npc/carpenter/saw" },

            { tileX: 64, tileY: 83, facing: "down", flipX: false, pose: null },
          ]),
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

  if (REGIONS.some((r) => r.id === "village")) {
    const tav = scaleAroundNearestIsland({ x: 82, y: 75 });
    const bar = scaleAroundNearestIsland({ x: 82, y: 76 });
    world.spawn({
      transform: { x: tav.x, y: tav.y, prevX: tav.x, prevY: tav.y, rotation: 0 },
      sprite: { atlasId: "main", frame: "structure/tavern", layer: 50, tintRgba: 0xffffffff },
      tavern: { isTavern: true },
      inbox: { messages: [] },
      solid: { isSolid: true, tileX: tav.x, tileY: tav.y },
    });
    world.spawn({
      transform: { x: bar.x, y: bar.y, prevX: bar.x, prevY: bar.y, rotation: 0 },
      sprite: { atlasId: "main", frame: "npc/barkeep/idle", layer: 50, tintRgba: 0xffffffff },
      workNpc: {
        idlePose: "npc/barkeep/idle",
        stations: scaleStations([

          { tileX: 82, tileY: 76, facing: "down", flipX: false, pose: "npc/barkeep/pour" },

          { tileX: 81, tileY: 76, facing: "down", flipX: false, pose: "npc/barkeep/pour" },

          { tileX: 83, tileY: 76, facing: "down", flipX: false, pose: null },
        ]),
        stationIndex: 0,
        phase: "working",
        timer: 90,
        poseFrame: null,
        facing: "down",
        flipX: false,
      },
    });
  }

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

  const shrineRegion = REGIONS.find((r) => r.id === "shrine");
  if (shrineRegion) {
    const sx = shrineRegion.center.x;
    const sy = shrineRegion.center.y;
    world.spawn({
      transform: { x: sx, y: sy, prevX: sx, prevY: sy, rotation: 0 },
      sprite: { atlasId: "main", frame: "structure/shrine", layer: 50, tintRgba: 0xffffffff },
    });
  }

  for (const [id, frame] of [
    ["heritage-stones", "structure/heritage-stones"],
    ["heritage-ruin",   "structure/heritage-ruin"],
    ["heritage-statue", "structure/heritage-statue"],
  ] as const) {
    const r = REGIONS.find((reg) => reg.id === id);
    if (r) {
      world.spawn({
        transform: { x: r.center.x, y: r.center.y, prevX: r.center.x, prevY: r.center.y, rotation: 0 },
        sprite: { atlasId: "main", frame, layer: 50, tintRgba: 0xffffffff },
      });
    }
  }

  const waterfallRegion = REGIONS.find((r) => r.id === "waterfall");
  if (waterfallRegion) {
    const wx = waterfallRegion.center.x;
    const wy = waterfallRegion.center.y;
    world.spawn({
      transform: { x: wx, y: wy, prevX: wx, prevY: wy, rotation: 0 },
      sprite: { atlasId: "main", frame: "structure/waterfall", layer: 40, tintRgba: 0xffffffff },
    });
  }

  const campRegion = REGIONS.find((r) => r.id === "camp");
  if (campRegion) {
    const cx = campRegion.center.x;
    const cy = campRegion.center.y;
    world.spawn({
      transform: { x: cx, y: cy, prevX: cx, prevY: cy, rotation: 0 },
      sprite: { atlasId: "main", frame: "structure/tent", layer: 50, tintRgba: 0xffffffff },
    });

    world.spawn({
      transform: { x: cx + 2, y: cy, prevX: cx + 2, prevY: cy, rotation: 0 },
      sprite: { atlasId: "main", frame: "structure/campfire", layer: 40, tintRgba: 0xffffffff },
    });
  }

  if (REGIONS.some((r) => r.id === "big-tree")) {
    for (const tx of [130, 131, 132]) {
      world.spawn({ solid: { isSolid: true, tileX: tx, tileY: 14 } });
    }
  }

  if (REGIONS.some((r) => r.id === "village")) {
    placeProps(world, [
      { x: 75, y: 75, frame: "decoration/lamp-post" },
      { x: 86, y: 75, frame: "decoration/lamp-post" },
      { x: 75, y: 86, frame: "decoration/lamp-post" },
      { x: 86, y: 86, frame: "decoration/lamp-post" },
      { x: 76, y: 85, frame: "decoration/signpost" },
      { x: 85, y: 76, frame: "decoration/barrel" },
      { x: 76, y: 78, frame: "decoration/crate" },
      { x: 85, y: 85, frame: "decoration/potted-plant" },
    ]);

    placeProps(world, [
      { x: 68, y: 85, frame: "decoration/log-stack" },
      { x: 67, y: 84, frame: "decoration/barrel" },
      { x: 63, y: 77, frame: "decoration/lamp-post" },
      { x: 63, y: 84, frame: "decoration/lamp-post" },
      { x: 63, y: 85, frame: "decoration/signpost" },
    ]);

    placeProps(world, [
      { x: 95, y: 76, frame: "decoration/crate" },
      { x: 102, y: 84, frame: "decoration/barrel" },
      { x: 95, y: 78, frame: "decoration/lamp-post" },
      { x: 95, y: 84, frame: "decoration/log-stack" },
    ]);

    placeProps(world, [
      { x: 62, y: 62, frame: "decoration/mushroom-cluster", solid: false },
      { x: 67, y: 63, frame: "decoration/fern", solid: false },
      { x: 63, y: 67, frame: "decoration/bush", solid: false },
      { x: 62, y: 94, frame: "decoration/fern", solid: false },
      { x: 67, y: 95, frame: "decoration/mushroom-cluster", solid: false },
      { x: 63, y: 99, frame: "decoration/log-stack", solid: false },
    ]);
    placeProps(world, [
      { x: 94, y: 62, frame: "decoration/ore-cart", solid: false },
      { x: 99, y: 63, frame: "decoration/rubble", solid: false },
      { x: 95, y: 67, frame: "decoration/crate", solid: false },
      { x: 94, y: 94, frame: "decoration/rubble", solid: false },
      { x: 99, y: 95, frame: "decoration/ore-cart", solid: false },
      { x: 95, y: 99, frame: "decoration/crate", solid: false },
    ]);
    placeProps(world, [
      { x: 77, y: 94, frame: "decoration/grain-sack" },
      { x: 84, y: 94, frame: "decoration/flour-bag" },
      { x: 77, y: 99, frame: "decoration/hay-bale" },
      { x: 84, y: 99, frame: "decoration/hay-bale" },
      { x: 80, y: 99, frame: "decoration/signpost" },
    ]);

    placeProps(world, [
      { x: 72, y: 59, frame: "decoration/stone-lantern" },
      { x: 76, y: 59, frame: "decoration/stone-lantern" },
      { x: 74, y: 63, frame: "decoration/torii" },
    ]);

    placeProps(world, [
      { x: 60, y: 48, frame: "decoration/mushroom-cluster", solid: false },
      { x: 65, y: 53, frame: "decoration/mushroom-cluster", solid: false },
      { x: 96, y: 48, frame: "decoration/cattail", solid: false },
      { x: 101, y: 53, frame: "decoration/cattail", solid: false },
    ]);

    placeProps(world, [
      { x: 46, y: 64, frame: "decoration/cairn", solid: false },
      { x: 115, y: 64, frame: "decoration/cairn", solid: false },
      { x: 46, y: 99, frame: "decoration/cairn", solid: false },
    ]);

    placeProps(world, [
      { x: 81, y: 64, frame: "decoration/cattail", solid: false },
      { x: 86, y: 64, frame: "decoration/cattail", solid: false },
    ]);
  }

  const harborBoardEntity = world.spawn({
    transform: {
      x: HARBOR_BOARD_TILE.x,
      y: HARBOR_BOARD_TILE.y,
      prevX: HARBOR_BOARD_TILE.x,
      prevY: HARBOR_BOARD_TILE.y,
      rotation: 0,
    },
    sprite: { atlasId: "main", frame: "structure/notice-board", layer: 45, tintRgba: 0xffffffff },
    harborBoard: { isHarborBoard: true, openContracts: [], committed: new Map() },
    inbox: { messages: [] },
  });

  world.spawn({
    transform: {
      x: HARBOR_DOCK_TILE.x,
      y: HARBOR_DOCK_TILE.y,
      prevX: HARBOR_DOCK_TILE.x,
      prevY: HARBOR_DOCK_TILE.y,
      rotation: 0,
    },
    sprite: { atlasId: "main", frame: "npc/dockmaster/idle", layer: 50, tintRgba: 0xffffffff },
    dockmaster: { isDockmaster: true },
    workNpc: {
      idlePose: "npc/dockmaster/idle",
      stations: scaleStations([
        { tileX: 96, tileY: 109, facing: "up", flipX: false, pose: null },   
        { tileX: 96, tileY: 106, facing: "down", flipX: false, pose: null }, 
        { tileX: 98, tileY: 110, facing: "side", flipX: false, pose: null }, 
      ]),
      stationIndex: 0,
      phase: "working",
      timer: 90,
      poseFrame: null,
      facing: "down",
      flipX: false,
    },
  });

  placeProps(world, [
    { x: 93, y: 107, frame: "structure/dock", solid: false },
    { x: 93, y: 109, frame: "structure/cargo-ship", solid: false },
    { x: 99, y: 106, frame: "decoration/buoy" },
    { x: 95, y: 111, frame: "decoration/fish-basket" },
    { x: 99, y: 111, frame: "decoration/anchor" },
  ]);

  return { regionEntities, plotEntities, fountainEntities, auctionPodiumEntity, noticeBoardEntity, harborBoardEntity };
}
