import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * These tests pin the parts of `WebGl2Renderer.endFrame` that are easy to get
 * plausibly wrong and hard to notice: **the order the passes draw in**, the
 * consume-each-frame cloud contract, the UI draw-list reset, and the
 * `useGpuEffects` / `instanceof RainField` branch.
 *
 * The passes themselves are mocked. That is deliberate: simulating enough of a
 * `WebGL2RenderingContext` to reach real draw calls would test the fake more than the
 * renderer, whereas the renderer's actual job here is orchestration — which pass runs,
 * in which order, under which condition. Each pass has its own unit tests against a
 * mock GL, and brief 09 verifies the composed result in a real browser.
 */

const rec = vi.hoisted(() => ({ order: [] as string[] }));

vi.mock("./gl-context", () => {
  class GlContext {
    gl = {
      clearColor: () => { /* recorded via clear */ },
      clear: () => { rec.order.push("clear"); },
      COLOR_BUFFER_BIT: 0x4000,
    };
    static create(): GlContext { return new GlContext(); }
    resize(): void { rec.order.push("resize"); }
    isLost(): boolean { return false; }
    dispose(): void {}
  }
  return { GlContext, createGlContext: () => GlContext.create() };
});

vi.mock("./gl-atlas-store", () => ({
  GlAtlasStore: class {
    add(): void {}
    get(): undefined { return undefined; }
    uv(): { u0: number; v0: number; u1: number; v1: number; layer: number } {
      return { u0: 0, v0: 0, u1: 1, v1: 1, layer: 0 };
    }
    texture(): object { return { __tex: true }; }
    dispose(): void {}
  },
}));

vi.mock("./sprite-batch", () => ({
  SpriteBatch: class {
    count = 0;
    begin(): void { this.count = 0; }
    setView(): void { rec.order.push("sprite.setView"); }
    add(): number { this.count += 1; return this.count - 1; }
    upload(): void {}
    drawRange(): void { rec.order.push("sprites"); }
  },
}));

vi.mock("./shadow-batch", () => ({
  ShadowBatch: class {
    begin(): void {}
    setView(): void { rec.order.push("shadow.setView"); }
    add(): void {}
    upload(): void {}
    draw(): void { rec.order.push("shadows"); }
  },
}));

vi.mock("./static-layer-pass", () => ({
  StaticLayerPass: class {
    setView(): void { rec.order.push("static.setView"); }
    bake(): void {}
    clear(): void {}
    draw(): void { rec.order.push("static"); }
  },
}));

vi.mock("./water-pass", () => ({
  WaterPass: class {
    setView(): void { rec.order.push("water.setView"); }
    bakePattern(): void {}
    setDepthMask(): void {}
    setScroll(): void {}
    setSwell(): void {}
    draw(): void { rec.order.push("water"); }
  },
}));

vi.mock("./particle-batch", () => ({
  ParticleBatch: class { draw(): void { rec.order.push("particles"); } },
}));

vi.mock("./weather-pass", () => ({
  WeatherPass: class { draw(): void { rec.order.push("weather"); } },
}));

vi.mock("./tint-pass", () => ({
  TintPass: class { draw(): void { rec.order.push("tint"); } },
}));

vi.mock("./cloud-shadow-pass", () => ({
  CloudShadowPass: class {
    setView(): void { rec.order.push("cloud.setView"); }
    draw(): void { rec.order.push("cloud"); }
  },
}));

vi.mock("./overlay-light-pass", () => ({
  OverlayLightPass: class {
    draw(overlay: unknown): void {
      // Mirrors the real pass: a no-op when no OverlayFn was supplied.
      if (overlay === undefined) return;
      rec.order.push("overlayLight");
    }
  },
}));

vi.mock("../overlay-2d", () => ({
  Overlay2D: class {
    ctx = {
      imageSmoothingEnabled: false,
      globalAlpha: 1,
      globalCompositeOperation: "source-over",
    };
    beginFrame(): void { rec.order.push("overlay.beginFrame"); }
    applyWorldTransform(): void { rec.order.push("overlay.worldTransform"); }
    resetTransform(): void { rec.order.push("overlay.resetTransform"); }
  },
}));

vi.mock("../ui-draw", () => ({
  drawUIQuad: () => { rec.order.push("uiQuad"); },
}));

// A stand-in RainField so `instanceof` resolves against the same module the renderer
// imports. Avoids depending on the real field's config shape.
vi.mock("../rain-field", () => ({
  RainField: class {
    count = 0;
    constructor(count = 1) { this.count = count; }
    draw(): void { rec.order.push("weather.cpuDraw"); }
  },
}));

import { WebGl2Renderer } from "./renderer";
import { Camera2D } from "../camera";
import { RainField } from "../rain-field";
import type { LoadedAtlasImage } from "../../assets/loader";
import type { ParticleSystem, Sprite, WeatherLike } from "..";

function makeCanvas(): HTMLCanvasElement {
  return {
    width: 640, height: 480, clientWidth: 640, clientHeight: 480,
    style: {} as Record<string, string>,
    parentElement: null,
  } as unknown as HTMLCanvasElement;
}

function stubAtlas(id = "a"): LoadedAtlasImage {
  return {
    manifest: { id, imageUrl: "", frames: {}, width: 1, height: 1 } as never,
    bitmap: {} as ImageBitmap,
    frameRect: () => ({ x: 0, y: 0, w: 1, h: 1 }),
  };
}

function makeSprite(over: Partial<Sprite> = {}): Sprite {
  return {
    x: 0, y: 0, width: 16, height: 16, frame: "f", atlasId: "a",
    rotation: 0, layer: 0, alpha: 1, ...over,
  } as Sprite;
}

function makeRenderer(): WebGl2Renderer {
  const camera = new Camera2D({ worldUnitsX: 640, worldUnitsY: 480, centerX: 0, centerY: 0 });
  const r = WebGl2Renderer.create(makeCanvas(), camera);
  r.addAtlas(stubAtlas());
  return r;
}

/**
 * Build the mocked RainField. `vi.mock` does not change TYPES, so `RainField` still
 * has the real class's zero-arg constructor signature here — set `count` after
 * construction rather than passing it in.
 */
function makeRain(count: number): WeatherLike {
  const field = new RainField() as unknown as { count: number };
  field.count = count;
  return field as unknown as WeatherLike;
}

const particles = { count: 3, draw: () => { rec.order.push("particles.cpuDraw"); } } as unknown as ParticleSystem;

beforeEach(() => { rec.order.length = 0; });

describe("WebGl2Renderer draw order", () => {
  it("draws water → static → shadows → sprites → particles → weather → overlayLight → cloud → tint, then the overlay", () => {
    const r = makeRenderer();
    r.beginFrame();
    r.push(makeSprite());
    r.pushShadow(0, 0, 4, 2, 0.5);
    r.setCloudOptions({ color: "#000000", coverage: 0.5, driftSpeed: 1, timeSec: 0 });
    r.endFrame(
      { color: "#000000", alpha: 0.5 },
      particles,
      makeRain(5),
      () => {},
    );

    const drawOnly = rec.order.filter((s) => !s.includes("setView") && s !== "resize");
    expect(drawOnly).toEqual([
      "clear",
      "water",
      "static",
      "shadows",
      "sprites",
      "particles",
      "weather",
      "overlayLight",
      "cloud",
      "tint",
      "overlay.beginFrame",
    ]);
  });

  it("sets the view on every setView-convention pass before anything draws", () => {
    const r = makeRenderer();
    r.beginFrame();
    r.push(makeSprite());
    r.endFrame();

    const firstDraw = rec.order.indexOf("water");
    const setViews = ["sprite.setView", "shadow.setView", "static.setView", "water.setView", "cloud.setView"];
    for (const sv of setViews) {
      const at = rec.order.indexOf(sv);
      expect(at, `${sv} must be called`).toBeGreaterThanOrEqual(0);
      expect(at, `${sv} must precede the first draw`).toBeLessThan(firstDraw);
    }
  });

  it("puts additive overlay light AFTER sprites and BEFORE the wash", () => {
    const r = makeRenderer();
    r.beginFrame();
    r.push(makeSprite());
    r.endFrame({ color: "#000000", alpha: 0.5 }, undefined, undefined, () => {});

    expect(rec.order.indexOf("sprites")).toBeLessThan(rec.order.indexOf("overlayLight"));
    expect(rec.order.indexOf("overlayLight")).toBeLessThan(rec.order.indexOf("tint"));
  });

  it("skips the overlay-light pass entirely when no OverlayFn is supplied", () => {
    const r = makeRenderer();
    r.beginFrame();
    r.push(makeSprite());
    r.endFrame({ color: "#000000", alpha: 0.5 });

    expect(rec.order).not.toContain("overlayLight");
  });
});

describe("WebGl2Renderer cloud-options contract", () => {
  it("skips the cloud pass when coverage is at or below the 0.001 threshold", () => {
    const r = makeRenderer();
    r.beginFrame();
    r.push(makeSprite());
    r.setCloudOptions({ color: "#000000", coverage: 0.001, driftSpeed: 1, timeSec: 0 });
    r.endFrame();
    expect(rec.order).not.toContain("cloud");
  });

  it("consumes the options each frame — a second frame without re-setting draws no cloud", () => {
    const r = makeRenderer();

    r.beginFrame();
    r.push(makeSprite());
    r.setCloudOptions({ color: "#000000", coverage: 0.5, driftSpeed: 1, timeSec: 0 });
    r.endFrame();
    expect(rec.order).toContain("cloud");

    rec.order.length = 0;
    r.beginFrame();
    r.push(makeSprite());
    r.endFrame();
    expect(rec.order).not.toContain("cloud");
  });
});

describe("WebGl2Renderer effect branching", () => {
  it("routes a RainField to the GPU weather pass when useGpuEffects is on", () => {
    const r = makeRenderer();
    r.beginFrame();
    r.push(makeSprite());
    r.endFrame(undefined, undefined, makeRain(4));

    expect(rec.order).toContain("weather");
    expect(rec.order).not.toContain("weather.cpuDraw");
  });

  it("routes a NON-RainField WeatherLike to the CPU overlay path even with useGpuEffects on", () => {
    const r = makeRenderer();
    const custom: WeatherLike = { count: 2, draw: () => { rec.order.push("custom.cpuDraw"); } };

    r.beginFrame();
    r.push(makeSprite());
    r.endFrame(undefined, undefined, custom);

    // The GPU weather pass must NOT claim it...
    expect(rec.order).not.toContain("weather");
    // ...it draws on the overlay, under the world transform.
    expect(rec.order).toContain("overlay.worldTransform");
    expect(rec.order).toContain("custom.cpuDraw");
  });

  it("routes particles and weather to the CPU overlay when useGpuEffects is off", () => {
    const r = makeRenderer();
    r.useGpuEffects = false;

    r.beginFrame();
    r.push(makeSprite());
    r.endFrame(undefined, particles, makeRain(4));

    expect(rec.order).not.toContain("particles");
    expect(rec.order).not.toContain("weather");
    expect(rec.order).toContain("particles.cpuDraw");
    expect(rec.order).toContain("weather.cpuDraw");
  });
});

describe("WebGl2Renderer UI draw-list", () => {
  it("flushes submitted UI quads last, in screen transform", () => {
    const r = makeRenderer();
    r.beginFrame();
    r.push(makeSprite());
    r.beginUI();
    r.pushUI({ x: 0, y: 0, width: 4, height: 4, color: "#000000" });
    r.pushUI({ x: 8, y: 8, width: 4, height: 4, color: "#000000" });
    r.endUI();
    r.endFrame();

    expect(rec.order.filter((s) => s === "uiQuad")).toHaveLength(2);
    expect(rec.order.indexOf("overlay.resetTransform")).toBeLessThan(rec.order.indexOf("uiQuad"));
    // UI is the last thing that happens in the frame.
    expect(rec.order[rec.order.length - 1]).toBe("uiQuad");
  });

  it("drops quads pushed without beginUI (layer inert)", () => {
    const r = makeRenderer();
    r.beginFrame();
    r.push(makeSprite());
    r.pushUI({ x: 0, y: 0, width: 4, height: 4, color: "#000000" });
    r.endFrame();

    expect(rec.order).not.toContain("uiQuad");
  });

  it("beginFrame resets the UI list, so a consumer that stops calling beginUI does not redraw forever", () => {
    const r = makeRenderer();

    r.beginFrame();
    r.push(makeSprite());
    r.beginUI();
    r.pushUI({ x: 0, y: 0, width: 4, height: 4, color: "#000000" });
    r.endUI();
    r.endFrame();
    expect(rec.order).toContain("uiQuad");

    // Frame 2: no beginUI, no pushUI. The stale quad must be gone.
    rec.order.length = 0;
    r.beginFrame();
    r.push(makeSprite());
    r.endFrame();
    expect(rec.order).not.toContain("uiQuad");
  });
});

describe("WebGl2Renderer guards", () => {
  it("does nothing in endFrame before any atlas is registered", () => {
    const camera = new Camera2D({ worldUnitsX: 640, worldUnitsY: 480, centerX: 0, centerY: 0 });
    const r = WebGl2Renderer.create(makeCanvas(), camera);
    r.beginFrame();
    r.endFrame();
    expect(rec.order.filter((s) => s !== "resize")).toEqual([]);
  });

  it("throws if bakeStaticLayer is called before addAtlas", () => {
    const camera = new Camera2D({ worldUnitsX: 640, worldUnitsY: 480, centerX: 0, centerY: 0 });
    const r = WebGl2Renderer.create(makeCanvas(), camera);
    expect(() => r.bakeStaticLayer([], 10, 10)).toThrow(/addAtlas/);
  });

  it("resizes with CSS pixels — GlContext applies DPR itself, so the renderer must not pre-scale", () => {
    const r = makeRenderer();
    r.beginFrame();
    expect(rec.order).toContain("resize");
  });
});
