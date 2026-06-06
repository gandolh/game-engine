import { ONT_ENCOUNTER } from "../../protocols/encounter";

export const OFFER_TTL_TICKS = 5;

/**
 * brief 24 — trust gained by the receiver toward the giver of a golden bean.
 * Large relative to the ±0.05 seed-trade deltas: a gift is a strong loyalty
 * signal. Clamped to [0,1] by `applyTrustDelta`.
 */
export const GIFT_TRUST_DELTA = 0.2;

type EncounterOntologyValue = (typeof ONT_ENCOUNTER)[keyof typeof ONT_ENCOUNTER];

export const ENCOUNTER_ONTOLOGIES: ReadonlySet<string> = new Set<EncounterOntologyValue>([
  ONT_ENCOUNTER.MEET,
  ONT_ENCOUNTER.OFFER_SEED,
  ONT_ENCOUNTER.OFFER_BEAN,
  ONT_ENCOUNTER.ACCEPT,
  ONT_ENCOUNTER.DECLINE,
]);
