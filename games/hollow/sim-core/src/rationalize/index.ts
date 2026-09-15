/**
 * The LLM-rationalizer seam (chunk hollow-13) — public surface.
 *
 * OFF BY DEFAULT: nothing here runs unless `HollowSimOptions.rationalizer` is
 * set. With that option absent, `agents/villager.ts` takes its pre-hollow-13
 * path verbatim — no request built, no allocation, no `Rng` draw, byte-
 * identical output. See `types.ts` for the anchoring contract and why the
 * provider interface is submit/poll rather than async/await.
 */
export type {
  Rationalizer,
  RationalizerRequest,
  RationalizerResponse,
  RationalizerResult,
  RationalizerCandidate,
  RationalizerGenomeSummary,
  RationalizerRelationship,
  RationalizerStanding,
} from "./types";
export { candidateAt } from "./types";

export {
  candidateFingerprint,
  candidateOptionKey,
  findCandidateByIdentity,
  validateRationalizerResponse,
  validateRationalizerResult,
  acceptedResponse,
  RATIONALE_MAX_CHARS,
  type AnchorOptions,
  type AnchorOutcome,
  type RationalizerRejectionReason,
} from "./validate";

export { SIGNIFICANT_SOCIAL_VERBS, isSignificantDecision } from "./policy";

export { buildRationalizerRequest, RELATIONSHIP_BUDGET } from "./request";

export { createStubRationalizer, stubRationale, type StubRationalizerOptions } from "./stub";

export {
  createRecordingRationalizer,
  createReplayingRationalizer,
  deriveCacheKey,
  isCacheMissError,
  CACHE_MISS_ERROR_PREFIX,
  type RationalizerCacheEntry,
  type RationalizerCacheData,
} from "./cache";

export {
  RationalizerSeam,
  DEFAULT_REQUEST_TIMEOUT_TICKS,
  DEFAULT_MAX_IN_FLIGHT,
  DEFAULT_MAX_DECISION_LOG,
  type RationalizerSeamOptions,
  type RationalizerDecision,
  type ConsiderInput,
} from "./seam";
