

import type { SimContext, System, World } from "@engine/core";
import type { GameEntity } from "../../components";
import { ONT_ENCOUNTER } from "../../protocols/encounter";
import { ONT_MARKET } from "../../protocols/market";

export interface TrustConfig {
  acceptDelta: number;
  declineDelta: number;
  tradeDelta: number;
}

export const DEFAULT_TRUST_CONFIG: TrustConfig = {
  acceptDelta: 0.05,
  declineDelta: -0.05,
  tradeDelta: 0.05,
};

interface TradeCompletedBody {
  offerId?: string;
  buyerId?: number;
  sellerId?: number;
}

export class TrustSystem implements System {
  readonly name = "TrustSystem";

  private readonly config: TrustConfig;

  constructor(
    private readonly world: World<GameEntity>,
    configOverrides?: Partial<TrustConfig>,
  ) {
    this.config = { ...DEFAULT_TRUST_CONFIG, ...(configOverrides ?? {}) };
  }

  run(_ctx: SimContext): void {
    this.processFarmerInboxes();
    this.processMarketWall();
  }

  private processFarmerInboxes(): void {
    for (const farmer of this.world.query("farmer", "inbox")) {
      for (const msg of farmer.inbox.messages) {
        if (typeof msg.sender !== "number") continue;
        if (msg.ontology === ONT_ENCOUNTER.ACCEPT) {
          applyTrustDelta(farmer, msg.sender, this.config.acceptDelta);
        } else if (msg.ontology === ONT_ENCOUNTER.DECLINE) {
          applyTrustDelta(farmer, msg.sender, this.config.declineDelta);
        }
      }
    }
  }

  private processMarketWall(): void {
    for (const wall of this.world.query("marketWall", "inbox")) {
      for (const msg of wall.inbox.messages) {
        if (msg.ontology !== ONT_MARKET.TRADE_COMPLETED) continue;
        const body = msg.body as TradeCompletedBody;
        if (typeof body.buyerId !== "number" || typeof body.sellerId !== "number") continue;
        const buyer = this.findFarmerById(body.buyerId);
        if (!buyer) continue;
        applyTrustDelta(buyer, body.sellerId, this.config.tradeDelta);
      }
    }
  }

  private findFarmerById(id: number): GameEntity | undefined {
    for (const f of this.world.query("farmer")) {
      if (f.id === id) return f;
    }
    return undefined;
  }
}

export function applyTrustDelta(farmer: GameEntity, peerId: number, delta: number): void {
  if (!farmer.trust) {
    farmer.trust = { byId: new Map<number, number>() };
  }
  const current = farmer.trust.byId.get(peerId) ?? 0.5;
  const next = Math.max(0, Math.min(1, current + delta));
  farmer.trust.byId.set(peerId, next);
}
