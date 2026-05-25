import { describe, expect, it } from "vitest";
import type { GpuContext } from "./device";
import type { LoadedAtlas } from "../assets";
import { Camera2D } from "./camera";
import {
  Tilemap,
  aabbIntersects,
  computeCameraAabb,
  computeChunkAabb,
  isChunkVisible,
} from "./tilemap";

// ---------------------------------------------------------------------------
// Test doubles: just enough surface for tile-data APIs. We never call draw(),
// so we never need any real GPUDevice / GPUQueue method to execute.
// ---------------------------------------------------------------------------

function makeStubGpu(): GpuContext {
  // The data-mutation paths (setTile/getTile/fill, dirty tracking, culling
  // predicates) do not touch the device at all. Cast a minimal stub.
  const stub = {
    device: {} as GPUDevice,
    canvas: {} as HTMLCanvasElement,
    context: {} as GPUCanvasContext,
    format: "rgba8unorm" as GPUTextureFormat,
  };
  return stub as GpuContext;
}

function makeStubAtlas(frames: Record<string, { u: number; v: number; w: number; h: number }>): LoadedAtlas {
  return {
    manifest: {
      id: "test-atlas",
      imageUrl: "",
      width: 256,
      height: 256,
      frames: {},
    },
    texture: {} as GPUTexture,
    view: {} as GPUTextureView,
    frameUv(name: string) {
      const rect = frames[name];
      if (!rect) throw new Error(`stub atlas: unknown frame ${name}`);
      return rect;
    },
  } as unknown as LoadedAtlas;
}

const defaultFrames = {
  grass: { u: 0.0, v: 0.0, w: 0.25, h: 0.25 },
  dirt: { u: 0.25, v: 0.0, w: 0.25, h: 0.25 },
  stone: { u: 0.5, v: 0.0, w: 0.25, h: 0.25 },
};

function makeTilemap(opts?: { chunkSize?: number; tileSizePx?: number; layers?: number }) {
  return new Tilemap({
    gpu: makeStubGpu(),
    atlas: makeStubAtlas(defaultFrames),
    chunkSize: opts?.chunkSize ?? 4,
    tileSizePx: opts?.tileSizePx ?? 16,
    layers: opts?.layers ?? 1,
  });
}

// ---------------------------------------------------------------------------
// Pure helpers
// ---------------------------------------------------------------------------

describe("tilemap pure helpers", () => {
  it("computeChunkAabb returns a chunkSize*tileSizePx square at chunk origin", () => {
    expect(computeChunkAabb(0, 0, 4, 16)).toEqual({
      minX: 0,
      minY: 0,
      maxX: 64,
      maxY: 64,
    });
    expect(computeChunkAabb(2, -1, 4, 16)).toEqual({
      minX: 128,
      minY: -64,
      maxX: 192,
      maxY: 0,
    });
  });

  it("computeCameraAabb expands worldUnits around centre", () => {
    const cam = new Camera2D({ worldUnitsX: 100, worldUnitsY: 60, centerX: 50, centerY: 30 });
    expect(computeCameraAabb(cam)).toEqual({
      minX: 0,
      minY: 0,
      maxX: 100,
      maxY: 60,
    });
  });

  it("aabbIntersects detects overlap and treats edge-touching as non-overlap", () => {
    const a = { minX: 0, minY: 0, maxX: 10, maxY: 10 };
    expect(aabbIntersects(a, { minX: 5, minY: 5, maxX: 15, maxY: 15 })).toBe(true);
    expect(aabbIntersects(a, { minX: 10, minY: 0, maxX: 20, maxY: 10 })).toBe(false);
    expect(aabbIntersects(a, { minX: -20, minY: -20, maxX: -10, maxY: -10 })).toBe(false);
    // Fully contained either way.
    expect(aabbIntersects(a, { minX: 2, minY: 2, maxX: 4, maxY: 4 })).toBe(true);
    expect(aabbIntersects({ minX: 2, minY: 2, maxX: 4, maxY: 4 }, a)).toBe(true);
  });

  it("isChunkVisible composes computeChunkAabb + aabbIntersects", () => {
    const cam = computeCameraAabb(
      new Camera2D({ worldUnitsX: 64, worldUnitsY: 64, centerX: 32, centerY: 32 }),
    );
    // Chunk (0,0) covers [0,0]-[64,64] with chunkSize=4, tileSizePx=16.
    expect(isChunkVisible(0, 0, 4, 16, cam)).toBe(true);
    // Chunk (1,0) covers [64,0]-[128,64] -> edge-touches the camera, not visible.
    expect(isChunkVisible(1, 0, 4, 16, cam)).toBe(false);
    // Chunk (-1,-1) covers [-64,-64]-[0,0] -> edge-touches origin, not visible.
    expect(isChunkVisible(-1, -1, 4, 16, cam)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// setTile / getTile / dirty tracking
// ---------------------------------------------------------------------------

describe("Tilemap.setTile + dirty tracking", () => {
  it("setTile marks exactly one chunk dirty and is readable via getTile", () => {
    const map = makeTilemap({ chunkSize: 4, tileSizePx: 16, layers: 2 });
    expect(map.getDirtyChunks(0)).toEqual([]);
    map.setTile(0, 1, 2, "grass");
    expect(map.getTile(0, 1, 2)).toBe("grass");
    expect(map.getTile(0, 0, 0)).toBe(null);
    expect(map.getDirtyChunks(0)).toEqual(["0,0"]);
    // Other layers untouched.
    expect(map.getDirtyChunks(1)).toEqual([]);
  });

  it("setTile on the same chunk does not produce duplicate dirty entries", () => {
    const map = makeTilemap({ chunkSize: 4 });
    map.setTile(0, 0, 0, "grass");
    map.setTile(0, 1, 0, "dirt");
    map.setTile(0, 2, 3, "stone");
    expect(map.getDirtyChunks(0)).toEqual(["0,0"]);
  });

  it("setTile across chunks marks every touched chunk and only those chunks", () => {
    const map = makeTilemap({ chunkSize: 4 });
    map.setTile(0, 0, 0, "grass"); // chunk (0,0)
    map.setTile(0, 5, 1, "dirt"); // chunk (1,0)
    map.setTile(0, 0, 7, "stone"); // chunk (0,1)
    const dirty = new Set(map.getDirtyChunks(0));
    expect(dirty).toEqual(new Set(["0,0", "1,0", "0,1"]));
  });

  it("setTile with the same id does not re-mark dirty", () => {
    const map = makeTilemap({ chunkSize: 4 });
    map.setTile(0, 0, 0, "grass");
    // Simulate the renderer clearing the dirty flag.
    clearDirty(map, 0);
    expect(map.getDirtyChunks(0)).toEqual([]);
    map.setTile(0, 0, 0, "grass");
    expect(map.getDirtyChunks(0)).toEqual([]);
  });

  it("setTile clearing to null leaves the chunk allocated but marked dirty", () => {
    const map = makeTilemap({ chunkSize: 4 });
    map.setTile(0, 0, 0, "grass");
    clearDirty(map, 0);
    map.setTile(0, 0, 0, null);
    expect(map.getTile(0, 0, 0)).toBe(null);
    expect(map.getDirtyChunks(0)).toEqual(["0,0"]);
  });

  it("supports negative tile coordinates", () => {
    const map = makeTilemap({ chunkSize: 4 });
    map.setTile(0, -1, -1, "grass");
    expect(map.getTile(0, -1, -1)).toBe("grass");
    expect(map.getDirtyChunks(0)).toEqual(["-1,-1"]);
  });
});

// ---------------------------------------------------------------------------
// fill
// ---------------------------------------------------------------------------

describe("Tilemap.fill", () => {
  it("marks every covered chunk dirty exactly once", () => {
    const map = makeTilemap({ chunkSize: 4 });
    // Rect [0,0] - [7,5] spans chunks (0,0), (1,0), (0,1), (1,1).
    map.fill(0, 0, 0, 7, 5, "grass");
    const dirty = new Set(map.getDirtyChunks(0));
    expect(dirty).toEqual(new Set(["0,0", "1,0", "0,1", "1,1"]));
  });

  it("fills only the rectangle interior, leaving outside tiles empty", () => {
    const map = makeTilemap({ chunkSize: 4 });
    map.fill(0, 1, 1, 2, 2, "dirt");
    expect(map.getTile(0, 1, 1)).toBe("dirt");
    expect(map.getTile(0, 2, 2)).toBe("dirt");
    expect(map.getTile(0, 0, 0)).toBe(null);
    expect(map.getTile(0, 3, 3)).toBe(null);
  });

  it("fill across many chunks marks every one (8x8 chunk grid)", () => {
    const map = makeTilemap({ chunkSize: 4 });
    // 32x32 region covers chunks (0..7) x (0..7) = 64 chunks.
    map.fill(0, 0, 0, 31, 31, "grass");
    expect(map.getDirtyChunks(0).length).toBe(64);
    expect(map.getAllocatedChunks(0).length).toBe(64);
  });

  it("idempotent fill does not re-mark chunks dirty", () => {
    const map = makeTilemap({ chunkSize: 4 });
    map.fill(0, 0, 0, 3, 3, "grass");
    clearDirty(map, 0);
    map.fill(0, 0, 0, 3, 3, "grass");
    expect(map.getDirtyChunks(0)).toEqual([]);
  });

  it("fill with swapped coordinates still works", () => {
    const map = makeTilemap({ chunkSize: 4 });
    map.fill(0, 7, 5, 0, 0, "stone");
    expect(map.getTile(0, 0, 0)).toBe("stone");
    expect(map.getTile(0, 7, 5)).toBe("stone");
  });
});

// ---------------------------------------------------------------------------
// Culling via visibleChunks
// ---------------------------------------------------------------------------

describe("Tilemap.visibleChunks", () => {
  it("returns only chunks intersecting the camera AABB", () => {
    const map = makeTilemap({ chunkSize: 4, tileSizePx: 16 }); // chunk = 64 world units
    // Allocate chunks (0,0), (1,0), (2,0), (5,5).
    map.setTile(0, 0, 0, "grass"); // chunk (0,0) covers [0,0]-[64,64]
    map.setTile(0, 4, 0, "grass"); // chunk (1,0) covers [64,0]-[128,64]
    map.setTile(0, 8, 0, "grass"); // chunk (2,0) covers [128,0]-[192,64]
    map.setTile(0, 20, 20, "grass"); // chunk (5,5) covers [320,320]-[384,384]

    // Camera covering [0,0]-[128,64] (worldUnits 128x64, center 64,32).
    const cam = new Camera2D({
      worldUnitsX: 128,
      worldUnitsY: 64,
      centerX: 64,
      centerY: 32,
    });
    const visible = new Set(map.visibleChunks(0, cam));
    expect(visible).toEqual(new Set(["0,0", "1,0"]));
    expect(visible.has("2,0")).toBe(false);
    expect(visible.has("5,5")).toBe(false);
  });

  it("returns all chunks when camera contains everything", () => {
    const map = makeTilemap({ chunkSize: 4, tileSizePx: 16 });
    map.setTile(0, 0, 0, "grass");
    map.setTile(0, 5, 5, "dirt");
    const cam = new Camera2D({
      worldUnitsX: 10_000,
      worldUnitsY: 10_000,
      centerX: 0,
      centerY: 0,
    });
    expect(map.visibleChunks(0, cam).length).toBe(map.getAllocatedChunks(0).length);
  });

  it("returns empty list when camera is far outside any allocated chunk", () => {
    const map = makeTilemap({ chunkSize: 4, tileSizePx: 16 });
    map.setTile(0, 0, 0, "grass");
    const cam = new Camera2D({
      worldUnitsX: 32,
      worldUnitsY: 32,
      centerX: 10_000,
      centerY: 10_000,
    });
    expect(map.visibleChunks(0, cam)).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// Errors
// ---------------------------------------------------------------------------

describe("Tilemap validation", () => {
  it("rejects invalid constructor args", () => {
    expect(() =>
      new Tilemap({
        gpu: makeStubGpu(),
        atlas: makeStubAtlas(defaultFrames),
        chunkSize: 0,
        tileSizePx: 16,
        layers: 1,
      })
    ).toThrow();
    expect(() =>
      new Tilemap({
        gpu: makeStubGpu(),
        atlas: makeStubAtlas(defaultFrames),
        chunkSize: 4,
        tileSizePx: 0,
        layers: 1,
      })
    ).toThrow();
    expect(() =>
      new Tilemap({
        gpu: makeStubGpu(),
        atlas: makeStubAtlas(defaultFrames),
        chunkSize: 4,
        tileSizePx: 16,
        layers: 0,
      })
    ).toThrow();
  });

  it("setTile rejects out-of-range layer", () => {
    const map = makeTilemap({ layers: 1 });
    expect(() => map.setTile(1, 0, 0, "grass")).toThrow();
    expect(() => map.setTile(-1, 0, 0, "grass")).toThrow();
  });

  it("setTile with unknown frame name throws via the atlas", () => {
    const map = makeTilemap();
    expect(() => map.setTile(0, 0, 0, "no-such-frame")).toThrow();
  });
});

// ---------------------------------------------------------------------------
// Internal helper: forcibly clear dirty flags for re-mark tests. We do this
// by reaching into the Tilemap's chunks via getDirtyChunks + a private cast.
// The cleaner option would be a public `markChunksClean` for tests, but to
// avoid widening the public API we go through the same key listing the
// renderer uses internally.
// ---------------------------------------------------------------------------

function clearDirty(map: Tilemap, layer: number): void {
  // The Tilemap stores chunks privately. We use a structural cast that only
  // exercises the same shape the production code uses.
  type ChunkLike = { dirty: boolean };
  type LayerLike = { chunks: Map<string, ChunkLike> };
  const internal = map as unknown as { layerData: LayerLike[] };
  const l = internal.layerData[layer];
  if (!l) return;
  for (const c of l.chunks.values()) c.dirty = false;
}
