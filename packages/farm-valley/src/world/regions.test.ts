import { describe, it, expect } from 'vitest';
import { regionAt, isWalkable, REGIONS } from './regions';

// Archipelago layout (88×80): every zone is an isolated island, connected only
// by 2-wide bridges. Pip top-center; the four AI farms in the corners; village
// central hub. See regions.ts for the full bounds table.

describe('regionAt', () => {
  it('returns "village" for a tile inside the village bounds (center hub)', () => {
    expect(regionAt(43, 39)).toBe('village');
    expect(regionAt(38, 34)).toBe('village');
    expect(regionAt(49, 45)).toBe('village');
  });

  it('returns "farm-cora" for tiles inside Cora\'s farm (NW corner)', () => {
    expect(regionAt(2, 2)).toBe('farm-cora');
    expect(regionAt(7, 7)).toBe('farm-cora');
    expect(regionAt(13, 13)).toBe('farm-cora');
  });

  it('returns "farm-atticus" for tiles inside Atticus\'s farm (NE corner)', () => {
    expect(regionAt(74, 2)).toBe('farm-atticus');
    expect(regionAt(79, 7)).toBe('farm-atticus');
    expect(regionAt(85, 13)).toBe('farm-atticus');
  });

  it('returns "farm-pip" for tiles inside Pip\'s farm (top-center)', () => {
    expect(regionAt(38, 2)).toBe('farm-pip');
    expect(regionAt(43, 7)).toBe('farm-pip');
    expect(regionAt(49, 13)).toBe('farm-pip');
  });

  it('returns "farm-hannah" for tiles inside Hannah\'s farm (SE corner)', () => {
    expect(regionAt(74, 54)).toBe('farm-hannah');
    expect(regionAt(79, 59)).toBe('farm-hannah');
    expect(regionAt(85, 65)).toBe('farm-hannah');
  });

  it('returns "farm-otto" for tiles inside Otto\'s farm (SW corner)', () => {
    expect(regionAt(2, 54)).toBe('farm-otto');
    expect(regionAt(7, 59)).toBe('farm-otto');
    expect(regionAt(13, 65)).toBe('farm-otto');
  });

  it('returns null for ocean tiles between islands', () => {
    expect(regionAt(0, 0)).toBeNull();    // top-left corner ocean
    expect(regionAt(18, 9)).toBeNull();   // water between Cora and forest-north (off bridge row)
    expect(regionAt(34, 36)).toBeNull();  // water between carpentry and village (off bridge row)
    expect(regionAt(50, 20)).toBeNull();  // open ocean east of the Pip bridge
    expect(regionAt(87, 79)).toBeNull();  // bottom-right corner ocean
  });

  it('returns "blacksmith" for tiles inside the blacksmith island (E of village)', () => {
    expect(regionAt(58, 34)).toBe('blacksmith');
    expect(regionAt(62, 38)).toBe('blacksmith'); // center
    expect(regionAt(67, 43)).toBe('blacksmith');
  });

  it('returns null for bridge (road) tiles — walkable but not a named region', () => {
    expect(regionAt(34, 38)).toBeNull(); // village ↔ carpentry bridge
    expect(regionAt(42, 20)).toBeNull(); // village ↔ Pip bridge
    expect(regionAt(54, 38)).toBeNull(); // village ↔ blacksmith bridge
    expect(regionAt(42, 50)).toBeNull(); // village ↔ mill bridge
  });
});

describe('isWalkable', () => {
  it('is walkable for tiles inside regions', () => {
    expect(isWalkable(43, 39)).toBe(true); // village
    expect(isWalkable(7, 7)).toBe(true);   // farm-cora (NW)
    expect(isWalkable(79, 7)).toBe(true);  // farm-atticus (NE)
    expect(isWalkable(43, 7)).toBe(true);  // farm-pip (top)
    expect(isWalkable(79, 59)).toBe(true); // farm-hannah (SE)
    expect(isWalkable(7, 59)).toBe(true);  // farm-otto (SW)
  });

  it('is walkable for bridge (road) tiles', () => {
    expect(isWalkable(34, 38)).toBe(true); // village ↔ carpentry
    expect(isWalkable(42, 20)).toBe(true); // village ↔ Pip
    expect(isWalkable(54, 38)).toBe(true); // village ↔ blacksmith
    expect(isWalkable(42, 50)).toBe(true); // village ↔ mill
  });

  it('is NOT walkable for ocean tiles', () => {
    expect(isWalkable(0, 0)).toBe(false);   // corner ocean
    expect(isWalkable(18, 9)).toBe(false);  // between Cora and forest-north (off-bridge row)
    expect(isWalkable(34, 36)).toBe(false); // between carpentry and village (off-bridge row)
    expect(isWalkable(50, 20)).toBe(false); // open ocean east of the Pip bridge
  });

  it('is walkable for blacksmith island tiles', () => {
    expect(isWalkable(62, 38)).toBe(true); // blacksmith center
    expect(isWalkable(67, 43)).toBe(true); // blacksmith corner
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
