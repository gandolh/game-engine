import { describe, it, expect } from "vitest";
import { ONT_FAMILY, ONT_COMMUNITY, ONT_SOCIAL, ONT_STARVATION, ONT_SHOCK } from "@hollow/sim-core/protocols";
import type { ChronicleEvent } from "@hollow/sim-core/observe";
import { agentName } from "./agent-name";
import { formatChronicleEvent, chronicleEventActors, chronicleCategory, CHRONICLE_CATEGORIES } from "./chronicle-format";

const TICKS_PER_DAY = 20;
const FMT = { ticksPerDay: TICKS_PER_DAY };

function ev(overrides: Partial<ChronicleEvent> & { tick: number; ontology: string }): ChronicleEvent {
  return { ...overrides };
}

describe("formatChronicleEvent", () => {
  it("prefixes every line with the derived year (floor(tick / ticksPerDay))", () => {
    const line = formatChronicleEvent(
      ev({ tick: 245, ontology: ONT_STARVATION.ONSET, agentId: 1 }),
      FMT,
    );
    expect(line.startsWith("Y12  ")).toBe(true); // floor(245/20) = 12
  });

  it("formats family.bonded", () => {
    const line = formatChronicleEvent(
      ev({ tick: 20, ontology: ONT_FAMILY.BONDED, householdId: 1, partnerAId: 1, partnerBId: 2 }),
      FMT,
    );
    expect(line).toBe(`Y1  ${agentName(1)} and ${agentName(2)} bond`);
  });

  it("formats family.birth", () => {
    const line = formatChronicleEvent(
      ev({ tick: 20, ontology: ONT_FAMILY.BIRTH, householdId: 1, childId: 3, parentAId: 1, parentBId: 2 }),
      FMT,
    );
    expect(line).toBe(`Y1  ${agentName(1)} and ${agentName(2)} welcome ${agentName(3)}`);
  });

  it("formats family.death with cause", () => {
    const line = formatChronicleEvent(
      ev({ tick: 260, ontology: ONT_FAMILY.DEATH, agentId: 5, cause: "starvation" }),
      FMT,
    );
    expect(line).toBe(`Y13  ${agentName(5)} dies (starvation)`);
  });

  it("formats family.stage-changed", () => {
    const line = formatChronicleEvent(
      ev({ tick: 20, ontology: ONT_FAMILY.STAGE_CHANGED, agentId: 5, stage: "adult" }),
      FMT,
    );
    expect(line).toBe(`Y1  ${agentName(5)} grows into an adult`);
  });

  it("formats community.formed", () => {
    const line = formatChronicleEvent(
      ev({ tick: 20, ontology: ONT_COMMUNITY.FORMED, communityId: 4, memberIds: [1, 2, 3] }),
      FMT,
    );
    expect(line).toBe("Y1  Community #4 forms (3 members)");
  });

  it("formats community.split", () => {
    const line = formatChronicleEvent(
      ev({
        tick: 20,
        ontology: ONT_COMMUNITY.SPLIT,
        originalId: 4,
        newId: 9,
        keptMemberIds: [1],
        newMemberIds: [2],
        strandedAgentIds: [],
      }),
      FMT,
    );
    expect(line).toBe("Y1  Community #4 splits into #4 and #9");
  });

  it("formats community.dissolved", () => {
    const line = formatChronicleEvent(
      ev({ tick: 20, ontology: ONT_COMMUNITY.DISSOLVED, communityId: 4, memberIds: [1, 2] }),
      FMT,
    );
    expect(line).toBe("Y1  Community #4 dissolves");
  });

  it("formats social.gift", () => {
    const line = formatChronicleEvent(
      ev({ tick: 20, ontology: ONT_SOCIAL.GIFT, actorId: 1, targetId: 2, good: "food", amount: 3 }),
      FMT,
    );
    expect(line).toBe(`Y1  ${agentName(1)} gifts food to ${agentName(2)}`);
  });

  it("formats social.trade, marking a declined offer", () => {
    const line = formatChronicleEvent(
      ev({
        tick: 20,
        ontology: ONT_SOCIAL.TRADE,
        actorId: 1,
        targetId: 2,
        offerGood: "food",
        offerAmount: 1,
        wantGood: "material",
        wantAmount: 1,
        accepted: false,
      }),
      FMT,
    );
    expect(line).toBe(`Y1  ${agentName(1)} trades with ${agentName(2)} (declined)`);
  });

  it("formats social.steal-detected", () => {
    const line = formatChronicleEvent(
      ev({ tick: 20, ontology: ONT_SOCIAL.STEAL_DETECTED, actorId: 1, targetId: 2, actorGx: 3, actorGy: 4 }),
      FMT,
    );
    expect(line).toBe(`Y1  ${agentName(2)} catches ${agentName(1)} stealing`);
  });

  it("formats social.attack, marking a lethal hit", () => {
    const line = formatChronicleEvent(
      ev({ tick: 20, ontology: ONT_SOCIAL.ATTACK, actorId: 1, targetId: 2, lethal: true }),
      FMT,
    );
    expect(line).toBe(`Y1  ${agentName(1)} attacks ${agentName(2)} (fatal)`);
  });

  it("formats starvation-onset", () => {
    const line = formatChronicleEvent(ev({ tick: 20, ontology: ONT_STARVATION.ONSET, agentId: 7 }), FMT);
    expect(line).toBe(`Y1  ${agentName(7)} begins starving`);
  });

  it("falls back to a plain line for an unrecognized ontology", () => {
    const line = formatChronicleEvent(ev({ tick: 20, ontology: "made.up" }), FMT);
    expect(line).toBe("Y1  Event: made.up");
  });
});

describe("chronicleEventActors", () => {
  it("returns both partners for family.bonded, primary first", () => {
    expect(
      chronicleEventActors(ev({ tick: 1, ontology: ONT_FAMILY.BONDED, householdId: 1, partnerAId: 10, partnerBId: 11 })),
    ).toEqual([10, 11]);
  });

  it("returns child then parents for family.birth", () => {
    expect(
      chronicleEventActors(
        ev({ tick: 1, ontology: ONT_FAMILY.BIRTH, householdId: 1, childId: 5, parentAId: 1, parentBId: 2 }),
      ),
    ).toEqual([5, 1, 2]);
  });

  it("returns the sole agent for family.death", () => {
    expect(chronicleEventActors(ev({ tick: 1, ontology: ONT_FAMILY.DEATH, agentId: 9, cause: "oldAge" }))).toEqual([9]);
  });

  it("returns all member ids for community.formed", () => {
    expect(
      chronicleEventActors(ev({ tick: 1, ontology: ONT_COMMUNITY.FORMED, communityId: 1, memberIds: [1, 2, 3] })),
    ).toEqual([1, 2, 3]);
  });

  it("returns the joining agent for community.joined", () => {
    expect(chronicleEventActors(ev({ tick: 1, ontology: ONT_COMMUNITY.JOINED, communityId: 1, agentId: 4 }))).toEqual([
      4,
    ]);
  });

  it("returns kept + new + stranded for community.split", () => {
    expect(
      chronicleEventActors(
        ev({
          tick: 1,
          ontology: ONT_COMMUNITY.SPLIT,
          originalId: 1,
          newId: 2,
          keptMemberIds: [1],
          newMemberIds: [2],
          strandedAgentIds: [3],
        }),
      ),
    ).toEqual([1, 2, 3]);
  });

  it("returns actor+target for a two-party social verb, actor first", () => {
    expect(
      chronicleEventActors(ev({ tick: 1, ontology: ONT_SOCIAL.STEAL, actorId: 1, targetId: 2, good: "food", amount: 1, detected: false })),
    ).toEqual([1, 2]);
  });

  it("returns only the actor for social.share (no individual target)", () => {
    expect(
      chronicleEventActors(ev({ tick: 1, ontology: ONT_SOCIAL.SHARE, actorId: 1, communityId: 2, good: "food", amount: 1 })),
    ).toEqual([1]);
  });

  it("returns the sole agent for starvation-onset", () => {
    expect(chronicleEventActors(ev({ tick: 1, ontology: ONT_STARVATION.ONSET, agentId: 3 }))).toEqual([3]);
  });

  it("returns an empty list for an unrecognized ontology", () => {
    expect(chronicleEventActors(ev({ tick: 1, ontology: "made.up" }))).toEqual([]);
  });
});

describe("chronicleCategory", () => {
  it("maps every declared ontology to a category from CHRONICLE_CATEGORIES", () => {
    const allOntologies = [
      ...Object.values(ONT_FAMILY),
      ...Object.values(ONT_COMMUNITY),
      ...Object.values(ONT_SOCIAL),
      ONT_STARVATION.ONSET,
    ];
    for (const ontology of allOntologies) {
      expect(CHRONICLE_CATEGORIES).toContain(chronicleCategory(ontology));
    }
  });

  it("categorizes births/deaths/pairings", () => {
    expect(chronicleCategory(ONT_FAMILY.BIRTH)).toBe("births");
    expect(chronicleCategory(ONT_FAMILY.DEATH)).toBe("deaths");
    expect(chronicleCategory(ONT_FAMILY.BONDED)).toBe("pairings");
  });

  it("categorizes every community ontology as community", () => {
    for (const ontology of Object.values(ONT_COMMUNITY)) {
      expect(chronicleCategory(ontology)).toBe("community");
    }
  });

  it("categorizes cooperative social verbs as cooperation", () => {
    expect(chronicleCategory(ONT_SOCIAL.GIFT)).toBe("cooperation");
    expect(chronicleCategory(ONT_SOCIAL.SHARE)).toBe("cooperation");
    expect(chronicleCategory(ONT_SOCIAL.HELP)).toBe("cooperation");
    expect(chronicleCategory(ONT_SOCIAL.TEACH)).toBe("cooperation");
    expect(chronicleCategory(ONT_SOCIAL.TRADE)).toBe("cooperation");
  });

  it("categorizes antagonistic social verbs as antagonism", () => {
    expect(chronicleCategory(ONT_SOCIAL.STEAL)).toBe("antagonism");
    expect(chronicleCategory(ONT_SOCIAL.STEAL_DETECTED)).toBe("antagonism");
    expect(chronicleCategory(ONT_SOCIAL.SABOTAGE)).toBe("antagonism");
    expect(chronicleCategory(ONT_SOCIAL.RUMOR)).toBe("antagonism");
    expect(chronicleCategory(ONT_SOCIAL.ATTACK)).toBe("antagonism");
  });

  it("categorizes starvation-onset as famine", () => {
    expect(chronicleCategory(ONT_STARVATION.ONSET)).toBe("famine");
  });

  it("categorizes stage-changed and unknown ontologies as other", () => {
    expect(chronicleCategory(ONT_FAMILY.STAGE_CHANGED)).toBe("other");
    expect(chronicleCategory("made.up")).toBe("other");
  });

  it("categorizes every ONT_SHOCK ontology as famine (chunk hollow-11b)", () => {
    for (const ontology of Object.values(ONT_SHOCK)) {
      expect(chronicleCategory(ontology)).toBe("famine");
    }
  });
});

describe("ONT_SHOCK formatting (chunk hollow-11b)", () => {
  it("formats a famine shock with resource/factor/duration", () => {
    const line = formatChronicleEvent(
      ev({
        tick: 20,
        ontology: ONT_SHOCK.FAMINE,
        seq: 0,
        shock: { kind: "famine", resourceKind: "food", factor: 0.3, durationTicks: 120 },
      }),
      FMT,
    );
    expect(line).toBe("Y1  Famine strikes: food regen x0.30 for 120 ticks");
  });

  it("formats a boom shock", () => {
    const line = formatChronicleEvent(
      ev({
        tick: 40,
        ontology: ONT_SHOCK.BOOM,
        seq: 1,
        shock: { kind: "boom", resourceKind: "material", factor: 2.5, durationTicks: 60 },
      }),
      FMT,
    );
    expect(line).toBe("Y2  Boom: material regen x2.50 for 60 ticks");
  });

  it("formats a disaster shock", () => {
    const line = formatChronicleEvent(
      ev({ tick: 60, ontology: ONT_SHOCK.DISASTER, seq: 2, shock: { kind: "disaster", resourceKind: "food" } }),
      FMT,
    );
    expect(line).toBe("Y3  Disaster destroys a food node");
  });

  it("formats a plague shock", () => {
    const line = formatChronicleEvent(
      ev({
        tick: 80,
        ontology: ONT_SHOCK.PLAGUE,
        seq: 3,
        shock: { kind: "plague", need: "rest", amountPerTick: 2, durationTicks: 100 },
      }),
      FMT,
    );
    expect(line).toBe("Y4  Plague drains rest (2/tick for 100 ticks)");
  });

  it("has no single agent actor (chronicleEventActors returns [])", () => {
    expect(
      chronicleEventActors(
        ev({ tick: 20, ontology: ONT_SHOCK.FAMINE, seq: 0, shock: { kind: "famine", resourceKind: "food", factor: 0.3, durationTicks: 120 } }),
      ),
    ).toEqual([]);
  });
});
