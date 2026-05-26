import type { GameEntity } from "../components";
import type { MeetBody, OfferSeedBody } from "../protocols/encounter";

export interface PeerTradeContext {
  tick: number;
}

/**
 * Personality hook fired when a farmer receives a MEET. Returning a non-null
 * `OfferSeedBody` instructs the encounter-trade system to deliver an
 * `OFFER_SEED` to the peer. Returning `null` means "this personality does not
 * initiate a peer trade in this context".
 */
export type InitiatePeerTradeFn = (
  farmer: GameEntity,
  meet: MeetBody,
  ctx: PeerTradeContext,
) => OfferSeedBody | null;

/**
 * Personality hook fired when a farmer receives an `OFFER_SEED`. The hook
 * returns whether to accept or decline. The encounter-trade system then
 * delivers the ACCEPT or DECLINE message to the offerer and (on accept)
 * performs the inventory + gold transfer.
 */
export type RespondPeerOfferFn = (
  farmer: GameEntity,
  offer: OfferSeedBody,
  sender: number,
  ctx: PeerTradeContext,
) => { decision: "accept" | "decline"; reason?: string };

interface PeerTradeHooks {
  initiate?: InitiatePeerTradeFn;
  respond: RespondPeerOfferFn;
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

export function listRegisteredPeerTradePersonalities(): readonly string[] {
  return Array.from(registry.keys()).sort();
}

/**
 * Test helper — clears the registry so each test file's import order is
 * deterministic. Not used in production.
 */
export function _resetPeerTradeRegistryForTests(): void {
  registry.clear();
}
