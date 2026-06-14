/**
 * region-inventory.ts — the canonical list of every region the world generator
 * places (brief 93), with its authored design-space center and a sizing rule.
 *
 * Two roles:
 *   1. Feeds RegionSpec[] to the BSP placer (island-placement.ts).
 *   2. Provides each region's AUTHORED design-space center, so on-island content
 *      authored in design space (décor/stations/footprints/dock tiles) can ride
 *      to the region's generated position via scaleAroundNearestIsland.
 *
 * Authored centers are the midpoints of the old 160-era design-space bounds (the
 * arguments that used to be passed to scaleB). They are NOT world coordinates —
 * they're the design-space frame all anchored content is authored against.
 */

import type { RegionId, RegionKind, RegionTheme } from "./regions";
import type { RegionSpec } from "./island-placement";

export const EXTRA_FARM_COUNT = 16;

/** Number of farms = 5 named + EXTRA_FARM_COUNT procedural; one ranch each. */
export const NAMED_FARM_IDS = ["farm-cora", "farm-atticus", "farm-hannah", "farm-otto", "farm-pip"] as const;

interface InventoryEntry {
  id: RegionId;
  kind: RegionKind;
  theme?: RegionTheme;
  /** Authored design-space bounds (old 160-era frame; midpoint = authored center). */
  design: { minX: number; minY: number; maxX: number; maxY: number };
}

/** Design-space bounds of every FIXED region (verbatim from the old scaleB calls). */
const FIXED: InventoryEntry[] = [
  { id: "village", kind: "village", design: { minX: 75, minY: 75, maxX: 86, maxY: 86 } },
  { id: "carpentry", kind: "village", design: { minX: 59, minY: 76, maxX: 68, maxY: 85 } },
  { id: "blacksmith", kind: "village", design: { minX: 93, minY: 76, maxX: 102, maxY: 85 } },
  { id: "mill", kind: "village", design: { minX: 76, minY: 93, maxX: 85, maxY: 100 } },
  { id: "forest-north", kind: "village", theme: "forest", design: { minX: 61, minY: 61, maxX: 68, maxY: 68 } },
  { id: "quarry-north", kind: "village", theme: "quarry", design: { minX: 93, minY: 61, maxX: 100, maxY: 68 } },
  { id: "forest-south", kind: "village", theme: "forest", design: { minX: 61, minY: 93, maxX: 68, maxY: 100 } },
  { id: "quarry-south", kind: "village", theme: "quarry", design: { minX: 93, minY: 93, maxX: 100, maxY: 100 } },
  { id: "mushroom-grove", kind: "village", theme: "forest", design: { minX: 57, minY: 45, maxX: 68, maxY: 56 } },
  { id: "ice-pond", kind: "village", theme: "pond", design: { minX: 93, minY: 45, maxX: 104, maxY: 56 } },
  { id: "well-north", kind: "village", design: { minX: 103, minY: 62, maxX: 104, maxY: 63 } },
  { id: "well-south", kind: "village", design: { minX: 103, minY: 94, maxX: 104, maxY: 95 } },
  { id: "shrine", kind: "village", theme: "shrine", design: { minX: 73, minY: 58, maxX: 79, maxY: 64 } },
  { id: "waterfall", kind: "village", theme: "forest", design: { minX: 80, minY: 58, maxX: 87, maxY: 65 } },
  { id: "heritage-stones", kind: "village", theme: "heritage", design: { minX: 43, minY: 61, maxX: 54, maxY: 72 } },
  { id: "heritage-ruin", kind: "village", theme: "heritage", design: { minX: 107, minY: 61, maxX: 118, maxY: 72 } },
  { id: "heritage-statue", kind: "village", theme: "heritage", design: { minX: 43, minY: 91, maxX: 54, maxY: 102 } },
  { id: "fishing-isle", kind: "village", design: { minX: 75, minY: 105, maxX: 82, maxY: 112 } },
  { id: "fishing-isle-2", kind: "village", design: { minX: 59, minY: 105, maxX: 66, maxY: 112 } },
  { id: "harbor", kind: "village", design: { minX: 93, minY: 105, maxX: 100, maxY: 112 } },
  { id: "camp", kind: "village", theme: "camp", design: { minX: 108, minY: 104, maxX: 117, maxY: 113 } },
  { id: "weather-station", kind: "landmark", theme: "quarry", design: { minX: 108, minY: 119, maxX: 116, maxY: 127 } },
  { id: "volcano", kind: "landmark", theme: "volcano", design: { minX: 74, minY: 7, maxX: 85, maxY: 18 } },
  { id: "casino", kind: "landmark", theme: "casino", design: { minX: 72, minY: 114, maxX: 83, maxY: 125 } },
  { id: "big-tree", kind: "landmark", theme: "big-tree", design: { minX: 127, minY: 7, maxX: 136, maxY: 16 } },
  { id: "ring", kind: "landmark", theme: "boxing", design: { minX: 121, minY: 101, maxX: 132, maxY: 112 } },
];

/** Authored design-space centers for farms, spread so content-riding stays stable. */
function farmDesign(i: number): { minX: number; minY: number; maxX: number; maxY: number } {
  // Spread procedural farms around the design-space rim (kept distinct so each
  // farm's authored center maps to a unique generated displacement).
  const cols = 6;
  const cx = 20 + (i % cols) * 22;
  const cy = 20 + Math.floor(i / cols) * 26;
  return { minX: cx - 5, minY: cy - 5, maxX: cx + 5, maxY: cy + 5 };
}

export function designCenter(b: { minX: number; minY: number; maxX: number; maxY: number }): { x: number; y: number } {
  return { x: (b.minX + b.maxX) / 2, y: (b.minY + b.maxY) / 2 };
}

export interface InventoryRow {
  id: RegionId;
  kind: RegionKind;
  theme?: RegionTheme;
  authoredCenter: { x: number; y: number };
  spec: RegionSpec;
}

// ── Sizing rules ─────────────────────────────────────────────────────────────
// Areas are tuned so 5 named + 16 proc farms (fixed) + their ranches + the fixed
// regions reach ~60% of the 240x240 world. Farms keep a FIXED area (varied
// aspect); everything else is a TARGET the coverage loop scales.
const FARM_AREA = 420; // ~20x21; factors into many aspects within maxAspect
const RANCH_AREA = 169; // 13x13
const SPECIAL_AREA = 360; // ~19x19 nominal target (coverage loop grows these)
const LANDMARK_AREA = 320;

/** The full inventory: fixed regions + 21 farms + 21 ranches. */
export function buildInventory(): InventoryRow[] {
  const rows: InventoryRow[] = [];

  for (const e of FIXED) {
    const area = e.kind === "landmark" ? LANDMARK_AREA : SPECIAL_AREA;
    rows.push({
      id: e.id,
      kind: e.kind,
      ...(e.theme ? { theme: e.theme } : {}),
      authoredCenter: designCenter(e.design),
      spec: { id: e.id, kind: e.kind, area, minSide: 8 },
    });
  }

  // Farms: 5 named (their old ids) + 16 procedural (farm-0..15).
  const farmIds: RegionId[] = [
    ...NAMED_FARM_IDS,
    ...Array.from({ length: EXTRA_FARM_COUNT }, (_, i) => `farm-${i}` as RegionId),
  ];
  farmIds.forEach((id, i) => {
    const design = farmDesign(i);
    rows.push({
      id,
      kind: "farm",
      theme: "ring",
      authoredCenter: designCenter(design),
      spec: { id, kind: "farm", area: FARM_AREA, minSide: 16, maxAspect: 2.2 },
    });
  });

  // Ranches: one per farm (ranch-0..20), authored near their farm.
  farmIds.forEach((_id, i) => {
    const design = farmDesign(i);
    const c = designCenter(design);
    rows.push({
      id: `ranch-${i}` as RegionId,
      kind: "ranch",
      theme: "ranch",
      authoredCenter: { x: c.x + 8, y: c.y },
      spec: { id: `ranch-${i}` as RegionId, kind: "ranch", area: RANCH_AREA, minSide: 11, maxAspect: 1.8 },
    });
  });

  return rows;
}
