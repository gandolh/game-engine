/**
 * Tests for the in-canvas occupancy badge layer (occupancy-badges.ts).
 *
 * Asserts the retained `@engine/ui` widget-tree lifecycle: correct number of
 * chips built for occupied owned buildings, infrastructure + non-owner +
 * zero-occupancy exclusions, chip text matching occupancy counts, and the
 * pooling / hiding contract. No real surface needed — we assert the node tree
 * and the `activeChips` iterable directly (pure node assertions, no canvas).
 */
import { describe, it, expect, beforeEach } from "vitest";
import { EDG } from "@engine/core";
import { resetNodeIds } from "@engine/ui";
import type { BuildingSnapshot } from "@citadel/sim-core";
import { OccupancyBadgeLayer } from "./occupancy-badges";
import type { TileToCss } from "./occupancy-badges";

/** Trivial projector: maps tile (tx, ty) → { x: tx * 32, y: ty * 32 }. */
const proj: TileToCss = (tx, ty) => ({ x: tx * 32, y: ty * 32 });

/** Build a minimal BuildingSnapshot with sensible defaults. */
function makeBuilding(overrides: Partial<BuildingSnapshot> = {}): BuildingSnapshot {
  return {
    type: "house",
    x: 0,
    y: 0,
    w: 2,
    h: 2,
    connected: true,
    outputBuffer: 0,
    workerCount: 0,
    occupancy: 1,
    ownerId: 0,
    onFire: false,
    burning: false,
    level: 1,
    lacksFaith: true,
    lacksSafety: true,
    lacksGoods: true,
    mood: 40,
    ...overrides,
  };
}

describe("OccupancyBadgeLayer — in-canvas chip lifecycle", () => {
  beforeEach(() => {
    // Keep node IDs stable so snapshot assertions are predictable.
    resetNodeIds();
  });

  it("builds one chip per occupied owned non-infrastructure building", () => {
    const layer = new OccupancyBadgeLayer();
    const buildings = [
      makeBuilding({ occupancy: 3 }),
      makeBuilding({ x: 4, y: 0, occupancy: 2 }),
      makeBuilding({ x: 8, y: 0, occupancy: 1 }),
    ];
    layer.update(buildings, 0, proj);
    expect(layer.activeChips.length).toBe(3);
  });

  it("chip label text equals the building's occupancy count", () => {
    const layer = new OccupancyBadgeLayer();
    const buildings = [
      makeBuilding({ occupancy: 7 }),
      makeBuilding({ x: 4, occupancy: 12 }),
    ];
    layer.update(buildings, 0, proj);
    const chips = layer.activeChips;
    // Each chip.node is a panel with a single label child.
    const text0 = (chips[0]!.node.children[0] as { text: string }).text;
    const text1 = (chips[1]!.node.children[0] as { text: string }).text;
    expect(text0).toBe("7");
    expect(text1).toBe("12");
  });

  it("excludes buildings with occupancy <= 0", () => {
    const layer = new OccupancyBadgeLayer();
    const buildings = [
      makeBuilding({ occupancy: 0 }),
      makeBuilding({ x: 4, occupancy: -1 }),
      makeBuilding({ x: 8, occupancy: 2 }),
    ];
    layer.update(buildings, 0, proj);
    expect(layer.activeChips.length).toBe(1);
  });

  it("excludes buildings owned by a different player", () => {
    const layer = new OccupancyBadgeLayer();
    const buildings = [
      makeBuilding({ ownerId: 0, occupancy: 3 }),
      makeBuilding({ x: 4, ownerId: 1, occupancy: 5 }),
    ];
    layer.update(buildings, 0, proj); // localPlayer = 0
    expect(layer.activeChips.length).toBe(1);
    expect((layer.activeChips[0]!.node.children[0] as { text: string }).text).toBe("3");
  });

  it("excludes infrastructure types: road, wall, bridge, gate", () => {
    const layer = new OccupancyBadgeLayer();
    const infra = ["road", "wall", "bridge", "gate"].map((type, i) =>
      makeBuilding({ type, x: i * 4, occupancy: 3 }),
    );
    const nonInfra = makeBuilding({ x: 20, occupancy: 2 });
    layer.update([...infra, nonInfra], 0, proj);
    expect(layer.activeChips.length).toBe(1);
  });

  it("produces zero chips when all buildings are filtered out", () => {
    const layer = new OccupancyBadgeLayer();
    const buildings = [
      makeBuilding({ occupancy: 0 }),
      makeBuilding({ type: "road", occupancy: 3 }),
      makeBuilding({ ownerId: 99, occupancy: 5 }),
    ];
    layer.update(buildings, 0, proj);
    expect(layer.activeChips.length).toBe(0);
  });

  it("chip screen position derived from top-centre tile via tileToCss", () => {
    const layer = new OccupancyBadgeLayer();
    // Building at (2, 4), footprint 4×2 → cxTile = 2+4/2 = 4, topTile = 4
    // proj(4, 4) = { x: 128, y: 128 }
    const buildings = [makeBuilding({ x: 2, y: 4, w: 4, h: 2, occupancy: 1 })];
    layer.update(buildings, 0, proj);
    expect(layer.activeChips[0]!.x).toBe(128);
    expect(layer.activeChips[0]!.y).toBe(128);
  });

  it("reuses pooled nodes across frames (pool grows only when needed)", () => {
    const layer = new OccupancyBadgeLayer();
    const buildings = [makeBuilding({ occupancy: 1 }), makeBuilding({ x: 4, occupancy: 2 })];
    layer.update(buildings, 0, proj);
    const firstFrameNode = layer.activeChips[0]!.node;
    // Second frame with same buildings.
    layer.update(buildings, 0, proj);
    // Same object identity — pool was reused.
    expect(layer.activeChips[0]!.node).toBe(firstFrameNode);
  });

  it("unused pooled chips have opacity 0 after an update with fewer active chips", () => {
    const layer = new OccupancyBadgeLayer();
    const three = [
      makeBuilding({ occupancy: 1 }),
      makeBuilding({ x: 4, occupancy: 1 }),
      makeBuilding({ x: 8, occupancy: 1 }),
    ];
    layer.update(three, 0, proj);
    // Capture the third pooled node.
    const thirdNode = layer.activeChips[2]!.node;

    // Now update with only one active building.
    layer.update([makeBuilding({ occupancy: 1 })], 0, proj);
    expect(layer.activeChips.length).toBe(1);
    // Third node is still in the pool but should be hidden.
    expect(thirdNode.opacity).toBe(0);
  });

  it("clear hides all pooled chips and empties activeChips", () => {
    const layer = new OccupancyBadgeLayer();
    layer.update([makeBuilding({ occupancy: 3 })], 0, proj);
    const node = layer.activeChips[0]!.node;
    layer.clear();
    expect(layer.activeChips.length).toBe(0);
    expect(node.opacity).toBe(0);
  });

  it("chip label uses EDG.yellow colour", () => {
    const layer = new OccupancyBadgeLayer();
    layer.update([makeBuilding({ occupancy: 1 })], 0, proj);
    const lbl = layer.activeChips[0]!.node.children[0] as { color?: string };
    expect(lbl.color).toBe(EDG.yellow);
  });

  it("active chip nodes have opacity 1", () => {
    const layer = new OccupancyBadgeLayer();
    layer.update([makeBuilding({ occupancy: 2 })], 0, proj);
    expect(layer.activeChips[0]!.node.opacity).toBe(1);
  });
});
