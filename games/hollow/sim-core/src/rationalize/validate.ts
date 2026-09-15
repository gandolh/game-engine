/**
 * THE ANCHORING GUARANTEE, enforced in code (chunk hollow-13).
 *
 * Everything in this file is a PURE function of (untrusted response, the
 * candidate set it is being applied to). No `Rng`, no clock, no world
 * access, no mutation — so it is exhaustively testable, and so a hostile,
 * confused or merely stale model response has exactly one possible effect on
 * the sim: it is rejected and the BDI default runs, which is what would have
 * happened if the seam were off.
 *
 * ── what "anchored" means here, precisely ─────────────────────────────────
 * A response names an INDEX into the candidate set it was OFFERED. By the
 * time an answer comes back — necessarily a later tick, since a tick cannot
 * await — the world has moved, and Hollow's 40-tick social cooldown
 * (`SOCIAL_COOLDOWN_TICKS`) guarantees the agent's next deliberation is a
 * long way off. So the option at index `k` of the LIVE set is usually not
 * the option the model was shown at index `k`. Adopting by raw index would
 * silently apply a reasoned choice to an unreasoned action — the subtlest
 * way this seam could break its own guarantee.
 *
 * So the rule is IDENTITY, not position: resolve the model's index in the
 * set it was offered, take that option's `kind` + grounded payload, and look
 * for the SAME option in the live set. Present → adopt it, at whatever index
 * it now sits (`AnchorOutcome.choiceIndex` is always an index into the LIVE
 * array). Gone → `stale-candidates`, BDI default. The adopted action is
 * therefore always both (a) exactly the action reasoned about and (b) an
 * action the substrate has re-validated as feasible THIS tick.
 *
 * Score is deliberately NOT part of that identity. Trust decays every tick
 * (`HollowTrustAccrualSystem`), so every verb's weighted-average score
 * drifts continuously; requiring an exact score match would reject
 * everything and make the seam inert while still looking green. "Steal 5
 * food from agent 4" is the same decision whether the substrate now values
 * it at 0.71 or 0.70.
 *
 * A caller that wants the strictest possible reading — the ENTIRE option
 * set, scores included, unchanged since the request — can pass
 * `strictCandidateSet`, which additionally compares `candidateFingerprint`.
 * It is off by default because in this sim it rejects ~everything.
 *
 * The rejection classes, and why each one exists:
 *  - `provider-error`   — the transport itself failed. Nothing to validate.
 *  - `malformed`        — not an object, missing `choiceIndex`/`rationale`,
 *                         or either field of the wrong type. A model that
 *                         returns prose, `{}`, `null`, an array, or JSON
 *                         with invented extra fields lands here.
 *  - `non-integer-index`— `1.5`, `NaN`, `Infinity`, `-1`. A number, but not
 *                         a usable array index.
 *  - `index-out-of-range` — an integer outside the set the model was
 *                         offered. THIS is the "propose an action outside
 *                         the set" attempt, and there is no other way to
 *                         spell one: the response type has no action field.
 *  - `wrong-agent`      — the result is for a different agent.
 *  - `stale-candidates` — the chosen option is no longer on the table (or,
 *                         under `strictCandidateSet`, the set changed at all).
 *
 * A rejection is never an error the sim has to handle: it is a value the
 * caller logs and ignores.
 */
import type { ScoredChoice } from "../agents/social-verbs";
import type { RationalizerCandidate, RationalizerResult, RationalizerResponse } from "./types";

/** Longest rationale kept. A model that rambles is not malformed, just
 *  verbose — the text is truncated (never rejected) so one long answer can't
 *  bloat the chronicle. */
export const RATIONALE_MAX_CHARS = 400;

export type RationalizerRejectionReason =
  | "provider-error"
  | "malformed"
  | "non-integer-index"
  | "index-out-of-range"
  | "wrong-agent"
  | "stale-candidates";

export type AnchorOutcome =
  | {
      readonly accepted: true;
      /** An index into the LIVE candidate set the outcome was validated
       *  against — already re-resolved by identity, so it is safe to index
       *  with directly — or `null` for the model's explicit "keep the BDI
       *  default". */
      readonly choiceIndex: number | null;
      /**
       * The index the model ACTUALLY named, into the set it was OFFERED —
       * before re-resolution against the live set. Set only by
       * `validateRationalizerResult` (the shape-only
       * `validateRationalizerResponse` has no live set to re-resolve against,
       * so its `choiceIndex` already IS the offered index).
       *
       * The seam needs this to tell agreement from instruction: an answer
       * whose `offeredIndex` is the request's own `bdiChoiceIndex` says "I
       * agree with the substrate", which must never be allowed to resurrect a
       * now-stale action — see `seam.ts`'s `applyAnswer`.
       */
      readonly offeredIndex?: number | null;
      readonly rationale: string;
    }
  | {
      readonly accepted: false;
      readonly reason: RationalizerRejectionReason;
      /** Human-readable specifics, for the chronicle/debug log. Never
       *  interpolated back into a prompt. */
      readonly detail: string;
    };

export interface AnchorOptions {
  /**
   * Additionally require the ENTIRE live candidate set — every verb, every
   * payload, every score — to be identical to the set the request was issued
   * against. The strictest possible reading of "not stale".
   *
   * OFF by default, and that default is load-bearing: Hollow's trust ledger
   * decays every tick, so scores drift continuously and the 40-tick social
   * cooldown puts ~40 ticks of drift between a request and the agent's next
   * deliberation. With this on, essentially every answer is rejected and the
   * seam is inert. Exposed for a caller (a test, a stricter future replay
   * mode) that genuinely wants set-level identity and can arrange for it.
   */
  readonly strictCandidateSet?: boolean;
}

/**
 * The identity of ONE option: its verb plus its grounded payload (target,
 * good, amount…), with SCORE deliberately excluded — see this file's header.
 * Two options with the same key are the same decision.
 */
export function candidateOptionKey(choice: { readonly kind: string; readonly data: Readonly<Record<string, unknown>> }): string {
  const keys = Object.keys(choice.data).sort();
  const payload = keys.map((k) => `${k}=${JSON.stringify(choice.data[k] ?? null)}`).join(",");
  return `${choice.kind}{${payload}}`;
}

/**
 * A deterministic digest of a whole candidate set, SCORES INCLUDED — the
 * identity `strictCandidateSet` compares, and a natural cache key for a
 * prompt-keyed response cache (the spec's deterministic-replay mode).
 *
 * Determinism: fixed field order, keys sorted, `String()`/`JSON.stringify`
 * on primitives only (candidate `data` is flat number/string payloads — see
 * `social-verbs.ts`). No hashing library, no `Math.random`, no clock; this is
 * a plain concatenation, so it is stable across processes and runs.
 */
export function candidateFingerprint(candidates: readonly ScoredChoice[]): string {
  return candidates.map((c) => `${candidateOptionKey(c)}@${String(c.score)}`).join("|");
}

/** Position of an option with the same identity in `candidates`, or `-1`. */
export function findCandidateByIdentity(
  candidates: readonly ScoredChoice[],
  offered: { readonly kind: string; readonly data: Readonly<Record<string, unknown>> },
): number {
  const key = candidateOptionKey(offered);
  for (let i = 0; i < candidates.length; i++) {
    if (candidateOptionKey(candidates[i]!) === key) return i;
  }
  return -1;
}

/** `true` for a value usable as an array index: a real, finite integer >= 0. */
function isIndexLike(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value >= 0;
}

/**
 * Validates a RAW response body's SHAPE and BOUNDS against the number of
 * options the model was offered. Returns an index into the OFFERED set (the
 * caller re-resolves it against the live set — see
 * `validateRationalizerResult`). Exported so a provider or a test can anchor
 * a response it holds in hand without manufacturing a `RationalizerResult`.
 */
export function validateRationalizerResponse(raw: unknown, offeredCount: number): AnchorOutcome {
  if (raw === null || typeof raw !== "object" || Array.isArray(raw)) {
    const shape = Array.isArray(raw) ? "an array" : raw === null ? "null" : typeof raw;
    return { accepted: false, reason: "malformed", detail: `response is ${shape}, not an object` };
  }
  // Narrowed to a plain record so the two fields can be probed; the values
  // themselves stay `unknown` and are type-checked below.
  const body = raw as Readonly<Record<string, unknown>>;

  const rationale = body["rationale"];
  if (typeof rationale !== "string") {
    return { accepted: false, reason: "malformed", detail: `rationale is ${typeof rationale}, not a string` };
  }
  const trimmed = rationale.slice(0, RATIONALE_MAX_CHARS);

  const choiceIndex = body["choiceIndex"];
  if (choiceIndex === null) return { accepted: true, choiceIndex: null, rationale: trimmed };
  if (typeof choiceIndex !== "number") {
    return { accepted: false, reason: "malformed", detail: `choiceIndex is ${typeof choiceIndex}, not a number or null` };
  }
  if (!isIndexLike(choiceIndex)) {
    return { accepted: false, reason: "non-integer-index", detail: `choiceIndex ${String(choiceIndex)} is not a non-negative integer` };
  }
  if (choiceIndex >= offeredCount) {
    return {
      accepted: false,
      reason: "index-out-of-range",
      detail: `choiceIndex ${choiceIndex} is outside the ${offeredCount}-candidate set it was offered`,
    };
  }
  return { accepted: true, choiceIndex, rationale: trimmed };
}

/**
 * THE function the seam calls. Validates a polled result against the agent
 * and the candidate set as they are RIGHT NOW, in cheapest-first order:
 * provider error → identity → (optional) set-level staleness → response
 * shape/bounds → option-level staleness + index re-resolution.
 *
 * `candidates` must be the LIVE set the choice would actually be applied to,
 * not the request's own copy — re-resolving against the live set is the
 * anchoring step, not a formality.
 */
export function validateRationalizerResult(
  result: RationalizerResult,
  agentId: number,
  candidates: readonly ScoredChoice[],
  opts: AnchorOptions = {},
): AnchorOutcome {
  if (result.error !== undefined) {
    return { accepted: false, reason: "provider-error", detail: result.error };
  }
  if (result.request.agentId !== agentId) {
    return {
      accepted: false,
      reason: "wrong-agent",
      detail: `result is for agent ${result.request.agentId}, not ${agentId}`,
    };
  }
  if (opts.strictCandidateSet && candidateFingerprint(candidates) !== result.request.candidateFingerprint) {
    return {
      accepted: false,
      reason: "stale-candidates",
      detail: `candidate set changed since tick ${result.request.tick} (strict set match)`,
    };
  }

  const offered: readonly RationalizerCandidate[] = result.request.candidates;
  const shape = validateRationalizerResponse(result.response, offered.length);
  if (!shape.accepted) return shape;
  if (shape.choiceIndex === null) {
    return { accepted: true, choiceIndex: null, offeredIndex: null, rationale: shape.rationale };
  }

  // In range by the check above, so this is always defined.
  const chosen = offered[shape.choiceIndex]!;
  const liveIndex = findCandidateByIdentity(candidates, chosen);
  if (liveIndex < 0) {
    return {
      accepted: false,
      reason: "stale-candidates",
      detail: `the chosen option (${candidateOptionKey(chosen)}) is no longer feasible`,
    };
  }
  return { accepted: true, choiceIndex: liveIndex, offeredIndex: shape.choiceIndex, rationale: shape.rationale };
}

/** Narrow a validated outcome back to the response shape, for logging. Only
 *  meaningful on an accepted outcome. */
export function acceptedResponse(outcome: AnchorOutcome): RationalizerResponse | null {
  return outcome.accepted ? { choiceIndex: outcome.choiceIndex, rationale: outcome.rationale } : null;
}
