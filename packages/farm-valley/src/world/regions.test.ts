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

  it('returns "farm-atticus" for tiles inside Atticus\'s farm (East)', () => {
    expect(regionAt(28, 14)).toBe('farm-atticus');
    expect(regionAt(33, 20)).toBe('farm-atticus');
    expect(regionAt(39, 25)).toBe('farm-atticus');
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
    // Top-left corner is void
    expect(regionAt(0, 0)).toBeNull();
    // Between north farm and village (row 12-13) but outside road x-range
    expect(regionAt(13, 12)).toBeNull();
    expect(regionAt(22, 12)).toBeNull();
    // Between east farm and village but outside road y-range
    expect(regionAt(26, 14)).toBeNull();
    // Bottom-right corner is void
    expect(regionAt(39, 39)).toBeNull();
    // Between farms that have no direct road
    expect(regionAt(27, 27)).toBeNull();
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
    expect(isWalkable(33, 20)).toBe(true);  // farm-atticus
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
    expect(isWalkable(0, 0)).toBe(false);
    expect(isWalkable(39, 39)).toBe(false);
    expect(isWalkable(13, 12)).toBe(false);
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
