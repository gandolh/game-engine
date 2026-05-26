import type { RegionId } from "../world/regions";

/**
 * In-person trade ontologies. Two farmers in the same region can negotiate
 * a seed exchange without going through the market wall.
 *
 *   MEET        — emitted by EncounterSystem when two co-located farmers
 *                 enter range. Tells each side who their peer is.
 *   OFFER_SEED  — initiator proposes a seed deal.
 *   ACCEPT      — recipient accepts a pending OFFER_SEED.
 *   DECLINE     — recipient declines a pending OFFER_SEED.
 */
export const ONT_ENCOUNTER = {
  MEET: "encounter.meet",
  OFFER_SEED: "encounter.offer-seed",
  ACCEPT: "encounter.accept",
  DECLINE: "encounter.decline",
} as const;

export type EncounterOntology = (typeof ONT_ENCOUNTER)[keyof typeof ONT_ENCOUNTER];

export interface MeetBody {
  peerId: number;
  regionId: RegionId;
}

/**
 * `direction` is the sender's role in the proposed trade:
 *   - `"buy"`  → sender will pay `unitPrice` per seed and wants to receive
 *                `quantity` seeds. Gold flows sender→recipient on accept;
 *                seeds flow recipient→sender.
 *   - `"sell"` → sender will give `quantity` seeds in exchange for
 *                `unitPrice` per seed. Seeds flow sender→recipient on
 *                accept; gold flows recipient→sender.
 */
export interface OfferSeedBody {
  offerId: string;
  crop: "radish" | "wheat" | "pumpkin";
  quantity: number;
  unitPrice: number;
  direction: "buy" | "sell";
}

export interface AcceptBody {
  offerId: string;
}

export interface DeclineBody {
  offerId: string;
  reason: string;
}
