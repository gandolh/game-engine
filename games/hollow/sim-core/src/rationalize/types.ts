/**
 * The LLM-RATIONALIZER SEAM's wire types (chunk hollow-13).
 *
 * The whole point of this seam is the ANCHORING GUARANTEE: the BDI + economy
 * substrate produces a grounded, already-feasible candidate set
 * (`agents/social-verbs.ts`'s `enumerateSocialActions` — every entry has
 * already been validated against real world state: surplus on hand, a
 * candidate actually in range, a genuine skill gap, a curdled relationship)
 * and the model is only ever allowed to pick an INDEX into that array, or
 * decline. It cannot name an action. It cannot name a target. There is no
 * field on `RationalizerResponse` through which an un-grounded action could
 * even be spelled, and `validate.ts` re-checks the index against the live
 * candidate set before anything is adopted. That is what stops this layer
 * reproducing the failure mode the spec is written against — LLM agents
 * narrating thoughts that nothing in the world can honor.
 *
 * ── why submit/poll and not async/await ───────────────────────────────────
 * A tick cannot await. The sim's whole determinism contract is "a tick's
 * output depends solely on the tick count" (CLAUDE.md), and `await` inside a
 * deliberation would either stall the scheduler or make adoption depend on
 * wall-clock network latency — i.e. on something other than the tick count.
 * So the seam is explicitly a MAILBOX, not a promise:
 *   - `submit(req)` hands the provider a request and returns IMMEDIATELY.
 *     The agent proceeds on its BDI default this tick regardless.
 *   - `poll()` is drained once per tick by the seam (see `seam.ts`) and
 *     returns whatever has arrived SINCE the last drain, in the provider's
 *     own array order.
 *   - a result therefore lands some LATER tick and is adopted then, if it
 *     still anchors. A result that never arrives, arrives too late, or
 *     arrives malformed costs nothing: the BDI default already ran.
 * A synchronous provider (the stub, `stub.ts`) satisfies this trivially by
 * answering on the very next `poll()`; a real network provider (chunk 4)
 * satisfies it by resolving into an internal buffer that `poll()` drains.
 *
 * ── what gets sent ────────────────────────────────────────────────────────
 * Only what the decision needs (the spec is explicit: "never send anything
 * that isn't needed for the decision; keep prompts small + structured").
 * `request.ts` builds these from live components; nothing here holds a live
 * entity reference, so a provider — however async, however remote — can
 * never reach through a request to mutate the world.
 */
import type { ScoredChoice } from "../agents/social-verbs";

/** One grounded, feasible option, as offered to the model. `index` is its
 *  position in `RationalizerRequest.candidates` and is the ONLY thing a
 *  response may name. `kind`/`data` are the verb + payload verbatim from the
 *  `ScoredChoice` the substrate produced; `score` is the BDI's own valuation,
 *  included so the model can see what it is disagreeing with. */
export interface RationalizerCandidate {
  readonly index: number;
  readonly kind: string;
  readonly data: Readonly<Record<string, unknown>>;
  readonly score: number;
}

/** The agent's heritable traits (components/genome.ts), flattened. */
export interface RationalizerGenomeSummary {
  readonly behavior: Readonly<Record<string, number>>;
  readonly aptitude: Readonly<Record<string, number>>;
  readonly appearance: {
    readonly height: number;
    readonly build: number;
    readonly skinTone: string;
    readonly hairTone: string;
  };
}

/** One KEY relationship — a peer the decision actually turns on. See
 *  `request.ts`'s `RELATIONSHIP_BUDGET` for which peers make the cut and why
 *  the selection is deterministic. */
export interface RationalizerRelationship {
  readonly peerId: number;
  /** Directed trust the ACTOR holds toward this peer, `[0,1]`, 0.5 neutral. */
  readonly trust: number;
  /** The actor's persistent grudge toward this peer (components/feud.ts), 0 if none. */
  readonly grudge: number;
  readonly sameHousehold: boolean;
  readonly sameCommunity: boolean;
  /** `true` when this peer is the target of at least one candidate. */
  readonly isCandidateTarget: boolean;
}

/** Where the actor sits in its community (chunk hollow-12a's governance
 *  standing), or the loner case. */
export interface RationalizerStanding {
  readonly communityId: number | null;
  readonly memberCount: number;
  /** The actor's own standing score, or `null` before the community's first
   *  governance pass (or for a loner). */
  readonly standing: number | null;
  readonly isLeader: boolean;
}

/**
 * ONE consultation. Small, structured, plain data — no live entity refs, no
 * `Map`s (a provider may serialize this), nothing the model doesn't need.
 */
export interface RationalizerRequest {
  readonly agentId: number;
  /** The tick the request was ISSUED on (not the tick it is answered on). */
  readonly tick: number;
  readonly genome: RationalizerGenomeSummary;
  /** Recent beliefs/memory — the small projection of `beliefs.data` the
   *  Hollow sim actually writes (starving / foodDepletedTicks / …). */
  readonly beliefs: Readonly<Record<string, unknown>>;
  /** Need kind → satisfaction fraction in `[0,1]` (1 = fully satisfied). */
  readonly needs: Readonly<Record<string, number>>;
  /** Ascending by `peerId` (determinism — CLAUDE.md). */
  readonly relationships: readonly RationalizerRelationship[];
  readonly standing: RationalizerStanding;
  /** THE OPTION SET. Indices into this array are the only legal choices. */
  readonly candidates: readonly RationalizerCandidate[];
  /** Index (into `candidates`) the substrate takes if the model declines,
   *  errors, is late, or is rejected. Always a valid index — a request is
   *  never issued for an empty candidate set. */
  readonly bdiChoiceIndex: number;
  /**
   * Deterministic digest of `candidates` — see `validate.ts`'s
   * `candidateFingerprint`. Echoed on the result and re-checked at adoption
   * time: an answer computed against a candidate set the world has since
   * moved past is STALE and must be rejected rather than applied to whatever
   * happens to sit at that index now.
   */
  readonly candidateFingerprint: string;
}

/**
 * What a model is allowed to say back. `choiceIndex` is an index into the
 * request's `candidates`, or `null` for "keep the BDI default". There is
 * deliberately NO field for proposing an action — see this file's header.
 */
export interface RationalizerResponse {
  readonly choiceIndex: number | null;
  /** A short stated reason. Logged to the chronicle so stated-vs-revealed
   *  reasoning can be studied (the spec's original research interest). */
  readonly rationale: string;
}

/**
 * One answered consultation, as handed back by `Rationalizer.poll()`.
 *
 * `request` is the harness's OWN object echoed back verbatim (the provider
 * does not author it), which is what lets the validator check identity and
 * staleness. `response` is typed `unknown` ON PURPOSE: it is raw, untrusted
 * model output that has not yet been through
 * `validateRationalizerResult`. Never read it without validating.
 */
export interface RationalizerResult {
  readonly request: RationalizerRequest;
  readonly response: unknown;
  /** Set when the PROVIDER itself failed (timeout, transport, unparseable
   *  body). The harness keeps the BDI default and ignores `response`. */
  readonly error?: string | undefined;
}

/**
 * The pluggable provider. Implementations: `stub.ts` (the test default — no
 * network, deterministic) and, behind a flag + key, a real Claude-backed one
 * in the CLI (out of `@hollow/sim-core`, which must stay render-free AND
 * HTTP/SDK-free — CLAUDE.md layering).
 *
 * Contract:
 *  - `submit` MUST return immediately and MUST NOT throw for an ordinary
 *    failure (report it as a `RationalizerResult.error` from `poll` instead).
 *  - `poll` returns every result that has arrived since the previous call
 *    and must not return the same result twice. Order is the provider's; the
 *    seam applies results in the order given, and the anchoring validator
 *    makes any order safe.
 *  - neither method may consume the sim's `Rng` or read wall-clock time in a
 *    way that feeds back into sim state.
 */
export interface Rationalizer {
  /** For logs/chronicle attribution, e.g. `"stub"`. */
  readonly name: string;
  submit(request: RationalizerRequest): void;
  poll(): readonly RationalizerResult[];
}

/** Convenience: the `ScoredChoice` at `index`, or `null` if out of range.
 *  Used by the seam after validation; exported because chunk 4's provider
 *  harness wants the same bounds-checked read. */
export function candidateAt(candidates: readonly ScoredChoice[], index: number): ScoredChoice | null {
  return candidates[index] ?? null;
}
