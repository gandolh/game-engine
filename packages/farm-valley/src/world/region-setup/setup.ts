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
    // (x99–100, y76–78); the work-yard props sit on the open ground in front of
    // it (y79–85). IMPORTANT: the island's through-road spine runs down x93–94
    // (the village bridge lands on the west edge y76–77 and the quarry bridges
    // land at the top {93-94} and bottom), so the building/props/footprint must
    // keep x93–94 CLEAR or the island — and everything routed through it — gets
    // walled off. The NPC patrols anvil → oven → quench.
    if (def.id === "blacksmith") {
      placeProps(world, [
        // Forge work line in front of the forge-house (east half, x95–102).
        { x: 97, y: 79, frame: "structure/forge-oven" },
        { x: 100, y: 79, frame: "structure/tool-rack" },
        { x: 99, y: 81, frame: "structure/anvil" },
        { x: 101, y: 80, frame: "structure/quench-tub" },
        // New detail props that flesh out the forge yard.
        { x: 97, y: 81, frame: "structure/coal-pile" },
        { x: 98, y: 83, frame: "structure/grindstone" },
        { x: 101, y: 82, frame: "structure/ingot-rack" },
        { x: 100, y: 83, frame: "structure/anvil" },
      ]);
      // The big forge-house occupies x99–100 × y76–78 (baked art in render-
      // systems BIG_STRUCTURES); block its footprint so nobody walks through it.
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
          stations: [
            // Stand below the anvil (99,81), face up, hammer.
            { tileX: 99, tileY: 82, facing: "up", flipX: false, pose: "npc/blacksmith/hammer" },
            // Tend the oven (97,79) — stand below it, face up, no swing pose.
            { tileX: 97, tileY: 80, facing: "up", flipX: false, pose: null },
            // Quench at the tub (101,80) — stand left of it, face side/right.
            { tileX: 100, tileY: 80, facing: "side", flipX: false, pose: null },
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
    // scenery, see render-systems BIG_STRUCTURES) stands on the WEST strip of the
    // island (x59–60, y76–78), left of the x61–62 road spine; the lumber-yard
    // props sit in the open EAST half (x63–68). IMPORTANT: the island's
    // through-road spine runs down x61–62 (the village bridge lands on the east
    // edge y76–77; the forest bridges land at the top {61-62} and bottom), so the
    // building/props/footprint must keep x61–62 CLEAR — and keep an open lane
    // through the east yard — or the island gets walled off. The whole east half
    // is reachable; props line the top/bottom edges leaving the center open. The
    // NPC patrols workbench → sawhorse.
    if (def.id === "carpentry") {
      const cx = def.center.x; // 63
      const cy = def.center.y; // 80
      // The village bridge lands on the east edge at (68,76)/(68,77) — keep that
      // entry column (x68, y76–79) and the row just inside it OPEN. Props line the
      // far-west-of-yard and bottom edges only.
      placeProps(world, [
        // Bench + sawing line along the TOP edge of the east yard (x63–65, y77).
        { x: 63, y: 78, frame: "structure/workbench" },
        { x: 65, y: 77, frame: "structure/sawhorse" },
        { x: 64, y: 77, frame: "structure/lumber-rack" },
        // Lumber stacks along the BOTTOM edge (y84–85), leaving y80–83 open.
        { x: 64, y: 84, frame: "structure/log-pile" },
        { x: 66, y: 84, frame: "structure/plank-stack" },
        { x: 64, y: 85, frame: "structure/sawpit" },
        { x: 66, y: 85, frame: "structure/shavings-pile" },
        { x: 67, y: 85, frame: "structure/log-pile" },
      ]);
      // The big carpenter-workshop occupies x59–60 × y76–78 (baked art in
      // render-systems BIG_STRUCTURES); block its footprint.
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
          stations: [
            // Saw at the workbench (63,78) — stand below, face up.
            { tileX: 63, tileY: 79, facing: "up", flipX: false, pose: "npc/carpenter/saw" },
            // Saw the log on the sawhorse (65,77) — stand below, face up.
            { tileX: 65, tileY: 78, facing: "up", flipX: false, pose: "npc/carpenter/saw" },
            // Inspect the log pile (64,84) — stand above it, face down.
            { tileX: 64, tileY: 83, facing: "down", flipX: false, pose: null },
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
  // The tavern building stands on the village's north edge (82,75); the barkeep
  // NPC works the bar one tile below it (82,76), patrolling pour → wipe → idle so
  // the hub reads as a place, not a terminal. The tavern entity carries an inbox
  // (TavernSystem snoops DAY_START for the daily gossip line) + the tavern tag.
  // Both tiles are free village tiles (clear of the market wall, shopkeeper,
  // podium, notice board and the corner lamps/props).
  if (REGIONS.some((r) => r.id === "village")) {
    world.spawn({
      transform: { x: 82, y: 75, prevX: 82, prevY: 75, rotation: 0 },
      sprite: { atlasId: "main", frame: "structure/tavern", layer: 50, tintRgba: 0xffffffff },
      tavern: { isTavern: true },
      inbox: { messages: [] },
      solid: { isSolid: true, tileX: 82, tileY: 75 },
    });
    world.spawn({
      transform: { x: 82, y: 76, prevX: 82, prevY: 76, rotation: 0 },
      sprite: { atlasId: "main", frame: "npc/barkeep/idle", layer: 50, tintRgba: 0xffffffff },
      workNpc: {
        idlePose: "npc/barkeep/idle",
        stations: [
          // Pour at the bar (stand at 82,76, face down toward patrons).
          { tileX: 82, tileY: 76, facing: "down", flipX: false, pose: "npc/barkeep/pour" },
          // Wipe the counter one tile west.
          { tileX: 81, tileY: 76, facing: "down", flipX: false, pose: "npc/barkeep/pour" },
          // Step back east and idle.
          { tileX: 83, tileY: 76, facing: "down", flipX: false, pose: null },
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

  // ── Camping island landmark (brief 54) ──────────────────────────────────────
  // A big TENT sprite at the camp island center + a static CAMPFIRE base beside
  // it. The campfire's flame flicker is drawn ON TOP as a wall-clock render-loop
  // overlay (render-loop.ts CAMPFIRE_FRAMES) — it has NO sim presence. Neither
  // entity carries an identifying component or behavior; the REST effect is a
  // passive region check in PerceiveSystem's night block (currentRegion ==='camp'
  // ⇒ rested). The tent hover label is resolved frame→label in
  // snapshot-builder/constants.ts (DECORATION_LABELS).
  const campRegion = REGIONS.find((r) => r.id === "camp");
  if (campRegion) {
    const cx = campRegion.center.x; // 112
    const cy = campRegion.center.y; // 108
    world.spawn({
      transform: { x: cx, y: cy, prevX: cx, prevY: cy, rotation: 0 },
      sprite: { atlasId: "main", frame: "structure/tent", layer: 50, tintRgba: 0xffffffff },
    });
    // Campfire base beside the tent (two tiles east — matches CAMPFIRE_TILE the
    // render loop animates the flame over). Layer 40 so the layer-41 flame
    // overlay sits just above it.
    world.spawn({
      transform: { x: cx + 2, y: cy, prevX: cx + 2, prevY: cy, rotation: 0 },
      sprite: { atlasId: "main", frame: "structure/campfire", layer: 40, tintRgba: 0xffffffff },
    });
  }

  // ── Ambient world dressing (purely decorative sprites; no collision) ──────────
  // Props are layer-40 sprites only — they do NOT affect walkability or
  // pathfinding (only `tileFeature` trees/stones block), so these are safe to
  // scatter on any walkable tile. Tiles are hand-picked to avoid overlapping
  // interactables (NPCs, market wall, podium, plots).
  if (REGIONS.some((r) => r.id === "village")) {
    // Village hub corners + edges: lamps, signpost, barrels, plants. Clear of the
    // tavern (82,75)/barkeep (82,76), market wall (77,77), shopkeeper (84,84),
    // podium (80,80) and notice board (79,80). Village bounds 75–86 × 75–86.
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

    // Carpentry workshop yard (island 59–68 × 76–85; workshop x59–60×76–78, spine
    // x61–62, open east yard x63–68): lamps framing the entrance, a barrel and a
    // log stack hugging the edges, a signpost — all clear of the open y80–83
    // corridor so the interior stays reachable.
    placeProps(world, [
      { x: 68, y: 85, frame: "decoration/log-stack" },
      { x: 67, y: 84, frame: "decoration/barrel" },
      { x: 63, y: 77, frame: "decoration/lamp-post" },
      { x: 63, y: 84, frame: "decoration/lamp-post" },
      { x: 63, y: 85, frame: "decoration/signpost" },
    ]);

    // Blacksmith yard (island 93–102 × 76–85; forge-house x99–100×76–78, spine
    // x93–94): crate + barrel of stock, lamps framing the forge, a firewood
    // stack — east of the spine, clear of the forge work line.
    placeProps(world, [
      { x: 95, y: 76, frame: "decoration/crate" },
      { x: 102, y: 84, frame: "decoration/barrel" },
      { x: 95, y: 78, frame: "decoration/lamp-post" },
      { x: 95, y: 84, frame: "decoration/log-stack" },
    ]);

    // Forest zones — friendlier woodland: mushrooms, ferns, a bush + firewood.
    // Resource islands grow trees/stones daily (TileFeatureSystem); keep these
    // NON-solid so they never block a feature tile or sever the island.
    placeProps(world, [
      // forest-north 61–68 × 61–68
      { x: 62, y: 62, frame: "decoration/mushroom-cluster", solid: false },
      { x: 67, y: 63, frame: "decoration/fern", solid: false },
      { x: 63, y: 67, frame: "decoration/bush", solid: false },
      // forest-south 61–68 × 93–100
      { x: 62, y: 94, frame: "decoration/fern", solid: false },
      { x: 67, y: 95, frame: "decoration/mushroom-cluster", solid: false },
      { x: 63, y: 99, frame: "decoration/log-stack", solid: false },
    ]);

    // Quarry zones — working stone yards: ore carts, rubble piles, crates of cut
    // stone. NON-solid (stones spawn here daily).
    placeProps(world, [
      // quarry-north 93–100 × 61–68
      { x: 94, y: 62, frame: "decoration/ore-cart", solid: false },
      { x: 99, y: 63, frame: "decoration/rubble", solid: false },
      { x: 95, y: 67, frame: "decoration/crate", solid: false },
      // quarry-south 93–100 × 93–100
      { x: 94, y: 94, frame: "decoration/rubble", solid: false },
      { x: 99, y: 95, frame: "decoration/ore-cart", solid: false },
      { x: 95, y: 99, frame: "decoration/crate", solid: false },
    ]);

    // Mill yard (76–85 × 93–100): grain + flour sacks, hay bales, a signpost.
    placeProps(world, [
      { x: 77, y: 94, frame: "decoration/grain-sack" },
      { x: 84, y: 94, frame: "decoration/flour-bag" },
      { x: 77, y: 99, frame: "decoration/hay-bale" },
      { x: 84, y: 99, frame: "decoration/hay-bale" },
      { x: 80, y: 99, frame: "decoration/signpost" },
    ]);

    // Shrine (71–77 × 58–64): stone lanterns flanking the shrine + a torii gate
    // at the approach. Center (74,61) holds the shrine sprite — keep it clear.
    placeProps(world, [
      { x: 72, y: 59, frame: "decoration/stone-lantern" },
      { x: 76, y: 59, frame: "decoration/stone-lantern" },
      { x: 74, y: 63, frame: "decoration/torii" },
    ]);

    // Mushroom-grove (59–66 × 47–54) + ice-pond (95–102 × 47–54) seasonal zones:
    // mushrooms in the grove, cattail reeds at the frozen pond.
    placeProps(world, [
      { x: 60, y: 48, frame: "decoration/mushroom-cluster", solid: false },
      { x: 65, y: 53, frame: "decoration/mushroom-cluster", solid: false },
      { x: 96, y: 48, frame: "decoration/cattail", solid: false },
      { x: 101, y: 53, frame: "decoration/cattail", solid: false },
    ]);

    // Heritage islets (decorative; center holds the landmark sprite): a cairn by
    // each so the relics read as tended. heritage-stones (45–52×63–70), -ruin
    // (109–116×63–70), -statue (45–52×93–100). Center is the landmark — offset.
    placeProps(world, [
      { x: 46, y: 64, frame: "decoration/cairn", solid: false },
      { x: 115, y: 64, frame: "decoration/cairn", solid: false },
      { x: 46, y: 99, frame: "decoration/cairn", solid: false },
    ]);

    // Waterfall islet (80–87 × 58–65): cattail reeds at the base pool. The center
    // (83,61) holds the static cliff + the animated cascade overlay — keep clear.
    placeProps(world, [
      { x: 81, y: 64, frame: "decoration/cattail", solid: false },
      { x: 86, y: 64, frame: "decoration/cattail", solid: false },
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
    // Tiles stay clear of the dock prop (93,107) + cargo ship (93,109) + the
    // interactive board (97,108)/dock (96,105). Harbor bounds: 93–100 × 105–112.
    workNpc: {
      idlePose: "npc/dockmaster/idle",
      stations: [
        { tileX: 96, tileY: 109, facing: "up", flipX: false, pose: null },   // at the board
        { tileX: 96, tileY: 106, facing: "down", flipX: false, pose: null }, // by the dock
        { tileX: 98, tileY: 110, facing: "side", flipX: false, pose: null }, // east end
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
  // interactive tiles (HARBOR_DOCK_TILE={96,105}, HARBOR_BOARD_TILE={97,108}).
  // Both are layer-40 decorative props with solid=false so the harbor floor
  // stays walkable (the ship is static art; the dock planks are decorative).
  // Harbor bounds: minX=93, minY=105, maxX=100, maxY=112.
  placeProps(world, [
    // Dock/pier prop: waterside at the west edge of the harbor isle (x93, y107),
    // one tile clear of the harbor bound edge — a plank pier jutting into the sea.
    { x: 93, y: 107, frame: "structure/dock", solid: false },
    // Cargo ship: anchored to the left of the dock (x93, y109 — one tile below
    // the pier), a purely decorative static prop.
    { x: 93, y: 109, frame: "structure/cargo-ship", solid: false },
    // Themed harbor dressing: a buoy bobbing off the pier, a creel of fish, and
    // an anchor leaning by the board. Clear of dock (96,105)/board (97,108).
    { x: 99, y: 106, frame: "decoration/buoy" },
    { x: 95, y: 111, frame: "decoration/fish-basket" },
    { x: 99, y: 111, frame: "decoration/anchor" },
  ]);

  return { regionEntities, plotEntities, fountainEntities, auctionPodiumEntity, noticeBoardEntity, harborBoardEntity };
}
