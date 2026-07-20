/**
 * Determinism check for the Hollow research CLI (chunk hollow-07) — mirrors
 * `tools/run-sim/src/determinism.ts`'s intent (same seed, twice, must be
 * byte-identical) but keeps the SIMPLE in-process double-run the brief
 * asks for, rather than that file's worker-pool version: `run-sim`'s
 * checker spawns worker threads because Farm's default check runs many
 * seeds over many days; Hollow's default check is deliberately tiny (see
 * `index.ts`'s small `MAX_YEARS` for `CHECK_DETERMINISM`), so a sequential
 * double-`runResearch` per seed is both simpler and plenty fast.
 */
import { runResearch, type RunResult } from "./run-core";
import { buildSimOptions } from "./env";

export interface DeterminismCheckOptions {
  seeds: number[];
  ticksPerYear: number;
  maxYears: number;
  personaSeedPath?: string;
}

/** A single JSON string capturing everything that must reproduce
 *  byte-identically: the metrics time series, the full event chronicle,
 *  and the lineage record. */
export function fingerprint(result: RunResult): string {
  return JSON.stringify({
    metricsRows: result.metricsRows,
    events: result.events,
    lineage: result.lineage,
  });
}

export function describeDivergence(a: RunResult, b: RunResult): string {
  const rowCount = Math.max(a.metricsRows.length, b.metricsRows.length);
  for (let i = 0; i < rowCount; i++) {
    const ra = JSON.stringify(a.metricsRows[i] ?? null);
    const rb = JSON.stringify(b.metricsRows[i] ?? null);
    if (ra !== rb) {
      return `first metrics-row divergence at index ${i}:\n  run A: ${ra}\n  run B: ${rb}`;
    }
  }
  const eventCount = Math.max(a.events.length, b.events.length);
  for (let i = 0; i < eventCount; i++) {
    const ea = JSON.stringify(a.events[i] ?? null);
    const eb = JSON.stringify(b.events[i] ?? null);
    if (ea !== eb) {
      return `first event divergence at index ${i}:\n  run A: ${ea}\n  run B: ${eb}`;
    }
  }
  const la = JSON.stringify(a.lineage);
  const lb = JSON.stringify(b.lineage);
  if (la !== lb) {
    return `lineage differs:\n  run A: ${la}\n  run B: ${lb}`;
  }
  return "runs differ but no per-field difference located (length mismatch?)";
}

export function runDeterminismCheck(opts: DeterminismCheckOptions): boolean {
  const { seeds, ticksPerYear, maxYears, personaSeedPath } = opts;
  const personaOpt = personaSeedPath !== undefined ? { personaSeedPath } : {};

  console.error(
    `Determinism check — ${seeds.length} seed(s), ${maxYears} year(s) @ ${ticksPerYear} ticks/year (in-process, sequential)`,
  );

  let anyDiverged = false;
  for (const seed of seeds) {
    const simOptions = buildSimOptions(seed);
    const a = runResearch({ simOptions, ticksPerYear, maxYears, ...personaOpt });
    const b = runResearch({ simOptions, ticksPerYear, maxYears, ...personaOpt });
    const seedHex = `0x${(seed >>> 0).toString(16)}`;

    if (fingerprint(a) === fingerprint(b)) {
      console.error(
        `  seed ${seedHex}: MATCH (${a.metricsRows.length} sample(s), ${a.events.length} event(s), ${a.lineage.length} lineage entrie(s))`,
      );
    } else {
      anyDiverged = true;
      console.error(`  seed ${seedHex}: DIVERGE`);
      console.error(describeDivergence(a, b));
    }
  }

  if (anyDiverged) {
    console.error("DETERMINISM CHECK FAILED — sim is not reproducible for at least one seed.");
    return false;
  }
  console.error("DETERMINISM CHECK PASSED — all seeds reproduced identically.");
  return true;
}
