import { createRegistry } from "@engine/core/agent";
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

// A second personality-keyed registry (peer-trade hooks), built on the engine's
// generic registry. The stored value is the hooks bundle rather than a
// deliberator fn. Label preserves the original duplicate-registration message.
const registry = createRegistry<PeerTradeHooks>("Peer-trade hooks");

export function registerPeerTradeHooks(
  personality: string,
  hooks: PeerTradeHooks,
): void {
  registry.register(personality, hooks);
}

export function getPeerTradeHooks(personality: string): PeerTradeHooks | undefined {
  return registry.get(personality);
}
