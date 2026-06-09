import { createRng } from '@engine/core';

/** Hand-authored islands with fixed coordinates. */
export type FixedRegionId =
  | 'village' | 'farm-cora' | 'farm-atticus' | 'farm-hannah' | 'farm-otto'
  | 'farm-pip'                         // Player-controlled farmer's farm (far east)
  | 'blacksmith' | 'carpentry'
  | 'forest-north' | 'quarry-north'   // North pair — NE quadrant
  | 'forest-south' | 'quarry-south'   // South pair — SW quadrant
  | 'mill'                            // Grain mill — south road between village & Hannah
  | 'well-north' | 'well-south'       // Irrigation wells near quarries
  | 'mushroom-grove'                  // Seasonal zone (autumn-only field work) — SE gap
  | 'ice-pond'                        // Seasonal zone (winter-only field work) — NW gap
  | 'fishing-isle'                    // Sand island you fish from (any ocean edge) — S of mill
  | 'fishing-isle-2'                  // Second sand fishing island — S of forest-south (SW)
  | 'harbor';                         // Harbor island — shipping dock + contract board (brief 46)

/** Procedurally-generated extra farm islands (the southern farm band). `farm-0`
 *  .. `farm-(EXTRA_FARM_COUNT-1)`, laid out by {@link makeExtraFarmRegion}. */
export type ExtraFarmRegionId = `farm-${number}`;

export type RegionId = FixedRegionId | ExtraFarmRegionId;

export type RegionKind = 'village' | 'farm';

export interface RegionDef {
  id: RegionId;
  kind: RegionKind;
  ownerId?: number | undefined; // farmer entity id for farms; undefined for village
  bounds: { minX: number; minY: number; maxX: number; maxY: number }; // inclusive
  center: { x: number; y: number };
}

// Archipelago layout (88×80). Every zone is an isolated island surrounded by
// ocean on all sides; islands NEVER touch (≥1 tile of water between any two
// region bodies) and are connected ONLY by 2-tile-wide bridges (the ROADS
// below, which only ever span water). The village sits dead-center as the hub
// most bridges radiate from; Pip's farm is the top island; the four AI farms
// occupy the four corners to maximise travel.
//
// The renderer is already island-aware: backdropFrame paints every non-walkable
// tile as ocean, computeShores adds foam on land-bordering-ocean, and
// computeBridges decks any road-only tile touching ocean. So this layout drives
// the whole archipelago purely from these bounds + ROADS.
//
//   C(NW)     forest-N     P(top)      quarry-N    A(NE)
//   mushroom  carpentry    VILLAGE     blacksmith  ice-pond   (mid band rows 34-45)
//   O(SW)     forest-S     mill        quarry-S    H(SE)
//             fishing-isle-2          fishing-isle  (two sand isles, rows 68-75; bubbles ring each)
export const WORLD_WIDTH = 88;

// ── Procedural farm band (south of the hand-authored core) ───────────────────
// To scale past the five hand-authored farms we generate extra farm islands in a
// regular grid in NEW space below the original 88×80 core. The originals (Pip +
// the four corners) keep their exact coordinates; these are purely additive.
//
// Layout: a COLS-wide grid starting at (FARM_BAND_X0, FARM_BAND_Y0). Each cell is
// EXTRA_FARM_SIZE tiles square with EXTRA_FARM_GAP tiles of ocean on every side
// (pitch = size + gap), so no two farm bodies are ever adjacent. Each farm hangs
// off a per-row "collector" bridge by a short centered stub; the collectors join
// a single vertical trunk that taps the village↔mill column, keeping the whole
// graph a connected tree rooted at the village.
//
// Organic jitter (brief 49 track 4): each band farm body is nudged by a small
// per-farm offset in X and Y so the band reads as scattered, not a perfect grid.
// The jitter is seeded by a FIXED module-level world-gen seed (NOT the run seed),
// so the terrain is identical on every run — exactly what we want for a stable
// world the spectator learns. We honour the project's "all randomness flows
// through rng.fork(label)" rule by forking from that fixed seed once at module
// init; we never call Math.random/Date.now. See WORLD_GEN_SEED / generateFarmBand().
// Typed as `number` (not the literal 16) so it reads as a tunable knob and the
// `=== 0` / `> 0` guards below aren't flagged as dead comparisons.
export const EXTRA_FARM_COUNT: number = 16; // 5 hand-authored + 16 = 21 farms (20 AI + Pip)
const EXTRA_FARM_COLS = 6;
const EXTRA_FARM_SIZE = 10;         // 10×10 still fits the 2×2 plot grid (PLOT_OFFSETS [-2,1])
const EXTRA_FARM_GAP = 4;           // 4-tile gutter between un-jittered farm bodies
const EXTRA_FARM_PITCH = EXTRA_FARM_SIZE + EXTRA_FARM_GAP; // 14
const FARM_BAND_X0 = 2;
const FARM_BAND_Y0 = 84;            // 4-tile water gutter below the reef lanes (y≤78)
const EXTRA_FARM_ROWS = Math.ceil(EXTRA_FARM_COUNT / EXTRA_FARM_COLS);

// ── World-gen RNG (FIXED seed — NOT the run seed) ────────────────────────────
// REGIONS/ROADS are module-level consts read by ~15 consumers; we deliberately do
// NOT thread a per-run seed through them. Instead the procedural farm band's
// organic jitter is drawn from this fixed seed, computed once at module load, so
// the world layout is byte-identical on every run. This keeps the const exports
// const, satisfies determinism (a tick's output depends only on tick count + the
// run rng; world geometry is constant), and still routes randomness through
// rng.fork(label) per project convention.
export const WORLD_GEN_SEED = 0x5eed_face;

// Per-farm jitter magnitude (tiles), applied independently in X and Y to each
// band farm body. Bounded at 1 BY DESIGN so the no-adjacency invariant holds by
// construction (budget proof below). Drawn from int(-MAG, MAG+1) → {-1,0,+1}.
const EXTRA_FARM_JITTER = 1;

// No-adjacency budget (X, the binding axis):
//   pitch 14, size 10 → 4 ocean tiles between adjacent un-jittered farm bodies.
//   Worst case: left farm shifts +JITTER, right farm shifts -JITTER → gutter
//   shrinks by 2*JITTER = 2 → 4 - 2 = 2 ocean tiles ≥ 1. ✔
// No-adjacency budget (Y):
//   pitch 14, size 10 → row r farm bottom (jittered ≤ base+10) vs row r+1 farm
//   top (jittered ≥ base+13): ≥ 3 ocean tiles ≥ 1, regardless of X. ✔
// Per-farm offsets are drawn in ascending farm order (0,1,2,…) from a single
// fork so the layout is reproducible.
const farmJitterRng = createRng(WORLD_GEN_SEED).fork('farm-band-jitter');
const FARM_JITTER: readonly { dx: number; dy: number }[] = Array.from(
  { length: EXTRA_FARM_COUNT },
  () => ({
    dx: farmJitterRng.int(-EXTRA_FARM_JITTER, EXTRA_FARM_JITTER + 1),
    dy: farmJitterRng.int(-EXTRA_FARM_JITTER, EXTRA_FARM_JITTER + 1),
  }),
);

// World grows downward to fit the farm band; the original core (y≤79) is
// untouched. With EXTRA_FARM_COUNT=0 this collapses to the original 80 (no rows).
export const WORLD_HEIGHT = Math.max(
  80,
  // Last row's un-jittered farm bottom = Y0 + (ROWS-1)*PITCH + (SIZE-1); +1 for
  // downward jitter, then ≥1 row of bottom water margin. PITCH*ROWS - GAP + 2
  // expands to exactly that with comfortable slack (the gutter below the last row
  // is unused), so reuse the simple closed form.
  FARM_BAND_Y0 + EXTRA_FARM_ROWS * EXTRA_FARM_PITCH + 2, // bottom water margin
);

// ── Farm islands (12×12) ─────────────────────────────────────────────────────
const FARM_PIP_BOUNDS      = { minX: 38, minY:  2, maxX: 49, maxY: 13 }; // Top-center (player)
const FARM_CORA_BOUNDS     = { minX:  2, minY:  2, maxX: 13, maxY: 13 }; // NW corner
const FARM_ATTICUS_BOUNDS  = { minX: 74, minY:  2, maxX: 85, maxY: 13 }; // NE corner
const FARM_OTTO_BOUNDS     = { minX:  2, minY: 54, maxX: 13, maxY: 65 }; // SW corner
const FARM_HANNAH_BOUNDS   = { minX: 74, minY: 54, maxX: 85, maxY: 65 }; // SE corner

// ── Village hub (12×12) + craft islands flanking it (10×10) ──────────────────
const VILLAGE_BOUNDS       = { minX: 38, minY: 34, maxX: 49, maxY: 45 }; // center hub
const CARPENTRY_BOUNDS     = { minX: 20, minY: 34, maxX: 29, maxY: 43 }; // W of village
const BLACKSMITH_BOUNDS    = { minX: 58, minY: 34, maxX: 67, maxY: 43 }; // E of village

// ── Resource zones (8×8) ─────────────────────────────────────────────────────
const FOREST_NORTH_BOUNDS  = { minX: 22, minY:  4, maxX: 29, maxY: 11 };
const QUARRY_NORTH_BOUNDS  = { minX: 58, minY:  4, maxX: 65, maxY: 11 };
const FOREST_SOUTH_BOUNDS  = { minX: 22, minY: 56, maxX: 29, maxY: 63 };
const QUARRY_SOUTH_BOUNDS  = { minX: 58, minY: 56, maxX: 65, maxY: 63 };

// ── Mill (south of village) + wells (near the quarries) ──────────────────────
const MILL_BOUNDS          = { minX: 39, minY: 56, maxX: 48, maxY: 63 };
const WELL_NORTH_BOUNDS    = { minX: 69, minY:  6, maxX: 70, maxY:  7 }; // 2×2
const WELL_SOUTH_BOUNDS    = { minX: 69, minY: 58, maxX: 70, maxY: 59 }; // 2×2

// ── Seasonal zones ───────────────────────────────────────────────────────────
const MUSHROOM_GROVE_BOUNDS = { minX:  6, minY: 34, maxX: 13, maxY: 41 }; // far W — autumn
const ICE_POND_BOUNDS      = { minX: 74, minY: 34, maxX: 81, maxY: 41 }; // far E — winter

// ── Fishing isles (two 8×8 sand islands in open ocean) ────────────────────────
// Dedicated sand islands you travel to and fish from: stand on any edge tile,
// face the surrounding ocean, and cast. Bubble spots drift in the ring of ocean
// around each (see BubbleSystem) and grant rarer fish. One hangs off the mill
// (S, center), the other off forest-south (S, SW).
const FISHING_ISLE_BOUNDS   = { minX: 40, minY: 68, maxX: 47, maxY: 75 };
const FISHING_ISLE_2_BOUNDS = { minX: 22, minY: 68, maxX: 29, maxY: 75 };

// ── Harbor island (brief 46) — 8×8 dock + contract board ─────────────────────
// A coastal dock island south of Hannah's farm (quarry-south quadrant). It sits
// at the SE corner of the navigable ocean, connected by a 2-tile bridge to
// quarry-south. The harbor is the home of shipping contracts, the dockmaster
// NPC, and the arriving cargo ship. 8×8 keeps it small like the fishing isles.
const HARBOR_BOUNDS = { minX: 58, minY: 68, maxX: 65, maxY: 75 };

/** Every fishing-isle region id, so the renderer / fishing logic treat them
 *  uniformly. */
export const FISHING_ISLE_IDS: readonly RegionId[] = ['fishing-isle', 'fishing-isle-2'];

/** The harbor island where shipping contracts are posted (brief 46). */
export const HARBOR_REGION_ID: RegionId = 'harbor';

/** The dock tile where a farmer stands to deliver a contract. */
export const HARBOR_DOCK_TILE = { x: 61, y: 68 } as const;

/** The contract board tile within the harbor. */
export const HARBOR_BOARD_TILE = { x: 62, y: 71 } as const;

/** True if a region id is one of the fishing isles. */
export function isFishingIsle(region: RegionId | null): boolean {
  return region === 'fishing-isle' || region === 'fishing-isle-2';
}

function midpoint(bounds: { minX: number; minY: number; maxX: number; maxY: number }): { x: number; y: number } {
  return {
    x: Math.floor((bounds.minX + bounds.maxX) / 2),
    y: Math.floor((bounds.minY + bounds.maxY) / 2),
  };
}

// ── Procedural farm-band generation ──────────────────────────────────────────
// Functions producing the extra farm regions + the bridge network that wires them
// into the village-rooted road tree. Indices 0..EXTRA_FARM_COUNT-1. The only
// randomness is the per-farm organic jitter (FARM_JITTER), drawn once at module
// init from the FIXED WORLD_GEN_SEED — so the band is identical on every run.

/** Un-jittered grid origin (minX,minY) of extra farm `i` (row-major, COLS wide).
 *  The row collector is pinned to this grid line; only the farm body is jittered. */
function extraFarmGridOrigin(i: number): { minX: number; minY: number } {
  const col = i % EXTRA_FARM_COLS;
  const row = Math.floor(i / EXTRA_FARM_COLS);
  return {
    minX: FARM_BAND_X0 + col * EXTRA_FARM_PITCH,
    minY: FARM_BAND_Y0 + row * EXTRA_FARM_PITCH,
  };
}

/** Jittered bounds of extra farm `i`. The body is nudged by its fixed-seed
 *  per-farm offset (±EXTRA_FARM_JITTER in each axis); the no-adjacency budget
 *  above proves neighbours keep ≥1 ocean tile in both axes by construction. */
function extraFarmBounds(i: number): { minX: number; minY: number; maxX: number; maxY: number } {
  const origin = extraFarmGridOrigin(i);
  const j = FARM_JITTER[i]!;
  const minX = origin.minX + j.dx;
  const minY = origin.minY + j.dy;
  return { minX, minY, maxX: minX + EXTRA_FARM_SIZE - 1, maxY: minY + EXTRA_FARM_SIZE - 1 };
}

/** The RegionDef for extra farm `i`. */
function makeExtraFarmRegion(i: number): RegionDef {
  const bounds = extraFarmBounds(i);
  return { id: `farm-${i}` as RegionId, kind: 'farm', bounds, center: midpoint(bounds) };
}

const EXTRA_FARM_REGIONS: readonly RegionDef[] = Array.from(
  { length: EXTRA_FARM_COUNT },
  (_unused, i) => makeExtraFarmRegion(i),
);

// Column of the trunk bridge. It taps the MILL's south edge and runs straight
// down into the farm band through open ocean. x48–49 is chosen because x48 is the
// mill's east-edge column (mill spans x39–48, so the trunk joins the mill body at
// exactly that edge) while x48–49 stays clear of fishing-isle (x40–47) and harbor
// (x58–65) — the only other islands in the southern corridor.
const FARM_TRUNK_X = 48;
// Y the trunk starts at: one tile below the mill's south edge (mill maxY = 63).
const FARM_TRUNK_Y0 = 64;

/**
 * Generate the bridge network for the farm band. Every road is a 2-wide bridge
 * spanning only ocean, joining exactly the islands it's meant to:
 *  - trunk: vertical, from the core (mill area) down to the first collector;
 *  - collectors: one horizontal road per occupied row, sitting in the GAP gutter
 *    above that row's farms (pure water), spanning the columns the row uses;
 *  - links: short vertical bridges in a gutter column joining the trunk down
 *    through successive collectors (so all collectors hang off the trunk);
 *  - stubs: a short 2-wide bridge from each farm's top edge up into its row
 *    collector, centered on the farm so it never touches a neighbour.
 */
function generateFarmBand(): RoadDef[] {
  if (EXTRA_FARM_COUNT === 0) return [];
  const roads: RoadDef[] = [];

  // Collector y for a given row: a fixed 2-tall bridge pinned to the UN-jittered
  // grid line, sitting in the middle of the gutter above the row's farms (gutter
  // is rowMinY-EXTRA_FARM_GAP .. rowMinY-1, i.e. 4 tiles tall now). Pinning the
  // collector to the grid line (not the jittered farm tops) means each farm joins
  // the network via its own short vertical stub from the collector down to the
  // jittered farm top. The collector is a road (not an island), so jittered farm
  // bodies stay non-adjacent to one another — the invariant is about islands only.
  const collectorY = (row: number): { minY: number; maxY: number } => {
    const rowMinY = FARM_BAND_Y0 + row * EXTRA_FARM_PITCH;
    // 2-tall, centered in the 4-tile gutter: rowMinY-3 .. rowMinY-2 (pure water).
    return { minY: rowMinY - 3, maxY: rowMinY - 2 };
  };

  // Trunk: from one tile below the mill's south edge straight down to the first
  // collector. x = FARM_TRUNK_X..+1 (see constant doc).
  const firstCollector = collectorY(0);
  roads.push({ minX: FARM_TRUNK_X, maxX: FARM_TRUNK_X + 1, minY: FARM_TRUNK_Y0, maxY: firstCollector.minY - 1 });

  for (let row = 0; row < EXTRA_FARM_ROWS; row++) {
    const farmsInRow = Math.min(EXTRA_FARM_COLS, EXTRA_FARM_COUNT - row * EXTRA_FARM_COLS);
    if (farmsInRow <= 0) break;
    const cy = collectorY(row);

    // Per-farm stubs + the X-extent the collector must span. Each stub is a 2-wide
    // vertical bridge centered on the JITTERED farm body, from the collector's
    // bottom edge down to one tile above the farm's (jittered) top edge — pure
    // water. The collector must span from the trunk column across every stub
    // column so trunk → collector → stub → farm is always one connected tree.
    let colMinX = FARM_TRUNK_X;
    let colMaxX = FARM_TRUNK_X + 1;
    for (let c = 0; c < farmsInRow; c++) {
      const bounds = extraFarmBounds(row * EXTRA_FARM_COLS + c);
      // Stub columns: 2-wide, left-of-center on the jittered farm (size 10 → +4,+5).
      const stubMinX = bounds.minX + Math.floor(EXTRA_FARM_SIZE / 2) - 1;
      const stubMaxX = stubMinX + 1;
      colMinX = Math.min(colMinX, stubMinX);
      colMaxX = Math.max(colMaxX, stubMaxX);

      // Stub spans the water between the collector bottom and the jittered farm
      // top. If downward jitter put the farm top directly under the collector
      // (no gap), the farm is already adjacent to the collector — skip the stub.
      const stubMinY = cy.maxY + 1;
      const stubMaxY = bounds.minY - 1;
      if (stubMaxY >= stubMinY) {
        roads.push({ minX: stubMinX, maxX: stubMaxX, minY: stubMinY, maxY: stubMaxY });
      }
    }

    // Collector spanning all of this row's stub columns plus the trunk column, so
    // the trunk/link always meets it and every stub joins it.
    roads.push({ minX: colMinX, maxX: colMaxX, minY: cy.minY, maxY: cy.maxY });

    // Link this collector down to the next occupied row's collector (vertical, in
    // the trunk column, through the farm row's gap).
    const nextRowStart = (row + 1) * EXTRA_FARM_COLS;
    if (row + 1 < EXTRA_FARM_ROWS && nextRowStart < EXTRA_FARM_COUNT) {
      const next = collectorY(row + 1);
      roads.push({ minX: FARM_TRUNK_X, maxX: FARM_TRUNK_X + 1, minY: cy.maxY + 1, maxY: next.minY - 1 });
    }
  }

  return roads;
}

const EXTRA_FARM_ROADS: readonly RoadDef[] = generateFarmBand();

export const REGIONS: readonly RegionDef[] = [
  { id: 'village',        kind: 'village', bounds: VILLAGE_BOUNDS,         center: midpoint(VILLAGE_BOUNDS) },
  { id: 'farm-cora',      kind: 'farm',    bounds: FARM_CORA_BOUNDS,       center: midpoint(FARM_CORA_BOUNDS) },
  { id: 'farm-atticus',   kind: 'farm',    bounds: FARM_ATTICUS_BOUNDS,    center: midpoint(FARM_ATTICUS_BOUNDS) },
  { id: 'farm-hannah',    kind: 'farm',    bounds: FARM_HANNAH_BOUNDS,     center: midpoint(FARM_HANNAH_BOUNDS) },
  { id: 'farm-otto',      kind: 'farm',    bounds: FARM_OTTO_BOUNDS,       center: midpoint(FARM_OTTO_BOUNDS) },
  { id: 'farm-pip',       kind: 'farm',    bounds: FARM_PIP_BOUNDS,        center: midpoint(FARM_PIP_BOUNDS) },
  { id: 'blacksmith',     kind: 'village', bounds: BLACKSMITH_BOUNDS,      center: midpoint(BLACKSMITH_BOUNDS) },
  { id: 'carpentry',      kind: 'village', bounds: CARPENTRY_BOUNDS,       center: midpoint(CARPENTRY_BOUNDS) },
  { id: 'forest-north',   kind: 'village', bounds: FOREST_NORTH_BOUNDS,    center: midpoint(FOREST_NORTH_BOUNDS) },
  { id: 'quarry-north',   kind: 'village', bounds: QUARRY_NORTH_BOUNDS,    center: midpoint(QUARRY_NORTH_BOUNDS) },
  { id: 'forest-south',   kind: 'village', bounds: FOREST_SOUTH_BOUNDS,    center: midpoint(FOREST_SOUTH_BOUNDS) },
  { id: 'quarry-south',   kind: 'village', bounds: QUARRY_SOUTH_BOUNDS,    center: midpoint(QUARRY_SOUTH_BOUNDS) },
  { id: 'mill',           kind: 'village', bounds: MILL_BOUNDS,            center: midpoint(MILL_BOUNDS) },
  { id: 'well-north',     kind: 'village', bounds: WELL_NORTH_BOUNDS,      center: midpoint(WELL_NORTH_BOUNDS) },
  { id: 'well-south',     kind: 'village', bounds: WELL_SOUTH_BOUNDS,      center: midpoint(WELL_SOUTH_BOUNDS) },
  { id: 'mushroom-grove', kind: 'village', bounds: MUSHROOM_GROVE_BOUNDS,  center: midpoint(MUSHROOM_GROVE_BOUNDS) },
  { id: 'ice-pond',       kind: 'village', bounds: ICE_POND_BOUNDS,        center: midpoint(ICE_POND_BOUNDS) },
  { id: 'fishing-isle',   kind: 'village', bounds: FISHING_ISLE_BOUNDS,    center: midpoint(FISHING_ISLE_BOUNDS) },
  { id: 'fishing-isle-2', kind: 'village', bounds: FISHING_ISLE_2_BOUNDS,  center: midpoint(FISHING_ISLE_2_BOUNDS) },
  { id: 'harbor',         kind: 'village', bounds: HARBOR_BOUNDS,          center: midpoint(HARBOR_BOUNDS) },
  // Procedural farm band (south) — additive; the five fixed farms above are unchanged.
  ...EXTRA_FARM_REGIONS,
];

// ── Road corridors ────────────────────────────────────────────────────────────
interface RoadDef {
  minX: number; minY: number; maxX: number; maxY: number;
}

// Every entry is a 2-tile-wide bridge that spans ONLY water (it touches no land
// except the two island edges it joins). Together they form a tree rooted at the
// village: village → {carpentry, blacksmith, Pip, mill}; carpentry → the west
// chain (mushroom-grove, forest-north, forest-south); blacksmith → the east
// chain (ice-pond, quarry-north, quarry-south); each corner farm + each well
// hangs off its nearest resource island. Verified: no island-to-island
// adjacency and full BFS connectivity from the village center (walkable-grid
// test asserts both).
const ROADS: readonly RoadDef[] = [
  // ── Village hub spokes ──
  { minX: 30, minY: 38, maxX: 37, maxY: 39 }, // village ↔ carpentry
  { minX: 50, minY: 38, maxX: 57, maxY: 39 }, // village ↔ blacksmith
  { minX: 42, minY: 14, maxX: 43, maxY: 33 }, // village ↔ Pip (top)
  { minX: 42, minY: 46, maxX: 43, maxY: 55 }, // village ↔ mill

  // ── West chain (off carpentry) ──
  { minX: 14, minY: 37, maxX: 19, maxY: 38 }, // carpentry ↔ mushroom-grove
  { minX: 24, minY: 12, maxX: 25, maxY: 33 }, // carpentry ↔ forest-north
  { minX: 24, minY: 44, maxX: 25, maxY: 55 }, // carpentry ↔ forest-south

  // ── East chain (off blacksmith) ──
  { minX: 68, minY: 37, maxX: 73, maxY: 38 }, // blacksmith ↔ ice-pond
  { minX: 60, minY: 12, maxX: 61, maxY: 33 }, // blacksmith ↔ quarry-north
  { minX: 60, minY: 44, maxX: 61, maxY: 55 }, // blacksmith ↔ quarry-south

  // ── Corner farms hang off the nearest resource island ──
  { minX: 14, minY:  6, maxX: 21, maxY:  7 }, // Cora ↔ forest-north
  { minX: 66, minY:  6, maxX: 73, maxY:  7 }, // Atticus ↔ quarry-north
  { minX: 14, minY: 59, maxX: 21, maxY: 60 }, // Otto ↔ forest-south
  { minX: 66, minY: 59, maxX: 73, maxY: 60 }, // Hannah ↔ quarry-south

  // ── Wells (stub off the adjacent quarry) ──
  { minX: 66, minY:  6, maxX: 68, maxY:  7 }, // well-north ↔ quarry-north
  { minX: 66, minY: 58, maxX: 68, maxY: 59 }, // well-south ↔ quarry-south

  // ── Fishing isles (hang off the mill / forest-south, due south) ──
  { minX: 42, minY: 64, maxX: 43, maxY: 67 }, // mill ↔ fishing-isle
  { minX: 24, minY: 64, maxX: 25, maxY: 67 }, // forest-south ↔ fishing-isle-2

  // ── Harbor (brief 46) — hangs off quarry-south, due south ──────────────────
  { minX: 60, minY: 64, maxX: 61, maxY: 67 }, // quarry-south ↔ harbor

  // ── Procedural farm band (south) — trunk + per-row collectors ──
  ...EXTRA_FARM_ROADS,
];

// Town square: inner 4×4 of village (auction podium + notice board markers)
export const TOWN_SQUARE = { minX: 42, minY: 38, maxX: 45, maxY: 41 };

// Auction podium tile: dead center of the town square — where agents gather for CFP
export const AUCTION_PODIUM_TILE = { x: 43, y: 39 } as const;

// Notice board tile: west edge of town square
export const NOTICE_BOARD_TILE = { x: 42, y: 39 } as const;

function inBounds(
  x: number,
  y: number,
  bounds: { minX: number; minY: number; maxX: number; maxY: number },
): boolean {
  return x >= bounds.minX && x <= bounds.maxX && y >= bounds.minY && y <= bounds.maxY;
}

/**
 * Returns the RegionId for a tile coordinate, or null for void/road-only tiles.
 */
export function regionAt(x: number, y: number): RegionId | null {
  for (const region of REGIONS) {
    if (inBounds(x, y, region.bounds)) return region.id;
  }
  return null;
}

/**
 * Returns true if the tile is walkable — inside a region or on a road.
 */
export function isWalkable(x: number, y: number): boolean {
  if (regionAt(x, y) !== null) return true;
  for (const road of ROADS) {
    if (inBounds(x, y, road)) return true;
  }
  return false;
}

/** Get a region definition by id. Throws if not found. */
export function getRegion(id: RegionId): RegionDef {
  const region = REGIONS.find((r) => r.id === id);
  if (!region) throw new Error(`getRegion: unknown region id '${id}'`);
  return region;
}

/**
 * Pick the resource zone (forest for "tree", quarry for "stone") nearest a
 * farm, used for gather routing + zone ownership. Replaces the old hardcoded
 * N/S corner-pair mapping so it works for any farm position (incl. the
 * procedural southern band). Compares the farm center to each candidate zone's
 * center by squared distance; ties resolve to the north zone for stability.
 */
export function nearestResourceZone(
  farmCenter: { x: number; y: number },
  kind: "tree" | "stone",
): RegionId {
  const candidates: RegionId[] = kind === "tree"
    ? ["forest-north", "forest-south"]
    : ["quarry-north", "quarry-south"];
  let best: RegionId = candidates[0]!;
  let bestDist = Infinity;
  for (const id of candidates) {
    const c = getRegion(id).center;
    const dx = c.x - farmCenter.x;
    const dy = c.y - farmCenter.y;
    const d = dx * dx + dy * dy;
    if (d < bestDist) {
      bestDist = d;
      best = id;
    }
  }
  return best;
}

export { ROADS };
export type { RoadDef };
