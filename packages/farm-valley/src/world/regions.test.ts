import { describe, it, expect } from 'vitest';
import { regionAt, isWalkable, REGIONS } from './regions';

describe('regionAt', () => {
  it('returns "village" for a tile inside the village bounds', () => {
    expect(regionAt(20, 20)).toBe('village');
    expect(regionAt(14, 14)).toBe('village');
    expect(regionAt(25, 25)).toBe('village');
  });

  it('returns "farm-cora" for tiles inside Cora\'s farm (North)', () => {
    expect(regionAt(14, 0)).toBe('farm-cora');
    expect(regionAt(19, 6)).toBe('farm-cora');
    expect(regionAt(25, 11)).toBe('farm-cora');
  });

  it('returns "farm-atticus" for tiles inside Atticus\'s farm (far East, shifted +12)', () => {
    expect(regionAt(40, 14)).toBe('farm-atticus');
    expect(regionAt(45, 20)).toBe('farm-atticus');
    expect(regionAt(51, 25)).toBe('farm-atticus');
  });

  it('returns "farm-pip" for tiles inside Pip\'s farm (East-center)', () => {
    expect(regionAt(28, 14)).toBe('farm-pip');
    expect(regionAt(33, 20)).toBe('farm-pip');
    expect(regionAt(39, 25)).toBe('farm-pip');
  });

  it('returns "farm-hannah" for tiles inside Hannah\'s farm (South)', () => {
    expect(regionAt(14, 28)).toBe('farm-hannah');
    expect(regionAt(19, 33)).toBe('farm-hannah');
    expect(regionAt(25, 39)).toBe('farm-hannah');
  });

  it('returns "farm-otto" for tiles inside Otto\'s farm (West)', () => {
    expect(regionAt(0, 14)).toBe('farm-otto');
    expect(regionAt(5, 20)).toBe('farm-otto');
    expect(regionAt(11, 25)).toBe('farm-otto');
  });

  it('returns null for void tiles', () => {
    // NW gap is now partly the ice-pond region (10-13, 0-3); use the west-edge
    // void below carpentry instead.
    expect(regionAt(0, 12)).toBeNull();   // W gap: below carpentry (y≤9), above Otto (y≥14)
    expect(regionAt(0, 13)).toBeNull();   // same gap, adjacent tile
    expect(regionAt(46,  3)).toBeNull();  // 1-tile gap between forest-north (38-45) and quarry-north (47-51)
    expect(regionAt(12, 26)).toBeNull();  // SW gap: east of forest-south (0-7), west of S road (18-21)
    expect(regionAt(13, 12)).toBeNull();  // south of Cora, outside road x-range
    expect(regionAt(26, 14)).toBeNull();  // between village and Pip, outside east-road y-range (18-21)
  });

  it('returns "blacksmith" for tiles inside the blacksmith region (shifted +12)', () => {
    expect(regionAt(42, 30)).toBe('blacksmith');
    expect(regionAt(45, 32)).toBe('blacksmith'); // NPC tile
    expect(regionAt(51, 39)).toBe('blacksmith');
  });

  it('returns null for road tiles (roads are walkable but not a named region)', () => {
    // North road: x ∈ [18..21], y ∈ [12..13]
    expect(regionAt(19, 12)).toBeNull();
    // East road: x ∈ [26..27], y ∈ [18..21]
    expect(regionAt(26, 19)).toBeNull();
    // South road: x ∈ [18..21], y ∈ [26..27]
    expect(regionAt(20, 26)).toBeNull();
    // West road: x ∈ [12..13], y ∈ [18..21]
    expect(regionAt(12, 20)).toBeNull();
  });
});

describe('isWalkable', () => {
  it('is walkable for tiles inside regions', () => {
    expect(isWalkable(20, 20)).toBe(true);  // village
    expect(isWalkable(19, 6)).toBe(true);   // farm-cora
    expect(isWalkable(45, 20)).toBe(true);  // farm-atticus (far east)
    expect(isWalkable(33, 20)).toBe(true);  // farm-pip (east-center)
    expect(isWalkable(19, 33)).toBe(true);  // farm-hannah
    expect(isWalkable(5, 20)).toBe(true);   // farm-otto
  });

  it('is walkable for road tiles', () => {
    expect(isWalkable(19, 12)).toBe(true);  // North road
    expect(isWalkable(26, 19)).toBe(true);  // East road
    expect(isWalkable(20, 26)).toBe(true);  // South road
    expect(isWalkable(12, 20)).toBe(true);  // West road
  });

  it('is NOT walkable for void tiles', () => {
    // (12,0) is now the ice-pond region; use the west-edge void instead.
    expect(isWalkable(0, 12)).toBe(false);  // W gap below carpentry, above Otto
    expect(isWalkable(46,  3)).toBe(false); // gap between forest-north (38-45) and quarry-north (47-51)
    expect(isWalkable(12, 26)).toBe(false); // SW gap east of forest-south
    expect(isWalkable(13,  6)).toBe(false); // NW gap: west of Cora (col 14), south of carpentry (row 9)
  });

  it('is walkable for blacksmith region tiles', () => {
    expect(isWalkable(45, 32)).toBe(true);  // blacksmith NPC tile (shifted +12)
    expect(isWalkable(51, 39)).toBe(true);  // blacksmith corner
  });

  it('is walkable for L-bridge road tiles', () => {
    expect(isWalkable(39, 25)).toBe(true);  // vertical leg
    expect(isWalkable(39, 29)).toBe(true);  // vertical leg bottom / horizontal leg overlap
    expect(isWalkable(40, 28)).toBe(true);  // horizontal leg
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
