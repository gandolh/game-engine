import { describe, it, expect, afterEach } from "vitest";
import { componentOf, sameComponent, _resetComponentMap } from "./connectivity";
import { getRegion, REGIONS, SHRINE_REGION_ID } from "./regions";

// Reset the lazy singleton between tests so each test starts fresh.
afterEach(() => {
  _resetComponentMap();
});

describe("connectivity component map", () => {
  it("village center has a valid (non-sentinel) component", () => {
    const village = getRegion("village").center;
    expect(componentOf(village.x, village.y)).toBeGreaterThanOrEqual(0);
  });

  it("every region center shares one component with the village center", () => {
    const village = getRegion("village").center;
    const vc = componentOf(village.x, village.y);
    expect(vc).toBeGreaterThanOrEqual(0);

    for (const region of REGIONS) {
      const { x, y } = region.center;
      const rc = componentOf(x, y);
      // Every region center (including farms, shrine, heritage, weather-station, etc.)
      // must be on the main connected land mass.
      expect(rc, `region ${region.id} center (${x},${y}) disconnected from village`).toBe(vc);
    }
  });

  it("sameComponent is true for two village tiles", () => {
    const a = getRegion("village").center;
    const shrine = getRegion("shrine").center;
    expect(sameComponent(a.x, a.y, shrine.x, shrine.y)).toBe(true);
  });

  it("sameComponent is symmetric", () => {
    const v = getRegion("village").center;
    const s = getRegion("shrine").center;
    expect(sameComponent(v.x, v.y, s.x, s.y)).toBe(true);
    expect(sameComponent(s.x, s.y, v.x, v.y)).toBe(true);
  });

  it("a known ocean tile (0,0) returns -1", () => {
    expect(componentOf(0, 0)).toBe(-1);
  });

  it("an out-of-bounds tile returns -1", () => {
    expect(componentOf(-1, 0)).toBe(-1);
    expect(componentOf(0, -1)).toBe(-1);
    expect(componentOf(999, 0)).toBe(-1);
  });

  it("sameComponent returns false when either tile is ocean / non-walkable", () => {
    const village = getRegion("village").center;
    // (0,0) is ocean
    expect(sameComponent(0, 0, village.x, village.y)).toBe(false);
    expect(sameComponent(village.x, village.y, 0, 0)).toBe(false);
  });

  // TASK 2 — diagnosis of tile (29,69) against the current (radial) world.
  //
  // Brief-73 diagnosed (29,69) as a walkable pocket disconnected from the shrine
  // (2026-06-10, pre-implementation probe). The probe predates the radial reorg.
  //
  // After the radial reorg, (29,69) falls inside farm-3 (inner ring slot 7,
  // center ≈ (29,69), proc size 10×10 ± jitter). It is walkable AND on the same
  // land mass as the village and shrine — connected via the farm-3 bridge spoke.
  //
  // OUTCOME: CASE 3 — (29,69) is walkable and already same-component as the shrine.
  // The brief-73 finding is STALE (it referred to the old non-radial world layout).
  // No world-data fix required. The reachability guard (task 3) still protects
  // against the aboard/boat case and any future isolated pocket.
  it("tile (29,69) is walkable and same-component as shrine in current radial world (stale brief-73 finding)", () => {
    // farm-3 (inner ring slot 7) contains this tile after the radial reorg.
    // This pin ensures a future world change that disconnects (29,69) from the
    // main land mass will be caught immediately.
    const comp = componentOf(29, 69);
    expect(comp).toBeGreaterThanOrEqual(0); // walkable
    const shrine = getRegion(SHRINE_REGION_ID).center;
    expect(sameComponent(29, 69, shrine.x, shrine.y)).toBe(true); // same land mass
  });

  it("shrine center is reachable from village (same component, never disconnected)", () => {
    const shrine = getRegion(SHRINE_REGION_ID).center;
    const village = getRegion("village").center;
    expect(sameComponent(shrine.x, shrine.y, village.x, village.y)).toBe(true);
  });
});
