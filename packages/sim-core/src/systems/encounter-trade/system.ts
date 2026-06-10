import type {
  SimContext,
  System,
  World,
  AgentMessage,
} from "@engine/core";
import type { GameEntity, CropKind, Inventory } from "../../components";
import { findById } from "../entity-helpers";
import {
  ONT_ENCOUNTER,
  type MeetBody,
  type OfferSeedBody,
  type OfferCropBody,
  type OfferBeanBody,
  type AcceptBody,
  type DeclineBody,
} from "../../protocols/encounter";
import { PERFORMATIVE } from "../../protocols/performatives";
import { getPeerTradeHooks } from "../../agents/peer-trade-registry";
import type { TradeCommodity } from "../../agents/peer-trade-policy";
import { applyTrustDelta, DEFAULT_TRUST_CONFIG } from "../trust";
import { OFFER_TTL_TICKS, GIFT_TRUST_DELTA, ENCOUNTER_ONTOLOGIES } from "./constants";

/**
 * EncounterTradeSystem — drives the peer-to-peer seed-trade handshake on top
 * of the encounter protocol.
 *
 * Lifecycle in one `run()`:
 *
 *   1. Drain pending-offer entries older than OFFER_TTL_TICKS.
 *   2. For each farmer (id-ascending for determinism), splice out any
 *      MEET / OFFER_SEED / ACCEPT / DECLINE message from its inbox and
 *      dispatch it through that farmer's personality peer-trade hooks. The
 *      resulting OFFER_SEED / ACCEPT / DECLINE messages are deposited
 *      directly into the appropriate peer's inbox (point-to-point — no
 *      MessageBus round-trip).
 *   3. Repeat until no encounter-protocol messages remain (handshake
 *      resolves in a single tick).
 *   4. On ACCEPT, transfer gold + seeds between the two farmer entities.
 *
 * Ordering contract (when wired into a scheduler — out of scope for this
 * brief, see corpus/briefs/game/todo/09-peer-meet-trades-plan.md §1.2):
 *   EncounterSystem  →  EncounterTradeSystem  →  PerceiveSystem
 * PerceiveSystem currently wipes farmer inboxes wholesale, so peer-trade
 * messages MUST be consumed beforehand.
 *
 * AP cost: peer trades are AP-free in this brief. Adding an AP cost is a
 * deliberate follow-up (see plan §8).
 */

interface PendingOffer {
  offer: OfferSeedBody;
  senderId: number;
  recipientId: number;
  tick: number;
  /** brief 59 — which inventory slot the transfer moves on accept. */
  commodity: TradeCommodity;
}

export class EncounterTradeSystem implements System {
  readonly name = "EncounterTradeSystem";

  private readonly pendingOffers = new Map<string, PendingOffer>();
  /** offerIds whose ACCEPT/DECLINE has been resolved this run. */
  private readonly resolvedHandshakes = new Set<string>();

  constructor(private readonly world: World<GameEntity>) {}

  /**
   * Test helper — wipes pending offers between test cases.
   */
  _resetForTests(): void {
    this.pendingOffers.clear();
    this.resolvedHandshakes.clear();
  }

  run(ctx: SimContext): void {
    // 1. Expire stale offers first.
    this.expireOffers(ctx.tick);

    // 2. Resolve the handshake. We loop until a pass finds no MEET or
    //    OFFER_SEED messages — those drive the state machine forward and
    //    are consumed (spliced out of inboxes).
    this.resolvedHandshakes.clear();
    let didWork = true;
    let safety = 0;
    while (didWork && safety < 8) {
      didWork = this.processInboxes(ctx);
      safety += 1;
    }
  }

  private expireOffers(tick: number): void {
    for (const [id, p] of this.pendingOffers) {
      if (tick - p.tick > OFFER_TTL_TICKS) {
        this.pendingOffers.delete(id);
      }
    }
  }

  /**
   * Single sweep over all farmer inboxes; returns true if any encounter
   * message was processed (so the caller can decide whether to loop again).
   */
  private processInboxes(ctx: SimContext): boolean {
    // Snapshot farmers in id-ascending order for determinism.
    const farmers: GameEntity[] = [];
    for (const f of this.world.query("farmer", "inbox", "personality")) {
      if (f.id === undefined) continue;
      farmers.push(f);
    }
    farmers.sort((a, b) => (a.id ?? 0) - (b.id ?? 0));

    let workDone = false;

    for (const farmer of farmers) {
      if (!farmer.inbox) continue;
      const inbox = farmer.inbox.messages;
      // Iterate in reverse so splice is safe.
      for (let i = inbox.length - 1; i >= 0; i--) {
        const msg = inbox[i];
        if (!msg) continue;
        if (!ENCOUNTER_ONTOLOGIES.has(msg.ontology)) continue;

        // MEET and OFFER_SEED drive the handshake forward and are consumed
        // (spliced out of the inbox). ACCEPT and DECLINE are left in the
        // inbox so TrustSystem can snoop them — they're dispatched once
        // per offerId via the resolvedHandshakes set.
        const consume =
          msg.ontology === ONT_ENCOUNTER.MEET ||
          msg.ontology === ONT_ENCOUNTER.OFFER_SEED ||
          msg.ontology === ONT_ENCOUNTER.OFFER_CROP ||
          msg.ontology === ONT_ENCOUNTER.OFFER_BEAN;

        if (consume) {
          inbox.splice(i, 1);
          this.dispatch(farmer, msg, ctx);
          workDone = true;
        } else {
          // ACCEPT / DECLINE — resolve at most once per offerId per tick.
          const body = msg.body as { offerId?: string };
          const offerId = body.offerId;
          if (typeof offerId === "string" && !this.resolvedHandshakes.has(offerId)) {
            this.resolvedHandshakes.add(offerId);
            this.dispatch(farmer, msg, ctx);
          }
        }
      }
    }

    return workDone;
  }

  private dispatch(farmer: GameEntity, msg: AgentMessage, ctx: SimContext): void {
    switch (msg.ontology) {
      case ONT_ENCOUNTER.MEET:
        this.handleMeet(farmer, msg.body as unknown as MeetBody, ctx);
        return;
      case ONT_ENCOUNTER.OFFER_SEED:
        this.handleOffer(
          farmer,
          msg.body as unknown as OfferSeedBody,
          msg.sender,
          ctx,
          "seed",
        );
        return;
      case ONT_ENCOUNTER.OFFER_CROP:
        this.handleOffer(
          farmer,
          msg.body as unknown as OfferCropBody,
          msg.sender,
          ctx,
          "crop",
        );
        return;
      case ONT_ENCOUNTER.OFFER_BEAN:
        this.handleBeanGift(
          farmer,
          msg.body as unknown as OfferBeanBody,
          msg.sender,
        );
        return;
      case ONT_ENCOUNTER.ACCEPT:
        this.handleAccept(farmer, msg.body as unknown as AcceptBody, msg.sender);
        return;
      case ONT_ENCOUNTER.DECLINE:
        this.handleDecline(msg.body as unknown as DeclineBody);
        return;
    }
  }

  private handleMeet(
    farmer: GameEntity,
    meet: MeetBody,
    ctx: SimContext,
  ): void {
    if (farmer.id === undefined) return;

    const personality = farmer.personality?.kind;
    if (!personality) return;
    const hooks = getPeerTradeHooks(personality);
    if (!hooks) return;

    // MEET is delivered to BOTH farmers in a pair. The lower-id guard below
    // applies ONLY to the seed offer, so a pair never makes two simultaneous
    // *seed* offers. Gifts and crop offers are each side proposing its OWN
    // surplus (distinct ontologies + offerIds, independently negotiated), so
    // both sides may fire them — that's how the crop seller, whichever id it
    // has, actually gets to sell (brief 59: the surplus-holding hoarder is
    // often the higher id, and the old guard silently blocked it).

    // brief 24 — gift a golden bean to this peer if the personality's gift hook
    // opts in (e.g. to a trusted ally). One-way and immediate; sent as an
    // OFFER_BEAN the peer consumes next pass. Independent of the seed offer.
    if (hooks.initiateGift && (farmer.inventory?.goldenBeans ?? 0) > 0) {
      const gift = hooks.initiateGift(farmer, meet, { tick: ctx.tick });
      if (gift) {
        const peerForGift = findById(this.world, meet.peerId, "farmer", "inbox");
        if (peerForGift?.inbox) {
          peerForGift.inbox.messages.push({
            performative: PERFORMATIVE.PROPOSE,
            ontology: ONT_ENCOUNTER.OFFER_BEAN,
            sender: farmer.id,
            body: gift as unknown as Record<string, unknown>,
            tickIssued: ctx.tick,
          });
        }
      }
    }

    // brief 59 — a HARVESTED-crop offer (the surplus that actually exists).
    // Independent of the seed offer; sent as OFFER_CROP.
    if (hooks.initiateCrop) {
      const cropOffer = hooks.initiateCrop(farmer, meet, { tick: ctx.tick });
      if (cropOffer) this.sendOffer(farmer.id, meet.peerId, cropOffer, "crop", ctx.tick);
    }

    // Seed offer: gated to the lower-id side so a pair never makes two
    // simultaneous seed offers (preserves the original brief-09 invariant).
    if (farmer.id > meet.peerId) return;
    if (!hooks.initiate) return;
    const offer = hooks.initiate(farmer, meet, { tick: ctx.tick });
    if (!offer) return;
    this.sendOffer(farmer.id, meet.peerId, offer, "seed", ctx.tick);
  }

  /**
   * Register a pending offer and deliver it to the peer. `commodity` selects
   * the ontology (OFFER_SEED / OFFER_CROP) and is recorded so the eventual
   * ACCEPT transfers the right inventory slot.
   */
  private sendOffer(
    fromId: number,
    toId: number,
    offer: OfferSeedBody,
    commodity: TradeCommodity,
    tick: number,
  ): void {
    // Defensive idempotency: skip if we already have a live offer with this id.
    if (this.pendingOffers.has(offer.offerId)) return;

    const peer = findById(this.world, toId, "farmer", "inbox");
    if (!peer || !peer.inbox) return;

    this.pendingOffers.set(offer.offerId, {
      offer,
      senderId: fromId,
      recipientId: toId,
      tick,
      commodity,
    });

    peer.inbox.messages.push({
      performative: PERFORMATIVE.PROPOSE,
      ontology: commodity === "crop" ? ONT_ENCOUNTER.OFFER_CROP : ONT_ENCOUNTER.OFFER_SEED,
      sender: fromId,
      body: offer as unknown as Record<string, unknown>,
      tickIssued: tick,
    });
  }

  private handleOffer(
    farmer: GameEntity,
    offer: OfferSeedBody,
    sender: number | "world",
    ctx: SimContext,
    commodity: TradeCommodity,
  ): void {
    if (farmer.id === undefined) return;
    if (sender === "world" || typeof sender !== "number") return;

    // Defensive — if the offer never made it into our pendingOffers map
    // (e.g. injected directly into the inbox by a test), track it now so
    // we can resolve ACCEPT later.
    if (!this.pendingOffers.has(offer.offerId)) {
      this.pendingOffers.set(offer.offerId, {
        offer,
        senderId: sender,
        recipientId: farmer.id,
        tick: ctx.tick,
        commodity,
      });
    }

    const personality = farmer.personality?.kind;
    if (!personality) {
      this.sendDecline(farmer.id, sender, offer.offerId, "no-personality", ctx.tick);
      this.pendingOffers.delete(offer.offerId);
      return;
    }
    const hooks = getPeerTradeHooks(personality);
    if (!hooks) {
      this.sendDecline(farmer.id, sender, offer.offerId, "no-hooks", ctx.tick);
      this.pendingOffers.delete(offer.offerId);
      return;
    }

    // Crop offers consult respondCrop (priced vs CROP_SELL_PRICE); a personality
    // without one declines all crop offers. Seed offers use respond.
    const responder = commodity === "crop" ? hooks.respondCrop : hooks.respond;
    if (!responder) {
      this.sendDecline(farmer.id, sender, offer.offerId, "no-crop-responder", ctx.tick);
      this.pendingOffers.delete(offer.offerId);
      return;
    }
    const result = responder(farmer, offer, sender, { tick: ctx.tick });
    if (result.decision === "accept") {
      this.sendAccept(farmer.id, sender, offer.offerId, ctx.tick);
      // Responder-side trust delta — initiator-side fires when their inbox
      // receives our ACCEPT and TrustSystem snoops it.
      applyTrustDelta(farmer, sender, DEFAULT_TRUST_CONFIG.acceptDelta);
    } else {
      this.sendDecline(
        farmer.id,
        sender,
        offer.offerId,
        result.reason ?? "declined",
        ctx.tick,
      );
      this.pendingOffers.delete(offer.offerId);
    }
  }

  /**
   * brief 24 — receive a gifted golden bean. One-way: the bean moves from the
   * giver to this farmer, and a large positive trust delta is applied from the
   * receiver (this farmer) toward the giver — a loyalty/alliance play. No
   * counter-payment, no ACCEPT round-trip.
   */
  private handleBeanGift(
    farmer: GameEntity,
    body: OfferBeanBody,
    sender: number | "world",
  ): void {
    if (farmer.id === undefined) return;
    if (sender === "world" || typeof sender !== "number") return;
    const giver = findById(this.world, sender, "farmer", "inbox");
    if (!giver?.inventory || !farmer.inventory) return;
    const qty = Math.max(1, body.quantity ?? 1);
    const have = giver.inventory.goldenBeans ?? 0;
    const moved = Math.min(qty, have);
    if (moved <= 0) return;
    giver.inventory.goldenBeans = have - moved;
    farmer.inventory.goldenBeans = (farmer.inventory.goldenBeans ?? 0) + moved;
    // Receiver → giver trust. Large delta (a gift is a strong loyalty signal).
    applyTrustDelta(farmer, sender, GIFT_TRUST_DELTA);
  }

  private handleAccept(
    farmer: GameEntity,
    body: AcceptBody,
    sender: number | "world",
  ): void {
    const pending = this.pendingOffers.get(body.offerId);
    if (!pending) return;
    if (farmer.id === undefined) return;
    // The ACCEPT must come from the offer's recipient (i.e. the peer who
    // received our OFFER_SEED).
    if (sender !== pending.recipientId) return;
    // And we must be the original sender (offer initiator).
    if (farmer.id !== pending.senderId) return;

    const initiator = findById(this.world, pending.senderId, "farmer", "inbox");
    const acceptor = findById(this.world, pending.recipientId, "farmer", "inbox");
    this.pendingOffers.delete(body.offerId);
    if (!initiator || !acceptor) return;
    if (!initiator.inventory || !acceptor.inventory) return;

    this.applyTransfer(initiator, acceptor, pending.offer, pending.commodity);
  }

  private handleDecline(body: DeclineBody): void {
    this.pendingOffers.delete(body.offerId);
  }

  /**
   * Atomic transfer. `direction` is the original initiator's role:
   *   - "buy"  → initiator pays gold, acceptor gives stock.
   *   - "sell" → initiator gives stock, acceptor pays gold.
   * `commodity` selects which inventory slot moves (seeds vs harvested crops).
   *
   * If either side can't fulfill (gold/stock), the transfer is silently
   * skipped to keep the sim deterministic.
   */
  private applyTransfer(
    initiator: GameEntity,
    acceptor: GameEntity,
    offer: OfferSeedBody,
    commodity: TradeCommodity,
  ): void {
    const inv1 = initiator.inventory!;
    const inv2 = acceptor.inventory!;
    const total = offer.unitPrice * offer.quantity;
    const crop: CropKind = offer.crop;
    const qty = offer.quantity;
    const stock1 = commodity === "seed" ? inv1.seeds : inv1.crops;
    const stock2 = commodity === "seed" ? inv2.seeds : inv2.crops;

    if (offer.direction === "buy") {
      // Initiator buys: pays gold to acceptor, receives stock.
      if (inv1.gold < total) return;
      if (stock2[crop] < qty) return;
      inv1.gold -= total;
      inv2.gold += total;
      stock2[crop] -= qty;
      stock1[crop] += qty;
      if (commodity === "crop") moveNormalQuality(inv2, inv1, crop, qty);
    } else {
      // Initiator sells: gives stock, receives gold from acceptor.
      if (inv2.gold < total) return;
      if (stock1[crop] < qty) return;
      inv2.gold -= total;
      inv1.gold += total;
      stock1[crop] -= qty;
      stock2[crop] += qty;
      if (commodity === "crop") moveNormalQuality(inv1, inv2, crop, qty);
    }
  }

  private sendAccept(
    fromId: number,
    toId: number,
    offerId: string,
    tick: number,
  ): void {
    const recipient = findById(this.world, toId, "farmer", "inbox");
    if (!recipient || !recipient.inbox) return;
    const body: AcceptBody = { offerId };
    recipient.inbox.messages.push({
      performative: PERFORMATIVE.ACCEPT,
      ontology: ONT_ENCOUNTER.ACCEPT,
      sender: fromId,
      body: body as unknown as Record<string, unknown>,
      tickIssued: tick,
    });
  }

  private sendDecline(
    fromId: number,
    toId: number,
    offerId: string,
    reason: string,
    tick: number,
  ): void {
    const recipient = findById(this.world, toId, "farmer", "inbox");
    if (!recipient || !recipient.inbox) return;
    const body: DeclineBody = { offerId, reason };
    recipient.inbox.messages.push({
      performative: PERFORMATIVE.REJECT,
      ontology: ONT_ENCOUNTER.DECLINE,
      sender: fromId,
      body: body as unknown as Record<string, unknown>,
      tickIssued: tick,
    });
  }

  /**
   * Inspector used by tests.
   */
  _pendingOfferCount(): number {
    return this.pendingOffers.size;
  }

  /**
   * Inspector used by tests.
   */
  _hasPendingOffer(offerId: string): boolean {
    return this.pendingOffers.has(offerId);
  }

  /**
   * Test helper — seed a pending offer directly so we can exercise TTL
   * without round-tripping through the inbox.
   */
  _seedPendingForTests(p: {
    offerId: string;
    senderId: number;
    recipientId: number;
    tick: number;
    offer: OfferSeedBody;
  }): void {
    this.pendingOffers.set(p.offerId, {
      offer: p.offer,
      senderId: p.senderId,
      recipientId: p.recipientId,
      tick: p.tick,
      commodity: "seed",
    });
  }
}

/**
 * brief 59 — keep `cropQuality` consistent when harvested crops change hands.
 * `crops[crop]` (already moved by the caller) must equal normal+silver+gold
 * when the per-quality breakdown is present. Traded units are treated as
 * Normal quality (sellers offload their lowest tier), so we shift the `normal`
 * bucket. No-ops when neither side tracks quality. Clamps to avoid negatives if
 * the giver's normal count somehow lags its total.
 */
function moveNormalQuality(
  giver: Inventory,
  receiver: Inventory,
  crop: CropKind,
  qty: number,
): void {
  if (giver.cropQuality) {
    const g = giver.cropQuality[crop];
    if (g) g.normal = Math.max(0, g.normal - qty);
  }
  if (receiver.cropQuality) {
    const r = receiver.cropQuality[crop];
    if (r) r.normal += qty;
  }
}
