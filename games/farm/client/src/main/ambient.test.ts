

import { describe, it, expect } from "vitest";
import { AmbientLayer } from "./ambient";
import type { ViewRect } from "./ambient";
import type { Canvas2dSprite } from "@engine/core/render";

function makeSprite(frame: string, x = 0, y = 0, width = 16, height = 16): Canvas2dSprite {
  return { x, y, width, height, frame, atlasId: "test", rotation: 0, layer: 0, alpha: 1 };
}

const WIDE_VIEW: ViewRect = { left: -10000, right: 10000, top: -10000, bottom: 10000 };

function makeCollector(): { push(s: Canvas2dSprite): void; sprites: Array<{ x: number; y: number; frame: string; alpha: number }> } {
  const sprites: Array<{ x: number; y: number; frame: string; alpha: number }> = [];
  return {
    push(s) {
      sprites.push({ x: s.x, y: s.y, frame: s.frame, alpha: s.alpha });
    },
    sprites,
  };
}

describe("AmbientLayer pool caps", () => {
  it("bird active count never exceeds BIRD_CAP (6) across many frames", () => {
    const layer = new AmbientLayer();

    const sprites: Canvas2dSprite[] = [];
    for (let i = 0; i < 50; i++) {
      sprites.push(makeSprite("structure/tree", i * 32, 100));
    }

    sprites.push(makeSprite("structure/home", 200, 200, 32, 48));
    sprites.push(makeSprite("structure/shopkeeper", 400, 200, 32, 32));
    layer.init(sprites, 42);

    const MAX_BIRDS = 6;
    const MAX_LEAVES = 20;
    const MAX_SMOKE = 12;

    for (let frame = 0; frame < 500; frame++) {
      const nowMs = frame * 50; 
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

describe("AmbientLayer frame validity", () => {
  it("never pushes a sprite with an undefined/empty frame (multi-bird flock regression)", () => {

    const sprites: Canvas2dSprite[] = [];
    for (let i = 0; i < 20; i++) sprites.push(makeSprite("structure/tree", i * 32, 100));
    sprites.push(makeSprite("structure/home", 200, 200, 32, 48));

    const layer = new AmbientLayer();
    layer.init(sprites, 42);

    let birdsSeen = 0;

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

    expect(birdsSeen).toBeGreaterThan(0);
  });
});

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

    for (let frame = 0; frame < 200; frame++) {
      const nowMs = frame * 30;
      layerA.update(30, nowMs, view, 0.5, "autumn");
      layerB.update(30, nowMs, view, 0.5, "autumn");
    }

    const collA = makeCollector();
    const collB = makeCollector();
    layerA.pushSprites(collA);
    layerB.pushSprites(collB);

    expect(collA.sprites.length).toBe(collB.sprites.length);

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

    const allMatch =
      collA.sprites.length === collB.sprites.length &&
      collA.sprites.every((sa, i) => sa.x === collB.sprites[i]?.x && sa.y === collB.sprites[i]?.y);
    expect(allMatch).toBe(false);
  });
});

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
