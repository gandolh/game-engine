/**
 * Tests for the road-feedback helpers — which buildings warrant a "no road"
 * marker. Pure logic (reads getProductionDef + the snapshot `connected` flag),
 * so these run headlessly.
 */
import { describe, it, expect } from "vitest";
import { needsRoadConnection, disconnectedBuildings } from "./road-feedback";
import type { BuildingSnapshot } from "@citadel/sim-core";

/** Minimal building snapshot with sensible defaults; override per test. */
function bld(partial: Partial<BuildingSnapshot> & { type: string }): BuildingSnapshot {
  return {
    type: partial.type,
    x: partial.x ?? 0,
    y: partial.y ?? 0,
    w: partial.w ?? 2,
    h: partial.h ?? 2,
    connected: partial.connected ?? false,
    outputBuffer: 0,
    workerCount: 0,
    occupancy: partial.occupancy ?? 0,
    ownerId: 0,
    onFire: false,
    burning: false,
    level: 1,
    lacksFaith: true,
    lacksSafety: true,
    lacksGoods: true,
    mood: 40,
  };
}

describe("needsRoadConnection", () => {
  it("production buildings need a road", () => {
    expect(needsRoadConnection("farm")).toBe(true);
    expect(needsRoadConnection("mill")).toBe(true);
    expect(needsRoadConnection("bakery")).toBe(true);
  });

  it("housing and storage need a road", () => {
    expect(needsRoadConnection("house")).toBe(true);
    expect(needsRoadConnection("storehouse")).toBe(true);
  });

  it("infrastructure (road/wall/gate/bridge) never needs a road", () => {
    expect(needsRoadConnection("road")).toBe(false);
    expect(needsRoadConnection("wall")).toBe(false);
    expect(needsRoadConnection("gate")).toBe(false);
    expect(needsRoadConnection("bridge")).toBe(false);
  });

  it("an unknown type is not marked (no production def → no expectation)", () => {
    expect(needsRoadConnection("not-a-building")).toBe(false);
  });
});

describe("disconnectedBuildings", () => {
  it("returns only connectable buildings that are disconnected", () => {
    const buildings: BuildingSnapshot[] = [
      bld({ type: "farm", connected: false }),       // mark
      bld({ type: "farm", connected: true }),        // connected → skip
      bld({ type: "house", connected: false }),      // mark
      bld({ type: "road", connected: false }),       // infra → skip
      bld({ type: "wall", connected: false }),       // infra → skip
      bld({ type: "storehouse", connected: true }),  // connected → skip
    ];
    const out = disconnectedBuildings(buildings);
    expect(out.map((b) => b.type).sort()).toEqual(["farm", "house"]);
  });

  it("is empty when everything is connected", () => {
    const buildings: BuildingSnapshot[] = [
      bld({ type: "farm", connected: true }),
      bld({ type: "house", connected: true }),
    ];
    expect(disconnectedBuildings(buildings)).toHaveLength(0);
  });

  it("is empty for an all-infrastructure snapshot regardless of connected flag", () => {
    const buildings: BuildingSnapshot[] = [
      bld({ type: "road", connected: false }),
      bld({ type: "gate", connected: false }),
    ];
    expect(disconnectedBuildings(buildings)).toHaveLength(0);
  });
});
