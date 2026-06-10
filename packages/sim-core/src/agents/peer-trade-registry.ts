import type { GameEntity } from "../components";
import type { MeetBody, OfferSeedBody, OfferBeanBody } from "../protocols/encounter";

export interface PeerTradeContext {
  tick: number;
}

/** Hook fired on MEET: return an OfferSeedBody to initiate a peer trade, or null to skip. */
export type InitiatePeerTradeFn = (
  farmer: GameEntity,
  meet: MeetBody,
  ctx: PeerTradeContext,
) => OfferSeedBody | null;

/** Hook fired on OFFER_SEED: return accept/decline; system performs the transfer on accept. */
export type RespondPeerOfferFn = (
  farmer: GameEntity,
  offer: OfferSeedBody,
  sender: number,
  ctx: PeerTradeContext,
) => { decision: "accept" | "decline"; reason?: string };

/** Hook fired on MEET when farmer holds a bean: return OfferBeanBody to gift (large trust boost), or null. */
export type InitiateBeanGiftFn = (
  farmer: GameEntity,
  meet: MeetBody,
  ctx: PeerTradeContext,
) => OfferBeanBody | null;

interface PeerTradeHooks {
  initiate?: InitiatePeerTradeFn;
  respond: RespondPeerOfferFn;
  initiateGift?: InitiateBeanGiftFn;
  /** Fired on MEET to propose a harvested-crop trade (crops are the real surplus; this closes most trades). */
  initiateCrop?: InitiatePeerTradeFn;
  /** Fired on OFFER_CROP; prices against CROP_SELL_PRICE. Defaults to declining if absent. */
  respondCrop?: RespondPeerOfferFn;
}

const registry = new Map<string, PeerTradeHooks>();

export function registerPeerTradeHooks(
  personality: string,
  hooks: PeerTradeHooks,
): void {
  if (registry.has(personality)) {
    throw new Error(`Peer-trade hooks already registered: ${personality}`);
  }
  registry.set(personality, hooks);
}

export function getPeerTradeHooks(personality: string): PeerTradeHooks | undefined {
  return registry.get(personality);
}

