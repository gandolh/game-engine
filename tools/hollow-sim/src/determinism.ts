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

// `JSON.stringify` collapses Infinity/-Infinity/NaN all to `null` and prints
// `-0` as `0` — so a real float-drift bug that flips a division-derived
// metric between, say, Infinity and -Infinity between two passes fingerprints
// *identically* and the determinism check falsely passes. These sentinels
// make each case a distinct, visible string instead. Mirrors
// `tools/run-sim/src/run-core.ts`'s scheme (see that file's header comment
// for the collision note — a legitimate string equal to one of these exact
// sentinels is re-escaped by `escapeSentinelString` below).
const SENTINEL_NAN = "__NaN";
const SENTINEL_POS_INF = "__Inf";
const SENTINEL_NEG_INF = "__-Inf";
const SENTINEL_NEG_ZERO = "__-0";
const SENTINELS: ReadonlySet<string> = new Set([
  SENTINEL_NAN,
  SENTINEL_POS_INF,
  SENTINEL_NEG_INF,
  SENTINEL_NEG_ZERO,
]);

function escapeSentinelString(value: string): string {
  return SENTINELS.has(value) ? `__esc${value}` : value;
}

function fingerprintReplacer(_key: string, value: unknown): unknown {
  if (typeof value === "number") {
    if (Number.isNaN(value)) return SENTINEL_NAN;
    if (value === Number.POSITIVE_INFINITY) return SENTINEL_POS_INF;
    if (value === Number.NEGATIVE_INFINITY) return SENTINEL_NEG_INF;
    if (Object.is(value, -0)) return SENTINEL_NEG_ZERO;
    return value;
  }
  if (typeof value === "string") return escapeSentinelString(value);
  return value;
}

/** A single JSON string capturing everything that must reproduce
 *  byte-identically: the metrics time series, the full event chronicle,
 *  and the lineage record. */
export function fingerprint(result: RunResult): string {
  return JSON.stringify(
    {
      metricsRows: result.metricsRows,
      events: result.events,
      lineage: result.lineage,
    },
    fingerprintReplacer,
  );
}

/** Same-value comparison for leaf values: unlike `===`, this treats NaN as
 *  equal to itself and -0 as DIFFERENT from 0 — the exact bit-for-bit
 *  reproducibility this tool is meant to enforce. */
function sameLeaf(a: unknown, b: unknown): boolean {
  if (typeof a === "number" && typeof b === "number") return Object.is(a, b);
  return a === b;
}

/** Renders a single leaf value legibly, spelling out non-finite numbers and
 *  -0 by name instead of letting them collapse to "null"/"0". */
function formatLeaf(v: unknown): string {
  if (typeof v === "number") {
    if (Number.isNaN(v)) return "NaN";
    if (v === Number.POSITIVE_INFINITY) return "Infinity";
    if (v === Number.NEGATIVE_INFINITY) return "-Infinity";
    if (Object.is(v, -0)) return "-0";
  }
  return JSON.stringify(v, fingerprintReplacer);
}

/** Recursively walks two same-shaped values and returns a legible
 *  `path: run A = ...\n  run B = ...` report for the first leaf that
 *  differs, or null if they match. */
function findDivergence(a: unknown, b: unknown, path: string): string | null {
  if (sameLeaf(a, b)) return null;

  const aIsObj = typeof a === "object" && a !== null;
  const bIsObj = typeof b === "object" && b !== null;
  if (aIsObj && bIsObj) {
    const aRec = a as Record<string, unknown>;
    const bRec = b as Record<string, unknown>;
    const keys = new Set([...Object.keys(aRec), ...Object.keys(bRec)]);
    const isArray = Array.isArray(a) || Array.isArray(b);
    for (const key of keys) {
      const childPath = isArray ? `${path}[${key}]` : `${path}.${key}`;
      const found = findDivergence(aRec[key], bRec[key], childPath);
      if (found) return found;
    }
    return null;
  }

  return `${path}: run A = ${formatLeaf(a)}\n  run B = ${formatLeaf(b)}`;
}

export function describeDivergence(a: RunResult, b: RunResult): string {
  const rowCount = Math.max(a.metricsRows.length, b.metricsRows.length);
  for (let i = 0; i < rowCount; i++) {
    const found = findDivergence(
      a.metricsRows[i] ?? null,
      b.metricsRows[i] ?? null,
      `metricsRows[${i}]`,
    );
    if (found) return `first metrics-row divergence at ${found}`;
  }
  const eventCount = Math.max(a.events.length, b.events.length);
  for (let i = 0; i < eventCount; i++) {
    const found = findDivergence(a.events[i] ?? null, b.events[i] ?? null, `events[${i}]`);
    if (found) return `first event divergence at ${found}`;
  }
  const found = findDivergence(a.lineage, b.lineage, "lineage");
  if (found) return `lineage differs at ${found}`;
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
