import { describe, it, expect } from "vitest";
import { getRegion } from "@farm/sim-core/world/regions";
import {
  PIP_FARM_MARKER_ZOOM_THRESHOLD,
  shouldShowPipFarmMarker,
  pipFarmWorldAnchor,
} from "./pip-farm-marker";
import { TILE, DEFAULT_ZOOM } from "./config";
import { MIN_ZOOM, MAX_ZOOM } from "@engine/core";

describe("shouldShowPipFarmMarker", () => {
  it("is false at DEFAULT_ZOOM (the normal play view should stay uncluttered)", () => {
    expect(DEFAULT_ZOOM).toBeGreaterThan(PIP_FARM_MARKER_ZOOM_THRESHOLD);
    expect(shouldShowPipFarmMarker(DEFAULT_ZOOM)).toBe(false);
  });

  it("is true at MIN_ZOOM (full zoom-out)", () => {
    expect(shouldShowPipFarmMarker(MIN_ZOOM)).toBe(true);
  });

  it("is false at MAX_ZOOM (fully zoomed in)", () => {
    expect(shouldShowPipFarmMarker(MAX_ZOOM)).toBe(false);
  });

  it("is exactly true at the threshold and flips false just past it", () => {
    expect(shouldShowPipFarmMarker(PIP_FARM_MARKER_ZOOM_THRESHOLD)).toBe(true);
    expect(shouldShowPipFarmMarker(PIP_FARM_MARKER_ZOOM_THRESHOLD + 0.0001)).toBe(false);
  });

  it("is monotonic: shown for every zoom <= threshold, hidden for every zoom > threshold", () => {
    for (let z = MIN_ZOOM; z <= MAX_ZOOM; z += 0.1) {
      expect(shouldShowPipFarmMarker(z)).toBe(z <= PIP_FARM_MARKER_ZOOM_THRESHOLD);
    }
  });
});

describe("pipFarmWorldAnchor", () => {
  it("sits on the north edge of the farm-pip region, horizontally centred over its bounds", () => {
    const region = getRegion("farm-pip");
    const anchor = pipFarmWorldAnchor();

    expect(anchor.wy).toBe(region.bounds.minY * TILE);
    expect(anchor.wx).toBe(((region.bounds.minX + region.bounds.maxX + 1) / 2) * TILE);

    // Sanity: the anchor's x falls within the plot's horizontal span (not off to one side).
    expect(anchor.wx).toBeGreaterThanOrEqual(region.bounds.minX * TILE);
    expect(anchor.wx).toBeLessThanOrEqual(region.bounds.maxX * TILE + TILE);
  });

  it("region 'farm-pip' is a farm (sanity: the anchor tracks the right region kind)", () => {
    const region = getRegion("farm-pip");
    expect(region.kind).toBe("farm");
  });

  it("is stable across repeated calls (static region geometry, not live entity tracking)", () => {
    expect(pipFarmWorldAnchor()).toEqual(pipFarmWorldAnchor());
  });
});
