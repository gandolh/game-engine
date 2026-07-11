/**
 * Generic, game-agnostic envelope for a headless run report — the JSON a
 * headless tool emits so a human or an LLM can read how a run went without
 * parsing console prose. Observer-only by contract: a report is built FROM
 * snapshots and event feeds after ticks run; it is never an input to a tick,
 * so emitting one cannot move a determinism baseline.
 */
export interface RunReportEvent {
  readonly tick: number;
  readonly day: number;
  readonly text: string;
}

export interface RunReportEventLog {
  /** Total events observed over the run (before truncation). */
  readonly total: number;
  /**
   * Events known to have been dropped because the source feed is a capped
   * tail and was sampled too coarsely. 0 means the log is complete.
   */
  readonly missed: number;
  /** Retained entries. If truncated, the head+tail split (oldest kept first). */
  readonly entries: readonly RunReportEvent[];
  readonly truncated: boolean;
}

/** Cap policy shared by both games: if a run produces more than this many
 *  events, keep the first RUN_REPORT_EVENT_HEAD and the most recent remainder. */
export const RUN_REPORT_EVENT_CAP = 400;
export const RUN_REPORT_EVENT_HEAD = 100;

export interface RunReportMeta {
  readonly game: string; // "farm-valley" | "citadel"
  readonly scenario?: string;
  readonly seed: number;
  readonly worldSeed?: number;
  readonly ticksPerDay: number;
  readonly daysSimulated: number;
}

export interface RunReport<TDay, TEnd> {
  readonly meta: RunReportMeta;
  /** Compact per-day aggregates — NOT full detail; that lives in endState once. */
  readonly timeline: readonly TDay[];
  readonly events: RunReportEventLog;
  readonly endState: TEnd;
  readonly outcome: { readonly gameOver: boolean; readonly note?: string };
}

/** Apply the shared cap policy. Pure. */
export function capReportEvents(all: readonly RunReportEvent[]): RunReportEventLog {
  const total = all.length;
  if (total <= RUN_REPORT_EVENT_CAP) {
    return { total, missed: 0, entries: all.slice(), truncated: false };
  }
  const head = all.slice(0, RUN_REPORT_EVENT_HEAD);
  const tailCount = RUN_REPORT_EVENT_CAP - RUN_REPORT_EVENT_HEAD;
  const tail = tailCount > 0 ? all.slice(total - tailCount) : [];
  return { total, missed: 0, entries: [...head, ...tail], truncated: true };
}
