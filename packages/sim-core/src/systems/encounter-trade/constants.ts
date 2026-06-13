import { ONT_ENCOUNTER } from "../../protocols/encounter";

export const OFFER_TTL_TICKS = 5;

export const GIFT_TRUST_DELTA = 0.2;

type EncounterOntologyValue = (typeof ONT_ENCOUNTER)[keyof typeof ONT_ENCOUNTER];

export const ENCOUNTER_ONTOLOGIES: ReadonlySet<string> = new Set<EncounterOntologyValue>([
  ONT_ENCOUNTER.MEET,
  ONT_ENCOUNTER.OFFER_SEED,
  ONT_ENCOUNTER.OFFER_CROP,
  ONT_ENCOUNTER.OFFER_BEAN,
  ONT_ENCOUNTER.ACCEPT,
  ONT_ENCOUNTER.DECLINE,
]);
