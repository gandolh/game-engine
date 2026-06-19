import type { GameEntity } from "../components";
import type { MeetBody, OfferSeedBody, OfferBeanBody } from "../protocols/encounter";

export interface PeerTradeContext {
  tick: number;
}

export type InitiatePeerTradeFn = (
  farmer: GameEntity,
  meet: MeetBody,
  ctx: PeerTradeContext,
) => OfferSeedBody | null;

export type RespondPeerOfferFn = (
  farmer: GameEntity,
  offer: OfferSeedBody,
  sender: number,
  ctx: PeerTradeContext,
) => { decision: "accept" | "decline"; reason?: string };

export type InitiateBeanGiftFn = (
  farmer: GameEntity,
  meet: MeetBody,
  ctx: PeerTradeContext,
) => OfferBeanBody | null;

interface PeerTradeHooks {
  initiate?: InitiatePeerTradeFn;
  respond: RespondPeerOfferFn;
  initiateGift?: InitiateBeanGiftFn;

  initiateCrop?: InitiatePeerTradeFn;

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
