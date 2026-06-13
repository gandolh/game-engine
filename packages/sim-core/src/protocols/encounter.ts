import type { RegionId } from "../world/regions";

export const ONT_ENCOUNTER = {
  MEET: "encounter.meet",
  OFFER_SEED: "encounter.offer-seed",
  ACCEPT: "encounter.accept",
  DECLINE: "encounter.decline",

  OFFER_BEAN: "encounter.offer-bean",

  OFFER_CROP: "encounter.offer-crop",
} as const;

export type EncounterOntology = (typeof ONT_ENCOUNTER)[keyof typeof ONT_ENCOUNTER];

export interface MeetBody {
  peerId: number;
  regionId: RegionId;
}

export interface OfferSeedBody {
  offerId: string;
  crop: import("../components").CropKind;
  quantity: number;
  unitPrice: number;
  direction: "buy" | "sell";
}

export type OfferCropBody = OfferSeedBody;

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
