import { describe, it, expect } from 'vitest';
import {
  regionAt, isWalkable, REGIONS, EXTRA_FARM_COUNT, nearestResourceZone, getRegion,
  WORLD_WIDTH, WORLD_HEIGHT,
} from './regions';

// RADIAL archipelago layout (160×160): every zone is an isolated island,
// connected only by 2-wide bridges. A central cluster of functional/decorative
// islands (village dead-center) is ringed by two concentric rings of the 21
// farms. See regions.ts for the full bounds table. These tests assert the
// PROPERTY (each region's own center resolves to it; corners are inside; ocean
// gaps are ocean) by deriving coordinates from the region defs, so they survive
// future layout tweaks rather than re-pinning literals each time.

/** A tile clearly inside a region (its center). */
const centerOf = (id: string) => getRegion(id as never).center;
/** Each corner tile of a region's bounds. */
const cornersOf = (id: string) => {
  const { minX, minY, maxX, maxY } = getRegion(id as never).bounds;
  return [
    { x: minX, y: minY }, { x: maxX, y: minY },
    { x: minX, y: maxY }, { x: maxX, y: maxY },
  ];
};

describe('regionAt', () => {
  it('resolves every region center and every corner to that region', () => {
    for (const region of REGIONS) {
      const c = region.center;
      expect(regionAt(c.x, c.y), `${region.id} center`).toBe(region.id);
      for (const corner of cornersOf(region.id)) {
        expect(regionAt(corner.x, corner.y), `${region.id} corner`).toBe(region.id);
      }
    }
  });

  it('places the village dead-center and the named farms on the inner ring', () => {
    expect(regionAt(centerOf('village').x, centerOf('village').y)).toBe('village');
    // The five named farms are real regions away from the center.
    for (const id of ['farm-cora', 'farm-atticus', 'farm-hannah', 'farm-otto', 'farm-pip'] as const) {
      const c = centerOf(id);
      expect(regionAt(c.x, c.y)).toBe(id);
    }
  });

  it('returns null for open-ocean tiles between islands', () => {
    expect(regionAt(0, 0)).toBeNull();       // top-left corner ocean
    expect(regionAt(WORLD_WIDTH - 1, WORLD_HEIGHT - 1)).toBeNull(); // bottom-right corner ocean
    expect(regionAt(80, 70)).toBeNull();     // open water just north of the village
    expect(regionAt(40, 40)).toBeNull();     // open water between the cluster and the SW farms
  });

  it('returns the blacksmith / shrine / landmark islets at their centers (walkable)', () => {
    for (const id of ['blacksmith', 'shrine', 'waterfall', 'camp', 'heritage-stones', 'heritage-ruin', 'heritage-statue'] as const) {
      const c = centerOf(id);
      expect(regionAt(c.x, c.y)).toBe(id);
      expect(isWalkable(c.x, c.y)).toBe(true);
    }
  });
});

describe('isWalkable', () => {
  it('is walkable for tiles inside regions', () => {
    for (const id of ['village', 'farm-cora', 'farm-atticus', 'farm-pip', 'farm-hannah', 'farm-otto'] as const) {
      const c = centerOf(id);
      expect(isWalkable(c.x, c.y), id).toBe(true);
    }
  });

  it('is walkable for bridge (road) tiles', () => {
    // The village hub spokes are road-only tiles (regionAt null, walkable). Pick
    // tiles on the village↔carpentry ({69-74,76-77}) and village↔mill
    // ({76-77,87-92}) bridges (see ROADS).
    expect(regionAt(70, 76)).toBeNull();
    expect(isWalkable(70, 76)).toBe(true);  // village ↔ carpentry bridge
    expect(regionAt(77, 90)).toBeNull();
    expect(isWalkable(77, 90)).toBe(true);  // village ↔ mill bridge
  });

  it('is NOT walkable for open-ocean tiles', () => {
    expect(isWalkable(0, 0)).toBe(false);   // corner ocean
    expect(isWalkable(80, 70)).toBe(false); // open water north of village
    expect(isWalkable(40, 40)).toBe(false); // open water SW of cluster
  });

  it('is walkable for blacksmith island tiles', () => {
    const c = centerOf('blacksmith');
    expect(isWalkable(c.x, c.y)).toBe(true);
  });

  it('isWalkable matches regionAt !== null for region tiles', () => {
    // For tiles in regions: isWalkable should be true and regionAt should be non-null
    for (const region of REGIONS) {
      const { minX, minY, maxX, maxY } = region.bounds;
      const midX = Math.floor((minX + maxX) / 2);
      const midY = Math.floor((minY + maxY) / 2);
      expect(isWalkable(midX, midY)).toBe(regionAt(midX, midY) !== null);
    }
  });
});

describe('procedural farm band', () => {
  it('spawns exactly EXTRA_FARM_COUNT farm-N regions in addition to the 5 fixed farms', () => {
    const extra = REGIONS.filter((r) => /^farm-\d+$/.test(r.id));
    expect(extra).toHaveLength(EXTRA_FARM_COUNT);
    const fixedFarms = REGIONS.filter((r) => r.kind === 'farm' && !/^farm-\d+$/.test(r.id));
    expect(fixedFarms).toHaveLength(5); // Cora/Atticus/Hannah/Otto/Pip
  });

  it('every procedural farm center resolves to its own region id and is walkable', () => {
    for (let i = 0; i < EXTRA_FARM_COUNT; i++) {
      const id = `farm-${i}` as const;
      const { center } = getRegion(id);
      expect(regionAt(center.x, center.y)).toBe(id);
      expect(isWalkable(center.x, center.y)).toBe(true);
    }
  });

  it('every band farm body stays within world bounds', () => {
    for (let i = 0; i < EXTRA_FARM_COUNT; i++) {
      const { bounds } = getRegion(`farm-${i}` as const);
      expect(bounds.minX, `farm-${i} minX`).toBeGreaterThanOrEqual(0);
      expect(bounds.minY, `farm-${i} minY`).toBeGreaterThanOrEqual(0);
      expect(bounds.maxX, `farm-${i} maxX`).toBeLessThan(WORLD_WIDTH);
      expect(bounds.maxY, `farm-${i} maxY`).toBeLessThan(WORLD_HEIGHT);
    }
  });

  it('every band farm routes to a resource zone for both tree and stone', () => {
    for (let i = 0; i < EXTRA_FARM_COUNT; i++) {
      const { center } = getRegion(`farm-${i}` as const);
      expect(['forest-north', 'forest-south']).toContain(nearestResourceZone(center, 'tree'));
      expect(['quarry-north', 'quarry-south']).toContain(nearestResourceZone(center, 'stone'));
    }
  });

  it('every procedural farm sits on one of the two radial ring radii (jitter ≤1)', () => {
    // The band is now RADIAL: farm-0..3 on the inner ring (R=52), farm-4..15 on
    // the outer ring (R=72), each nudged by a fixed-seed ±1 organic jitter. We
    // assert the PROPERTY that every procedural farm center lies on one of the
    // two ring radii within the jitter tolerance — rather than locking 16
    // coordinate pairs. Deterministic by design (fixed WORLD_GEN_SEED).
    const CX = 80;
    const CY = 80;
    // A 10×10 farm center is ~4.5–5 tiles off its bounds origin; the jitter is
    // ±1; so allow a generous radial tolerance of 3 tiles around each radius.
    const TOL = 3;
    let offRing = 0;
    for (let i = 0; i < EXTRA_FARM_COUNT; i++) {
      const { center } = getRegion(`farm-${i}` as const);
      const r = Math.hypot(center.x - CX, center.y - CY);
      const onInner = Math.abs(r - 52) <= TOL;
      const onOuter = Math.abs(r - 72) <= TOL;
      expect(onInner || onOuter, `farm-${i} radius ${r.toFixed(1)} on a ring`).toBe(true);
      // farm-0..3 are inner, farm-4..15 outer.
      if (i < 4) expect(onInner, `farm-${i} on inner ring`).toBe(true);
      else expect(onOuter, `farm-${i} on outer ring`).toBe(true);
      // jitter actually moved at least some bodies (not a perfect wheel).
      const a = (i < 4 ? 52 : 72);
      if (Math.abs(r - a) > 0.6) offRing++;
    }
    expect(offRing).toBeGreaterThan(0);
  });
});

describe('nearestResourceZone', () => {
  it('routes northern (Cora/Atticus) farms to the north zones', () => {
    // Resource zones sit symmetrically about y=80: forest/quarry-north at y64,
    // -south at y96. Cora (inner slot 8, NW) and Atticus (inner slot 2, NE) are
    // above center → north.
    const cora = getRegion('farm-cora').center;
    expect(nearestResourceZone(cora, 'tree')).toBe('forest-north');
    expect(nearestResourceZone(cora, 'stone')).toBe('quarry-north');
    const atticus = getRegion('farm-atticus').center;
    expect(nearestResourceZone(atticus, 'tree')).toBe('forest-north');
  });

  it('routes southern farms to the south zones', () => {
    // Otto (inner slot 6, SW) and Hannah (inner slot 4, S) are below center.
    const otto = getRegion('farm-otto').center;
    expect(nearestResourceZone(otto, 'tree')).toBe('forest-south');
    expect(nearestResourceZone(otto, 'stone')).toBe('quarry-south');
    // An outer-ring southern farm (farm-9, center ~(98,149)) → south.
    const south = getRegion('farm-9').center;
    expect(nearestResourceZone(south, 'tree')).toBe('forest-south');
    expect(nearestResourceZone(south, 'stone')).toBe('quarry-south');
  });
});
