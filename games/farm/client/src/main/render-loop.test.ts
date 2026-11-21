import { afterEach, describe, expect, it, vi } from "vitest";
import { animationFrameLoop } from "./render-loop";

/** A fake `requestAnimationFrame`: callbacks wait until `flush(ts)` runs them, as a display refresh does. */
function fakeRaf() {
  let next = 1;
  let queue = new Map<number, (ts: number) => void>();
  return {
    request: (cb: (ts: number) => void): number => {
      const handle = next;
      next += 1;
      queue.set(handle, cb);
      return handle;
    },
    cancel: (handle: number): void => {
      queue.delete(handle);
    },
    /** Runs the callbacks requested before this refresh; ones they request wait for the next. */
    flush: (ts: number): void => {
      const due = queue;
      queue = new Map();
      for (const cb of due.values()) cb(ts);
    },
    pending: (): number => queue.size,
  };
}

afterEach(() => {
  vi.useRealTimers();
});

describe("animationFrameLoop", () => {
  it("draws exactly one frame per callback, with its timestamp, and none between callbacks", () => {
    vi.useFakeTimers();
    const raf = fakeRaf();
    const drawn: number[] = [];
    const loop = animationFrameLoop((ts) => drawn.push(ts), raf.request, raf.cancel);
    loop.start();
    expect(drawn).toEqual([]);
    for (let i = 1; i <= 5; i += 1) {
      raf.flush(i * 16.7);
      expect(drawn).toHaveLength(i);
      // Between two refreshes nothing else draws: no timer, no microtask.
      vi.advanceTimersByTime(16);
      vi.runAllTimers();
      expect(drawn).toHaveLength(i);
      expect(raf.pending()).toBe(1);
    }
    expect(drawn).toEqual([1, 2, 3, 4, 5].map((i) => i * 16.7));
  });

  it("runs one loop however many times it is started", () => {
    const raf = fakeRaf();
    let frames = 0;
    const loop = animationFrameLoop(() => (frames += 1), raf.request, raf.cancel);
    loop.start();
    loop.start();
    raf.flush(16);
    expect(frames).toBe(1);
    expect(raf.pending()).toBe(1);
  });

  it("stops: the pending frame is cancelled, and a frame that stops the loop requests no other", () => {
    const raf = fakeRaf();
    let frames = 0;
    const loop = animationFrameLoop(() => (frames += 1), raf.request, raf.cancel);
    loop.start();
    raf.flush(16);
    loop.stop();
    expect(loop.running).toBe(false);
    expect(raf.pending()).toBe(0);
    raf.flush(32);
    expect(frames).toBe(1);

    const selfStopping = animationFrameLoop(() => selfStopping.stop(), raf.request, raf.cancel);
    selfStopping.start();
    raf.flush(48);
    expect(raf.pending()).toBe(0);
  });
});
