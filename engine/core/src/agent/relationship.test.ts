import { describe, it, expect } from "vitest";
import {
  applyRelationshipDelta,
  relationshipScore,
  pairKey,
  directedKey,
  UNIT_TRUST_SCALE,
  type RelationshipLedger,
} from "./relationship";

function ledger(): RelationshipLedger {
  return { byId: new Map<number, number>() };
}

describe("relationship primitives", () => {
  it("defaults to the scale's neutral value for an unknown peer", () => {
    expect(relationshipScore(ledger(), 3)).toBe(0.5);
    expect(relationshipScore(undefined, 3)).toBe(0.5);
  });

  it("nudges a score up and down from neutral", () => {
    const l = ledger();
    applyRelationshipDelta(l, 3, 0.05);
    expect(l.byId.get(3)).toBeCloseTo(0.55);
    applyRelationshipDelta(l, 3, -0.1);
    expect(l.byId.get(3)).toBeCloseTo(0.45);
  });

  it("clamps to the scale bounds", () => {
    const l = ledger();
    applyRelationshipDelta(l, 1, 5); // way over max
    expect(l.byId.get(1)).toBe(UNIT_TRUST_SCALE.max);
    applyRelationshipDelta(l, 2, -5); // way under min
    expect(l.byId.get(2)).toBe(UNIT_TRUST_SCALE.min);
  });

  it("honors a custom scale", () => {
    const l = ledger();
    const scale = { min: -100, max: 100, neutral: 0 };
    expect(relationshipScore(l, 9, scale)).toBe(0);
    applyRelationshipDelta(l, 9, -250, scale);
    expect(l.byId.get(9)).toBe(-100);
  });

  it("pairKey is order-independent; directedKey is not", () => {
    expect(pairKey(2, 5)).toBe(pairKey(5, 2));
    expect(directedKey(2, 5)).not.toBe(directedKey(5, 2));
    expect(directedKey(2, 5)).toBe("2->5");
  });
});
