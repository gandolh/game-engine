// TrustSystem — passive snooper that applies trust deltas based on resolving
// peer-interaction events. Runs between InboxDispatchSystem and PerceiveSystem
// so it can observe messages routed to farmer inboxes before PerceiveSystem
// clears them, and before MarketSystem drains the market wall's inbox.
//
// Trust matrix (see corpus/briefs/game/todo/10-trust-and-endgame.md):
//   Peer ACCEPTed our OFFER_SEED  → toward peer: +0.05
//   Peer DECLINEd our OFFER_SEED  → toward peer: -0.05
//   Successful market trade       → buyer → seller: +0.05
//   CNP broken commitment         → initiator → winner: -0.10
//
// All updates clamp to [0, 1]. Trust map is lazy-initialized on first delta.
//
// The responder-side OFFER_SEED ACCEPT delta (we ACCEPTed peer's offer →
// +0.05 toward peer) is not implementable today because no production code
// processes OFFER_SEED. Once a handler exists, add the symmetric branch here.
import type { SimContext, System, World } from "@engine/core";
import type { GameEntity } from "../components";
import { ONT_ENCOUNTER } from "../protocols/encounter";
import { ONT_MARKET } from "../protocols/market";
import type { CnpCoordinator } from "../agents/cnp-coordinator";

export interface TrustConfig {
  acceptDelta: number;
  declineDelta: number;
  brokenDelta: number;
  tradeDelta: number;
  /** How many ticks after `deadlineTick` an awarded task counts as broken. */
  brokenCommitmentWindow: number;
}

export const DEFAULT_TRUST_CONFIG: TrustConfig = {
  acceptDelta: 0.05,
  declineDelta: -0.05,
  brokenDelta: -0.1,
  tradeDelta: 0.05,
  brokenCommitmentWindow: 4,
};

/** Minimal shape of a TRADE_COMPLETED body that TrustSystem cares about. */
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
    private readonly cnpCoordinators?: ReadonlyMap<number, CnpCoordinator>,
    configOverrides?: Partial<TrustConfig>,
  ) {
    this.config = { ...DEFAULT_TRUST_CONFIG, ...(configOverrides ?? {}) };
  }

  run(ctx: SimContext): void {
    this.processFarmerInboxes();
    this.processMarketWall();
    this.processCnpCommitments(ctx.tick);
  }

  // ---- farmer inboxes ----------------------------------------------------

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

  // ---- market wall snoop -------------------------------------------------

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

  // ---- CNP broken commitments --------------------------------------------

  private processCnpCommitments(currentTick: number): void {
    if (!this.cnpCoordinators) return;
    for (const coord of this.cnpCoordinators.values()) {
      const broken = coord.findBrokenCommitments(
        currentTick,
        this.config.brokenCommitmentWindow,
      );
      for (const task of broken) {
        if (task.winnerId === null) continue;
        const initiator = this.findFarmerById(task.initiatorId);
        if (initiator) {
          applyTrustDelta(initiator, task.winnerId, this.config.brokenDelta);
        }
        coord.markBrokenCommitmentReported(task.taskId);
      }
    }
  }

  // ---- helpers -----------------------------------------------------------

  private findFarmerById(id: number): GameEntity | undefined {
    for (const f of this.world.query("farmer")) {
      if (f.id === id) return f;
    }
    return undefined;
  }
}

/**
 * Apply a trust delta from `farmer` toward `peerId`. Lazy-initializes the
 * trust map. Clamps the resulting value to [0, 1]. Baseline `0.5` matches
 * the default already used by hoarder/opportunist for unseen peers.
 */
export function applyTrustDelta(farmer: GameEntity, peerId: number, delta: number): void {
  if (!farmer.trust) {
    farmer.trust = { byId: new Map<number, number>() };
  }
  const current = farmer.trust.byId.get(peerId) ?? 0.5;
  const next = Math.max(0, Math.min(1, current + delta));
  farmer.trust.byId.set(peerId, next);
}
