import { describe, it, expect } from "vitest";
import type { Genome } from "../components";
import { LineageRegistry } from "./registry";

function fakeGenome(): Genome {
  return { behavior: {}, aptitude: {}, appearance: { height: 1, build: 1, skinTone: "skin", hairTone: "hairBlack" } };
}

describe("LineageRegistry", () => {
  it("records a founder (parents: null) and returns it via get()", () => {
    const reg = new LineageRegistry();
    const genome = fakeGenome();
    reg.record({ id: 1, genome, parents: null, birthTick: 0 });
    const entry = reg.get(1);
    expect(entry).toBeDefined();
    expect(entry!.parents).toBeNull();
    expect(entry!.deathTick).toBeNull();
    expect(entry!.deathCause).toBeNull();
    expect(entry!.communityHistory).toEqual([]);
  });

  it("all() returns every recorded entry sorted ascending by id, regardless of record order", () => {
    const reg = new LineageRegistry();
    reg.record({ id: 3, genome: fakeGenome(), parents: null, birthTick: 0 });
    reg.record({ id: 1, genome: fakeGenome(), parents: null, birthTick: 0 });
    reg.record({ id: 2, genome: fakeGenome(), parents: null, birthTick: 0 });
    expect(reg.all().map((e) => e.id)).toEqual([1, 2, 3]);
  });

  it("markDeath sets deathTick/deathCause; no-op for an unrecorded id", () => {
    const reg = new LineageRegistry();
    reg.record({ id: 1, genome: fakeGenome(), parents: null, birthTick: 0 });
    reg.markDeath(1, 500, "oldAge");
    expect(reg.get(1)!.deathTick).toBe(500);
    expect(reg.get(1)!.deathCause).toBe("oldAge");

    reg.markDeath(999, 500, "starvation"); // no-op, no throw
    expect(reg.get(999)).toBeUndefined();
  });

  describe("areCloseKin", () => {
    it("is true for parent/child", () => {
      const reg = new LineageRegistry();
      reg.record({ id: 1, genome: fakeGenome(), parents: null, birthTick: 0 });
      reg.record({ id: 2, genome: fakeGenome(), parents: null, birthTick: 0 });
      reg.record({ id: 3, genome: fakeGenome(), parents: [1, 2], birthTick: 10 });
      expect(reg.areCloseKin(1, 3)).toBe(true);
      expect(reg.areCloseKin(3, 1)).toBe(true);
      expect(reg.areCloseKin(2, 3)).toBe(true);
    });

    it("is true for full and half siblings (shared >= 1 parent)", () => {
      const reg = new LineageRegistry();
      reg.record({ id: 1, genome: fakeGenome(), parents: null, birthTick: 0 });
      reg.record({ id: 2, genome: fakeGenome(), parents: null, birthTick: 0 });
      reg.record({ id: 3, genome: fakeGenome(), parents: null, birthTick: 0 });
      reg.record({ id: 10, genome: fakeGenome(), parents: [1, 2], birthTick: 10 });
      reg.record({ id: 11, genome: fakeGenome(), parents: [1, 3], birthTick: 10 }); // half-sibling (shares parent 1)
      expect(reg.areCloseKin(10, 11)).toBe(true);
    });

    it("is false for unrelated founders and false for an id not present in the registry", () => {
      const reg = new LineageRegistry();
      reg.record({ id: 1, genome: fakeGenome(), parents: null, birthTick: 0 });
      reg.record({ id: 2, genome: fakeGenome(), parents: null, birthTick: 0 });
      expect(reg.areCloseKin(1, 2)).toBe(false);
      expect(reg.areCloseKin(1, 999)).toBe(false);
    });

    it("is false for grandparent/grandchild or cousins (only parent/child + shared-parent count as close kin, v1 scope)", () => {
      const reg = new LineageRegistry();
      reg.record({ id: 1, genome: fakeGenome(), parents: null, birthTick: 0 });
      reg.record({ id: 2, genome: fakeGenome(), parents: null, birthTick: 0 });
      reg.record({ id: 10, genome: fakeGenome(), parents: [1, 2], birthTick: 10 });
      reg.record({ id: 11, genome: fakeGenome(), parents: null, birthTick: 10 });
      reg.record({ id: 20, genome: fakeGenome(), parents: [10, 11], birthTick: 20 });
      expect(reg.areCloseKin(1, 20)).toBe(false); // grandparent/grandchild
    });
  });

  describe("generationsOfDescent", () => {
    it("is 0 with only founders recorded", () => {
      const reg = new LineageRegistry();
      reg.record({ id: 1, genome: fakeGenome(), parents: null, birthTick: 0 });
      reg.record({ id: 2, genome: fakeGenome(), parents: null, birthTick: 0 });
      expect(reg.generationsOfDescent()).toBe(0);
    });

    it("reflects the deepest parent -> child -> grandchild chain", () => {
      const reg = new LineageRegistry();
      reg.record({ id: 1, genome: fakeGenome(), parents: null, birthTick: 0 }); // gen 0
      reg.record({ id: 2, genome: fakeGenome(), parents: null, birthTick: 0 }); // gen 0
      reg.record({ id: 10, genome: fakeGenome(), parents: [1, 2], birthTick: 10 }); // gen 1
      reg.record({ id: 11, genome: fakeGenome(), parents: null, birthTick: 10 }); // gen 0
      expect(reg.generationsOfDescent()).toBe(1);
      reg.record({ id: 20, genome: fakeGenome(), parents: [10, 11], birthTick: 20 }); // gen 2
      expect(reg.generationsOfDescent()).toBe(2);
    });
  });
});
