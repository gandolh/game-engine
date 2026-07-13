/**
 * art-06 — All-assets SHOWCASE (DEV-only visual acceptance harness).
 *
 * Lays EVERY Citadel asset out on the iso grid with generous spacing so no two
 * sprites' pixels overlap, then drives the REAL renderer (same atlas / pushScene /
 * endFrame / wash / cloud path as gameplay) so what you see is the shipped art —
 * not a mock. It is the surface the asset-critique rubric
 * (corpus/wiki/citadel-asset-critique.md) is graded against.
 *
 * Split into a PURE layout half (`showcaseLayout` — enumerates the asset set and
 * assigns each a grid cell + AABB; unit-tested headlessly, no GPU) and an
 * imperative render half (`runShowcase` — creates the renderer and runs the frame
 * loop with the isometry / all-burning / day-phase overlays). Reached via the
 * `?showcase` URL flag in main.ts, gated by import.meta.env.DEV.
 */
import { CITADEL_PAL as EDG } from "./citadel-palette";
import type { IsoProjection } from "./iso";
import type { BuildingSnapshot, VillagerSnapshot, RaiderSnapshot, TerrainGrid } from "@citadel/sim-core";
import {
  createCitadelRenderer,
  pushScene,
  pushWearOverlay,
  pushLightPool,
  pushFire,
  cloudOptionsFor,
  quadToSprite,
  packTint,
  isoSpriteDims,
  fitCameraToCanvas,
  ISO_TILE_W,
  ISO_TILE_H,
} from "./citadel-renderer";
import { BUILDING_SPRITE_TYPES } from "./sprites/recipes";
import { computeWash, nightFactorOf, emittersOf, lightPoolQuads } from "./atmosphere";

// ---------------------------------------------------------------------------
// Asset set + per-type height (mirrors buildings.ts `heightTiles`, source-of-
// truth ordering says it must match the recipe — asserted by the layout test).
// ---------------------------------------------------------------------------

/** Per-type art height in tiles — MUST match the authored recipe heights. */
const SHOWCASE_HEIGHT_TILES: Record<string, number> = {
  keep: 3, tower: 3, mill: 3, garrison: 2, chapel: 2, "town-hall": 2, healer: 2, mine: 2,
};
export function showcaseHeightTiles(type: string): number {
  return SHOWCASE_HEIGHT_TILES[type] ?? 1;
}

/** Per-type footprint (w,h) in tiles — mirrors the recipe footprints. */
const SHOWCASE_FOOTPRINT: Record<string, readonly [number, number]> = {
  farm: [3, 3], storehouse: [3, 2], tradingpost: [3, 2], garrison: [3, 2],
  keep: [3, 3], "town-hall": [3, 3], well: [1, 1],
};
function showcaseFootprint(type: string): readonly [number, number] {
  return SHOWCASE_FOOTPRINT[type] ?? [2, 2];
}

/** Stable, sorted list of every building type that has a sprite. */
export function showcaseBuildingTypes(): string[] {
  return [...BUILDING_SPRITE_TYPES].sort();
}

// ---------------------------------------------------------------------------
// Pure layout
// ---------------------------------------------------------------------------

/** An axis-aligned bounding box in iso world-px. */
export interface Aabb {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** One placed showcase asset: the synthetic building + its label + iso AABB. */
export interface ShowcaseItem {
  readonly building: BuildingSnapshot;
  readonly label: string;
  readonly aabb: Aabb;
}

/** The full laid-out showcase: placed items + the tile pitch used. */
export interface ShowcaseLayout {
  readonly items: readonly ShowcaseItem[];
  readonly pitchTiles: number;
  readonly cols: number;
}

/** A neutral, non-burning, connected synthetic building at a tile. */
function makeBuilding(type: string, x: number, y: number, w: number, h: number, burning = false): BuildingSnapshot {
  return {
    type, x, y, w, h,
    connected: true, outputBuffer: 0, workerCount: 1, occupancy: 1, ownerId: 0,
    onFire: burning, burning,
    level: 1, lacksFaith: false, lacksSafety: false, lacksGoods: false, mood: 80,
    wellServed: false,
  };
}

/**
 * Lay every building type on a padded iso lattice. Pure: no GPU, no clock — so a
 * headless test can assert no two sprite AABBs intersect (the structural "pixels
 * don't overlap" guarantee). The tile PITCH is derived from the widest+tallest
 * sprite so a cell always clears its neighbour, computed once (not eyeballed).
 * `burning` stamps every building as on-fire for the fire-FX capture.
 */
export function showcaseLayout(iso: IsoProjection, burning = false): ShowcaseLayout {
  const types = showcaseBuildingTypes();
  const cols = Math.ceil(Math.sqrt(types.length));

  // A tall multi-storey sprite's iso AABB reaches WELL above its footprint
  // diamond (roof + walls) and to both sides (h·ISO_HW), so a naive tile pitch
  // lets a tall building in one row poke into the row above. Rather than derive a
  // fragile closed-form pitch through the 2:1 projection + vertical rise, grow the
  // tile pitch until NO two sprite AABBs overlap — deterministic, pure, and the
  // "pixels don't overlap" invariant holds by construction (the layout test then
  // just re-confirms it). Bounded so a bug can't loop forever.
  const build = (pitchTiles: number): ShowcaseItem[] => {
    const items: ShowcaseItem[] = [];
    types.forEach((type, i) => {
      const col = i % cols;
      const row = Math.floor(i / cols);
      // The +8 origin keeps everything in positive iso-x after the diamond stagger.
      const tx = 8 + col * pitchTiles;
      const ty = 8 + row * pitchTiles;
      const [w, h] = showcaseFootprint(type);
      const b = makeBuilding(type, tx, ty, w, h, burning);
      const box = iso.isoFootprintBox(tx, ty, w, h, showcaseHeightTiles(type));
      items.push({
        building: b,
        label: type,
        aabb: { x: box.x, y: box.y, width: box.width, height: box.height },
      });
    });
    return items;
  };

  let pitchTiles = 4;
  let items = build(pitchTiles);
  while (pitchTiles < 40 && firstOverlapIn(items) !== null) {
    pitchTiles++;
    items = build(pitchTiles);
  }

  return { items, pitchTiles, cols };
}

/** Internal: first overlapping pair among a raw item list (used while growing pitch). */
function firstOverlapIn(items: readonly ShowcaseItem[]): [ShowcaseItem, ShowcaseItem] | null {
  for (let i = 0; i < items.length; i++) {
    for (let j = i + 1; j < items.length; j++) {
      if (aabbsOverlap(items[i]!.aabb, items[j]!.aabb)) return [items[i]!, items[j]!];
    }
  }
  return null;
}

/** Extend a bounds AABB to include the villager row's iso footprint points, so
 *  the framed view doesn't crop the units below the building lattice. */
function padBounds(iso: IsoProjection, b: Aabb, villagers: readonly VillagerSnapshot[]): Aabb {
  let { x: minX, y: minY } = b;
  let maxX = b.x + b.width, maxY = b.y + b.height;
  for (const v of villagers) {
    const p = iso.tileCenterToIso(v.x, v.y);
    minX = Math.min(minX, p.x - ISO_TILE_W);
    maxX = Math.max(maxX, p.x + ISO_TILE_W);
    maxY = Math.max(maxY, p.y + ISO_TILE_H * 2);
  }
  return { x: minX, y: minY, width: maxX - minX, height: maxY - minY };
}

/** The union iso-px bounding box of every placed item (for camera framing). */
export function showcaseBounds(layout: ShowcaseLayout): Aabb {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const it of layout.items) {
    minX = Math.min(minX, it.aabb.x);
    minY = Math.min(minY, it.aabb.y);
    maxX = Math.max(maxX, it.aabb.x + it.aabb.width);
    maxY = Math.max(maxY, it.aabb.y + it.aabb.height);
  }
  return { x: minX, y: minY, width: maxX - minX, height: maxY - minY };
}

/** Do two AABBs overlap (share any interior area)? Touching edges is allowed. */
export function aabbsOverlap(a: Aabb, b: Aabb): boolean {
  return a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;
}

/** The first pair of overlapping showcase items, or null if none overlap. */
export function firstOverlap(layout: ShowcaseLayout): [ShowcaseItem, ShowcaseItem] | null {
  const items = layout.items;
  for (let i = 0; i < items.length; i++) {
    for (let j = i + 1; j < items.length; j++) {
      if (aabbsOverlap(items[i]!.aabb, items[j]!.aabb)) return [items[i]!, items[j]!];
    }
  }
  return null;
}

// ---------------------------------------------------------------------------
// Overlay toggles (render-only switches, mirror main.ts `renderToggles`)
// ---------------------------------------------------------------------------

export interface ShowcaseToggles {
  /** Force every building `burning` so the full fire treatment is visible. */
  burning: boolean;
  /** Draw the 2:1 ground diamond + a vertical ruler behind each building. */
  isometry: boolean;
  /** Day fraction 0..1 driving the wash / nightFactor (dawn≈0, noon≈0.5, night≈0.9). */
  dayFraction: number;
}

export const DEFAULT_SHOWCASE_TOGGLES: ShowcaseToggles = { burning: false, isometry: false, dayFraction: 0.5 };

/** Layer just below buildings for the isometry-overlay diamonds/rulers. */
const LAYER_ISO_OVERLAY = 2;

/** Every villager job — a showcase row so each role silhouette is visible. */
const SHOWCASE_JOBS: readonly string[] = [
  "farmer", "woodcutter", "sawyer", "smith", "priest", "healer",
  "watchman", "soldier", "trader", "miller", "quarryman", "miner", "idle",
];

/**
 * Synthetic villagers laid out in a spaced ROW below the building lattice (art-05
 * showcase). One per job so each role-accessory silhouette + job tint is visible
 * at once. Pure — deterministic tile coords.
 */
export function showcaseVillagers(rowTy: number, startTx = 10): VillagerSnapshot[] {
  // Wrap into rows ~8 wide so the unit block stays roughly as wide as the
  // building lattice (keeps the camera zoom tight instead of stretching to a
  // single long row).
  const perRow = 8;
  return SHOWCASE_JOBS.map((job, i) => ({
    id: i + 1,
    x: startTx + (i % perRow) * 2, // 2-tile spacing — the 32px figures read spaced
    y: rowTy + Math.floor(i / perRow) * 2,
    fsm: "idle",
    carryGood: null,
    job,
    mood: 70,
  }));
}

// ---------------------------------------------------------------------------
// Render loop
// ---------------------------------------------------------------------------

/**
 * Boot the showcase against a real canvas + terrain and run the frame loop.
 * DEV-only; called from main.ts on `?showcase`. Returns a handle exposing the
 * toggles (so a capture script / dev hook can flip them) and a stop fn.
 */
export async function runShowcase(
  canvas: HTMLCanvasElement,
  terrain: TerrainGrid,
): Promise<{ toggles: ShowcaseToggles; stop: () => void }> {
  const { renderer, camera, iso, windowController } = await createCitadelRenderer(canvas, terrain);
  const toggles: ShowcaseToggles = { ...DEFAULT_SHOWCASE_TOGGLES };

  // Hide the game's static HUD DOM (index.html ships it) — the showcase is a bare
  // asset sheet, not the game. Best-effort; absent in headless/other hosts.
  for (const id of ["hud", "ui-overlay", "topbar", "bottombar"]) {
    const el = document.getElementById(id);
    if (el) el.style.display = "none";
  }

  const noRaiders: readonly RaiderSnapshot[] = [];
  // art-05: a row of one villager per job below the building lattice, so every
  // role-accessory silhouette is visible in the showcase (was buildings-only).
  const baseLayout = showcaseLayout(iso);
  const maxTy = Math.max(...baseLayout.items.map((it) => it.building.y + it.building.h));
  const villagers = showcaseVillagers(maxTy + 3);

  // Frame the camera on the ASSET LATTICE (not the whole 160×160 world) so the
  // sprites read large. Center on the lattice bounds + pick a zoom that fits it
  // with margin. Recomputed once (layout is deterministic + burning-invariant in
  // footprint). worldUnitsX/Y = baseWorld / zoom, so zoom = baseWorld / desiredView.
  // Include the villager row in the framed bounds so it isn't cropped.
  const bounds = padBounds(iso, showcaseBounds(baseLayout), villagers);
  const MARGIN = 1.15;

  let raf = 0;
  let stopped = false;
  const frame = (): void => {
    if (stopped) return;
    const nowMs = performance.now();
    const layout = showcaseLayout(iso, toggles.burning);
    const buildings = layout.items.map((it) => it.building);

    const dayFraction = toggles.dayFraction;
    const nightFactor = nightFactorOf(dayFraction);

    renderer.beginFrame();
    camera.centerX = bounds.x + bounds.width / 2;
    camera.centerY = bounds.y + bounds.height / 2;
    // Zoom so the lattice + margin fills the view. Derive from the zoom=1 fit
    // (frame-stable — computed off `bounds`, not the previous frame's zoom):
    // at zoom=1, worldUnits = whole-world span; scaling zoom by (span / view)
    // shrinks the visible units to the lattice. Recompute from zoom=1 each frame
    // so the value never drifts.
    camera.setZoom(1);
    fitCameraToCanvas(camera, canvas.width, canvas.height, iso);
    const zoomForW = camera.worldUnitsX / (bounds.width * MARGIN);
    const zoomForH = camera.worldUnitsY / (bounds.height * MARGIN);
    camera.setZoom(Math.min(zoomForW, zoomForH));
    fitCameraToCanvas(camera, canvas.width, canvas.height, iso);
    windowController.update(camera);

    // Isometry overlay: a flat ground diamond + a vertical ruler behind each
    // building so you can read base-square → narrowing-upward.
    if (toggles.isometry) {
      for (const it of layout.items) {
        const b = it.building;
        const d = iso.isoFootprintDiamondBox(b.x, b.y, b.w, b.h, 0);
        renderer.push(quadToSprite(
          { x: d.x, y: d.y, width: d.width, height: d.height, tintRgba: packTint(EDG.slate, 0x66), frame: "fx/diamond" },
          LAYER_ISO_OVERLAY,
        ));
        // Vertical ruler up the near corner (a thin 1px column the full sprite height).
        const box = iso.isoFootprintBox(b.x, b.y, b.w, b.h, showcaseHeightTiles(b.type));
        renderer.push(quadToSprite(
          { x: box.x + box.width / 2, y: box.y, width: 1, height: box.height, tintRgba: packTint(EDG.yellow, 0x99) },
          LAYER_ISO_OVERLAY,
        ));
      }
    }

    pushScene(renderer, iso, { buildings, villagers, raiders: noRaiders }, undefined, nowMs, nightFactor);

    // Fire: soot overlay + flame billboards + embers/glow when burning (mirrors main.ts).
    if (toggles.burning) {
      pushWearOverlay(renderer, buildings, 4000); // full-ramp soot (composes under the flame)
      pushFire(renderer, iso, buildings, nowMs, nightFactor);
    }
    // Warm light pools at dusk/night.
    pushLightPool(renderer, iso, lightPoolQuads(emittersOf(buildings), nightFactor));

    const wash = computeWash("summer", dayFraction);
    renderer.setCloudOptions?.(cloudOptionsFor("summer", 1, dayFraction, nowMs / 1000));
    renderer.endFrame(wash, undefined, undefined);

    raf = requestAnimationFrame(frame);
  };
  raf = requestAnimationFrame(frame);

  return {
    toggles,
    stop: () => { stopped = true; cancelAnimationFrame(raf); },
  };
}
