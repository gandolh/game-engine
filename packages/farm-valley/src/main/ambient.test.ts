/**
 * AmbientLayer unit tests (node environment — no DOM/canvas needed).
 *
 * Three assertion targets:
 *   1. Pool caps — active counts never exceed hard caps.
 *   2. Seeded determinism — two layers with the same seed and identical
 *      update sequences produce identical pushed sprite data.
 *   3. Anchor extraction — tree / building anchors are extracted correctly;
 *      forge-house is excluded from smoke anchors; empty input is safe.
 */

import { describe, it, expect } from "vitest";
import { AmbientLayer } from "./ambient";
import type { ViewRect } from "./ambient";
import type { Canvas2dSprite } from "@engine/core/render";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Build a minimal Canvas2dSprite record for use as synthetic static-layer input. */
function makeSprite(frame: string, x = 0, y = 0, width = 16, height = 16): Canvas2dSprite {
  return { x, y, width, height, frame, atlasId: "test", rotation: 0, layer: 0, alpha: 1 };
}

/** A wide view that contains everything. */
const WIDE_VIEW: ViewRect = { left: -10000, right: 10000, top: -10000, bottom: 10000 };

/**
 * Collector renderer: captures every push() call and returns the list.
 * Each call returns a fresh array (reuse is expected inside AmbientLayer,
 * so we snapshot the values at push time).
 */
function makeCollector(): { push(s: Canvas2dSprite): void; sprites: Array<{ x: number; y: number; frame: string; alpha: number }> } {
  const sprites: Array<{ x: number; y: number; frame: string; alpha: number }> = [];
  return {
    push(s) {
      sprites.push({ x: s.x, y: s.y, frame: s.frame, alpha: s.alpha });
    },
    sprites,
  };
}

// ---------------------------------------------------------------------------
// 1. Pool caps
// ---------------------------------------------------------------------------
describe("AmbientLayer pool caps", () => {
  it("bird active count never exceeds BIRD_CAP (6) across many frames", () => {
    const layer = new AmbientLayer();
    // Many tree anchors so leaves can also spawn freely (stress test)
    const sprites: Canvas2dSprite[] = [];
    for (let i = 0; i < 50; i++) {
      sprites.push(makeSprite("structure/tree", i * 32, 100));
    }
    // A few smoke-producing buildings
    sprites.push(makeSprite("structure/home", 200, 200, 32, 48));
    sprites.push(makeSprite("structure/shopkeeper", 400, 200, 32, 32));
    layer.init(sprites, 42);

    const MAX_BIRDS = 6;
    const MAX_LEAVES = 20;
    const MAX_SMOKE = 12;

    // Simulate 500 frames at ~16ms each (≈8 seconds wall-clock)
    // Use a large dtMs to rapidly exercise spawn logic.
    for (let frame = 0; frame < 500; frame++) {
      const nowMs = frame * 50; // 50ms steps — faster than real time to hammer spawn paths
      layer.update(50, nowMs, WIDE_VIEW, 0, "spring");

      const collector = makeCollector();
      layer.pushSprites(collector);

      const birds = collector.sprites.filter((s) => s.frame.startsWith("decoration/bird")).length;
      const leaves = collector.sprites.filter((s) => s.frame.startsWith("decoration/leaf")).length;
      const smoke = collector.sprites.filter((s) => s.frame.startsWith("structure/forge-smoke")).length;

      expect(birds).toBeLessThanOrEqual(MAX_BIRDS);
      expect(leaves).toBeLessThanOrEqual(MAX_LEAVES);
      expect(smoke).toBeLessThanOrEqual(MAX_SMOKE);
    }
  });

  it("no particles and no throw with empty sprite list", () => {
    const layer = new AmbientLayer();
    layer.init([], 0);

    layer.update(16, 1000, WIDE_VIEW, 0, "spring");
    const collector = makeCollector();
    expect(() => layer.pushSprites(collector)).not.toThrow();
    expect(collector.sprites.length).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// 1b. Every pushed sprite has a valid atlas frame
// ---------------------------------------------------------------------------
describe("AmbientLayer frame validity", () => {
  it("never pushes a sprite with an undefined/empty frame (multi-bird flock regression)", () => {
    // Regression for the render-loop crash "Atlas frame not found: undefined
    // (atlas props)": flock birds were spawned with spawnMs in the FUTURE
    // (nowMs + i*80), so on their first rendered frames `elapsed` was negative
    // and `floor(elapsed / halfPeriod) % 2` produced -1 → BIRD_FRAMES[-1] ===
    // undefined. The fix staggers spawnMs into the past. This drives enough
    // frames for several flocks (some with count >= 2) and asserts every pushed
    // sprite carries a real frame name.
    const sprites: Canvas2dSprite[] = [];
    for (let i = 0; i < 20; i++) sprites.push(makeSprite("structure/tree", i * 32, 100));
    sprites.push(makeSprite("structure/home", 200, 200, 32, 48));

    const layer = new AmbientLayer();
    layer.init(sprites, 42);

    let birdsSeen = 0;
    // ~128s at 16ms — long enough for multiple bird flocks (interval 20-60s).
    for (let frame = 0; frame < 8000; frame++) {
      layer.update(16, frame * 16, WIDE_VIEW, 0, "autumn");
      const coll = makeCollector();
      layer.pushSprites(coll);
      for (const s of coll.sprites) {
        expect(typeof s.frame).toBe("string");
        expect(s.frame.length).toBeGreaterThan(0);
      }
      birdsSeen += coll.sprites.filter((s) => s.frame.startsWith("decoration/bird")).length;
    }
    // Sanity: the run actually exercised the bird path (otherwise the assertion
    // above is vacuous).
    expect(birdsSeen).toBeGreaterThan(0);
  });
});

// ---------------------------------------------------------------------------
// 2. Seeded determinism
// ---------------------------------------------------------------------------
describe("AmbientLayer seeded determinism", () => {
  it("two layers with the same seed produce identical sprite snapshots after N updates", () => {
    const anchors: Canvas2dSprite[] = [
      makeSprite("structure/tree", 100, 100),
      makeSprite("structure/tree", 300, 150),
      makeSprite("structure/home", 500, 200, 32, 48),
    ];

    const layerA = new AmbientLayer();
    const layerB = new AmbientLayer();
    layerA.init(anchors, 1234);
    layerB.init(anchors, 1234);

    const view: ViewRect = { left: 0, right: 800, top: 0, bottom: 600 };

    // Drive both through 200 identical update steps
    for (let frame = 0; frame < 200; frame++) {
      const nowMs = frame * 30;
      layerA.update(30, nowMs, view, 0.5, "autumn");
      layerB.update(30, nowMs, view, 0.5, "autumn");
    }

    const collA = makeCollector();
    const collB = makeCollector();
    layerA.pushSprites(collA);
    layerB.pushSprites(collB);

    // Same number of active sprites
    expect(collA.sprites.length).toBe(collB.sprites.length);

    // Same positions, frames, and alphas
    for (let i = 0; i < collA.sprites.length; i++) {
      expect(collA.sprites[i]).toEqual(collB.sprites[i]);
    }
  });

  it("two layers with DIFFERENT seeds produce different states after many updates", () => {
    const anchors: Canvas2dSprite[] = [
      makeSprite("structure/tree", 100, 100),
      makeSprite("structure/tree", 300, 150),
    ];

    const layerA = new AmbientLayer();
    const layerB = new AmbientLayer();
    layerA.init(anchors, 1);
    layerB.init(anchors, 999);

    const view: ViewRect = { left: 0, right: 800, top: 0, bottom: 600 };

    for (let frame = 0; frame < 300; frame++) {
      const nowMs = frame * 20;
      layerA.update(20, nowMs, view, 0, "summer");
      layerB.update(20, nowMs, view, 0, "summer");
    }

    const collA = makeCollector();
    const collB = makeCollector();
    layerA.pushSprites(collA);
    layerB.pushSprites(collB);

    // At least one position differs (overwhelming probability with different seeds)
    const allMatch =
      collA.sprites.length === collB.sprites.length &&
      collA.sprites.every((sa, i) => sa.x === collB.sprites[i]?.x && sa.y === collB.sprites[i]?.y);
    expect(allMatch).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// 3. Anchor extraction
// ---------------------------------------------------------------------------
describe("AmbientLayer anchor extraction", () => {
  it("extracts tree anchors from structure/tree* frames", () => {
    const sprites: Canvas2dSprite[] = [
      makeSprite("structure/tree", 10, 20),
      makeSprite("structure/tree-autumn", 30, 40),
      makeSprite("structure/tree-bare", 50, 60),
      makeSprite("structure/home", 70, 80, 32, 48),
      makeSprite("decoration/barn", 90, 100),
    ];

    const layer = new AmbientLayer();
    layer.init(sprites, 7);

    // After many updates with a wide view, leaves should eventually spawn
    // (they need at least one tree anchor).
    let leafSeen = false;
    for (let frame = 0; frame < 600 && !leafSeen; frame++) {
      layer.update(30, frame * 30, WIDE_VIEW, 0, "spring");
      const coll = makeCollector();
      layer.pushSprites(coll);
      if (coll.sprites.some((s) => s.frame.startsWith("decoration/leaf"))) {
        leafSeen = true;
      }
    }
    expect(leafSeen).toBe(true);
  });

  it("excludes forge-house from smoke anchors", () => {
    const sprites: Canvas2dSprite[] = [
      makeSprite("structure/forge-house", 100, 100, 32, 48),
    ];

    const layer = new AmbientLayer();
    layer.init(sprites, 0);

    // Run many frames — no smoke should ever appear (forge-house excluded)
    for (let frame = 0; frame < 500; frame++) {
      layer.update(30, frame * 30, WIDE_VIEW, 0, "summer");
      const coll = makeCollector();
      layer.pushSprites(coll);
      const smokeCount = coll.sprites.filter((s) => s.frame.startsWith("structure/forge-smoke")).length;
      expect(smokeCount).toBe(0);
    }
  });

  it("produces smoke from non-forge buildings", () => {
    const sprites: Canvas2dSprite[] = [
      makeSprite("structure/home", 200, 200, 32, 48),
    ];

    const layer = new AmbientLayer();
    layer.init(sprites, 5);

    let smokeSeen = false;
    for (let frame = 0; frame < 600 && !smokeSeen; frame++) {
      layer.update(50, frame * 50, WIDE_VIEW, 0, "spring");
      const coll = makeCollector();
      layer.pushSprites(coll);
      if (coll.sprites.some((s) => s.frame.startsWith("structure/forge-smoke"))) {
        smokeSeen = true;
      }
    }
    expect(smokeSeen).toBe(true);
  });

  it("uses autumn leaf frame in autumn season", () => {
    const sprites: Canvas2dSprite[] = [
      makeSprite("structure/tree", 100, 100),
    ];

    const layer = new AmbientLayer();
    layer.init(sprites, 3);

    let autumnLeafSeen = false;
    for (let frame = 0; frame < 600 && !autumnLeafSeen; frame++) {
      layer.update(30, frame * 30, WIDE_VIEW, 0, "autumn");
      const coll = makeCollector();
      layer.pushSprites(coll);
      if (coll.sprites.some((s) => s.frame === "decoration/leaf-autumn")) {
        autumnLeafSeen = true;
      }
    }
    expect(autumnLeafSeen).toBe(true);
  });

  it("uses green leaf frame in non-autumn season", () => {
    const sprites: Canvas2dSprite[] = [
      makeSprite("structure/tree", 100, 100),
    ];

    const layer = new AmbientLayer();
    layer.init(sprites, 3);

    let greenLeafSeen = false;
    for (let frame = 0; frame < 600 && !greenLeafSeen; frame++) {
      layer.update(30, frame * 30, WIDE_VIEW, 0, "summer");
      const coll = makeCollector();
      layer.pushSprites(coll);
      if (coll.sprites.some((s) => s.frame === "decoration/leaf-a")) {
        greenLeafSeen = true;
      }
    }
    expect(greenLeafSeen).toBe(true);
  });
});
