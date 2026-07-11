/**
 * Citadel headless sim runner.
 *
 * Drives bootstrapSim() directly on the main thread — no Worker.
 * Places a well-connected economy near the map center, then prints a per-day
 * economy summary from getSnapshot().
 *
 * Six scenarios are supported via the SCENARIO env var:
 *   SCENARIO=grow   (default) — full economy; should see pop growing and
 *                               winter halting grain but not killing the town
 *                               if autumn surplus was large enough.
 *   SCENARIO=starve — minimal economy with no autumn surplus; winter bread
 *                     shortfall triggers population decline and game-over.
 *   SCENARIO=siege  — a heavily fortified citadel (keep + towers + garrison +
 *                     walls + gates) on top of a large economy; raids arrive
 *                     from ~day 5 and are REPELLED by the strong defenses.
 *                     Refining chains (quarry→stone, sawmill→planks, smith→tools)
 *                     are active and produce visible output.
 *   SCENARIO=sack   — a REAL PLAYTHROUGH of the sharp raid path: a fire-safe
 *                     lattice town grows to Town tier, legitimately unlocks and
 *                     raises a lone keep (defense 8, no walls), and is then ground
 *                     down by escalating raids → keepSacked=true, game-over from
 *                     the SACK (not starvation). The ONLY fixture that drives the
 *                     sharp (cozyThreats:false) raid resolution end to end.
 *   SCENARIO=fire   — dense wooden buildings packed close together → fire
 *                     ignites and spreads. Second half places wells to show
 *                     reduced fire spread. Expect fire events in the log.
 *   SCENARIO=disease — crowded housing + low happiness → disease outbreak.
 *                      Second half places a healer to show reduced mortality.
 *
 * Usage:
 *   npm run sim:citadel
 *   SEED=0xdeadbeef MAX_DAYS=40 npm run sim:citadel
 *   SCENARIO=starve MAX_DAYS=25 npm run sim:citadel
 *   SCENARIO=siege  MAX_DAYS=40 npm run sim:citadel
 *   SCENARIO=sack   npm run sim:citadel      # 70-day default — see SACK_MAX_DAYS
 *   SCENARIO=fire   MAX_DAYS=40 npm run sim:citadel
 *   SCENARIO=disease MAX_DAYS=40 npm run sim:citadel
 */
import { bootstrapSim, isWalkable, TerrainType, tierAtLeast, localPlayer } from "@citadel/sim-core";
import type { CitadelCommand, TerrainGrid } from "@citadel/sim-core";

const SEED = parseInt(process.env.SEED ?? "0x1a2b3c4d", 16) >>> 0;
const TICKS_PER_DAY = parseInt(process.env.TICKS_PER_DAY ?? "20", 10);
const SCENARIO = process.env.SCENARIO ?? "grow";

/**
 * `sack` needs a longer horizon than the other scenarios, and the reason is
 * geometry, not balance.
 *
 * Raiders march one tile every 3 ticks (`MOVE_INTERVAL`, raider-movement.ts) ≈ 6.7
 * tiles/day, and they spawn on a MAP EDGE. Brief 110 doubled the solo world from
 * 96×96 to 192×192, which doubled that march: a raid aimed at a keep near the map
 * centre is now ~15 days in transit, where it used to be ~7. The old scenario's
 * comment ("raid 4 arrives ~day 27.5 → within 40 days") was arithmetic done on the
 * 96×96 map and quietly stopped being true when the world grew.
 *
 * The honest budget for a REAL playthrough on today's map: ~13 days to grow to Town
 * and raise the keep, then raids 1..N escalating and each ~15 days in transit. The
 * keep falls around day 50 at the default seed; 70 leaves headroom.
 */
const SACK_MAX_DAYS = 70;
const MAX_DAYS = parseInt(process.env.MAX_DAYS ?? String(SCENARIO === "sack" ? SACK_MAX_DAYS : 40), 10);

/** Find a clear w×h region of buildable tiles near (preferX, preferY). */
function findClear(terrain: TerrainGrid, w: number, h: number, sx: number, sy: number): { x: number; y: number } {
  for (let r = 0; r < 40; r++) {
    for (let dy = -r; dy <= r; dy++) {
      for (let dx = -r; dx <= r; dx++) {
        const x = sx + dx;
        const y = sy + dy;
        let ok = true;
        for (let yy = 0; yy < h && ok; yy++)
          for (let xx = 0; xx < w; xx++)
            if (!isWalkable(terrain, x + xx, y + yy)) { ok = false; break; }
        if (ok) return { x, y };
      }
    }
  }
  return { x: sx, y: sy };
}

/** Find a 2×2 region overlapping a Stone tile (for quarry/mine). */
function findStone(terrain: TerrainGrid, sx: number, sy: number): { x: number; y: number } | null {
  for (let r = 0; r < 60; r++) {
    for (let dy = -r; dy <= r; dy++) {
      for (let dx = -r; dx <= r; dx++) {
        const x = sx + dx;
        const y = sy + dy;
        if (x < 1 || y < 1 || x >= terrain.width - 2 || y >= terrain.height - 2) continue;
        let stone = false;
        let blocked = false;
        for (let yy = 0; yy < 2; yy++)
          for (let xx = 0; xx < 2; xx++) {
            const t = terrain.cells[(y + yy) * terrain.width + (x + xx)]!;
            if (t === TerrainType.Stone) stone = true;
            if (t === TerrainType.Water || t === TerrainType.Rough) blocked = true;
          }
        if (stone && !blocked) return { x, y };
      }
    }
  }
  return null;
}

/**
 * Find a 2×2 region overlapping a Stone tile that is REACHABLE from
 * (anchorX, anchorY) via walkable terrain.  Falls back to findStone if no
 * reachable placement exists (caller should handle null = skip quarry).
 */
function findConnectedStone(
  terrain: TerrainGrid,
  anchorX: number,
  anchorY: number,
): { x: number; y: number } | null {
  const W = terrain.width;
  const H = terrain.height;
  // BFS from anchor to build the reachable set.
  const visited = new Uint8Array(W * H);
  const queue: number[] = [anchorY * W + anchorX];
  visited[anchorY * W + anchorX] = 1;
  for (let qi = 0; qi < queue.length; qi++) {
    const idx = queue[qi]!;
    const x = idx % W;
    const y = (idx - x) / W;
    for (const delta of [[-1,0],[1,0],[0,-1],[0,1]] as const) {
      const nx = x + delta[0];
      const ny = y + delta[1];
      if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
      if (!isWalkable(terrain, nx, ny)) continue;
      const ni = ny * W + nx;
      if (visited[ni]) continue;
      visited[ni] = 1;
      queue.push(ni);
    }
  }
  // Now find the closest 2×2 stone placement reachable from anchor.
  for (let r = 0; r < 60; r++) {
    for (let dy = -r; dy <= r; dy++) {
      for (let dx = -r; dx <= r; dx++) {
        const x = anchorX + dx;
        const y = anchorY + dy;
        if (x < 1 || y < 1 || x >= W - 2 || y >= H - 2) continue;
        let stone = false;
        let blocked = false;
        let reachable = false;
        for (let yy = 0; yy < 2; yy++) {
          for (let xx = 0; xx < 2; xx++) {
            const t = terrain.cells[(y + yy) * W + (x + xx)]!;
            if (t === TerrainType.Stone) stone = true;
            if (t === TerrainType.Water || t === TerrainType.Rough) blocked = true;
            if (visited[(y + yy) * W + (x + xx)]) reachable = true;
          }
        }
        // Also check the 8 border tiles around the 2×2 footprint for reachability.
        if (!reachable) {
          outer: for (let by = -1; by <= 2; by++) {
            for (let bx = -1; bx <= 2; bx++) {
              if (by >= 0 && by <= 1 && bx >= 0 && bx <= 1) continue;
              const bax = x + bx;
              const bay = y + by;
              if (bax >= 0 && bay >= 0 && bax < W && bay < H && visited[bay * W + bax]) {
                reachable = true;
                break outer;
              }
            }
          }
        }
        if (stone && !blocked && reachable) return { x, y };
      }
    }
  }
  return null;
}

/** Build a straight road (horizontal then vertical) from a to b, collecting tiles. */
function link(tiles: Array<{ x: number; y: number }>, ax: number, ay: number, bx: number, by: number): void {
  let x = ax;
  let y = ay;
  while (x !== bx) { tiles.push({ x, y }); x += x < bx ? 1 : -1; }
  while (y !== by) { tiles.push({ x, y }); y += y < by ? 1 : -1; }
  tiles.push({ x: bx, y: by });
}

function buildGrowScenario(terrain: TerrainGrid): CitadelCommand[] {
  /**
   * "Grow" scenario: a well-connected economy with 2 farms, 1 mill, 1 bakery,
   * 2 houses, 1 storehouse — enough workers to fill all slots and build a
   * real bread surplus. Population should grow past 8+ by summer/autumn.
   * Winter halts grain but a surplus stockpile should carry the town through.
   * Phase 3: also places a chapel, market, watchpost, and tradingpost for
   * needs coverage and barter opportunities.
   */
  const cx = Math.floor(terrain.width / 2);
  const cy = Math.floor(terrain.height / 2);

  const store = findClear(terrain, 3, 2, cx, cy);
  // Farms to the east
  const farm1 = findClear(terrain, 3, 3, store.x + 5, store.y - 4);
  const farm2 = findClear(terrain, 3, 3, store.x + 5, store.y + 3);
  // Two mills to the north
  const mill1 = findClear(terrain, 2, 2, store.x - 1, store.y - 5);
  const mill2 = findClear(terrain, 2, 2, store.x + 3, store.y - 5);
  // Two bakeries to the west
  const bakery1 = findClear(terrain, 2, 2, store.x - 5, store.y - 1);
  const bakery2 = findClear(terrain, 2, 2, store.x - 5, store.y + 2);
  // Three houses to the south (popCap = 18). Brief 100 measures where population
  // settles under FOOD pressure; with only two houses the town saturates its
  // housing cap at 12 and the economy's real equilibrium is invisible.
  const house1 = findClear(terrain, 2, 2, store.x - 2, store.y + 4);
  const house2 = findClear(terrain, 2, 2, store.x + 2, store.y + 4);
  // Kept well clear of the western bakery/chapel column: parked beside them it forms a
  // dense wooden cluster and density-driven ignition burns the town down by ~day 33.
  const house3 = findClear(terrain, 2, 2, store.x, store.y + 7);
  // Phase 3: service buildings
  const chapel     = findClear(terrain, 2, 2, store.x - 8, store.y - 1);
  const market     = findClear(terrain, 2, 2, store.x - 8, store.y + 2);
  const watchpost  = findClear(terrain, 2, 2, store.x + 3, store.y + 4);
  const tradingpost = findClear(terrain, 3, 2, store.x + 7, store.y);

  const cmds: CitadelCommand[] = [
    { type: "placeBuilding", payload: { buildingType: "storehouse",  x: store.x,      y: store.y } },
    { type: "placeBuilding", payload: { buildingType: "farm",        x: farm1.x,      y: farm1.y } },
    { type: "placeBuilding", payload: { buildingType: "farm",        x: farm2.x,      y: farm2.y } },
    { type: "placeBuilding", payload: { buildingType: "mill",        x: mill1.x,      y: mill1.y } },
    { type: "placeBuilding", payload: { buildingType: "mill",        x: mill2.x,      y: mill2.y } },
    { type: "placeBuilding", payload: { buildingType: "bakery",      x: bakery1.x,    y: bakery1.y } },
    { type: "placeBuilding", payload: { buildingType: "bakery",      x: bakery2.x,    y: bakery2.y } },
    { type: "placeBuilding", payload: { buildingType: "house",       x: house1.x,     y: house1.y } },
    { type: "placeBuilding", payload: { buildingType: "house",       x: house2.x,     y: house2.y } },
    { type: "placeBuilding", payload: { buildingType: "house",       x: house3.x,     y: house3.y } },
    // Phase 3 service buildings
    { type: "placeBuilding", payload: { buildingType: "chapel",      x: chapel.x,     y: chapel.y } },
    { type: "placeBuilding", payload: { buildingType: "market",      x: market.x,     y: market.y } },
    { type: "placeBuilding", payload: { buildingType: "watchpost",   x: watchpost.x,  y: watchpost.y } },
    { type: "placeBuilding", payload: { buildingType: "tradingpost", x: tradingpost.x, y: tradingpost.y } },
  ];

  // Road network: connect all buildings to the storehouse.
  const roadTiles: Array<{ x: number; y: number }> = [];
  const storeRight = store.x + 3;
  const storeLeft = store.x - 1;
  const storeTop = store.y - 1;
  const storeBottom = store.y + 2;

  link(roadTiles, farm1.x - 1, farm1.y + 1, storeRight, store.y);
  link(roadTiles, farm2.x - 1, farm2.y + 1, storeRight, store.y + 1);
  link(roadTiles, mill1.x + 1, mill1.y + 2, store.x, storeTop);
  link(roadTiles, mill2.x, mill2.y + 2, store.x + 2, storeTop);
  link(roadTiles, bakery1.x + 2, bakery1.y + 1, storeLeft, store.y);
  link(roadTiles, bakery2.x + 2, bakery2.y + 1, storeLeft, store.y + 1);
  link(roadTiles, house1.x + 1, house1.y - 1, store.x, storeBottom);
  link(roadTiles, house2.x, house2.y - 1, store.x + 2, storeBottom);
  link(roadTiles, house3.x + 1, house3.y - 1, store.x + 1, storeBottom);
  link(roadTiles, chapel.x + 2,      chapel.y + 1,      storeLeft,  store.y);
  link(roadTiles, market.x + 2,      market.y + 1,      storeLeft,  store.y + 1);
  link(roadTiles, watchpost.x,       watchpost.y - 1,   store.x + 2, storeBottom);
  link(roadTiles, tradingpost.x,     tradingpost.y + 1, storeRight,  store.y);

  cmds.push({ type: "placeRoad", payload: { tiles: roadTiles } });
  return cmds;
}

function buildStarveScenario(terrain: TerrainGrid): CitadelCommand[] {
  /**
   * "Starve" scenario: 1 farm, 1 mill, 1 bakery — only enough to feed ~6 — and,
   * since brief 100, deliberately BADLY LAID OUT.
   *
   * Each producer sits at the end of a long spoke from the storehouse. Everything is
   * connected (production requires it), but a hauler's round trip eats most of a day,
   * so output buffers back up: the service EWMA never clears the sustained-service
   * band, the buildings earn no output bonus, and the buffer throttle pulls them
   * toward the floor. That is the brief-100 downside and upside in one fixture — the
   * town starves *because of how it was built*, not merely because it owns few farms.
   *
   * Placed short spokes, it survives comfortably on the service bonus (measured: pop 6
   * and alive at day 40), which is exactly the point.
   */
  const cx = Math.floor(terrain.width / 2) + 10;
  const cy = Math.floor(terrain.height / 2) + 10;

  const SPOKE = 16; // long enough that a hauler round trip dominates the cycle

  const store = findClear(terrain, 3, 2, cx, cy);
  const farm = findClear(terrain, 3, 3, store.x + SPOKE, store.y - 2);
  const mill = findClear(terrain, 2, 2, store.x, store.y - SPOKE);
  const bakery = findClear(terrain, 2, 2, store.x - SPOKE, store.y);
  const house1 = findClear(terrain, 2, 2, store.x - 3, store.y + 4);
  const house2 = findClear(terrain, 2, 2, store.x, store.y + 4);
  const house3 = findClear(terrain, 2, 2, store.x + 3, store.y + 4);

  const cmds: CitadelCommand[] = [
    { type: "placeBuilding", payload: { buildingType: "storehouse", x: store.x, y: store.y } },
    { type: "placeBuilding", payload: { buildingType: "farm", x: farm.x, y: farm.y } },
    { type: "placeBuilding", payload: { buildingType: "mill", x: mill.x, y: mill.y } },
    { type: "placeBuilding", payload: { buildingType: "bakery", x: bakery.x, y: bakery.y } },
    { type: "placeBuilding", payload: { buildingType: "house", x: house1.x, y: house1.y } },
    { type: "placeBuilding", payload: { buildingType: "house", x: house2.x, y: house2.y } },
    { type: "placeBuilding", payload: { buildingType: "house", x: house3.x, y: house3.y } },
  ];

  const roadTiles: Array<{ x: number; y: number }> = [];
  const storeRight = store.x + 3;
  const storeLeft = store.x - 1;
  const storeTop = store.y - 1;
  const storeBottom = store.y + 2;
  link(roadTiles, farm.x - 1, farm.y + 1, storeRight, store.y);
  link(roadTiles, mill.x + 1, mill.y + 2, store.x + 1, storeTop);
  link(roadTiles, bakery.x + 2, bakery.y + 1, storeLeft, store.y + 1);
  link(roadTiles, house1.x + 1, house1.y - 1, store.x, storeBottom);
  link(roadTiles, house2.x + 1, house2.y - 1, store.x + 1, storeBottom);
  link(roadTiles, house3.x, house3.y - 1, store.x + 2, storeBottom);
  cmds.push({ type: "placeRoad", payload: { tiles: roadTiles } });
  return cmds;
}

/**
 * "Siege" scenario: a self-contained fortified economy with all refining chains
 * running and strong enough defenses to repel the first two raids.
 *
 * Worker budget (founding window = 6 days → 6 founders):
 *   Primary types (Tier 1): farm, keep = 2 → staffed on founding days 1-2.
 *   Converter types (Tier 2): mill, bakery, sawmill, smith = 4 → staffed on
 *   founding days 3-6.
 *   All food-chain and refining converters are staffed within the 6-day window!
 *
 * Refining chains: wood (injected daily) → sawmill → planks.
 *                  stone (injected daily) → smith → tools.
 *   Injecting raw materials per day ensures both smithy and sawmill have continuous
 *   input regardless of quarry/woodcutter connectivity.
 *
 * Defense: keep(8) + garrison(10) + wall-adjacency bonus.
 *   Garrison is placed INSIDE the wall ring and CONNECTED to the economy, but
 *   since it IS a unique primary type it uses one founding slot.
 *   Wait — garrison would be a 3rd primary type, bumping one converter out of
 *   the founding window (6 slots = farm + keep + garrison + mill + bakery + sawmill,
 *   leaving smith out).  Instead we skip garrison and use walls only for bonus:
 *   keep(8) + ~16-20 adjacent walls = 24-28 defense.
 *   Raid 1 (10) → needs 15 to repel → 24 ≥ 15 → REPELLED.
 *   Raid 2 (15) → needs 22.5 → 24 ≥ 22.5 → REPELLED.
 *   Raid 3 (20) → needs 30 → 24 < 30, ≥ 10 → DAMAGE (not sacked).
 *
 * Returns { cmds, injectWoodPerDay, injectStonePerDay }.
 */
function buildSiegeScenario(
  terrain: TerrainGrid,
): { cmds: CitadelCommand[]; injectWoodPerDay: number; injectStonePerDay: number } {
  const cx = Math.floor(terrain.width / 2);
  const cy = Math.floor(terrain.height / 2);

  // ---------- Economy core ----------
  const store   = findClear(terrain, 3, 2, cx, cy);
  const farm1   = findClear(terrain, 3, 3, store.x + 5, store.y - 3);
  const farm2   = findClear(terrain, 3, 3, store.x + 5, store.y + 2);
  const mill1   = findClear(terrain, 2, 2, store.x - 1, store.y - 5);
  const mill2   = findClear(terrain, 2, 2, store.x + 3, store.y - 5);
  const bakery1 = findClear(terrain, 2, 2, store.x - 5, store.y - 1);
  const bakery2 = findClear(terrain, 2, 2, store.x - 5, store.y + 2);
  const house1  = findClear(terrain, 2, 2, store.x - 3, store.y + 4);
  const house2  = findClear(terrain, 2, 2, store.x,     store.y + 4);
  const house3  = findClear(terrain, 2, 2, store.x + 3, store.y + 4);
  const house4  = findClear(terrain, 2, 2, store.x,     store.y + 7);

  // ---------- Refining chain ----------
  // Sawmill and smith are converter types → get founding workers on days 3-6.
  // Wood (injected daily) feeds sawmill → planks.
  // Stone (injected daily) feeds smith → tools.
  // No quarry: raw material comes from injection so we don't need an extra
  // primary type that would displace a converter from the founding window.
  const sawmill = findClear(terrain, 2, 2, store.x - 1, store.y - 8);
  const smith   = findClear(terrain, 2, 2, store.x + 3, store.y - 8);

  // ---------- Citadel core ----------
  // Only keep (primary, day 2 founding) — no garrison, to keep primary types at 2.
  // Defense = keep(8) + 5×5 wall ring (16 walls adjacent to 3×3 keep footprint) = 24.
  // 24 ≥ 15 (raid 1 repel), 24 ≥ 22.5 (raid 2 repel), 24 < 30 (raid 3 damage).
  const keep = findClear(terrain, 3, 3, store.x + 2, store.y + 12);

  const cmds: CitadelCommand[] = [
    { type: "placeBuilding", payload: { buildingType: "storehouse", x: store.x,   y: store.y } },
    // Primary types (2): farm (day 1), keep (day 2).
    { type: "placeBuilding", payload: { buildingType: "farm",       x: farm1.x,   y: farm1.y } },
    { type: "placeBuilding", payload: { buildingType: "farm",       x: farm2.x,   y: farm2.y } },
    // Converter types (4): mill (day 3), bakery (day 4), sawmill (day 5), smith (day 6).
    { type: "placeBuilding", payload: { buildingType: "mill",       x: mill1.x,   y: mill1.y } },
    { type: "placeBuilding", payload: { buildingType: "mill",       x: mill2.x,   y: mill2.y } },
    { type: "placeBuilding", payload: { buildingType: "bakery",     x: bakery1.x, y: bakery1.y } },
    { type: "placeBuilding", payload: { buildingType: "bakery",     x: bakery2.x, y: bakery2.y } },
    { type: "placeBuilding", payload: { buildingType: "sawmill",    x: sawmill.x, y: sawmill.y } },
    { type: "placeBuilding", payload: { buildingType: "smith",      x: smith.x,   y: smith.y } },
    // Housing: 4 houses → popCap 24
    { type: "placeBuilding", payload: { buildingType: "house",      x: house1.x,  y: house1.y } },
    { type: "placeBuilding", payload: { buildingType: "house",      x: house2.x,  y: house2.y } },
    { type: "placeBuilding", payload: { buildingType: "house",      x: house3.x,  y: house3.y } },
    { type: "placeBuilding", payload: { buildingType: "house",      x: house4.x,  y: house4.y } },
    // Citadel: keep only (day 2 primary).
    { type: "placeBuilding", payload: { buildingType: "keep",       x: keep.x,    y: keep.y } },
  ];

  // ---------- Wall ring tightly around the keep ----------
  // Walls placed 1 tile outside the 3×3 keep footprint → adjacent to footprint tiles.
  // 5×5 ring minus 3×3 center = 16 wall tiles, each adjacent to a keep tile.
  // Wall-adjacency bonus = +16, total defense = keep(8) + 16 = 24.
  const x0 = keep.x - 1;
  const x1 = keep.x + 3;
  const y0 = keep.y - 1;
  const y1 = keep.y + 3;
  const gateN = Math.floor((x0 + x1) / 2);
  const gateS = gateN + 1;
  const gateW = Math.floor((y0 + y1) / 2);
  const gateE = gateW + 1;

  const wallTiles: Array<{ x: number; y: number }> = [];
  const gateTiles: CitadelCommand[] = [];
  for (let x = x0; x <= x1; x++) {
    if (x === gateN) gateTiles.push({ type: "placeBuilding", payload: { buildingType: "gate", x, y: y0 } });
    else if (isWalkable(terrain, x, y0)) wallTiles.push({ x, y: y0 });
    if (x === gateS) gateTiles.push({ type: "placeBuilding", payload: { buildingType: "gate", x, y: y1 } });
    else if (isWalkable(terrain, x, y1)) wallTiles.push({ x, y: y1 });
  }
  for (let y = y0 + 1; y < y1; y++) {
    if (y === gateW) gateTiles.push({ type: "placeBuilding", payload: { buildingType: "gate", x: x0, y } });
    else if (isWalkable(terrain, x0, y)) wallTiles.push({ x: x0, y });
    if (y === gateE) gateTiles.push({ type: "placeBuilding", payload: { buildingType: "gate", x: x1, y } });
    else if (isWalkable(terrain, x1, y)) wallTiles.push({ x: x1, y });
  }
  for (const g of gateTiles) cmds.push(g);
  cmds.push({ type: "placeWall", payload: { tiles: wallTiles } });

  // ---------- Road network ----------
  // Use a full bounding-box carpet so every building in the scenario is
  // guaranteed to be road-connected to the storehouse regardless of terrain
  // obstacles that could break individual link() segments.
  //
  // Economy carpet: from the leftmost bakery to the rightmost farm, and from
  // the sawmill/smith row down to the southernmost house row.
  const roadTiles: Array<{ x: number; y: number }> = [];

  // Economy carpet (covers all food + refining buildings).
  const econLeft  = Math.min(bakery1.x, bakery2.x) - 1;
  const econRight = Math.max(farm1.x + 2, farm2.x + 2) + 1;
  const econTop   = Math.min(sawmill.y, smith.y) - 1;
  const econBot   = Math.max(house4.y + 1, house3.y + 1);
  for (let ry = econTop; ry <= econBot; ry++) {
    for (let rx = econLeft; rx <= econRight; rx++) {
      if (isWalkable(terrain, rx, ry)) roadTiles.push({ x: rx, y: ry });
    }
  }

  // Citadel carpet (covers the keep inside the wall ring).
  // We use the wall-ring bounding box + 1 tile margin.
  const citeLeft  = x0 - 1;
  const citeRight = x1 + 1;
  const citeTop   = y0 - 1;
  const citeBot   = y1 + 1;
  for (let ry = citeTop; ry <= citeBot; ry++) {
    for (let rx = citeLeft; rx <= citeRight; rx++) {
      if (isWalkable(terrain, rx, ry)) roadTiles.push({ x: rx, y: ry });
    }
  }

  // Connector spine: a vertical strip linking the economy carpet to the
  // citadel carpet (between econBot and citeTop).
  const spineX = store.x + 1;
  for (let ry = econBot + 1; ry < citeTop; ry++) {
    if (isWalkable(terrain, spineX, ry)) roadTiles.push({ x: spineX, y: ry });
  }

  cmds.push({ type: "placeRoad", payload: { tiles: roadTiles } });

  // Inject 2 wood + 2 stone per day so both sawmill and smith always have
  // input materials.  This is deterministic: same injection every tick-day
  // boundary, and the amounts are fixed constants.
  return { cmds, injectWoodPerDay: 2, injectStonePerDay: 2 };
}

/**
 * "Sack" scenario — RE-LAID 2026-07-11 as a real playthrough (see below).
 *
 * This is the ONLY fixture that drives the SHARP (`cozyThreats:false`) raid
 * resolution end to end, so it is the thing brief 103 (Challenge mode) and brief
 * 113 (raid gets a body) are built on. It must earn its ending, not be handed it.
 *
 * ## Why it stopped sacking (three linked defects, all now designed out)
 *
 * 1. `cozyThreats` defaults to TRUE (cozy pivot Phase D, 2026-07-01) and a cozy
 *    raid pilfers goods and leaves — it can NEVER sack, by contract. The scenario
 *    never passed the flag, so from that day it silently asserted nothing.
 *    (Fixed separately in `main()`: `isSiegeScenario()` now opts into the sharp path.)
 *
 * 2. The old layout placed a `keep` on DAY 0 at Hamlet tier. `TIER_LOCK.keep`
 *    is "Town", so the command was REJECTED — and since raids are gated entirely on
 *    `keepPosition` (raid-spawn.ts), no keep meant no raid clock, no threat, no
 *    raiders, nothing to sack. The reject was not even silent: the run logged
 *    "Day 0: a keep needs Town tier — unlock it first." Nobody read it.
 *
 * 3. Turning the sharp path back on (1) also un-gated SHARP FIRE, which DESTROYS
 *    buildings instead of smouldering. The old layout parked its four houses on a
 *    3-tile pitch — dense enough that each had ≥3 wooden neighbours within 4 tiles,
 *    which is exactly the ignition trigger — so fire razed three of them and popCap
 *    collapsed 24 → 6. The town could then never reach the pop it needed to tier up.
 *
 * ## The re-lay (the brief-100 `starve` precedent: build it for a REASON)
 *
 * The town is laid out on a LATTICE with a 4-tile column pitch and a 5-tile row
 * pitch. That is not cosmetic — it is the fire rule inverted:
 * `FireSystem._checkIgnition` ignites a wooden building only when ≥3 other wooden
 * buildings sit within Manhattan 4 of its centre. On this lattice an in-row
 * neighbour is exactly 4 away (counted) and a cross-row neighbour is 5 (not), so
 * every wooden building has AT MOST 2 wooden neighbours in range and spontaneous
 * ignition is structurally impossible. The town is fireproof BY LAYOUT — which is
 * the lesson the sharp fire hazard is there to teach.
 *
 * With the town no longer burning down it grows honestly:
 *   - 20 structures from day 0 (≥15, the Town buildings-path threshold, with 5 to
 *     spare so a raid or two can raze one without dropping the settlement back).
 *   - 6 houses → popCap 36, so growth is gated by FOOD, not by housing.
 *   - 2 farms → 2 mills → 2 bakeries, all within ~9 tiles of the storehouse, so the
 *     haulers keep up and the service bonus pays (the brief-100 upside).
 *   - 2 chapels + 1 market + 1 watchpost → needs coverage → happiness stays >40,
 *     which keeps immigration rolling and keeps disease onset off the amplifier.
 *   - 1 healer covering the houses → a disease outbreak cannot kill (deathRate 0.05
 *     with `healerNear`, and no guaranteed minimum death) → pop only ever climbs.
 *
 * Population crosses 10 around day 11 → with 20 structures that satisfies Town
 * (`nonRoadBuildings ≥ 15 AND pop ≥ 10`). ONLY THEN is the keep placed — `main()`
 * watches the tier and enqueues it the moment the settlement earns it, exactly as a
 * player would. So the keep now lands through the real `TIER_LOCK` gate.
 *
 * The keep stands ALONE — defenseStrength 8, no towers, no garrison, no walls. The
 * raid clock anchors to it: raid 1 (str 10) ~5 days later, then every ~7-8 days,
 * escalating +5. `resolveSiege` bands on defence:strength ratio — 8:10 = 0.8 and
 * 8:15 = 0.53 are the "mid" band (mostly damage, 10% sack), 8:20 = 0.4 drops into
 * the "weak" band (85% sack). So the town is ground down and the keep falls, with
 * the economy still alive around it — a sack, not a starvation.
 *
 * At the default seed: Town on day 12, keep raised day 13, THE KEEP IS SACKED on day 50.
 *
 * NB the town plateaus around pop 17-18 (two bakeries is the bread ceiling; grain and
 * flour visibly pile up behind them) and you will see the odd "a villager starved" as it
 * sits on that ceiling. That is an EQUILIBRIUM, not a collapse — pop is still 17 and all
 * 351 buildings still connected when the keep falls, and `gameOver` is set by
 * "THE KEEP IS SACKED", never by the town dying out. Don't mistake this for `starve`.
 *
 * Returns the keep's site rather than a command: it is placed LATER, on tier-up.
 */

/** Column pitch of the sack town's lattice. In-row wooden neighbours land at Manhattan 4 → counted by the fire rule (2 max). */
const SACK_COL_PITCH = 4;
/** Row pitch. Cross-row neighbours land at Manhattan 5 → OUTSIDE the fire rule's range-4 window. */
const SACK_ROW_PITCH = 5;

/**
 * The lattice, row-major. Every entry is a slot at
 * (X + col*SACK_COL_PITCH, Y + row*SACK_ROW_PITCH).
 *
 * Widest footprint is 3 (farm, storehouse), so a 4-tile column pitch always leaves a
 * 1-tile road gap; tallest is 3 (farm), so a 5-tile row pitch leaves 2. Every building
 * type here has its centre at top-left + (1,1), which is what makes the pitch arithmetic
 * above hold exactly for the fire rule.
 *
 * `well` and `healer` are NOT in FireSystem's WOODEN_TYPES, so they are free real estate
 * on the lattice — they break up the wooden runs without adding to anyone's neighbour count.
 */
const SACK_LATTICE: ReadonlyArray<ReadonlyArray<string>> = [
  ["mill",   "farm",       "farm",   "mill"],
  ["bakery", "storehouse", "well",   "bakery"],
  ["chapel", "house",      "house",  "market"],
  ["house",  "watchpost",  "healer", "house"],
  ["well",   "house",      "house",  "chapel"],
];

/** Where the sack town's keep goes once the settlement earns Town tier. */
interface SackPlan {
  readonly cmds: CitadelCommand[];
  readonly keep: { x: number; y: number };
}

function buildSackScenario(terrain: TerrainGrid): SackPlan {
  const cx = Math.floor(terrain.width / 2);
  const cy = Math.floor(terrain.height / 2);

  // ONE clear region for the whole town + the keep site below it. Deliberately not
  // findClear-per-building (as the other scenarios do): a per-building search nudges
  // individual buildings off the lattice to dodge a rough tile, and any such nudge can
  // pull a third wooden neighbour inside the range-4 window and re-arm the ignition rule
  // the layout exists to defeat. One region → the pitch is exact by construction.
  const REGION_W = 17; // road margin (1) + 3 col pitches + widest footprint (3) + margin (1)
  const REGION_H = 31; // road margin (1) + 4 row pitches + footprint (2) + spine/keep (8)
  const region = findClear(terrain, REGION_W, REGION_H, cx - 8, cy - 15);
  const X = region.x + 1;
  const Y = region.y + 1;

  const cmds: CitadelCommand[] = [];
  // Footprint tiles, so the road carpet below can fill only the GAPS (a road command
  // onto an occupied tile is rejected, which would spam the event log with "N road
  // tiles blocked — the run has a gap").
  const footprint = new Set<number>();
  const claim = (x: number, y: number, w: number, h: number): void => {
    for (let dy = 0; dy < h; dy++)
      for (let dx = 0; dx < w; dx++) footprint.add((y + dy) * terrain.width + (x + dx));
  };

  for (let row = 0; row < SACK_LATTICE.length; row++) {
    const slots = SACK_LATTICE[row]!;
    for (let col = 0; col < slots.length; col++) {
      const type = slots[col]!;
      const x = X + col * SACK_COL_PITCH;
      const y = Y + row * SACK_ROW_PITCH;
      cmds.push({ type: "placeBuilding", payload: { buildingType: type, x, y } });
      const size = SACK_FOOTPRINTS[type] ?? { w: 2, h: 2 };
      claim(x, y, size.w, size.h);
    }
  }

  // The keep's site: below the town, on the clear region's southern strip. Placed later
  // (on tier-up), so nothing may be built on these tiles now — the road ring below stops
  // one tile short of the footprint on every side.
  const keep = { x: X + 4, y: Y + 25 };

  // ---------- Roads ----------
  // A carpet over the lattice's gaps: connects every building to the storehouse AND
  // (bonus) lays a firebreak on the line between most wooden pairs, so even a
  // raider-set blaze struggles to spread (FireSystem._hasFirebreak treats a road tile
  // on the centre-to-centre line as a break).
  const roadTiles: Array<{ x: number; y: number }> = [];
  const push = (x: number, y: number): void => {
    if (!isWalkable(terrain, x, y)) return;
    if (footprint.has(y * terrain.width + x)) return;
    roadTiles.push({ x, y });
  };
  const townBottom = Y + (SACK_LATTICE.length - 1) * SACK_ROW_PITCH + 2; // last row's footprint bottom
  for (let y = Y - 1; y <= townBottom + 1; y++) {
    for (let x = X - 1; x <= X + 3 * SACK_COL_PITCH + 2; x++) push(x, y);
  }
  // Spine down to the keep, then a ring around its 3×3 footprint so it road-connects.
  for (let y = townBottom + 2; y < keep.y; y++) push(keep.x + 1, y);
  for (let y = keep.y - 1; y <= keep.y + 3; y++) {
    for (let x = keep.x - 1; x <= keep.x + 3; x++) {
      if (x >= keep.x && x < keep.x + 3 && y >= keep.y && y < keep.y + 3) continue; // the keep's own tiles
      push(x, y);
    }
  }

  cmds.push({ type: "placeRoad", payload: { tiles: roadTiles } });
  return { cmds, keep };
}

/** Footprints of the types the sack lattice uses (mirrors BUILDING_DEFS). */
const SACK_FOOTPRINTS: Readonly<Record<string, { w: number; h: number }>> = {
  house: { w: 2, h: 2 },
  farm: { w: 3, h: 3 },
  mill: { w: 2, h: 2 },
  bakery: { w: 2, h: 2 },
  storehouse: { w: 3, h: 2 },
  chapel: { w: 2, h: 2 },
  market: { w: 2, h: 2 },
  watchpost: { w: 2, h: 2 },
  well: { w: 1, h: 1 },
  healer: { w: 2, h: 2 },
};

/**
 * "Fire" scenario: builds a DENSE wooden district.
 *
 * When `withWell=false`: no mitigation → high fire risk.
 * When `withWell=true`: a Well placed in range → ignition chance cut 80%.
 *
 * Layout: a storehouse and food chain (farm + mill + bakery) are placed to
 * the SOUTH of the cluster and connected by a road that runs BELOW the dense
 * wooden district. The cluster itself uses the proven 4-col × 3-row grid at
 * 3-tile spacing (same geometry as the integration test). No road tiles pass
 * through the cluster interior, so there are no firebreaks between buildings.
 *
 * Expect fire ignition within 5-15 days with no well.
 */
function buildFireCommands(terrain: TerrainGrid, withWell: boolean): CitadelCommand[] {
  const cx = Math.floor(terrain.width / 2);
  // Shift north so the cluster has room for roads below it.
  const cy = Math.floor(terrain.height / 2) - 8;

  // Dense wooden cluster: 10 buildings in a 4-col × 3-row grid at 3-tile spacing.
  // This layout matches the integration test that proves fire occurs within 60 days.
  // Middle buildings (col=1,2,row=1) see 4 wooden neighbors → ignition chance 0.60/day.
  // CRITICAL: no road carpet through the cluster.
  const clusterTypes = [
    "house", "house", "bakery", "bakery",   // row 0
    "mill",  "mill",  "house",  "house",    // row 1
    "chapel","market","house",  "house",    // row 2 (3rd row adds more density)
  ];
  const cmds: CitadelCommand[] = [];
  const clusterPositions: Array<{ x: number; y: number }> = [];

  for (let i = 0; i < clusterTypes.length; i++) {
    const row = Math.floor(i / 4);
    const col = i % 4;
    const pos = findClear(terrain, 2, 2, cx + col * 3, cy + row * 3);
    clusterPositions.push(pos);
    cmds.push({ type: "placeBuilding", payload: { buildingType: clusterTypes[i]!, x: pos.x, y: pos.y } });
  }

  // Economy: storehouse + farm + mill + bakery south of the cluster.
  // Road connects them without passing through the dense district.
  const econY = cy + 12; // below the 3-row cluster
  const store  = findClear(terrain, 3, 2, cx,     econY);
  const farm1  = findClear(terrain, 3, 3, cx - 5, econY);
  const farm2  = findClear(terrain, 3, 3, cx + 4, econY);
  const mill   = findClear(terrain, 2, 2, cx - 2, econY + 4);
  const bakery = findClear(terrain, 2, 2, cx + 2, econY + 4);

  cmds.push({ type: "placeBuilding", payload: { buildingType: "storehouse", x: store.x,  y: store.y } });
  cmds.push({ type: "placeBuilding", payload: { buildingType: "farm",       x: farm1.x,  y: farm1.y } });
  cmds.push({ type: "placeBuilding", payload: { buildingType: "farm",       x: farm2.x,  y: farm2.y } });
  cmds.push({ type: "placeBuilding", payload: { buildingType: "mill",       x: mill.x,   y: mill.y } });
  cmds.push({ type: "placeBuilding", payload: { buildingType: "bakery",     x: bakery.x, y: bakery.y } });

  // Wells placed across the cluster when mitigation is active.
  // The cluster is ~11 tiles wide; three wells spaced 4 tiles apart give
  // full coverage with the 5-tile radius: every building is within 5 tiles
  // of at least one well, cutting ignition chance by 80%.
  if (withWell) {
    const well1 = findClear(terrain, 1, 1, cx + 1, cy + 4);
    const well2 = findClear(terrain, 1, 1, cx + 5, cy + 4);
    const well3 = findClear(terrain, 1, 1, cx + 9, cy + 4);
    cmds.push({ type: "placeBuilding", payload: { buildingType: "well", x: well1.x, y: well1.y } });
    cmds.push({ type: "placeBuilding", payload: { buildingType: "well", x: well2.x, y: well2.y } });
    cmds.push({ type: "placeBuilding", payload: { buildingType: "well", x: well3.x, y: well3.y } });
  }

  // Road: economy carpet BELOW the cluster only (econY-1 downward).
  // The cluster at cy..cy+8 is safely above and has no roads through it.
  const roadTiles: Array<{ x: number; y: number }> = [];
  const roadTop  = econY - 1;
  const roadBot  = Math.max(mill.y + 1, bakery.y + 1);
  const roadLeft  = Math.min(farm1.x, store.x) - 1;
  const roadRight = Math.max(farm2.x + 2, store.x + 2) + 1;
  for (let ry = roadTop; ry <= roadBot; ry++) {
    for (let rx = roadLeft; rx <= roadRight; rx++) {
      if (isWalkable(terrain, rx, ry)) roadTiles.push({ x: rx, y: ry });
    }
  }
  cmds.push({ type: "placeRoad", payload: { tiles: roadTiles } });
  return cmds;
}

/**
 * "Disease" scenario: deliberately OVERCROWDED housing to guarantee outbreak.
 *
 * Key insight: crowding = population / houseCount. To get high crowding we
 * need FEW houses (low denominator) and a strong food chain that fills the
 * population cap quickly (high numerator).
 *
 * Setup: 2 houses (popCap=12) + 2 farms + 1 mill + 1 bakery.
 * Workers fill slots over 5-6 "founding" days. By day 10-12, pop reaches 8-10.
 * Crowding = 8/2 = 4 → onsetChance = (4-1)*0.12 = 0.36 per day.
 * No service buildings → happiness stays low (25-40) → unhappyFactor amplifies.
 *
 * IMPORTANT: Buildings are kept SPARSE enough that no building has ≥3 wooden
 * neighbors within 4 tiles, so fire hazard does NOT trigger (this scenario
 * demonstrates DISEASE only, not both hazards simultaneously).
 *
 * When withHealer=true: a Healer is placed to demonstrate mortality reduction.
 * With healer: death rate 0.05% + no min death guaranteed → far fewer deaths.
 */
function buildDiseaseScenario(terrain: TerrainGrid, withHealer = true): CitadelCommand[] {
  // Offset far from center to avoid overlap with other scenarios.
  const cx = Math.floor(terrain.width / 2) - 20;
  const cy = Math.floor(terrain.height / 2) + 15;

  // 2 houses → popCap=12, crowding = pop/2.
  // Economy buildings placed FAR APART (>5 tiles) so fire density threshold stays < 3.
  const store  = findClear(terrain, 3, 2, cx,      cy);
  const house1 = findClear(terrain, 2, 2, cx - 7,  cy);
  const house2 = findClear(terrain, 2, 2, cx - 7,  cy + 5);
  // Food chain: 2 farms (north, spaced 10 apart), 1 mill, 1 bakery.
  // All wooden buildings are ≥5 tiles apart so no wooden building has 3 neighbors.
  const farm1  = findClear(terrain, 3, 3, cx + 5,  cy - 3);
  const farm2  = findClear(terrain, 3, 3, cx + 5,  cy + 4);
  const mill   = findClear(terrain, 2, 2, cx,      cy - 6);  // ≥5 tiles from nearest wooden
  const bakery = findClear(terrain, 2, 2, cx - 7,  cy - 6);  // ≥5 tiles from mill
  // Healer placed between the two houses.
  const healer = findClear(terrain, 2, 2, cx - 7,  cy + 2);

  const cmds: CitadelCommand[] = [
    { type: "placeBuilding", payload: { buildingType: "storehouse", x: store.x,  y: store.y } },
    { type: "placeBuilding", payload: { buildingType: "house",      x: house1.x, y: house1.y } },
    { type: "placeBuilding", payload: { buildingType: "house",      x: house2.x, y: house2.y } },
    { type: "placeBuilding", payload: { buildingType: "farm",       x: farm1.x,  y: farm1.y } },
    { type: "placeBuilding", payload: { buildingType: "farm",       x: farm2.x,  y: farm2.y } },
    { type: "placeBuilding", payload: { buildingType: "mill",       x: mill.x,   y: mill.y } },
    { type: "placeBuilding", payload: { buildingType: "bakery",     x: bakery.x, y: bakery.y } },
  ];
  // Healer placed near both houses — only when mitigation is active.
  if (withHealer) {
    cmds.push({ type: "placeBuilding", payload: { buildingType: "healer", x: healer.x, y: healer.y } });
  }

  const roadTiles: Array<{ x: number; y: number }> = [];
  const left  = Math.min(house1.x, bakery.x) - 1;
  const right = Math.max(farm1.x + 2, farm2.x + 2) + 1;
  const top   = Math.min(mill.y, bakery.y) - 1;
  const bot   = Math.max(farm2.y + 2, house2.y + 1);
  for (let ry = top; ry <= bot; ry++) {
    for (let rx = left; rx <= right; rx++) {
      if (isWalkable(terrain, rx, ry)) roadTiles.push({ x: rx, y: ry });
    }
  }
  cmds.push({ type: "placeRoad", payload: { tiles: roadTiles } });
  return cmds;
}

/** Run a single headless sim with the given commands and return fire + event stats. */
function runOneSim(
  cmds: CitadelCommand[],
  label: string,
): { fires: number; deaths: number; finalPop: number; events: string[] } {
  const sim = bootstrapSim({ seed: SEED, ticksPerDay: TICKS_PER_DAY });
  for (const c of cmds) sim.commands.enqueue(c);
  const totalTicks = MAX_DAYS * TICKS_PER_DAY;
  let fireEvents = 0;
  let deathEvents = 0;
  let lastDay = -1;
  const allEvents: string[] = [];
  console.log(`\n--- ${label} ---`);
  for (let tick = 0; tick < totalTicks; tick++) {
    sim.scheduler.tick({ tick });
    if (sim.dayClock.day !== lastDay) {
      lastDay = sim.dayClock.day;
      const snap = sim.getSnapshot(tick);
      const hazardStr = (snap.activeFires > 0 || snap.outbreakActive)
        ? ` | fires=${snap.activeFires} sick=${snap.sickVillagers}${snap.outbreakActive ? " [OUTBREAK]" : ""}`
        : "";
      console.log(
        `  Day ${String(snap.day + 1).padStart(2)}/${MAX_DAYS} pop=${snap.population}/${snap.popCap}` +
        ` bread=${snap.stockpiles.bread ?? 0} happy=${snap.happiness}${hazardStr}`,
      );
      for (const ev of snap.recentEvents) {
        if (!allEvents.includes(ev)) {
          allEvents.push(ev);
          if (/fire|burned|disease|outbreak|died/i.test(ev)) {
            console.log(`    >> ${ev}`);
            if (/fire|burned/i.test(ev)) fireEvents++;
            if (/died/i.test(ev)) deathEvents++;
          }
        }
      }
    }
    if (sim.gameOver) break;
  }
  const final = sim.getSnapshot(totalTicks);
  return { fires: fireEvents, deaths: deathEvents, finalPop: final.population, events: allEvents };
}

/** Run two disease sims (no-healer vs with-healer) and print a comparison. */
function runDiseaseComparison(terrain: TerrainGrid): void {
  console.log(`\n=== DISEASE COMPARISON: crowded housing (seed=0x${SEED.toString(16)}) ===`);
  const resultCrowded   = runOneSim(buildDiseaseScenario(terrain, false), "CROWDED — no healer (unmitigated)");
  const resultMitigated = runOneSim(buildDiseaseScenario(terrain, true),  "MITIGATED — healer in range");
  console.log("\n=== DISEASE COMPARISON SUMMARY ===");
  console.log(`  Unmitigated: ${resultCrowded.deaths} disease deaths, final pop ${resultCrowded.finalPop}`);
  console.log(`  Mitigated:   ${resultMitigated.deaths} disease deaths, final pop ${resultMitigated.finalPop}`);
  if (resultCrowded.deaths > resultMitigated.deaths) {
    console.log(`  RESULT: Healer REDUCED deaths (${resultCrowded.deaths} → ${resultMitigated.deaths}). Disease hazard proven!`);
  } else if (resultCrowded.deaths > 0) {
    console.log(`  RESULT: Disease deaths occurred in both runs; healer provided partial mitigation.`);
  } else {
    console.log(`  RESULT: No disease deaths in this seed/day count — try higher MAX_DAYS or more crowding.`);
  }
}

/** Run two fire sims (no-well vs with-well) and print a comparison. */
function runFireComparison(terrain: TerrainGrid): void {
  console.log(`\n=== FIRE COMPARISON: dense wooden district (seed=0x${SEED.toString(16)}) ===`);
  const resultDense    = runOneSim(buildFireCommands(terrain, false), "DENSE — no well (unmitigated)");
  const resultMitigated = runOneSim(buildFireCommands(terrain, true),  "MITIGATED — well inside district");
  console.log("\n=== FIRE COMPARISON SUMMARY ===");
  console.log(`  Unmitigated: ${resultDense.fires} fire events, final pop ${resultDense.finalPop}`);
  console.log(`  Mitigated:   ${resultMitigated.fires} fire events, final pop ${resultMitigated.finalPop}`);
  if (resultDense.fires > resultMitigated.fires) {
    console.log(`  RESULT: Well REDUCED fire events (${resultDense.fires} → ${resultMitigated.fires}). Fire hazard proven!`);
  } else if (resultDense.fires > 0) {
    console.log(`  RESULT: Fire occurred in both runs (hazard proven); well provided partial mitigation.`);
  } else {
    console.log(`  RESULT: No fires in this seed/day count — try a higher MAX_DAYS or denser layout.`);
  }
}

function isSiegeScenario(): boolean {
  return SCENARIO === "siege" || SCENARIO === "sack";
}

function main(): void {
  console.log(
    `Citadel headless sim — seed=0x${SEED.toString(16)}, ${MAX_DAYS} days @ ${TICKS_PER_DAY} ticks/day [scenario: ${SCENARIO}]`,
  );

  const startDay = SCENARIO === "starve" ? 12 : 0;
  // The siege/sack scenarios exist to exercise the SHARP raid resolution
  // (resolveSiege's repelled/damage/sacked bands). `cozyThreats` defaults to TRUE
  // (cozy pivot Phase D, 2026-07-01), and under it a raid pilfers goods and leaves —
  // it can never sack, by contract. So these two scenarios must opt into the sharp
  // path explicitly, or they silently assert nothing: `sack` ran the cozy path and
  // stopped sacking the day the pivot landed, and nobody noticed for ten days.
  const sim = bootstrapSim({
    seed: SEED,
    ticksPerDay: TICKS_PER_DAY,
    startDay,
    ...(isSiegeScenario() ? { cozyThreats: false } : {}),
  });
  const { scheduler, dayClock, terrain, commands, getSnapshot } = sim;

  console.log(`Terrain generated: ${terrain.width}×${terrain.height} tiles`);

  let injectWoodPerDay = 0;
  let injectStonePerDay = 0;
  // `sack` builds its keep LATE, through the real TIER_LOCK gate — see below.
  let sackKeep: { x: number; y: number } | null = null;
  let sackKeepOrdered = false;
  if (SCENARIO === "siege") {
    const result = buildSiegeScenario(terrain);
    for (const c of result.cmds) commands.enqueue(c);
    injectWoodPerDay = result.injectWoodPerDay;
    injectStonePerDay = result.injectStonePerDay;
  } else if (SCENARIO === "sack") {
    const plan = buildSackScenario(terrain);
    for (const c of plan.cmds) commands.enqueue(c);
    sackKeep = plan.keep;
  } else if (SCENARIO === "starve") {
    const cmds = buildStarveScenario(terrain);
    for (const c of cmds) commands.enqueue(c);
  } else if (SCENARIO === "fire") {
    // Fire scenario: run two sims — dense WITHOUT well vs dense WITH well.
    // This is a standalone comparison; main loop below is skipped for this branch.
    runFireComparison(terrain);
    return;
  } else if (SCENARIO === "disease") {
    // Disease scenario: run two sims — crowded without healer vs with healer.
    runDiseaseComparison(terrain);
    return;
  } else {
    const cmds = buildGrowScenario(terrain);
    for (const c of cmds) commands.enqueue(c);
  }

  const totalTicks = MAX_DAYS * TICKS_PER_DAY;
  let lastDay = -1;
  // Track which events we've already printed to show NEW events each day.
  let printedEventCount = 0;

  for (let tick = 0; tick < totalTicks; tick++) {
    // Inject raw materials before each day boundary so converters always have input.
    // Both injections are deterministic: fixed amounts, same every day.
    if (tick % TICKS_PER_DAY === 0) {
      if (injectWoodPerDay > 0) sim.stockpiles.wood  += injectWoodPerDay;
      if (injectStonePerDay > 0) sim.stockpiles.stone += injectStonePerDay;
    }

    scheduler.tick({ tick });

    if (dayClock.day !== lastDay) {
      lastDay = dayClock.day;
      const snap = getSnapshot(tick);

      // `sack`: the keep is TIER_LOCKed to Town, so it cannot be placed at founding —
      // the old fixture tried, was rejected, and therefore never had anything to sack.
      // Order it the moment the settlement EARNS Town, exactly as a player would. The
      // command drains on the next tick's "commands" stage; the decision is a pure
      // function of sim state, so the run stays deterministic.
      // Read `peakTier` off the player rather than `snap.tier`: it is the typed
      // `SettlementTier` (the snapshot widens it to `string`), and it is the exact field
      // `placeOne`'s tier gate consults via `unlockTier` — so the fixture asks the same
      // question the tier-lock will answer.
      if (sackKeep !== null && !sackKeepOrdered && tierAtLeast(localPlayer(sim.state).peakTier, "Town")) {
        commands.enqueue({ type: "placeBuilding", payload: { buildingType: "keep", x: sackKeep.x, y: sackKeep.y } });
        sackKeepOrdered = true;
        console.log(`    >> Day ${snap.day + 1}: Town tier earned — raising the keep (defense 8, no walls).`);
      }

      const connected = snap.buildings.filter((b) => b.connected).length;
      const workers = snap.villagers.length;
      const decreesStr = snap.activeDecrees.length > 0 ? ` [${snap.activeDecrees.join(",")}]` : "";
      const traderStr = snap.traderPresent ? " [TRADER]" : "";
      const siegeStr = isSiegeScenario()
        ? ` | threat=${snap.threatLevel} defense=${snap.defensiveStrength} raiders=${snap.raiders.length} keepSacked=${snap.keepSacked}`
        : "";
      const refinStr = SCENARIO === "siege"
        ? ` stone=${snap.stockpiles.stone ?? 0} planks=${snap.stockpiles.planks ?? 0} tools=${snap.stockpiles.tools ?? 0}`
        : "";
      const hazardStr = (snap.activeFires > 0 || snap.outbreakActive)
        ? ` | fires=${snap.activeFires} sick=${snap.sickVillagers}${snap.outbreakActive ? " [OUTBREAK]" : ""}`
        : "";
      console.log(
        `  Day ${String(snap.day + 1).padStart(2)}/${MAX_DAYS} [${snap.season.padEnd(6)}] ` +
          `[${snap.tier}] ` +
          `pop ${snap.population}/${snap.popCap}  ` +
          `grain=${String(snap.stockpiles.grain ?? 0).padStart(3)} ` +
          `flour=${String(snap.stockpiles.flour ?? 0).padStart(3)} ` +
          `bread=${String(snap.stockpiles.bread ?? 0).padStart(3)}  ` +
          `workers=${workers} ` +
          `(connected ${connected}/${snap.buildings.length}, surplus ${snap.foodSurplus}) ` +
          `happy=${snap.happiness} faith=${(snap.faithCoverage * 100).toFixed(0)}% ` +
          `safe=${(snap.safetyCoverage * 100).toFixed(0)}% goods=${(snap.goodsCoverage * 100).toFixed(0)}%` +
          decreesStr + traderStr + siegeStr + refinStr + hazardStr +
          (snap.gameOver ? " *** GAME OVER ***" : ""),
      );
      // Print NEW events that arrived since the last day print (siege + hazards + tier).
      const newEvents = snap.recentEvents.slice(printedEventCount);
      printedEventCount = snap.recentEvents.length;
      for (const ev of newEvents) {
        if (/Raid|REPELLED|SACKED|DAMAGE|sacked outer|spotted|fire|burned|disease|outbreak|villager.*died|risen from|Hamlet|Village|Town|Citadel|Fortress/i.test(ev)) {
          console.log(`    >> ${ev}`);
        }
      }
    }

    if (sim.gameOver) break;
  }

  const final = getSnapshot(totalTicks);
  console.log(`\nDone. Simulated up to ${MAX_DAYS} days.`);
  console.log(
    `Final: pop ${final.population}/${final.popCap}, bread ${final.stockpiles.bread ?? 0}, ` +
      `gameOver=${final.gameOver}, keepSacked=${final.keepSacked}`,
  );
  if (isSiegeScenario()) {
    console.log(
      `Siege: ${final.keepPresent ? "keep present" : "no keep"}, ` +
        `threat=${final.threatLevel}, defense=${final.defensiveStrength}, ` +
        `keepSacked=${final.keepSacked}`,
    );
    if (SCENARIO === "siege") {
      console.log(
        `Refining: stone=${final.stockpiles.stone ?? 0} planks=${final.stockpiles.planks ?? 0} tools=${final.stockpiles.tools ?? 0}`,
      );
    }
  }
  if (final.recentEvents.length > 0) {
    console.log("Recent events:");
    for (const e of final.recentEvents.slice(-10)) console.log(`  - ${e}`);
  }

  // `sack` is the only fixture that drives the SHARP raid resolution end to end, and it
  // rotted for ten days precisely because nothing ever said so out loud: it kept printing
  // a cheerful economy summary while asserting nothing. Give it a verdict and a non-zero
  // exit, so a future regression is a FAILURE and not a paragraph nobody reads.
  if (SCENARIO === "sack") {
    if (final.keepSacked && final.gameOver) {
      console.log("\nSACK: PASS — the sharp raid path reached the `sacked` band: keep sacked, game over.");
    } else {
      console.log(
        "\nSACK: FAIL — the keep was NOT sacked.\n" +
          `  keepPresent=${final.keepPresent} keepSacked=${final.keepSacked} gameOver=${final.gameOver} ` +
          `threat=${final.threatLevel} defense=${final.defensiveStrength} tier=${final.tier}\n` +
          "  This fixture is the ONLY end-to-end check of the sharp (cozyThreats:false) raid\n" +
          "  resolution. If it is not sacking, the sharp path is unproven — do not sign off\n" +
          "  Challenge mode or any raid work on top of it. Check, in order: (1) is\n" +
          "  cozyThreats:false actually reaching bootstrapSim? (2) did the settlement reach\n" +
          "  Town so the TIER_LOCKed keep could be placed? (3) did a raider ever arrive?",
      );
      process.exit(1);
    }
  }
  process.exit(0);
}

main();
