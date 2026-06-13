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

interface PendingOffer {
  offer: OfferSeedBody;
  senderId: number;
  recipientId: number;
  tick: number;
  commodity: TradeCommodity; 
}

export class EncounterTradeSystem implements System {
  readonly name = "EncounterTradeSystem";

  private readonly pendingOffers = new Map<string, PendingOffer>();
  private readonly resolvedHandshakes = new Set<string>(); 

  constructor(private readonly world: World<GameEntity>) {}

  _resetForTests(): void {
    this.pendingOffers.clear();
    this.resolvedHandshakes.clear();
  }

  run(ctx: SimContext): void {
    this.expireOffers(ctx.tick);

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

  private processInboxes(ctx: SimContext): boolean {
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
      for (let i = inbox.length - 1; i >= 0; i--) { 
        const msg = inbox[i];
        if (!msg) continue;
        if (!ENCOUNTER_ONTOLOGIES.has(msg.ontology)) continue;

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

    if (hooks.initiateCrop) {
      const cropOffer = hooks.initiateCrop(farmer, meet, { tick: ctx.tick });
      if (cropOffer) this.sendOffer(farmer.id, meet.peerId, cropOffer, "crop", ctx.tick);
    }

    if (farmer.id > meet.peerId) return; 
    if (!hooks.initiate) return;
    const offer = hooks.initiate(farmer, meet, { tick: ctx.tick });
    if (!offer) return;
    this.sendOffer(farmer.id, meet.peerId, offer, "seed", ctx.tick);
  }

  private sendOffer(
    fromId: number,
    toId: number,
    offer: OfferSeedBody,
    commodity: TradeCommodity,
    tick: number,
  ): void {
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

    const responder = commodity === "crop" ? hooks.respondCrop : hooks.respond;
    if (!responder) {
      this.sendDecline(farmer.id, sender, offer.offerId, "no-crop-responder", ctx.tick);
      this.pendingOffers.delete(offer.offerId);
      return;
    }
    const result = responder(farmer, offer, sender, { tick: ctx.tick });
    if (result.decision === "accept") {
      this.sendAccept(farmer.id, sender, offer.offerId, ctx.tick);
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
    if (sender !== pending.recipientId) return; 
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
      if (inv1.gold < total) return;
      if (stock2[crop] < qty) return;
      inv1.gold -= total;
      inv2.gold += total;
      stock2[crop] -= qty;
      stock1[crop] += qty;
      if (commodity === "crop") moveNormalQuality(inv2, inv1, crop, qty);
    } else {
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

  _pendingOfferCount(): number {
    return this.pendingOffers.size;
  }

  _hasPendingOffer(offerId: string): boolean {
    return this.pendingOffers.has(offerId);
  }

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
