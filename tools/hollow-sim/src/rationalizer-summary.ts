/**
 * The rationalizer seam's own adoption rate, computed from the chronicle
 * (hollow-16).
 *
 * WHY THIS EXISTS. hollow-13 shipped a seam that is architecturally correct
 * and unit-provably live, and it is very easy to read that as "an LLM is
 * steering this town". It is not. Most consultations are REJECTED: by the time
 * an answer lands (~40 ticks — one `SOCIAL_COOLDOWN_TICKS`), the specific peer
 * the model chose is usually no longer in the agent's candidate set, so the
 * answer is correctly refused as `stale-candidates` and the BDI default runs.
 *
 * Measured over four seeds at 1500 ticks with the `contrarian` diagnostic
 * provider (which disagrees with the substrate on every single decision, so it
 * is the UPPER bound on how often the seam can possibly change anything):
 * **52 consultations, 6 adopted (11.5%), 43 rejected — every one of the 43 for
 * `stale-candidates`.** In all 43 the chosen peer was gone; in 33 of them the
 * same VERB was still available against a DIFFERENT peer, which is exactly
 * what a kind-only identity relaxation would have adopted, and exactly why the
 * seam refuses to (see corpus/wiki/decisions.md → Hollow).
 *
 * So the rate is PRINTED, not documented. A figure in a wiki page drifts from
 * the code that produces it; a figure every run prints cannot. It is computed
 * from the chronicle rather than from the seam deliberately — these are the
 * exact rows `events.jsonl` carries, so the printed summary and the exported
 * data can never disagree.
 */
import { ONT_RATIONALIZE } from "@hollow/sim-core/observe";
import type { ChronicleEvent, RationalizeDecisionBody } from "@hollow/sim-core/observe";

export interface RationalizerRunSummary {
  readonly consultations: number;
  readonly adopted: number;
  readonly keptDefault: number;
  readonly declined: number;
  readonly rejected: number;
  /** Rejection reason → count, descending by count then name (stable output). */
  readonly reasons: readonly (readonly [string, number])[];
  /** Median, not mean: one expired request would drag a mean and misrepresent
   *  the typical wait, which is what the social cooldown pins. */
  readonly medianLagTicks: number;
  /** `adopted / consultations` as a percentage. 0 when there were none. */
  readonly adoptionPct: number;
}

/**
 * `null` when the run used no seam at all — the caller prints nothing, so a
 * `RATIONALIZER=off` run's summary is byte-identical to one from before this
 * block existed.
 */
export function summarizeRationalizerDecisions(
  events: readonly ChronicleEvent[],
): RationalizerRunSummary | null {
  // `ChronicleEvent` is FLAT (an index signature, no `body` wrapper) — a
  // decision's fields sit directly on the event, which is also exactly how
  // they serialize into events.jsonl.
  const rows = events.filter(
    (e) => e.ontology === ONT_RATIONALIZE.DECISION,
  ) as readonly unknown[] as readonly RationalizeDecisionBody[];
  if (rows.length === 0) return null;

  const count = (outcome: string): number => rows.filter((r) => r.outcome === outcome).length;

  const lags = rows.map((r) => r.tick - r.requestTick).sort((a, b) => a - b);
  const medianLagTicks = lags[lags.length >> 1] ?? 0;

  const byReason = new Map<string, number>();
  for (const r of rows) {
    if (r.outcome === "rejected" && r.reason !== null) {
      byReason.set(r.reason, (byReason.get(r.reason) ?? 0) + 1);
    }
  }

  const adopted = count("adopted");
  return {
    consultations: rows.length,
    adopted,
    keptDefault: count("kept-default"),
    declined: count("declined"),
    rejected: count("rejected"),
    reasons: [...byReason.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])),
    medianLagTicks,
    adoptionPct: (adopted / rows.length) * 100,
  };
}

/** The printed block, as lines. Returned rather than logged so it is testable
 *  and so the caller owns all console output. */
export function formatRationalizerSummary(s: RationalizerRunSummary): readonly string[] {
  const reasonText = s.reasons.map(([r, n]) => `${r} ${String(n)}`).join(", ");
  const lines = [
    `  rationalizer — ${String(s.consultations)} consultation(s), ${String(s.adopted)} adopted (${s.adoptionPct.toFixed(1)}%)`,
    `    kept-default ${String(s.keptDefault)}, declined ${String(s.declined)}, rejected ${String(s.rejected)}` +
      (reasonText === "" ? "" : ` (${reasonText})`),
    `    median answer-lag: ${String(s.medianLagTicks)} tick(s)`,
  ];
  // The line that would have prevented hollow-16's original mis-reading: a run
  // with zero adoptions is not evidence the seam is broken, it is a run whose
  // world is by definition the seam-OFF world.
  if (s.adopted === 0) {
    lines.push("    NOTE: 0 adopted — this run's world is identical to RATIONALIZER=off.");
  }
  return lines;
}
