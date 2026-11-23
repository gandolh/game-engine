/**
 * GPU frame time from `EXT_disjoint_timer_query_webgl2` (corpus brief 05).
 *
 * The CPU `frame` timer stops when the game's JavaScript returns, but the GPU keeps drawing after that:
 * the 2026-06-11 profile lost about 10 ms a frame to that gap. A `TIME_ELAPSED_EXT` query around each
 * frame's draw measures the GPU's own time.
 *
 * Results arrive a few frames late. `poll()` reads only the queries whose result is available, in the
 * order they were issued, and never waits. When the GPU reports a disjoint event (a clock change or a
 * context switch), the results in flight are not trustworthy and are dropped.
 *
 * Browsers that do not expose the extension (Firefox and Safari by default, every software rasteriser)
 * get `null` from `GpuTimer.probe`, and the export says `gpu: "unavailable"`.
 */

/** The parts of `EXT_disjoint_timer_query_webgl2` this uses. */
export interface TimerQueryExt {
  readonly TIME_ELAPSED_EXT: number;
  readonly GPU_DISJOINT_EXT: number;
}

/** The parts of a WebGL2 context this uses, so a test can pass a fake. */
export interface TimerQueryGl {
  readonly QUERY_RESULT_AVAILABLE: number;
  readonly QUERY_RESULT: number;
  getExtension(name: string): unknown;
  createQuery(): WebGLQuery | null;
  deleteQuery(query: WebGLQuery | null): void;
  beginQuery(target: number, query: WebGLQuery): void;
  endQuery(target: number): void;
  getQueryParameter(query: WebGLQuery, pname: number): unknown;
  getParameter(pname: number): unknown;
}

export const TIMER_QUERY_EXTENSION = "EXT_disjoint_timer_query_webgl2";

/** Queries in flight at most. A GPU that falls this far behind skips timing frames rather than queueing. */
const MAX_PENDING = 8;

export class GpuTimer {
  /** Frame times in milliseconds, read so far and not yet taken by the caller. */
  private readonly results: number[] = [];
  private readonly pending: WebGLQuery[] = [];
  private readonly spare: WebGLQuery[] = [];
  private active = false;
  /** Results thrown away because a disjoint event made them untrustworthy. */
  dropped = 0;
  /** Frames not timed because too many queries were in flight. */
  skipped = 0;

  private readonly gl: TimerQueryGl;
  private readonly ext: TimerQueryExt;

  private constructor(gl: TimerQueryGl, ext: TimerQueryExt) {
    this.gl = gl;
    this.ext = ext;
  }

  /** A timer when the context exposes the extension, otherwise `null`. Creates no query until `begin()`. */
  static probe(gl: TimerQueryGl): GpuTimer | null {
    const ext = gl.getExtension(TIMER_QUERY_EXTENSION) as TimerQueryExt | null;
    if (ext === null || ext === undefined) return null;
    return new GpuTimer(gl, ext);
  }

  /** Starts timing a frame's GPU work. Call once per frame, before the first draw. */
  begin(): void {
    if (this.active) return;
    if (this.pending.length >= MAX_PENDING) {
      this.skipped += 1;
      return;
    }
    const query = this.spare.pop() ?? this.gl.createQuery();
    if (query === null) return;
    this.gl.beginQuery(this.ext.TIME_ELAPSED_EXT, query);
    this.pending.push(query);
    this.active = true;
  }

  /** Ends the frame's query. A frame `begin()` skipped ends nothing. */
  end(): void {
    if (!this.active) return;
    this.gl.endQuery(this.ext.TIME_ELAPSED_EXT);
    this.active = false;
  }

  /** Reads every query whose result is ready, oldest first, without waiting for the rest. */
  poll(): void {
    const disjoint = Boolean(this.gl.getParameter(this.ext.GPU_DISJOINT_EXT));
    // The query still being recorded is the last one; it can't be read yet.
    const readable = this.active ? this.pending.length - 1 : this.pending.length;
    let done = 0;
    for (; done < readable; done += 1) {
      const query = this.pending[done];
      if (query === undefined) break;
      if (!disjoint && !this.gl.getQueryParameter(query, this.gl.QUERY_RESULT_AVAILABLE)) break;
      if (disjoint) {
        this.dropped += 1;
      } else {
        const ns = Number(this.gl.getQueryParameter(query, this.gl.QUERY_RESULT));
        this.results.push(ns / 1e6);
      }
      this.spare.push(query);
    }
    if (done > 0) this.pending.splice(0, done);
  }

  /** The frame times read since the last call, in milliseconds. */
  take(): number[] {
    return this.results.splice(0, this.results.length);
  }

  /** Deletes every query this timer created. */
  dispose(): void {
    if (this.active) this.end();
    for (const q of this.pending) this.gl.deleteQuery(q);
    for (const q of this.spare) this.gl.deleteQuery(q);
    this.pending.length = 0;
    this.spare.length = 0;
  }
}
