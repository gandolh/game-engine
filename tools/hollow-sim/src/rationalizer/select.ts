// Chooses the rationalizer a CLI run uses, and owns the cache's file I/O.
//
// `@hollow/sim-core` is deliberately node:fs-free (it also runs in a browser
// Worker), so the record/replay cache serialises to a plain JSON value and the
// reading and writing of that value lives here — the same split as every other
// artifact this tool exports.
//
// OFF is the default and means the seam is never constructed at all, so a
// normal `npm run sim:hollow` stays byte-deterministic (hollow-13).

import { readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { mkdirSync } from "node:fs";
import {
  createStubRationalizer,
  createRecordingRationalizer,
  createReplayingRationalizer,
  type Rationalizer,
  type RationalizerCacheData,
} from "@hollow/sim-core/rationalize";
import { createClaudeRationalizerFromEnv } from "./claude-rationalizer";

export interface SelectRationalizerEnv {
  readonly kind: string;
  readonly model: string | undefined;
  readonly cachePath: string | undefined;
  readonly cacheMode: string;
}

export interface SelectedRationalizer {
  /** `null` means the seam stays OFF — the sim is untouched. */
  readonly rationalizer: Rationalizer | null;
  /** Called after the run; writes the recording when in record mode. */
  readonly finish: () => void;
  /** One line for the run summary, or null when the seam is off. */
  readonly note: string | null;
}

const OFF: SelectedRationalizer = { rationalizer: null, finish: () => {}, note: null };

function readCache(path: string): RationalizerCacheData {
  return JSON.parse(readFileSync(path, "utf8")) as RationalizerCacheData;
}

/**
 * Resolve the seam from env. Never throws for an ordinary misconfiguration —
 * a research run that cannot reach a provider should fall back to the BDI
 * substrate and SAY so, not die.
 */
export function selectRationalizer(env: SelectRationalizerEnv): SelectedRationalizer {
  // Replay first: it answers from a recording and must never construct a
  // provider (that is the whole point of deterministic replay).
  if (env.cachePath !== undefined && env.cacheMode === "replay") {
    const replay = createReplayingRationalizer(readCache(env.cachePath), { name: "replay" });
    return {
      rationalizer: replay,
      finish: () => {
        if (replay.missCount > 0) {
          console.warn(
            `WARNING: ${replay.missCount} cache miss(es) during replay — those decisions fell back to the BDI default, so this run is NOT a faithful replay. Missing keys: ${replay.missedKeys.slice(0, 3).join(", ")}${replay.missedKeys.length > 3 ? " …" : ""}`,
          );
        }
      },
      note: `replay from ${env.cachePath}`,
    };
  }

  let base: Rationalizer | null;
  if (env.kind === "stub") {
    base = createStubRationalizer();
  } else if (env.kind === "contrarian") {
    // Diagnostic provider: always picks a candidate OTHER than the BDI
    // default, so the adoption path — the only path where the seam actually
    // changes the world — can be exercised end-to-end without spending money
    // on a live provider. `stub` agrees by construction, so a stub run is
    // byte-identical to seam OFF and proves only that nothing broke; `claude`
    // costs real money. Neither can show adoption working in a CLI run.
    // Not a research profile: the choice is arbitrary, not reasoned.
    base = createStubRationalizer({
      name: "contrarian",
      respond: (req) => ({
        choiceIndex: req.candidates.length > 1 ? (req.bdiChoiceIndex + 1) % req.candidates.length : req.bdiChoiceIndex,
        rationale: "diagnostic: deliberately not the substrate's default",
      }),
    });
  } else if (env.kind === "claude") {
    base = createClaudeRationalizerFromEnv({
      ...(env.model !== undefined ? { model: env.model } : {}),
    });
    if (base === null) {
      console.warn(
        "WARNING: RATIONALIZER=claude but no ANTHROPIC_API_KEY is set — the seam stays OFF and the run uses the BDI substrate alone.",
      );
      return OFF;
    }
  } else {
    return OFF;
  }

  if (env.cachePath === undefined) {
    return { rationalizer: base, finish: () => {}, note: base.name };
  }

  const recorder = createRecordingRationalizer(base);
  const path = env.cachePath;
  return {
    rationalizer: recorder,
    finish: () => {
      mkdirSync(dirname(path), { recursive: true });
      writeFileSync(path, `${JSON.stringify(recorder.snapshot(), null, 2)}\n`);
      console.log(`wrote rationalizer cache to ${path} (replay with RATIONALIZER_CACHE_MODE=replay)`);
    },
    note: `${base.name} (recording to ${path})`,
  };
}
