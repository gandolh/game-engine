import type {
  SimContext,
  System,
  World,
  AgentMessage,
} from "@engine/core";
import type { GameEntity, CropKind } from "../../components";
import { findById } from "../entity-helpers";
import {
  ONT_ENCOUNTER,
  type MeetBody,
  type OfferSeedBody,
  type OfferBeanBody,
  type AcceptBody,
  type DeclineBody,
} from "../../protocols/encounter";
import { PERFORMATIVE } from "../../protocols/performatives";
import { getPeerTradeHooks } from "../../agents/peer-trade-registry";
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
    // Only the lower-id farmer's MEET triggers initiate, so a pair never
    // initiates two simultaneous offers.
    if (farmer.id > meet.peerId) return;

    const personality = farmer.personality?.kind;
    if (!personality) return;
    const hooks = getPeerTradeHooks(personality);
    if (!hooks) return;

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

    if (!hooks.initiate) return;

    const offer = hooks.initiate(farmer, meet, { tick: ctx.tick });
    if (!offer) return;

    // Defensive idempotency: skip if we already have a live offer with this id.
    if (this.pendingOffers.has(offer.offerId)) return;

    const peer = findById(this.world, meet.peerId, "farmer", "inbox");
    if (!peer || !peer.inbox) return;

    this.pendingOffers.set(offer.offerId, {
      offer,
      senderId: farmer.id,
      recipientId: meet.peerId,
      tick: ctx.tick,
    });

    peer.inbox.messages.push({
      performative: PERFORMATIVE.PROPOSE,
      ontology: ONT_ENCOUNTER.OFFER_SEED,
      sender: farmer.id,
      body: offer as unknown as Record<string, unknown>,
      tickIssued: ctx.tick,
    });
  }

  private handleOffer(
    farmer: GameEntity,
    offer: OfferSeedBody,
    sender: number | "world",
    ctx: SimContext,
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

    const result = hooks.respond(farmer, offer, sender, { tick: ctx.tick });
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

    this.applyTransfer(initiator, acceptor, pending.offer);
  }

  private handleDecline(body: DeclineBody): void {
    this.pendingOffers.delete(body.offerId);
  }

  /**
   * Atomic transfer. `direction` is the original initiator's role:
   *   - "buy"  → initiator pays gold, acceptor gives seeds.
   *   - "sell" → initiator gives seeds, acceptor pays gold.
   *
   * If either side can't fulfill (gold/stock), the transfer is silently
   * skipped to keep the sim deterministic.
   */
  private applyTransfer(
    initiator: GameEntity,
    acceptor: GameEntity,
    offer: OfferSeedBody,
  ): void {
    const inv1 = initiator.inventory!;
    const inv2 = acceptor.inventory!;
    const total = offer.unitPrice * offer.quantity;
    const crop: CropKind = offer.crop;

    if (offer.direction === "buy") {
      // Initiator buys: pays gold to acceptor, receives seeds.
      if (inv1.gold < total) return;
      if (inv2.seeds[crop] < offer.quantity) return;
      inv1.gold -= total;
      inv2.gold += total;
      inv2.seeds[crop] -= offer.quantity;
      inv1.seeds[crop] += offer.quantity;
    } else {
      // Initiator sells: gives seeds, receives gold from acceptor.
      if (inv2.gold < total) return;
      if (inv1.seeds[crop] < offer.quantity) return;
      inv2.gold -= total;
      inv1.gold += total;
      inv1.seeds[crop] -= offer.quantity;
      inv2.seeds[crop] += offer.quantity;
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
    });
  }
}
