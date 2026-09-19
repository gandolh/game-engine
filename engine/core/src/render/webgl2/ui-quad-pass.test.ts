import { describe, it, expect, vi } from "vitest";
import { UiQuadPass, screenSpaceView } from "./ui-quad-pass";
import { drawUIQuad } from "../ui-draw";
import { EDG, rgbOf } from "../palette";
import type { UIQuad } from "../renderer";
import type { Ctx2D } from "../sprite-types";
import type { LoadedAtlasImage } from "../../assets/loader";
import type { GlAtlasStore } from "./gl-atlas-store";
import type { GlSpriteInstance, SpriteBatch } from "./sprite-batch";

/**
 * Unit tests for the screen-space UI pass (sweep-04).
 *
 * Per this directory's convention, the GL side is a fake object — what is
 * actually under test is the packing arithmetic, the run coalescing, the skip
 * rules, and the one `beginPass`/`endPass` bracket.
 *
 * The block at the bottom, "pixel parity with the CPU rasterizer", is the one
 * that decides whether this pass is allowed to exist: it drives the REAL
 * `drawUIQuad` against a recording 2D context and asserts the GPU instance
 * lands on the byte-identical destination rect with the same source rect and
 * the same effective colour.
 */

// ---------------------------------------------------------------- fakes ----

const ATLAS_W = 100;
const ATLAS_H = 200;
const FRAME = { x: 10, y: 20, w: 30, h: 40 };

function makeAtlas(id = "ui"): LoadedAtlasImage {
  return {
    manifest: {
      id, imageUrl: "", width: ATLAS_W, height: ATLAS_H, frames: { g: FRAME },
    } as unknown as LoadedAtlasImage["manifest"],
    bitmap: { __tag: "bitmap" } as unknown as ImageBitmap,
    frameRect: (name: string) => {
      if (name !== "g") throw new Error(`no frame ${name}`);
      return FRAME;
    },
  };
}

/** A `GlAtlasStore` stand-in: real `uv()` arithmetic, tagged texture handles. */
function makeStore(ids: readonly string[]): GlAtlasStore {
  const textures = new Map(ids.map((id) => [id, { __tex: id } as unknown as WebGLTexture]));
  const white = { __tex: "white" } as unknown as WebGLTexture;
  return {
    uvInto: (atlasId: string, _frame: string, out: { u0: number; v0: number; u1: number; v1: number }) => {
      if (!textures.has(atlasId)) throw new Error(`atlas sheet "${atlasId}" not loaded`);
      out.u0 = FRAME.x / ATLAS_W;
      out.v0 = FRAME.y / ATLAS_H;
      out.u1 = (FRAME.x + FRAME.w) / ATLAS_W;
      out.v1 = (FRAME.y + FRAME.h) / ATLAS_H;
    },
    texture: (atlasId: string) => {
      const t = textures.get(atlasId);
      if (t === undefined) throw new Error(`atlas sheet "${atlasId}" not loaded`);
      return t;
    },
    whiteTexture: () => white,
    white,
  } as unknown as GlAtlasStore & { white: WebGLTexture };
}

interface Recorded {
  added: GlSpriteInstance[];
  calls: string[];
  ranges: Array<{ texture: unknown; first: number; count: number }>;
  view: unknown;
}

function makeBatch(): { batch: SpriteBatch; rec: Recorded } {
  const rec: Recorded = { added: [], calls: [], ranges: [], view: undefined };
  const batch = {
    get count(): number { return rec.added.length; },
    add(inst: GlSpriteInstance): number {
      // The pass reuses ONE scratch instance object, so snapshot it.
      rec.added.push({ ...inst });
      return rec.added.length - 1;
    },
    setView(v: unknown): void { rec.view = v; rec.calls.push("setView"); },
    beginPass(): void { rec.calls.push("beginPass"); },
    drawRange(_gl: unknown, texture: unknown, first: number, count: number): void {
      rec.calls.push("drawRange");
      rec.ranges.push({ texture, first, count });
    },
    endPass(): void { rec.calls.push("endPass"); },
  } as unknown as SpriteBatch;
  return { batch, rec };
}

const GL = {} as unknown as WebGL2RenderingContext;

function packed(quads: readonly UIQuad[], dpr = 1, ids: readonly string[] = ["ui"]) {
  const pass = new UiQuadPass();
  const { batch, rec } = makeBatch();
  const store = makeStore(ids);
  const atlases = new Map(ids.map((id) => [id, makeAtlas(id)]));
  pass.pack(batch, store, atlases, quads, quads.length, dpr);
  return { pass, batch, rec, store };
}

// --------------------------------------------------------------- tests ----

describe("screenSpaceView", () => {
  it("maps the device-pixel corners of the drawing buffer onto the clip-space corners", () => {
    const v = screenSpaceView(640, 480);
    const clip = (x: number, y: number) => [x * v.scaleX + v.offsetX, y * v.scaleY + v.offsetY];

    expect(clip(0, 0)).toEqual([-1, 1]); // top-left
    expect(clip(640, 0)).toEqual([1, 1]); // top-right
    expect(clip(0, 480)).toEqual([-1, -1]); // bottom-left
    expect(clip(640, 480)).toEqual([1, -1]); // bottom-right
  });

  it("keeps scaleY negative — the y-flip is baked in here, never re-applied in the shader", () => {
    expect(screenSpaceView(640, 480).scaleY).toBeLessThan(0);
  });

  it("zeroes the wind/time terms so an identical UI frame packs identically", () => {
    const v = screenSpaceView(640, 480);
    expect(v.timeSec).toBe(0);
    expect(v.windStrength).toBe(0);
  });
});

describe("UiQuadPass#pack geometry", () => {
  it("emits centre + extent whose corners are exactly the CPU path's [x*dpr, (x+w)*dpr] rect", () => {
    const { rec } = packed([{ x: 10, y: 20, width: 5, height: 7, color: EDG.white }], 2);
    const inst = rec.added[0]!;

    expect(inst.w).toBe(10);
    expect(inst.h).toBe(14);
    expect(inst.x - inst.w / 2).toBe(20); // left  = 10 * 2
    expect(inst.x + inst.w / 2).toBe(30); // right = (10 + 5) * 2
    expect(inst.y - inst.h / 2).toBe(40); // top   = 20 * 2
    expect(inst.y + inst.h / 2).toBe(54); // bottom = (20 + 7) * 2
  });

  it("never rotates, flips or sways a UI quad", () => {
    const { rec } = packed([{ x: 1, y: 2, width: 3, height: 4, color: EDG.white }]);
    const inst = rec.added[0]!;
    expect(inst.rotation).toBe(0);
    expect(inst.flipX).toBe(0);
    expect(inst.swayAmp).toBe(0);
    expect(inst.swayPhase).toBe(0);
  });

  it("takes the textured quad's UVs from the store (the frame rect over the sheet)", () => {
    const { rec } = packed([{ x: 0, y: 0, width: 8, height: 8, atlasId: "ui", frame: "g" }]);
    expect(rec.added[0]).toMatchObject({ u0: 0.1, v0: 0.1, u1: 0.4, v1: 0.3 });
  });

  it("gives a solid-colour quad the whole 1x1 white texel, bound to the white texture", () => {
    const { rec, store, pass } = packed([{ x: 0, y: 0, width: 8, height: 8, color: EDG.red }]);
    expect(rec.added[0]).toMatchObject({ u0: 0, v0: 0, u1: 1, v1: 1 });

    const { batch, rec: drawRec } = makeBatch();
    pass.draw(GL, batch, screenSpaceView(640, 480));
    expect(drawRec.ranges).toHaveLength(1);
    // Not an atlas sheet: the sampler must be a no-op so the tint alone colours it.
    expect(drawRec.ranges[0]!.texture).toBe(store.whiteTexture());
  });
});

describe("UiQuadPass#pack tint", () => {
  it("leaves an untinted textured quad at the identity tint, so it blits byte-for-byte", () => {
    const { rec } = packed([{ x: 0, y: 0, width: 8, height: 8, atlasId: "ui", frame: "g" }]);
    expect(rec.added[0]).toMatchObject({ r: 1, g: 1, b: 1, a: 1 });
  });

  it("feeds a palette colour into the per-instance tint (what the CPU tint cache emulated)", () => {
    const { rec } = packed([
      { x: 0, y: 0, width: 8, height: 8, atlasId: "ui", frame: "g", color: EDG.gold },
    ]);
    const [r, g, b] = rgbOf(EDG.gold);
    expect(rec.added[0]!.r).toBeCloseTo(r / 255, 10);
    expect(rec.added[0]!.g).toBeCloseTo(g / 255, 10);
    expect(rec.added[0]!.b).toBeCloseTo(b / 255, 10);
  });

  it("puts the quad's alpha in the tint alpha — the shader's tex.a * tint.a is the CPU globalAlpha", () => {
    const { rec } = packed([
      { x: 0, y: 0, width: 8, height: 8, atlasId: "ui", frame: "g", alpha: 0.25 },
    ]);
    expect(rec.added[0]!.a).toBe(0.25);
  });
});

describe("UiQuadPass#pack skips", () => {
  it("skips zero/negative alpha and zero/negative extents, exactly like drawUIQuad", () => {
    const { rec, pass } = packed([
      { x: 0, y: 0, width: 8, height: 8, color: EDG.red, alpha: 0 },
      { x: 0, y: 0, width: 0, height: 8, color: EDG.red },
      { x: 0, y: 0, width: 8, height: 0, color: EDG.red },
      { x: 0, y: 0, width: -4, height: 8, color: EDG.red },
    ]);
    expect(rec.added).toHaveLength(0);
    expect(pass.groupCount).toBe(0);
    expect(pass.instanceCount).toBe(0);
  });

  it("skips a quad that is neither textured nor coloured", () => {
    const { rec } = packed([{ x: 0, y: 0, width: 8, height: 8 }]);
    expect(rec.added).toHaveLength(0);
  });

  it("warns once and skips (never throws) for an unloaded atlas or an unknown frame", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    try {
      const { rec } = packed([
        { x: 0, y: 0, width: 8, height: 8, atlasId: "nope", frame: "g" },
        { x: 0, y: 0, width: 8, height: 8, atlasId: "ui", frame: "nosuchframe" },
        { x: 0, y: 0, width: 8, height: 8, atlasId: "ui", frame: "g" },
      ]);
      // The good quad after the two bad ones still lands: a miss must not abort
      // the rest of the frame's UI.
      expect(rec.added).toHaveLength(1);
      expect(warn).toHaveBeenCalled();
    } finally {
      warn.mockRestore();
    }
  });
});

describe("UiQuadPass#pack group coalescing", () => {
  it("keeps submission order and coalesces only CONSECUTIVE same-texture runs", () => {
    // A panel background (white texel), then two glyphs (sheet "ui"), then
    // another background. Sorting by texture would put the last background under
    // the glyphs, so the run structure has to be a, b, b, a — three groups.
    const { pass, rec } = packed([
      { x: 0, y: 0, width: 40, height: 20, color: EDG.black },
      { x: 2, y: 2, width: 5, height: 7, atlasId: "ui", frame: "g", color: EDG.white },
      { x: 8, y: 2, width: 5, height: 7, atlasId: "ui", frame: "g", color: EDG.white },
      { x: 0, y: 24, width: 40, height: 20, color: EDG.black },
    ]);

    expect(pass.instanceCount).toBe(4);
    expect(pass.groupCount).toBe(3);

    expect(rec.added).toHaveLength(4);

    const store = makeStore(["ui"]);
    const { batch, rec: drawRec } = makeBatch();
    pass.draw(GL, batch, screenSpaceView(640, 480));
    expect(drawRec.ranges.map((r) => [r.first, r.count])).toEqual([[0, 1], [1, 2], [3, 1]]);
    // ...and the bindings alternate white -> sheet -> white, proving the second
    // background was NOT merged back into the first group.
    expect(drawRec.ranges.map((r) => (r.texture as { __tex: string }).__tex))
      .toEqual(["white", "ui", "white"]);
    expect(store.whiteTexture()).toBeTruthy();
  });

  it("numbers its groups from the batch cursor, so it can pack behind the world sprites", () => {
    const pass = new UiQuadPass();
    const { batch, rec } = makeBatch();
    const store = makeStore(["ui"]);
    const atlases = new Map([["ui", makeAtlas("ui")]]);

    // Three world sprites already in the shared instance buffer.
    for (let i = 0; i < 3; i += 1) {
      batch.add({
        x: 0, y: 0, w: 1, h: 1, u0: 0, v0: 0, u1: 1, v1: 1,
        rotation: 0, flipX: 0, r: 1, g: 1, b: 1, a: 1, swayPhase: 0, swayAmp: 0,
      });
    }

    const quads: UIQuad[] = [{ x: 0, y: 0, width: 4, height: 4, color: EDG.red }];
    pass.pack(batch, store, atlases, quads, quads.length, 1);
    rec.calls.length = 0;
    rec.ranges.length = 0;
    pass.draw(GL, batch, screenSpaceView(640, 480));

    expect(rec.ranges).toEqual([{ texture: expect.anything(), first: 3, count: 1 }]);
  });

  it("forgets the previous pack: a frame with no quads draws nothing", () => {
    const pass = new UiQuadPass();
    const { batch, rec } = makeBatch();
    const store = makeStore(["ui"]);
    const atlases = new Map([["ui", makeAtlas("ui")]]);

    pass.pack(batch, store, atlases, [{ x: 0, y: 0, width: 4, height: 4, color: EDG.red }], 1, 1);
    expect(pass.groupCount).toBe(1);

    pass.pack(batch, store, atlases, [], 0, 1);
    expect(pass.groupCount).toBe(0);

    rec.calls.length = 0;
    pass.draw(GL, batch, screenSpaceView(640, 480));
    expect(rec.calls).toEqual([]);
  });
});

describe("UiQuadPass#draw", () => {
  it("brackets every group with exactly one beginPass/endPass (the sweep-05 structure)", () => {
    const { pass } = packed([
      { x: 0, y: 0, width: 40, height: 20, color: EDG.black },
      { x: 2, y: 2, width: 5, height: 7, atlasId: "ui", frame: "g" },
      { x: 0, y: 24, width: 40, height: 20, color: EDG.black },
    ]);
    const { batch, rec } = makeBatch();
    pass.draw(GL, batch, screenSpaceView(640, 480));

    expect(rec.calls).toEqual([
      "setView", "beginPass", "drawRange", "drawRange", "drawRange", "endPass",
    ]);
  });

  it("re-issues the screen-space view before drawing, because the world view was set earlier", () => {
    const { pass } = packed([{ x: 0, y: 0, width: 4, height: 4, color: EDG.red }]);
    const { batch, rec } = makeBatch();
    pass.draw(GL, batch, screenSpaceView(640, 480));
    expect(rec.view).toEqual(screenSpaceView(640, 480));
  });

  it("issues no GL calls at all when nothing was packed", () => {
    const pass = new UiQuadPass();
    const { batch, rec } = makeBatch();
    pass.draw(GL, batch, screenSpaceView(640, 480));
    expect(rec.calls).toEqual([]);
  });

  it("reset() drops the groups so a dead context's texture handles are never redrawn", () => {
    const { pass } = packed([{ x: 0, y: 0, width: 4, height: 4, color: EDG.red }]);
    pass.reset();
    const { batch, rec } = makeBatch();
    pass.draw(GL, batch, screenSpaceView(640, 480));
    expect(rec.calls).toEqual([]);
    expect(pass.groupCount).toBe(0);
  });
});

// ----------------------------------------- pixel parity with the CPU path ----

/**
 * Records what the REAL `drawUIQuad` asked the 2D context to do, so the GPU
 * instance can be diffed against it rather than against a restatement of the
 * rules. This is the acceptance evidence for sweep-04: "the same rect, the same
 * source, the same colour", checked against the production rasterizer.
 */
function recordCpuDraw(quad: UIQuad, dpr: number): {
  dest: number[]; src: number[] | null; fillStyle: string | null; alpha: number;
} {
  let dest: number[] = [];
  let src: number[] | null = null;
  let fillStyle: string | null = null;
  let alpha = 1;
  const ctx = {
    globalAlpha: 1,
    globalCompositeOperation: "source-over",
    fillStyle: "",
    clearRect: () => {},
    fillRect(...a: number[]) {
      dest = a;
      fillStyle = String(ctx.fillStyle);
      alpha = ctx.globalAlpha;
    },
    drawImage(_img: unknown, ...a: number[]) {
      if (a.length === 8) {
        src = a.slice(0, 4);
        dest = a.slice(4);
      } else {
        dest = a;
      }
      alpha = ctx.globalAlpha;
    },
  };
  const atlases = new Map([["ui", makeAtlas("ui")]]);
  drawUIQuad(ctx as unknown as Ctx2D, atlases, quad, dpr);
  return { dest, src, fillStyle, alpha };
}

describe("UiQuadPass pixel parity with the CPU rasterizer", () => {
  const cases: Array<[string, UIQuad, number]> = [
    ["untinted glyph at dpr 1", { x: 10, y: 20, width: 5, height: 7, atlasId: "ui", frame: "g" }, 1],
    ["untinted glyph at dpr 2", { x: 10, y: 20, width: 5, height: 7, atlasId: "ui", frame: "g" }, 2],
    ["glyph at a fractional origin", { x: 10.5, y: 20.25, width: 5, height: 7, atlasId: "ui", frame: "g" }, 1],
    ["translucent glyph", { x: 3, y: 4, width: 5, height: 7, atlasId: "ui", frame: "g", alpha: 0.5 }, 2],
  ];

  for (const [name, quad, dpr] of cases) {
    it(`lands ${name} on the identical destination rect`, () => {
      const cpu = recordCpuDraw(quad, dpr);
      const { rec } = packed([quad], dpr);
      const inst = rec.added[0]!;

      const [dx, dy, dw, dh] = cpu.dest as [number, number, number, number];
      expect(inst.x - inst.w / 2).toBe(dx);
      expect(inst.y - inst.h / 2).toBe(dy);
      expect(inst.w).toBe(dw);
      expect(inst.h).toBe(dh);
      expect(inst.a).toBe(cpu.alpha);
    });
  }

  it("samples the identical source rect out of the sheet", () => {
    const quad: UIQuad = { x: 0, y: 0, width: 5, height: 7, atlasId: "ui", frame: "g" };
    const cpu = recordCpuDraw(quad, 1);
    const { rec } = packed([quad], 1);
    const inst = rec.added[0]!;

    // The CPU path names the source rect in atlas pixels; the GPU path names it
    // in UV fractions of the same sheet. Convert and compare.
    expect(cpu.src).toEqual([FRAME.x, FRAME.y, FRAME.w, FRAME.h]);
    expect(inst.u0 * ATLAS_W).toBeCloseTo(FRAME.x, 10);
    expect(inst.v0 * ATLAS_H).toBeCloseTo(FRAME.y, 10);
    expect((inst.u1 - inst.u0) * ATLAS_W).toBeCloseTo(FRAME.w, 10);
    expect((inst.v1 - inst.v0) * ATLAS_H).toBeCloseTo(FRAME.h, 10);
  });

  it("resolves a solid quad to the same colour the CPU path filled with", () => {
    const quad: UIQuad = { x: 2, y: 3, width: 40, height: 20, color: EDG.gold, alpha: 0.75 };
    const cpu = recordCpuDraw(quad, 2);
    const { rec } = packed([quad], 2);
    const inst = rec.added[0]!;

    expect(cpu.fillStyle).toBe(EDG.gold);
    const [r, g, b] = rgbOf(EDG.gold);
    // tex is an opaque white texel, so the shader's tex.rgb * tint.rgb IS the tint.
    expect(inst.r).toBeCloseTo(r / 255, 10);
    expect(inst.g).toBeCloseTo(g / 255, 10);
    expect(inst.b).toBeCloseTo(b / 255, 10);
    expect(inst.a).toBe(cpu.alpha);

    const [dx, dy, dw, dh] = cpu.dest as [number, number, number, number];
    expect(inst.x - inst.w / 2).toBe(dx);
    expect(inst.y - inst.h / 2).toBe(dy);
    expect(inst.w).toBe(dw);
    expect(inst.h).toBe(dh);
  });
});
