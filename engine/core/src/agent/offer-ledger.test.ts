import { describe, it, expect } from "vitest";
import { OfferLedger } from "./offer-ledger";

interface Offer {
  from: number;
  to: number;
  price: number;
}

describe("OfferLedger", () => {
  it("runs one contract-net round: add → accept resolves once → remove", () => {
    const ledger = new OfferLedger<Offer>(5);
    expect(ledger.add("o1", { from: 1, to: 2, price: 10 }, 0)).toBe(true);
    expect(ledger.has("o1")).toBe(true);
    expect(ledger.size).toBe(1);
    expect(ledger.get("o1")).toEqual({ from: 1, to: 2, price: 10 });

    // handshake dedup: the accept reply is claimed once per round
    ledger.beginHandshakeRound();
    expect(ledger.claimHandshake("o1")).toBe(true);
    expect(ledger.claimHandshake("o1")).toBe(false);

    // settlement removes the offer
    expect(ledger.remove("o1")).toBe(true);
    expect(ledger.has("o1")).toBe(false);
    expect(ledger.size).toBe(0);
  });

  it("does not overwrite an existing offer id", () => {
    const ledger = new OfferLedger<Offer>(5);
    ledger.add("o1", { from: 1, to: 2, price: 10 }, 0);
    expect(ledger.add("o1", { from: 9, to: 9, price: 99 }, 3)).toBe(false);
    expect(ledger.get("o1")).toEqual({ from: 1, to: 2, price: 10 });
  });

  it("expires offers older than the TTL, keeping fresh ones", () => {
    const ledger = new OfferLedger<Offer>(5);
    ledger.add("old", { from: 1, to: 2, price: 10 }, 0);
    ledger.add("fresh", { from: 3, to: 4, price: 20 }, 4);
    ledger.expire(6); // now-tick: old is 6 > 5, fresh is 2 <= 5
    expect(ledger.has("old")).toBe(false);
    expect(ledger.has("fresh")).toBe(true);
  });

  it("resets the dedup set each round", () => {
    const ledger = new OfferLedger<Offer>(5);
    ledger.beginHandshakeRound();
    expect(ledger.claimHandshake("x")).toBe(true);
    ledger.beginHandshakeRound();
    expect(ledger.claimHandshake("x")).toBe(true); // fresh round
  });
});
