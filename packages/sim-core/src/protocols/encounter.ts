import type { RegionId } from "../world/regions";

// In-person trade ontologies (co-located farmers, bypasses market wall).
export const ONT_ENCOUNTER = {
  MEET: "encounter.meet",
  OFFER_SEED: "encounter.offer-seed",
  ACCEPT: "encounter.accept",
  DECLINE: "encounter.decline",
  /** Gift a golden bean to a co-located peer; no counter-payment. */
  OFFER_BEAN: "encounter.offer-bean",
  /** Trade harvested crops (not seeds); priced vs CROP_SELL_PRICE. This is the path that actually closes peer trades and feeds trust. */
  OFFER_CROP: "encounter.offer-crop",
} as const;

export type EncounterOntology = (typeof ONT_ENCOUNTER)[keyof typeof ONT_ENCOUNTER];

export interface MeetBody {
  peerId: number;
  regionId: RegionId;
}

/** direction "buy" = sender pays and receives seeds; "sell" = sender gives seeds and receives gold. */
export interface OfferSeedBody {
  offerId: string;
  crop: import("../components").CropKind;
  quantity: number;
  unitPrice: number;
  direction: "buy" | "sell";
}

/** Same shape as OfferSeedBody; ontology (OFFER_CROP) routes transfer to inventory.crops. Lowest quality tier transferred. */
export type OfferCropBody = OfferSeedBody;

/** One-way bean gift; ACCEPT triggers a positive trust delta toward the giver. Reuses ACCEPT/DECLINE replies. */
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
