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

// `order` = per-frame DRAW sequence (order assertions). `life` = lifecycle events
// (constructions, bakes, uploads) — kept separate so instrumenting recovery does not
// pollute the strict draw-order assertions.
const rec = vi.hoisted(() => ({ order: [] as string[], life: [] as string[], contexts: [] as any[] }));

vi.mock("./gl-context", () => {
  class GlContext {
    gl = {
      clearColor: () => { /* recorded via clear */ },
      clear: () => { rec.order.push("clear"); },
      COLOR_BUFFER_BIT: 0x4000,
    };
    lost = false;
    lostHandlers: Array<() => void> = [];
    restoredHandlers: Array<() => void> = [];
    static create(): GlContext {
      const c = new GlContext();
      rec.contexts.push(c);
      return c;
    }
    resize(): void { rec.order.push("resize"); }
    isLost(): boolean { return this.lost; }
    onContextLost(h: () => void): () => void { this.lostHandlers.push(h); return () => {}; }
    onContextRestored(h: () => void): () => void { this.restoredHandlers.push(h); return () => {}; }
    /** Test helper: drive a full loss → restore cycle like the browser would. */
    simulateLossAndRestore(): void {
      this.lost = true;
      for (const h of this.lostHandlers) h();
      this.lost = false;
      for (const h of this.restoredHandlers) h();
    }
    dispose(): void {}
  }
  return { GlContext, createGlContext: () => GlContext.create() };
});

vi.mock("./gl-atlas-store", () => ({
  GlAtlasStore: class {
    add(): void { rec.life.push("atlas.add"); }
    get(): undefined { return undefined; }
    uv(): { u0: number; v0: number; u1: number; v1: number; layer: number } {
      return { u0: 0, v0: 0, u1: 1, v1: 1, layer: 0 };
    }
    uvInto(_a: string, _f: string, out: { u0: number; v0: number; u1: number; v1: number }): void {
      out.u0 = 0; out.v0 = 0; out.u1 = 1; out.v1 = 1;
    }
    texture(): object { return { __tex: true }; }
    whiteTexture(): object { return { __white: true }; }
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
    beginPass(): void { rec.order.push("sprite.beginPass"); }
    drawRange(): void { rec.order.push("sprites"); }
    endPass(): void { rec.order.push("sprite.endPass"); }
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
    constructor() { rec.life.push("staticPass.ctor"); }
    setView(): void { rec.order.push("static.setView"); }
    bake(): void { rec.life.push("staticPass.bake"); }
    clear(): void {}
    draw(): void { rec.order.push("static"); }
  },
}));

vi.mock("./water-pass", () => ({
  WaterPass: class {
    constructor() { rec.life.push("waterPass.ctor"); }
    setView(): void { rec.order.push("water.setView"); }
    bakePattern(): void { rec.life.push("waterPass.bakePattern"); }
    setDepthMask(): void {}
    setScroll(): void { rec.life.push("waterPass.setScroll"); }
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

// The screen-space UI pass (sweep-04). Mocked like every other pass: what this
// file pins is WHEN the renderer packs and draws it relative to the rest of the
// frame, and which of the two UI paths it chooses. The packing arithmetic and the
// group coalescing are the real pass's own unit tests (./ui-quad-pass.test.ts).
vi.mock("./ui-quad-pass", () => ({
  UiQuadPass: class {
    groups = 0;
    instances = 0;
    get groupCount(): number { return this.groups; }
    get instanceCount(): number { return this.instances; }
    pack(_b: unknown, _s: unknown, _a: unknown, _q: unknown, len: number): void {
      rec.order.push("ui.pack");
      this.groups = len > 0 ? 1 : 0;
      this.instances = len;
    }
    draw(): void { rec.order.push("ui.draw"); }
    reset(): void { rec.life.push("ui.reset"); this.groups = 0; this.instances = 0; }
  },
  screenSpaceView: (w: number, h: number) => ({
    scaleX: 2 / w, scaleY: -2 / h, offsetX: -1, offsetY: 1, timeSec: 0, windStrength: 0,
  }),
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

beforeEach(() => { rec.order.length = 0; rec.life.length = 0; });

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
      "sprite.beginPass",
      "sprites",
      "sprite.endPass",
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

describe("WebGl2Renderer sprite draw-group hoist (sweep-05)", () => {
  it("brackets ALL of this frame's draw groups with exactly one beginPass/endPass, however many groups the queue produces", () => {
    const r = makeRenderer();
    r.beginFrame();
    // Same layer/sortY-adjacent sprites with alternating atlasId force three
    // separate groups out of the coalescing loop (a, b, a) — compareSprite
    // doesn't know atlases exist, which is exactly sweep-05's premise.
    r.push(makeSprite({ atlasId: "a", y: 0 }));
    r.push(makeSprite({ atlasId: "b", y: 1 }));
    r.push(makeSprite({ atlasId: "a", y: 2 }));
    r.endFrame();

    expect(rec.order.filter((s) => s === "sprite.beginPass")).toHaveLength(1);
    expect(rec.order.filter((s) => s === "sprite.endPass")).toHaveLength(1);
    // Three draw groups (a, b, a) -> three drawRange calls, bracketed once.
    expect(rec.order.filter((s) => s === "sprites")).toHaveLength(3);
    expect(rec.order.indexOf("sprite.beginPass")).toBeLessThan(rec.order.indexOf("sprites"));
    expect(rec.order.lastIndexOf("sprite.endPass")).toBeGreaterThan(rec.order.lastIndexOf("sprites"));
  });

  it("issues no beginPass/endPass when there is nothing to draw", () => {
    const r = makeRenderer();
    r.beginFrame();
    r.endFrame();
    expect(rec.order).not.toContain("sprite.beginPass");
    expect(rec.order).not.toContain("sprite.endPass");
  });
});

describe("WebGl2Renderer draw-group profiling seam (sweep-05)", () => {
  it("leaves lastDrawStats at its zeroed default when profileUi is off", () => {
    const r = makeRenderer();
    r.beginFrame();
    r.push(makeSprite({ atlasId: "a" }));
    r.push(makeSprite({ atlasId: "b" }));
    r.endFrame();

    expect(r.lastDrawStats).toEqual({ groups: 0, ghostGroups: 0, sprites: 0, atlases: 0 });
  });

  it("reports the main-pass group count, sprite-queue length, and distinct atlas count when profileUi is on", () => {
    const r = makeRenderer();
    r.profileUi = true;
    r.beginFrame();
    r.push(makeSprite({ atlasId: "a", y: 0 }));
    r.push(makeSprite({ atlasId: "b", y: 1 }));
    r.push(makeSprite({ atlasId: "a", y: 2 }));
    r.endFrame();

    expect(r.lastDrawStats.sprites).toBe(3);
    expect(r.lastDrawStats.groups).toBe(3); // a, b, a — three groups, two atlases
    expect(r.lastDrawStats.atlases).toBe(2);
    expect(r.lastDrawStats.ghostGroups).toBe(0); // no occludable sprites pushed
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

describe("WebGl2Renderer UI draw-list (sweep-04: instanced, on the GL canvas)", () => {
  it("packs the UI before the batch upload and draws it after the wash, last on the GL canvas", () => {
    const r = makeRenderer();
    r.beginFrame();
    r.push(makeSprite());
    r.beginUI();
    r.pushUI({ x: 0, y: 0, width: 4, height: 4, color: "#000000" });
    r.pushUI({ x: 8, y: 8, width: 4, height: 4, color: "#000000" });
    r.endUI();
    r.endFrame({ color: "#000000", alpha: 0.5 });

    // The CPU rasterizer must not run at all on this path.
    expect(rec.order).not.toContain("uiQuad");

    // Packed into the shared instance buffer before anything is drawn...
    expect(rec.order.indexOf("ui.pack")).toBeGreaterThanOrEqual(0);
    expect(rec.order.indexOf("ui.pack")).toBeLessThan(rec.order.indexOf("clear"));
    // ...and drawn after the day/night wash, which is where the old CPU flush
    // sat in the composite.
    expect(rec.order.indexOf("tint")).toBeLessThan(rec.order.indexOf("ui.draw"));
    // Last thing on the GL canvas: nothing GL-side happens after it.
    expect(rec.order.indexOf("ui.draw")).toBeLessThan(rec.order.indexOf("overlay.beginFrame"));
    expect(rec.order[rec.order.length - 1]).toBe("overlay.beginFrame");
  });

  it("reports the GPU path and its group count through the profileUi seam", () => {
    const r = makeRenderer();
    r.profileUi = true;
    r.beginFrame();
    r.push(makeSprite());
    r.beginUI();
    r.pushUI({ x: 0, y: 0, width: 4, height: 4, color: "#000000" });
    r.endUI();
    r.endFrame();

    expect(r.lastUiDraw).toEqual({ gpu: true, groups: 1, instances: 1 });
    expect(r.lastUiFlush.quads).toBe(1);
  });

  it("falls back to the CPU flush when the 2D overlay also paints, so UI is never buried under it", () => {
    // Overlay2D is CSS-stacked ABOVE the GL canvas. A non-RainField WeatherLike
    // paints on it, so the UI has to stay on that same canvas (drawn after the
    // weather) rather than moving down to the GL one.
    const r = makeRenderer();
    const custom: WeatherLike = { count: 2, draw: () => { rec.order.push("custom.cpuDraw"); } };

    r.profileUi = true;
    r.beginFrame();
    r.push(makeSprite());
    r.beginUI();
    r.pushUI({ x: 0, y: 0, width: 4, height: 4, color: "#000000" });
    r.endUI();
    r.endFrame(undefined, undefined, custom);

    expect(rec.order).not.toContain("ui.draw");
    expect(rec.order).toContain("uiQuad");
    expect(rec.order.indexOf("custom.cpuDraw")).toBeLessThan(rec.order.indexOf("uiQuad"));
    expect(rec.order.indexOf("overlay.resetTransform")).toBeLessThan(rec.order.indexOf("uiQuad"));
    expect(r.lastUiDraw).toEqual({ gpu: false, groups: 0, instances: 0 });
  });

  it("falls back to the CPU flush when GPU effects are off and the overlay draws particles", () => {
    const r = makeRenderer();
    r.useGpuEffects = false;

    r.beginFrame();
    r.push(makeSprite());
    r.beginUI();
    r.pushUI({ x: 0, y: 0, width: 4, height: 4, color: "#000000" });
    r.endUI();
    r.endFrame(undefined, particles, makeRain(4));

    expect(rec.order).not.toContain("ui.draw");
    expect(rec.order.indexOf("particles.cpuDraw")).toBeLessThan(rec.order.indexOf("uiQuad"));
  });

  it("still takes the GPU path with GPU effects off when nothing actually paints on the overlay", () => {
    const r = makeRenderer();
    r.useGpuEffects = false;

    r.beginFrame();
    r.push(makeSprite());
    r.beginUI();
    r.pushUI({ x: 0, y: 0, width: 4, height: 4, color: "#000000" });
    r.endUI();
    r.endFrame();

    expect(rec.order).toContain("ui.draw");
    expect(rec.order).not.toContain("uiQuad");
  });

  it("drops quads pushed without beginUI (layer inert)", () => {
    const r = makeRenderer();
    r.beginFrame();
    r.push(makeSprite());
    r.pushUI({ x: 0, y: 0, width: 4, height: 4, color: "#000000" });
    r.endFrame();

    expect(rec.order).not.toContain("uiQuad");
    expect(rec.order).not.toContain("ui.draw");
  });

  it("beginFrame resets the UI list, so a consumer that stops calling beginUI does not redraw forever", () => {
    const r = makeRenderer();

    r.beginFrame();
    r.push(makeSprite());
    r.beginUI();
    r.pushUI({ x: 0, y: 0, width: 4, height: 4, color: "#000000" });
    r.endUI();
    r.endFrame();
    expect(rec.order).toContain("ui.draw");

    // Frame 2: no beginUI, no pushUI. The stale quad must be gone.
    rec.order.length = 0;
    r.beginFrame();
    r.push(makeSprite());
    r.endFrame();
    expect(rec.order).not.toContain("ui.draw");
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

describe("WebGl2Renderer context-loss recovery", () => {
  function ctx(): any { return rec.contexts[rec.contexts.length - 1]; }

  it("skips frames while the context is lost, instead of issuing dead GL calls", () => {
    const r = makeRenderer();
    const c = ctx();
    c.lost = true;
    r.beginFrame();
    r.push(makeSprite());
    r.endFrame();
    expect(rec.order.filter((s) => s !== "resize")).toEqual([]);
  });

  it("re-creates the passes and re-uploads atlases on restore", () => {
    const r = makeRenderer();
    rec.life.length = 0;
    ctx().simulateLossAndRestore();

    // Passes rebuilt...
    expect(rec.life).toContain("staticPass.ctor");
    expect(rec.life).toContain("waterPass.ctor");
    // ...and the retained atlas re-uploaded into the fresh store.
    expect(rec.life).toContain("atlas.add");
  });

  it("replays the retained static-layer bake and water state after restore", () => {
    const r = makeRenderer();
    r.bakeStaticLayer([makeSprite()], 64, 64);
    r.bakeWaterPattern("water", "a", 16);
    r.setWaterScroll(3, 4);

    rec.life.length = 0;
    ctx().simulateLossAndRestore();

    // This is the whole point: GPU state cannot be read back, so recovery must
    // REPLAY the CPU inputs. Without this the world renders empty after a tab sleep.
    expect(rec.life).toContain("staticPass.bake");
    expect(rec.life).toContain("waterPass.bakePattern");
    expect(rec.life).toContain("waterPass.setScroll");
  });

  it("does NOT replay a static bake that was explicitly cleared", () => {
    const r = makeRenderer();
    r.bakeStaticLayer([makeSprite()], 64, 64);
    r.clearStaticLayer();

    rec.life.length = 0;
    ctx().simulateLossAndRestore();
    expect(rec.life).not.toContain("staticPass.bake");
  });

  it("reports isRestoring and notifies via onContextStateChange", () => {
    const r = makeRenderer();
    const seen: boolean[] = [];
    r.onContextStateChange = (lost) => seen.push(lost);
    expect(r.isRestoring).toBe(false);
    ctx().simulateLossAndRestore();
    expect(seen).toEqual([true, false]);
    expect(r.isRestoring).toBe(false);
  });

  it("renders again after a restore (the regression this prevents)", () => {
    const r = makeRenderer();
    ctx().simulateLossAndRestore();
    rec.order.length = 0;
    r.beginFrame();
    r.push(makeSprite());
    r.endFrame();
    // A black-canvas-forever bug would show up here as no draws at all.
    expect(rec.order).toContain("sprites");
    expect(rec.order).toContain("water");
    expect(rec.order).toContain("static");
  });
});
