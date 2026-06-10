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
  /** brief 24 — gift a golden bean to a co-located peer (no counter-payment). */
  OFFER_BEAN: "encounter.offer-bean",
  /**
   * brief 59 — propose a trade of HARVESTED crops (not seeds). Same handshake
   * as OFFER_SEED, but the transfer moves `inventory.crops[crop]` and is priced
   * against CROP_SELL_PRICE. Farmers never hold a seed surplus (they plant
   * just-in-time), but DO sit on harvested crops waiting to sell — so this is
   * the path that actually closes peer trades and feeds the trust matrix.
   */
  OFFER_CROP: "encounter.offer-crop",
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
  /** brief 41 — extended to all 8 crop kinds. */
  crop: import("../components").CropKind;
  quantity: number;
  unitPrice: number;
  direction: "buy" | "sell";
}

/**
 * brief 59 — a trade of HARVESTED crops. Identical shape to OfferSeedBody;
 * `direction` carries the same sender-role semantics (see above). Distinguished
 * from a seed offer only by the ontology (OFFER_CROP), so the encounter-trade
 * system routes the transfer to `inventory.crops` instead of `inventory.seeds`.
 * Crop units traded are treated as Normal quality on both sides (sellers
 * offload their lowest tier; keeps the transfer deterministic and simple).
 */
export type OfferCropBody = OfferSeedBody;

/**
 * brief 24 — a one-way gift of a golden bean from sender to recipient. No
 * counter-payment; accepting moves a large positive trust delta from the
 * receiver toward the giver. Reuses the ACCEPT/DECLINE replies (by `offerId`).
 */
export interface OfferBeanBody {
  offerId: string;
  quantity: number;
}

export interface AcceptBody {
  offerId: string;
}

export interface DeclineBody {
  offerId: string;
  reason: string;
}
