import { describe, it, expect } from 'vitest';
import {
  regionAt, isWalkable, REGIONS, EXTRA_FARM_COUNT, nearestResourceZone, getRegion,
  WORLD_WIDTH, WORLD_HEIGHT,
} from './regions';

const centerOf = (id: string) => getRegion(id as never).center;

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

    for (const id of ['farm-cora', 'farm-atticus', 'farm-hannah', 'farm-otto', 'farm-pip'] as const) {
      const c = centerOf(id);
      expect(regionAt(c.x, c.y)).toBe(id);
    }
  });

  it('returns null for open-ocean tiles between islands', () => {
    expect(regionAt(0, 0)).toBeNull();       
    expect(regionAt(WORLD_WIDTH - 1, WORLD_HEIGHT - 1)).toBeNull(); 
    expect(regionAt(120, 105)).toBeNull();   
    expect(regionAt(60, 60)).toBeNull();     
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

    expect(regionAt(108, 116)).toBeNull();
    expect(isWalkable(108, 116)).toBe(true);  
    expect(regionAt(116, 132)).toBeNull();
    expect(isWalkable(116, 132)).toBe(true);  
  });

  it('is NOT walkable for open-ocean tiles', () => {
    expect(isWalkable(0, 0)).toBe(false);   
    expect(isWalkable(120, 105)).toBe(false); 
    expect(isWalkable(60, 60)).toBe(false); 
  });

  it('is walkable for blacksmith island tiles', () => {
    const c = centerOf('blacksmith');
    expect(isWalkable(c.x, c.y)).toBe(true);
  });

  it('isWalkable matches regionAt !== null for region tiles', () => {

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
    expect(fixedFarms).toHaveLength(5); 
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

    const CX = 120;
    const CY = 120;

    const TOL = 3;
    let offRing = 0;
    for (let i = 0; i < EXTRA_FARM_COUNT; i++) {
      const { center } = getRegion(`farm-${i}` as const);
      const r = Math.hypot(center.x - CX, center.y - CY);
      const onInner = Math.abs(r - 78) <= TOL;
      const onOuter = Math.abs(r - 108) <= TOL;
      expect(onInner || onOuter, `farm-${i} radius ${r.toFixed(1)} on a ring`).toBe(true);

      if (i < 4) expect(onInner, `farm-${i} on inner ring`).toBe(true);
      else expect(onOuter, `farm-${i} on outer ring`).toBe(true);

      const a = (i < 4 ? 78 : 108);
      if (Math.abs(r - a) > 0.6) offRing++;
    }
    expect(offRing).toBeGreaterThan(0);
  });
});

describe('nearestResourceZone', () => {
  it('routes northern (Cora/Atticus) farms to the north zones', () => {

    const cora = getRegion('farm-cora').center;
    expect(nearestResourceZone(cora, 'tree')).toBe('forest-north');
    expect(nearestResourceZone(cora, 'stone')).toBe('quarry-north');
    const atticus = getRegion('farm-atticus').center;
    expect(nearestResourceZone(atticus, 'tree')).toBe('forest-north');
  });

  it('routes southern farms to the south zones', () => {

    const otto = getRegion('farm-otto').center;
    expect(nearestResourceZone(otto, 'tree')).toBe('forest-south');
    expect(nearestResourceZone(otto, 'stone')).toBe('quarry-south');

    const south = getRegion('farm-9').center;
    expect(nearestResourceZone(south, 'tree')).toBe('forest-south');
    expect(nearestResourceZone(south, 'stone')).toBe('quarry-south');
  });
});
