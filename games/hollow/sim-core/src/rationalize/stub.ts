/**
 * The STUB rationalizer (chunk hollow-13) — the test default, and the only
 * implementation that lives inside `@hollow/sim-core`.
 *
 * It is deliberately boring: it echoes the BDI default back with a templated
 * rationale. That makes it (a) a real exercise of the whole seam — request
 * built, submitted, polled a tick later, validated, adopted — while (b)
 * changing not one decision, so "seam ON with the stub" can be asserted
 * against "seam OFF" directly. CI needs no network and no key.
 *
 * ── why the real provider is NOT here ─────────────────────────────────────
 * `@hollow/sim-core` must stay free of HTTP/SDK dependencies (CLAUDE.md
 * layering: the sim core runs headless, in a Worker, and under vitest). A
 * Claude-backed provider is a `Rationalizer` implementation like any other
 * and belongs in the CLI, behind a flag + key.
 *
 * ── determinism ───────────────────────────────────────────────────────────
 * No `Rng`, no clock, no `Math.random`. `submit` appends to a plain array;
 * `poll` returns that array and clears it. So a request issued during tick
 * T's DELIBERATE stage is delivered on tick T+1's drain, every run, every
 * seed — the delay is structural, not timing-dependent.
 */
import type { Rationalizer, RationalizerRequest, RationalizerResult } from "./types";

/**
 * Builds the stub's default rationale: a fixed template over facts the
 * request already carries. Pure and deterministic — same request, same
 * string.
 */
export function stubRationale(request: RationalizerRequest): string {
  const chosen = request.candidates[request.bdiChoiceIndex];
  const kind = chosen ? chosen.kind : "nothing";
  const score = chosen ? chosen.score.toFixed(3) : "0.000";
  return `agent ${request.agentId} at tick ${request.tick}: keeping the substrate's ${kind} (score ${score}) out of ${request.candidates.length} feasible option(s)`;
}

export interface StubRationalizerOptions {
  /**
   * Overrides what the stub answers with. The return value is fed to the
   * seam as RAW, UNVALIDATED output — which is exactly the point: this is
   * the injection seam the anchoring tests use to return an out-of-range
   * index, a fractional index, a wrong-shaped body, or prose, and assert the
   * sim falls back to the BDI default. It is typed `unknown` so an illegal
   * answer needs no cast to express.
   *
   * Must stay a pure function of the request (no `Rng`, no clock) or the run
   * stops being reproducible.
   */
  readonly respond?: (request: RationalizerRequest) => unknown;
  /**
   * Reports a PROVIDER-level failure for this request (timeout, transport)
   * instead of an answer. Returning a string here makes the seam take the
   * `provider-error` rejection path.
   */
  readonly failWith?: (request: RationalizerRequest) => string | null;
  /** Name carried into the chronicle. Defaults to `"stub"`. */
  readonly name?: string;
}

/**
 * Creates the offline stub. With no options it answers every request with
 * `{ choiceIndex: request.bdiChoiceIndex, rationale: stubRationale(request) }`
 * — i.e. it agrees with the substrate, always.
 */
export function createStubRationalizer(opts: StubRationalizerOptions = {}): Rationalizer {
  const respond = opts.respond ?? ((request: RationalizerRequest) => ({
    choiceIndex: request.bdiChoiceIndex,
    rationale: stubRationale(request),
  }));
  let mailbox: RationalizerResult[] = [];

  return {
    name: opts.name ?? "stub",
    submit(request: RationalizerRequest): void {
      const failure = opts.failWith?.(request) ?? null;
      mailbox.push(
        failure !== null
          ? { request, response: null, error: failure }
          : { request, response: respond(request) },
      );
    },
    poll(): readonly RationalizerResult[] {
      // Hand over and clear — a result is delivered exactly once (the
      // `Rationalizer` contract). Swapping the array rather than splicing it
      // keeps the returned batch immune to a later `submit`.
      const batch = mailbox;
      mailbox = [];
      return batch;
    },
  };
}
