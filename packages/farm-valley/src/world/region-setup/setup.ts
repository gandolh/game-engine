/**
 * setupRegions — spawn all region, plot, NPC, and prop entities for the world.
 * Split from region-setup.ts. Placement call order is identical to the original.
 */

import type { World } from "@engine/core";
import type { GameEntity } from "../../components";
import { REGIONS, AUCTION_PODIUM_TILE, NOTICE_BOARD_TILE, HARBOR_BOARD_TILE, HARBOR_DOCK_TILE, type RegionId, type RegionDef } from "../regions";
import { BLACKSMITH_TILE, MARKET_WALL_TILE, SHOPKEEPER_TILE } from "./tiles";
import { fountainTile, placeProps, placeFootprint } from "./placement";

export interface SetupRegionsResult {
  regionEntities: Map<RegionId, GameEntity>;
  plotEntities: GameEntity[];
  fountainEntities: GameEntity[];
  auctionPodiumEntity: GameEntity;
  noticeBoardEntity: GameEntity;
  /** brief 46 — harbor contract board entity. */
  harborBoardEntity: GameEntity;
}

/**
 * Spawn one region entity per REGIONS entry. For each farm region, lay
 * out 4 plots in a 2×2 grid centered in the region with the owning farmer's
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

  // Assign farmers to their farms by the homeRegion each carries (set at
  // spec-generation time). Supports any number of farmers / farms.
  const farmerByRegion = new Map<RegionId, GameEntity>();
  for (const farmer of farmers) {
    const regionId = farmer.farmer?.homeRegion;
    if (regionId) farmerByRegion.set(regionId as RegionId, farmer);
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

    // Blacksmith NPC + forge props. A big forge-house (baked static scenery,
    // see render-systems BIG_STRUCTURES) stands on the EAST half of the island
    // (x63–64, y34–36); the work-yard props sit on the open ground in front of
    // it (y37–41). IMPORTANT: the island's through-road spine runs down x60–61
    // (the bridge road {60-61, 12-33} lands at the top and {60-61, 44-55} exits
    // the bottom), so the building/props/footprint must keep x60–61 CLEAR or the
    // island — and everything routed through it — gets walled off. The NPC
    // patrols anvil → oven → quench.
    if (def.id === "blacksmith") {
      placeProps(world, [
        // Forge work line in front of the forge-house (east half, x62–67).
        { x: 62, y: 37, frame: "structure/forge-oven" },
        { x: 65, y: 37, frame: "structure/tool-rack" },
        { x: 64, y: 39, frame: "structure/anvil" },
        { x: 66, y: 38, frame: "structure/quench-tub" },
        // New detail props that flesh out the forge yard.
        { x: 62, y: 39, frame: "structure/coal-pile" },
        { x: 63, y: 41, frame: "structure/grindstone" },
        { x: 66, y: 40, frame: "structure/ingot-rack" },
        { x: 65, y: 41, frame: "structure/anvil" },
      ]);
      // The big forge-house occupies x63–64 × y34–36 (baked art in render-
      // systems BIG_STRUCTURES); block its footprint so nobody walks through it.
      placeFootprint(world, [
        { x: 63, y: 34 }, { x: 64, y: 34 },
        { x: 63, y: 35 }, { x: 64, y: 35 },
        { x: 63, y: 36 }, { x: 64, y: 36 },
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
            // Stand below the anvil (64,39), face up, hammer.
            { tileX: 64, tileY: 40, facing: "up", flipX: false, pose: "npc/blacksmith/hammer" },
            // Tend the oven (62,37) — stand below it, face up, no swing pose.
            { tileX: 62, tileY: 38, facing: "up", flipX: false, pose: null },
            // Quench at the tub (66,38) — stand left of it, face side/right.
            { tileX: 65, tileY: 38, facing: "side", flipX: false, pose: null },
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

    // Carpenter NPC + workshop props. A big carpenter-workshop (baked static
    // scenery, see render-systems BIG_STRUCTURES) stands on the WEST half of the
    // island (x21–22, y34–36); the lumber-yard props sit on the open ground in
    // front of it (y37–41). IMPORTANT: the island's through-road spine runs down
    // x24–25 (bridge road {24-25, 12-33} lands at the top and {24-25, 44-55}
    // exits the bottom), so the building/props/footprint must keep x24–25 CLEAR
    // or the island — and forest-north + farm-cora, which route through it — get
    // walled off. The NPC patrols workbench → sawhorse.
    if (def.id === "carpentry") {
      const cx = def.center.x;
      const cy = def.center.y;
      placeProps(world, [
        // Bench + sawing line in front of the workshop (west + east of spine).
        { x: 21, y: 37, frame: "structure/workbench" },
        { x: 27, y: 37, frame: "structure/sawhorse" },
        { x: 20, y: 40, frame: "structure/log-pile" },
        { x: 27, y: 40, frame: "structure/plank-stack" },
        // New detail props that flesh out the lumber yard.
        { x: 28, y: 38, frame: "structure/lumber-rack" },
        { x: 22, y: 41, frame: "structure/sawpit" },
        // Shavings sit east of the spine — column x20,y37–38 is the mushroom-
        // grove road landing and must stay clear.
        { x: 23, y: 41, frame: "structure/shavings-pile" },
        { x: 27, y: 41, frame: "structure/log-pile" },
      ]);
      // The big carpenter-workshop occupies x21–22 × y34–36 (baked art in
      // render-systems BIG_STRUCTURES); block its footprint.
      placeFootprint(world, [
        { x: 21, y: 34 }, { x: 22, y: 34 },
        { x: 21, y: 35 }, { x: 22, y: 35 },
        { x: 21, y: 36 }, { x: 22, y: 36 },
      ]);
      world.spawn({
        transform: { x: cx, y: cy, prevX: cx, prevY: cy, rotation: 0 },
        sprite: { atlasId: "main", frame: "structure/carpenter", layer: 50, tintRgba: 0xffffffff },
        carpenter: { isCarpenter: true },
        inbox: { messages: [] },
        workNpc: {
          idlePose: "npc/carpenter/idle",
          stations: [
            // Saw at the workbench (21,37) — stand below, face up.
            { tileX: 21, tileY: 38, facing: "up", flipX: false, pose: "npc/carpenter/saw" },
            // Saw the log on the sawhorse (27,37) — stand below, face up.
            { tileX: 27, tileY: 38, facing: "up", flipX: false, pose: "npc/carpenter/saw" },
            // Inspect the log pile (20,40) — stand right of it, face side/left.
            { tileX: 21, tileY: 40, facing: "side", flipX: true, pose: null },
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

  // ── Tavern — village social hub (brief 44) ──────────────────────────────────
  // The tavern building stands on the village's north edge (45,34); the barkeep
  // NPC works the bar one tile below it (45,35), patrolling pour → wipe → idle so
  // the hub reads as a place, not a terminal. The tavern entity carries an inbox
  // (TavernSystem snoops DAY_START for the daily gossip line) + the tavern tag.
  // Both tiles are free village tiles (clear of the market wall, shopkeeper,
  // podium, notice board and the corner lamps/props).
  if (REGIONS.some((r) => r.id === "village")) {
    world.spawn({
      transform: { x: 45, y: 34, prevX: 45, prevY: 34, rotation: 0 },
      sprite: { atlasId: "main", frame: "structure/tavern", layer: 50, tintRgba: 0xffffffff },
      tavern: { isTavern: true },
      inbox: { messages: [] },
      solid: { isSolid: true, tileX: 45, tileY: 34 },
    });
    world.spawn({
      transform: { x: 45, y: 35, prevX: 45, prevY: 35, rotation: 0 },
      sprite: { atlasId: "main", frame: "npc/barkeep/idle", layer: 50, tintRgba: 0xffffffff },
      workNpc: {
        idlePose: "npc/barkeep/idle",
        stations: [
          // Pour at the bar (stand at 45,35, face down toward patrons).
          { tileX: 45, tileY: 35, facing: "down", flipX: false, pose: "npc/barkeep/pour" },
          // Wipe the counter one tile west.
          { tileX: 44, tileY: 35, facing: "down", flipX: false, pose: "npc/barkeep/pour" },
          // Step back east and idle.
          { tileX: 46, tileY: 35, facing: "down", flipX: false, pose: null },
        ],
        stationIndex: 0,
        phase: "working",
        timer: 90,
        poseFrame: null,
        facing: "down",
        flipX: false,
      },
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

  // ── Shrine landmark (brief 50) ───────────────────────────────────────────────
  // A single decorative set-piece sprite at the shrine island center. The
  // interaction (pray-at-shrine) is region-gated in ActSystem, so the sprite is
  // purely the visible landmark; no special component needed.
  const shrineRegion = REGIONS.find((r) => r.id === "shrine");
  if (shrineRegion) {
    const sx = shrineRegion.center.x;
    const sy = shrineRegion.center.y;
    world.spawn({
      transform: { x: sx, y: sy, prevX: sx, prevY: sy, rotation: 0 },
      sprite: { atlasId: "main", frame: "structure/shrine", layer: 50, tintRgba: 0xffffffff },
    });
  }

  // ── Heritage landmarks (brief 51) ────────────────────────────────────────────
  // One decorative sprite at each heritage islet center. These carry NO
  // identifying component and NO sim behavior — they are purely visible landmarks.
  // The hover label is resolved frame→label in snapshot-builder/constants.ts
  // (DECORATION_LABELS), the same path the village props use.
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

  // ── Waterfall landmark (brief 52) ────────────────────────────────────────────
  // A single decorative BASE sprite (the static rock/cliff the water falls over)
  // at the waterfall islet center. The cascading-water animation is drawn on top
  // as a wall-clock render-loop overlay (render-loop.ts WATERFALL_FRAMES) — it has
  // NO sim presence. This entity carries NO identifying component and NO behavior;
  // the hover label is resolved frame→label in snapshot-builder/constants.ts.
  const waterfallRegion = REGIONS.find((r) => r.id === "waterfall");
  if (waterfallRegion) {
    const wx = waterfallRegion.center.x;
    const wy = waterfallRegion.center.y;
    world.spawn({
      transform: { x: wx, y: wy, prevX: wx, prevY: wy, rotation: 0 },
      sprite: { atlasId: "main", frame: "structure/waterfall", layer: 40, tintRgba: 0xffffffff },
    });
  }

  // ── Ambient world dressing (purely decorative sprites; no collision) ──────────
  // Props are layer-40 sprites only — they do NOT affect walkability or
  // pathfinding (only `tileFeature` trees/stones block), so these are safe to
  // scatter on any walkable tile. Tiles are hand-picked to avoid overlapping
  // interactables (NPCs, market wall, podium, plots).
  if (REGIONS.some((r) => r.id === "village")) {
    placeProps(world, [
      // Village hub corners + edges: lamps, signpost, barrels, plants.
      { x: 38, y: 34, frame: "decoration/lamp-post" },
      { x: 49, y: 34, frame: "decoration/lamp-post" },
      { x: 38, y: 45, frame: "decoration/lamp-post" },
      { x: 49, y: 45, frame: "decoration/lamp-post" },
      { x: 39, y: 44, frame: "decoration/signpost" },
      { x: 48, y: 35, frame: "decoration/barrel" },
      { x: 39, y: 35, frame: "decoration/crate" },
      { x: 48, y: 44, frame: "decoration/potted-plant" },
      // Carpentry workshop yard: stacked logs + a barrel of fasteners, lamps
      // framing the workshop, a signpost at the dock-side entrance.
      { x: 20, y: 42, frame: "decoration/log-stack" },
      { x: 29, y: 42, frame: "decoration/barrel" },
      { x: 20, y: 35, frame: "decoration/lamp-post" },
      { x: 29, y: 35, frame: "decoration/lamp-post" },
      { x: 21, y: 43, frame: "decoration/signpost" },
      // Blacksmith yard: crate + barrel of stock, lamps framing the forge, a
      // firewood stack for the forge fire.
      { x: 58, y: 42, frame: "decoration/crate" },
      { x: 67, y: 42, frame: "decoration/barrel" },
      { x: 58, y: 35, frame: "decoration/lamp-post" },
      { x: 67, y: 35, frame: "decoration/lamp-post" },
      { x: 66, y: 41, frame: "decoration/log-stack" },
      // Forest zones: bushes + a firewood stack.
      { x: 23, y: 5,  frame: "decoration/bush" },
      { x: 28, y: 10, frame: "decoration/log-stack" },
      { x: 23, y: 57, frame: "decoration/bush" },
      { x: 28, y: 62, frame: "decoration/log-stack" },
      // Quarry zones: crates of cut stone.
      { x: 59, y: 5,  frame: "decoration/crate" },
      { x: 64, y: 10, frame: "decoration/crate" },
      { x: 59, y: 57, frame: "decoration/crate" },
      { x: 64, y: 62, frame: "decoration/crate" },
      // Mill yard: hay bales + a signpost.
      { x: 40, y: 62, frame: "decoration/hay-bale" },
      { x: 47, y: 62, frame: "decoration/hay-bale" },
      { x: 40, y: 57, frame: "decoration/signpost" },
    ]);
  }

  // ── Harbor board — dockmaster's contract board at the harbor island ──────────
  // brief 46 — the harbor board entity holds openContracts + committed map;
  // HarborSystem queries "harborBoard","inbox" to post/resolve contracts.
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

  // Dockmaster NPC at the dock tile (flavor; no interaction yet).
  // Frame is "npc/dockmaster/idle" matching the npc/barkeep/idle convention.
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
    // Paces the harbor (board ↔ dock edge) so the dock reads as staffed. The
    // dockmaster has no swing pose (only an idle frame), so every station stands
    // idle; NpcDeliberateSystem speeds the patrol while contracts are open.
    // Tiles stay clear of the dock prop (58,70) + cargo ship (58,72) + the
    // interactive board (62,71)/dock (61,68). Harbor bounds: 58–65 × 68–75.
    workNpc: {
      idlePose: "npc/dockmaster/idle",
      stations: [
        { tileX: 62, tileY: 72, facing: "up", flipX: false, pose: null },   // at the board
        { tileX: 61, tileY: 69, facing: "down", flipX: false, pose: null }, // by the dock
        { tileX: 63, tileY: 73, facing: "side", flipX: false, pose: null }, // east end
      ],
      stationIndex: 0,
      phase: "working",
      timer: 90,
      poseFrame: null,
      facing: "down",
      flipX: false,
    },
  });

  // Harbor props — dock + cargo ship. Placed on tiles that don't overlap the
  // interactive tiles (HARBOR_DOCK_TILE={61,68}, HARBOR_BOARD_TILE={62,71}).
  // Both are layer-40 decorative props with solid=false so the harbor floor
  // stays walkable (the ship is static art; the dock planks are decorative).
  // Harbor bounds: minX=58, minY=68, maxX=65, maxY=75.
  placeProps(world, [
    // Dock/pier prop: waterside at the west edge of the harbor isle (x58, y70),
    // one tile clear of the harbor bound edge — a plank pier jutting into the sea.
    { x: 58, y: 70, frame: "structure/dock", solid: false },
    // Cargo ship: anchored to the left of the dock (x58, y72 — one tile below
    // the pier), a purely decorative static prop.
    { x: 58, y: 72, frame: "structure/cargo-ship", solid: false },
  ]);

  return { regionEntities, plotEntities, fountainEntities, auctionPodiumEntity, noticeBoardEntity, harborBoardEntity };
}
