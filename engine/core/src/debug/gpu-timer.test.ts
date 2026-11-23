import { describe, expect, it } from "vitest";
import { GpuTimer, TIMER_QUERY_EXTENSION, type TimerQueryGl } from "./gpu-timer";

interface FakeQuery {
  id: number;
  ns: number;
  available: boolean;
}

/** A fake WebGL2 context with a scriptable timer-query extension. */
function fakeGl(opts: { extension: boolean }) {
  const queries: FakeQuery[] = [];
  const state = { disjoint: false, created: 0, deleted: 0, began: 0, ended: 0, nextNs: 4_000_000 };
  const ext = { TIME_ELAPSED_EXT: 0x88bf, GPU_DISJOINT_EXT: 0x8fbb };
  const gl: TimerQueryGl = {
    QUERY_RESULT_AVAILABLE: 0x8867,
    QUERY_RESULT: 0x8866,
    getExtension: (name: string) => (opts.extension && name === TIMER_QUERY_EXTENSION ? ext : null),
    createQuery: () => {
      const q: FakeQuery = { id: state.created, ns: 0, available: false };
      state.created += 1;
      queries.push(q);
      return q;
    },
    deleteQuery: () => {
      state.deleted += 1;
    },
    beginQuery: (_target: number, query: WebGLQuery) => {
      state.began += 1;
      const q = query as unknown as FakeQuery;
      q.available = false;
      q.ns = state.nextNs;
    },
    endQuery: () => {
      state.ended += 1;
    },
    getQueryParameter: (query: WebGLQuery, pname: number) => {
      const q = query as unknown as FakeQuery;
      return pname === 0x8867 ? q.available : q.ns;
    },
    getParameter: (pname: number) => (pname === ext.GPU_DISJOINT_EXT ? state.disjoint : null),
  };
  /** The GPU finishes every query issued so far. */
  const finishAll = (): void => {
    for (const q of queries) q.available = true;
  };
  return { gl, state, finishAll };
}

describe("GpuTimer", () => {
  it("is unavailable without the extension, and creates no query", () => {
    const { gl, state } = fakeGl({ extension: false });
    expect(GpuTimer.probe(gl)).toBeNull();
    expect(state.created).toBe(0);
  });

  it("reads a frame's time once the GPU has it, without waiting", () => {
    const { gl, state, finishAll } = fakeGl({ extension: true });
    const timer = GpuTimer.probe(gl);
    expect(timer).not.toBeNull();
    if (timer === null) return;
    timer.begin();
    timer.end();
    timer.poll(); // not available yet: nothing read, nothing blocks
    expect(timer.take()).toEqual([]);
    finishAll();
    timer.poll();
    expect(timer.take()).toEqual([4]); // 4,000,000 ns
    expect(state.began).toBe(1);
    expect(state.ended).toBe(1);
  });

  it("drops results in flight when the GPU reports a disjoint event", () => {
    const { gl, state, finishAll } = fakeGl({ extension: true });
    const timer = GpuTimer.probe(gl);
    if (timer === null) throw new Error("expected a timer");
    timer.begin();
    timer.end();
    timer.begin();
    timer.end();
    finishAll();
    state.disjoint = true;
    timer.poll();
    expect(timer.take()).toEqual([]);
    expect(timer.dropped).toBe(2);
    // The next frames are timed again.
    state.disjoint = false;
    timer.begin();
    timer.end();
    finishAll();
    timer.poll();
    expect(timer.take()).toEqual([4]);
  });

  it("reuses queries and never reads the one still recording", () => {
    const { gl, state, finishAll } = fakeGl({ extension: true });
    const timer = GpuTimer.probe(gl);
    if (timer === null) throw new Error("expected a timer");
    for (let i = 0; i < 5; i += 1) {
      timer.poll();
      timer.begin();
      finishAll();
      timer.end();
    }
    timer.poll();
    expect(timer.take()).toHaveLength(5);
    expect(state.created).toBeLessThanOrEqual(2);
    timer.dispose();
    expect(state.deleted).toBe(state.created);
  });

  it("skips timing rather than queueing when the GPU falls far behind", () => {
    const { gl } = fakeGl({ extension: true });
    const timer = GpuTimer.probe(gl);
    if (timer === null) throw new Error("expected a timer");
    for (let i = 0; i < 12; i += 1) {
      timer.begin();
      timer.end();
      timer.poll();
    }
    expect(timer.skipped).toBe(4);
  });
});
