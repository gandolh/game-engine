/**
 * The prompt-keyed response cache (chunk hollow-13) — the seam's DETERMINISM
 * story once a real provider is switched on: "a recorded run stores each
 * (prompt -> response); replaying with the cache reproduces the run exactly"
 * (the spec's Determinism section).
 *
 * This is a DECORATOR over `Rationalizer` (types.ts), not a change to the
 * interface — `RationalizerSeam` (seam.ts) and a real provider (chunk 4) are
 * built against `submit`/`poll` alone and need not know a cache sits in
 * front of (recording) or in place of (replaying) the thing they talk to.
 *
 * Two modes, one key derivation:
 *  - `createRecordingRationalizer(wrapped)` is a transparent pass-through: it
 *    forwards every `submit`/`poll` to `wrapped` unchanged and additionally
 *    remembers each (key -> raw response|error) pair as it is polled.
 *    `.snapshot()` returns the recording as plain, JSON-safe data — writing
 *    it to disk is the CLI's job (this package stays `node:fs`-free).
 *  - `createReplayingRationalizer(data)` NEVER calls a wrapped provider (it
 *    has none) — it answers every `submit` out of the recording alone, on
 *    the very next `poll()` (matching `stub.ts`'s sync-next-tick timing, so
 *    swapping a live+cache pair for a bare replay changes nothing about WHEN
 *    an answer lands, only what it says). A key with nothing left queued is
 *    an explicit, safe MISS: it resolves immediately with a
 *    `RationalizerResult.error`, which `validate.ts` already treats as
 *    `provider-error` — the seam falls back to the BDI default. It never
 *    throws and never invents an answer.
 *
 * ── the cache key ──────────────────────────────────────────────────────────
 * `deriveCacheKey` is a pure function of the DECISION — everything a prompt
 * built from this request would actually say — and deliberately excludes two
 * fields that ARE on `RationalizerRequest` but are not decision content:
 *
 *  - `tick` — WHEN the request was issued, not what it is about. Two
 *    requests with identical genome/needs/beliefs/relationships/candidates
 *    are the same question whether they land 5 ticks or 5000 ticks apart; a
 *    live model given the same prompt twice should be treated as answering
 *    the same prompt twice, not two different ones. Keying on tick would
 *    also mean nearly every request gets its own bucket (ticks essentially
 *    never repeat for one agent), which defeats "prompt-keyed" entirely and
 *    degenerates into keying on iteration order by another name — exactly
 *    what this cache was told not to do.
 *  - `agentId` — an identity LABEL, not decision content, and not needed for
 *    correctness: a polled `RationalizerResult` always carries the harness's
 *    own echoed `request` object (types.ts's contract), so which agent a
 *    cached answer gets applied to is decided by that echo, never by the
 *    cache key. Excluding it means two agents facing a byte-identical
 *    situation (same genome, needs, beliefs, relationships, candidates,
 *    standing, BDI default) are treated as the same prompt — the correct
 *    behavior for a cache keyed on PROMPT CONTENT rather than on who asked.
 *
 * Excluding both raises one question: what happens when the SAME key is
 * submitted more than once in a run (the same agent facing a recurring
 * situation, or two different agents colliding on identical content)? A
 * single scalar cached answer per key would silently misattribute a later
 * recording to an earlier occurrence (or vice versa) whenever a live,
 * non-deterministic provider gave two different real answers to what looks
 * like the same prompt. So a cache entry is a FIFO QUEUE of responses, not
 * one response: recording pushes, replay shifts. Because the underlying sim
 * is otherwise deterministic and a successful replay reproduces the exact
 * world trajectory the recording took, the Nth time a given key is submitted
 * is the Nth time in BOTH runs — across the whole population, not just
 * per-agent, since `submit` calls happen in the sim's fixed per-tick agent
 * order — so FIFO consumption lines up exactly without needing tick or
 * agentId in the key at all. This is content-scoped ordering, not the
 * iteration-order key the spec warns against: two requests only share a
 * queue when their DECISION CONTENT is identical.
 *
 * ── serialisation ──────────────────────────────────────────────────────────
 * `RationalizerCacheData` is plain JSON-able data (a version tag plus
 * string-keyed arrays of `{ response, error? }`). `snapshot()` produces it,
 * `createReplayingRationalizer` consumes it, and both round-trip cleanly
 * through `JSON.parse(JSON.stringify(...))` — this file never touches
 * `node:fs`; the CLI (chunk 4) owns reading/writing the file.
 */
import type { Rationalizer, RationalizerRequest, RationalizerResult } from "./types";
import { candidateFingerprint } from "./validate";

/** One recorded answer (or provider-level failure) for one cache key. */
export interface RationalizerCacheEntry {
  readonly response: unknown;
  readonly error?: string | undefined;
}

/** The whole recording, as plain JSON-safe data. `entries` maps a
 *  `deriveCacheKey` digest to the FIFO queue of answers recorded under it,
 *  oldest first. */
export interface RationalizerCacheData {
  readonly version: 1;
  readonly entries: Readonly<Record<string, readonly RationalizerCacheEntry[]>>;
}

/** Prefix on every miss's `RationalizerResult.error`, so a caller (or a test)
 *  can recognize a replay-cache miss specifically, as opposed to a genuine
 *  recorded provider failure. */
export const CACHE_MISS_ERROR_PREFIX = "rationalizer-cache-miss:";

/** `true` for a `RationalizerResult.error` produced by a replay miss. */
export function isCacheMissError(error: string | undefined): boolean {
  return error !== undefined && error.startsWith(CACHE_MISS_ERROR_PREFIX);
}

/** Deterministic stringify: object keys sorted recursively so the key never
 *  depends on incidental insertion order. `undefined` and `null` both fold to
 *  `"null"` — a harmless conflation for a cache key (neither carries decision
 *  information), and cheaper than a bespoke sentinel. */
function stableStringify(value: unknown): string {
  if (value === undefined) return "null";
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map((v) => stableStringify(v)).join(",")}]`;
  const obj = value as Readonly<Record<string, unknown>>;
  const keys = Object.keys(obj).sort();
  return `{${keys.map((k) => `${JSON.stringify(k)}:${stableStringify(obj[k])}`).join(",")}}`;
}

/**
 * The cache key: a deterministic digest of everything about `request` that a
 * prompt built from it would actually say, EXCLUDING `tick` and `agentId` —
 * see this file's header for why. `candidateFingerprint` (validate.ts) is
 * reused for the candidates component; `request.candidates` structurally
 * satisfies its `ScoredChoice[]` parameter (score/kind/data), so no mapping
 * is needed.
 */
export function deriveCacheKey(request: RationalizerRequest): string {
  return stableStringify({
    candidates: candidateFingerprint(request.candidates),
    bdiChoiceIndex: request.bdiChoiceIndex,
    genome: request.genome,
    beliefs: request.beliefs,
    needs: request.needs,
    relationships: request.relationships,
    standing: request.standing,
  });
}

/**
 * Wraps `wrapped` so every polled (request -> response) pair is remembered
 * under `deriveCacheKey(request)`, in arrival order. Pure pass-through
 * otherwise: `submit`/`poll` behavior, timing and return values are
 * `wrapped`'s, unchanged — recording must never itself change a run.
 */
export function createRecordingRationalizer(wrapped: Rationalizer): Rationalizer & { snapshot(): RationalizerCacheData } {
  const entries = new Map<string, RationalizerCacheEntry[]>();

  return {
    name: wrapped.name,
    submit(request: RationalizerRequest): void {
      wrapped.submit(request);
    },
    poll(): readonly RationalizerResult[] {
      const results = wrapped.poll();
      for (const result of results) {
        const key = deriveCacheKey(result.request);
        const entry: RationalizerCacheEntry =
          result.error !== undefined ? { response: result.response, error: result.error } : { response: result.response };
        const bucket = entries.get(key);
        if (bucket) bucket.push(entry);
        else entries.set(key, [entry]);
      }
      return results;
    },
    snapshot(): RationalizerCacheData {
      const out: Record<string, readonly RationalizerCacheEntry[]> = {};
      // `Map` iteration order is insertion order for one recording run, but
      // that is never load-bearing here: `entries` is a plain object keyed by
      // the SAME digest a replay looks up by, so the order JSON happens to
      // print keys in never affects which bucket an answer comes from.
      for (const [key, bucket] of entries) out[key] = bucket.slice();
      return { version: 1, entries: out };
    },
  };
}

/**
 * A `Rationalizer` that answers purely from a prior `snapshot()` (round-
 * tripped through JSON or not) and never calls anything else — there IS no
 * wrapped provider to call. `submit` resolves immediately by pushing straight
 * into the mailbox, exactly like `stub.ts`'s default behavior, so `poll()` on
 * the very next tick returns it: replacing a live+cache pair with a bare
 * replay changes nothing about WHEN an answer lands, only what it says.
 */
export function createReplayingRationalizer(
  data: RationalizerCacheData,
  opts: { readonly name?: string } = {},
): Rationalizer & { readonly missCount: number; readonly missedKeys: readonly string[] } {
  // Mutable per-key queues, copied out of the (possibly frozen/shared) input
  // so consuming an entry never mutates the caller's `data`.
  const queues = new Map<string, RationalizerCacheEntry[]>();
  for (const [key, bucket] of Object.entries(data.entries)) queues.set(key, bucket.slice());

  let mailbox: RationalizerResult[] = [];
  let missCount = 0;
  const missedKeys: string[] = [];

  return {
    name: opts.name ?? "replay",
    submit(request: RationalizerRequest): void {
      const key = deriveCacheKey(request);
      const entry = queues.get(key)?.shift();
      if (entry !== undefined) {
        mailbox.push(
          entry.error !== undefined
            ? { request, response: entry.response, error: entry.error }
            : { request, response: entry.response },
        );
        return;
      }
      // Explicit, safe miss: reported as a provider-level error so
      // `validate.ts` rejects it as `provider-error` and the seam keeps the
      // BDI default. Never invents a response, never throws.
      missCount++;
      missedKeys.push(key);
      mailbox.push({
        request,
        response: null,
        error: `${CACHE_MISS_ERROR_PREFIX} no recorded response for this decision`,
      });
    },
    poll(): readonly RationalizerResult[] {
      const batch = mailbox;
      mailbox = [];
      return batch;
    },
    get missCount(): number {
      return missCount;
    },
    get missedKeys(): readonly string[] {
      return missedKeys.slice();
    },
  };
}
