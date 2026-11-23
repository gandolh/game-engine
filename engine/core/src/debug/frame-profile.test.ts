import { describe, expect, it } from "vitest";
import { FrameProfile, PROFILE_SCHEMA, profileRequested } from "./frame-profile";

/** A fake WebGL2 context: prototype methods (as a real one has), an optional timer-query extension. */
function fakeGl(opts: { timerQuery: boolean }) {
  const log = { createQuery: 0, getExtension: [] as string[] };
  const ext = { TIME_ELAPSED_EXT: 1, GPU_DISJOINT_EXT: 2 };
  class FakeContext {
    QUERY_RESULT_AVAILABLE = 3;
    QUERY_RESULT = 4;
    RENDERER = 5;
    VENDOR = 6;
    getExtension(name: string): unknown {
      log.getExtension.push(name);
      return opts.timerQuery && name === "EXT_disjoint_timer_query_webgl2" ? ext : null;
    }
    createQuery(): object {
      log.createQuery += 1;
      return {};
    }
    deleteQuery(): void {}
    beginQuery(): void {}
    endQuery(): void {}
    getQueryParameter(_q: unknown, pname: number): unknown {
      return pname === 3 ? true : 2_000_000;
    }
    getParameter(pname: number): unknown {
      if (pname === 5) return "Fake Renderer";
      if (pname === 6) return "Fake Vendor";
      return false;
    }
    drawArrays(): void {}
    drawElements(): void {}
    drawArraysInstanced(): void {}
    drawElementsInstanced(): void {}
    texImage2D(): void {}
    texSubImage2D(): void {}
    createTexture(): object {
      return {};
    }
  }
  return { gl: new FakeContext() as unknown as WebGL2RenderingContext, log };
}

/** A manual animation-frame scheduler and clock. */
function fakeFrames() {
  let clock = 0;
  const callbacks = new Map<number, FrameRequestCallback>();
  let next = 1;
  return {
    now: () => clock,
    requestFrame: (cb: FrameRequestCallback) => {
      callbacks.set(next, cb);
      return next++;
    },
    cancelFrame: (h: number) => {
      callbacks.delete(h);
    },
    /** Advances the clock and runs the frame callbacks queued so far. */
    step(ms: number): void {
      clock += ms;
      const due = [...callbacks.entries()];
      callbacks.clear();
      for (const [, cb] of due) cb(clock);
    },
    get queued(): number {
      return callbacks.size;
    },
  };
}

describe("FrameProfile, disabled", () => {
  it("creates no timer query, keeps no samples and schedules no frame", () => {
    const { gl, log } = fakeGl({ timerQuery: true });
    const frames = fakeFrames();
    const profile = new FrameProfile({ game: "test", enabled: false, gl, ...frames, heapBytes: () => 1 });
    profile.start();
    for (let i = 0; i < 10; i += 1) {
      profile.beginFrame();
      profile.endFrame({ drawGroups: 3 });
      profile.displayTick(i * 16);
    }
    expect(frames.queued).toBe(0);
    expect(log.createQuery).toBe(0);
    expect(log.getExtension).toEqual([]);
    expect(profile.sampleCount()).toBe(0);
    expect(Object.prototype.hasOwnProperty.call(gl, "drawArrays")).toBe(false);
    const out = profile.exportProfile();
    expect(out.gpu).toBe("unavailable");
    expect(out.heap).toBe("unavailable");
    expect(out.frames.displayTicks).toBe(0);
  });
});

describe("FrameProfile, enabled", () => {
  it("measures display ticks apart from frames drawn", () => {
    const { gl } = fakeGl({ timerQuery: false });
    const frames = fakeFrames();
    const profile = new FrameProfile({ game: "test", enabled: true, gl, ...frames, heapBytes: () => null });
    profile.start();
    // 61 display ticks 16 ms apart, then one long one; two frames drawn per tick (an uncapped loop).
    for (let i = 0; i < 61; i += 1) {
      frames.step(16);
      for (let j = 0; j < 2; j += 1) {
        profile.beginFrame();
        profile.endFrame();
      }
    }
    frames.step(40);
    const out = profile.exportProfile();
    expect(out.schema).toBe(PROFILE_SCHEMA);
    expect(out.frames.displayTicks).toBe(62);
    expect(out.frames.interval.samples).toBe(61);
    expect(out.frames.interval.p50).toBe(16);
    expect(out.frames.interval.over33_3).toBeCloseTo(1 / 61);
    expect(out.frames.drawn.frames).toBe(122);
    expect(out.gpu).toBe("unavailable");
    expect(out.device.renderer).toBe("Fake Renderer");
    profile.dispose();
    expect(frames.queued).toBe(0);
  });

  it("times the GPU when the extension is there", () => {
    const { gl, log } = fakeGl({ timerQuery: true });
    const frames = fakeFrames();
    const profile = new FrameProfile({ game: "test", enabled: true, gl, ...frames, heapBytes: () => null });
    expect(profile.gpuAvailable).toBe(true);
    for (let i = 0; i < 5; i += 1) {
      profile.beginFrame();
      profile.endFrame();
    }
    profile.beginFrame(); // polls the earlier frames
    const out = profile.exportProfile();
    expect(out.gpu).not.toBe("unavailable");
    if (out.gpu === "unavailable") return;
    expect(out.gpu.frames).toBe(5);
    expect(out.gpu.p50).toBe(2);
    expect(log.createQuery).toBeGreaterThan(0);
  });

  it("counts GL calls and the renderer's own counts per frame", () => {
    const { gl } = fakeGl({ timerQuery: false });
    const profile = new FrameProfile({ game: "test", enabled: true, gl, ...fakeFrames(), heapBytes: () => null });
    gl.createTexture();
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, { width: 4, height: 4 } as ImageBitmap);
    for (let i = 0; i < 3; i += 1) {
      profile.beginFrame();
      gl.drawArrays(gl.TRIANGLES, 0, 3);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
      profile.endFrame({ drawGroups: 7, uiQuads: 40 });
    }
    const out = profile.exportProfile();
    expect(out.counters.glDrawCalls?.mean).toBe(2);
    expect(out.counters.drawGroups?.mean).toBe(7);
    expect(out.counters.uiQuads?.p95).toBe(40);
    expect(out.counters.texturesCreated).toBe(1);
    expect(out.counters.textureUploads).toBe(1);
    expect(out.timers["frame"]?.count).toBe(3);
  });

  it("samples the heap once a second and counts the drops", () => {
    const { gl } = fakeGl({ timerQuery: false });
    const frames = fakeFrames();
    const heap = [100, 120, 90, 110];
    let reading = 0;
    const profile = new FrameProfile({
      game: "test",
      enabled: true,
      gl,
      ...frames,
      heapBytes: () => heap[Math.min(reading, heap.length - 1)] ?? null,
    });
    profile.start();
    for (let s = 0; s < 4; s += 1) {
      reading = s;
      frames.step(1000);
    }
    const out = profile.exportProfile();
    expect(out.heap).not.toBe("unavailable");
    if (out.heap === "unavailable") return;
    expect(out.heap.samples.map((h) => h.usedBytes)).toEqual([100, 120, 90, 110]);
    expect(out.heap.drops).toBe(1);
  });

  it("drops every sample on reset", () => {
    const { gl } = fakeGl({ timerQuery: false });
    const frames = fakeFrames();
    const profile = new FrameProfile({ game: "test", enabled: true, gl, ...frames, heapBytes: () => null });
    profile.start();
    for (let i = 0; i < 5; i += 1) {
      frames.step(16);
      profile.beginFrame();
      profile.endFrame();
    }
    profile.reset();
    expect(profile.sampleCount()).toBe(0);
    expect(profile.exportProfile().frames.drawn.frames).toBe(0);
  });
});

describe("profileRequested", () => {
  it("reads ?profile", () => {
    expect(profileRequested("?profile")).toBe(true);
    expect(profileRequested("?seed=3&profile=1")).toBe(true);
    expect(profileRequested("?seed=3")).toBe(false);
  });
});
