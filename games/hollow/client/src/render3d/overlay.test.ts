import { describe, it, expect, beforeEach } from "vitest";
import { lookAt, multiply, perspective, type Mat4 } from "@engine/core/render3d";
import {
  mostDepletedNeed,
  needBarColorRole,
  drawAgentOverlay,
  createOverlayCanvas,
  resizeOverlayCanvas,
  type OverlayCtx,
  type OverlayAgentInput,
} from "./overlay";

describe("mostDepletedNeed", () => {
  it("picks the lowest-fraction need", () => {
    const worst = mostDepletedNeed({ food: 80, rest: 10, wealth: 100 });
    expect(worst?.kind).toBe("rest");
    expect(worst?.fraction).toBeCloseTo(0.1);
  });

  it("returns null for an empty needs record", () => {
    expect(mostDepletedNeed({})).toBeNull();
  });

  it("is pure/deterministic", () => {
    const needs = { food: 50, rest: 50 };
    expect(mostDepletedNeed(needs)).toEqual(mostDepletedNeed(needs));
  });
});

describe("needBarColorRole", () => {
  it("starving always forces the alarm role regardless of fraction", () => {
    expect(needBarColorRole(0.95, true)).toBe("red");
    expect(needBarColorRole(0.0, true)).toBe("red");
  });

  it("tiers by fraction when not starving", () => {
    expect(needBarColorRole(0.1, false)).toBe("orange");
    expect(needBarColorRole(0.45, false)).toBe("gold");
    expect(needBarColorRole(0.9, false)).toBe("green");
  });
});

// ---------------------------------------------------------------------------
// drawAgentOverlay — driven with a plain mock OverlayCtx (jsdom has no real
// 2D canvas rendering, per this module's header).
// ---------------------------------------------------------------------------

function overheadViewProj(width: number, height: number): Mat4 {
  const view = lookAt([0, 0, 10], [0, 0, 0], [0, 1, 0]);
  const proj = perspective(Math.PI / 3, width / height, 0.1, 100);
  return multiply(proj, view);
}

class RecordingCtx implements OverlayCtx {
  fillStyle = "";
  strokeStyle = "";
  lineWidth = 1;
  font = "";
  textAlign = "";
  textBaseline = "";
  readonly calls: string[] = [];
  readonly fillTexts: string[] = [];
  readonly fillRectFills: string[] = [];

  clearRect(): void {
    this.calls.push("clearRect");
  }
  fillRect(): void {
    this.calls.push("fillRect");
    this.fillRectFills.push(this.fillStyle);
  }
  fillText(text: string): void {
    this.calls.push("fillText");
    this.fillTexts.push(text);
  }
  beginPath(): void {
    this.calls.push("beginPath");
  }
  arc(): void {
    this.calls.push("arc");
  }
  stroke(): void {
    this.calls.push("stroke");
  }
}

const WIDTH = 800;
const HEIGHT = 600;

function makeAgent(overrides: Partial<OverlayAgentInput> = {}): OverlayAgentInput {
  return {
    id: 1,
    headWorld: [0, 0, 0],
    action: "idle",
    needs: { food: 80, rest: 90 },
    starving: false,
    ...overrides,
  };
}

describe("drawAgentOverlay", () => {
  let ctx: RecordingCtx;
  beforeEach(() => {
    ctx = new RecordingCtx();
  });

  it("always clears the canvas first", () => {
    drawAgentOverlay(ctx, [], { viewProj: overheadViewProj(WIDTH, HEIGHT), width: WIDTH, height: HEIGHT, showTags: false, selectedAgentId: null });
    expect(ctx.calls[0]).toBe("clearRect");
  });

  it("draws no glyph for an idle/walking agent in default (tags-off) mode", () => {
    drawAgentOverlay(ctx, [makeAgent({ action: "idle" })], {
      viewProj: overheadViewProj(WIDTH, HEIGHT),
      width: WIDTH,
      height: HEIGHT,
      showTags: false,
      selectedAgentId: null,
    });
    expect(ctx.fillTexts).toHaveLength(0);
  });

  it("draws a glyph for a notable action even with tags off", () => {
    drawAgentOverlay(ctx, [makeAgent({ action: "gift" })], {
      viewProj: overheadViewProj(WIDTH, HEIGHT),
      width: WIDTH,
      height: HEIGHT,
      showTags: false,
      selectedAgentId: null,
    });
    expect(ctx.fillTexts.length).toBe(1);
  });

  it("draws name + need bar only when tags are ON", () => {
    const agent = makeAgent({ id: 7, action: "idle", needs: { food: 20, rest: 90 } });
    drawAgentOverlay(ctx, [agent], {
      viewProj: overheadViewProj(WIDTH, HEIGHT),
      width: WIDTH,
      height: HEIGHT,
      showTags: true,
      selectedAgentId: null,
    });
    // name text drawn
    expect(ctx.fillTexts.length).toBe(1);
    // a bar background + a bar fill = two fillRect calls
    expect(ctx.calls.filter((c) => c === "fillRect")).toHaveLength(2);
  });

  it("draws a selection ring only for the selected agent", () => {
    drawAgentOverlay(ctx, [makeAgent({ id: 3 })], {
      viewProj: overheadViewProj(WIDTH, HEIGHT),
      width: WIDTH,
      height: HEIGHT,
      showTags: false,
      selectedAgentId: 3,
    });
    expect(ctx.calls).toContain("arc");
    expect(ctx.calls).toContain("stroke");
  });

  it("skips an agent whose head projects off-screen (not visible)", () => {
    drawAgentOverlay(ctx, [makeAgent({ headWorld: [1e6, 1e6, 0] })], {
      viewProj: overheadViewProj(WIDTH, HEIGHT),
      width: WIDTH,
      height: HEIGHT,
      showTags: true,
      selectedAgentId: null,
    });
    expect(ctx.fillTexts).toHaveLength(0);
    expect(ctx.calls.filter((c) => c === "fillRect")).toHaveLength(0);
  });
});

describe("createOverlayCanvas / resizeOverlayCanvas", () => {
  it("creates an absolutely-positioned, click-through canvas appended to the container", () => {
    const container = document.createElement("div");
    const canvas = createOverlayCanvas(container);
    expect(container.contains(canvas)).toBe(true);
    expect(canvas.style.position).toBe("absolute");
    expect(canvas.style.pointerEvents).toBe("none");
  });

  it("resizes the backing buffer only when the size actually changes", () => {
    const canvas = document.createElement("canvas");
    expect(resizeOverlayCanvas(canvas, 400, 300, 2)).toBe(true);
    expect(canvas.width).toBe(800);
    expect(canvas.height).toBe(600);
    expect(resizeOverlayCanvas(canvas, 400, 300, 2)).toBe(false);
  });
});
