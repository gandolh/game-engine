/**
 * MateQuest M4c — `run/mastery.ts` unit tests
 * (corpus/todos/2026-07-23-mathquest-M4c-persistent-mastery.md).
 */
import { describe, it, expect } from "vitest";
import type { MathTopic } from "../combat/types";
import {
  BLUEPRINTS,
  EMPTY_MASTERY_STORE,
  blueprintItemsFor,
  foldTopicOutcomes,
  masteryPct,
  masteryTier,
  overallMasteryTier,
  parseMasteryStore,
  type MasteryStore,
  type TopicMastery,
} from "./mastery";

const ALL_TOPICS: readonly MathTopic[] = ["addition", "subtraction", "multiplication", "comparison"];

function topic(correct: number, attempts: number): TopicMastery {
  return { correct, attempts };
}

function storeWith(overrides: Partial<Record<MathTopic, TopicMastery>>, blueprints: readonly string[] = []): MasteryStore {
  return {
    version: 1,
    topics: {
      addition: topic(0, 0),
      subtraction: topic(0, 0),
      multiplication: topic(0, 0),
      comparison: topic(0, 0),
      ...overrides,
    },
    blueprints,
  };
}

describe("masteryTier — boundaries", () => {
  it("0 below 5, 1 at exactly 5, 2 at exactly 15, 3 at exactly 30", () => {
    expect(masteryTier(0)).toBe(0);
    expect(masteryTier(4)).toBe(0);
    expect(masteryTier(5)).toBe(1);
    expect(masteryTier(14)).toBe(1);
    expect(masteryTier(15)).toBe(2);
    expect(masteryTier(29)).toBe(2);
    expect(masteryTier(30)).toBe(3);
    expect(masteryTier(1000)).toBe(3);
  });
});

describe("masteryPct — display only", () => {
  it("0 attempts -> 0 (never NaN/Infinity)", () => {
    expect(masteryPct(topic(0, 0))).toBe(0);
  });
  it("correct/attempts otherwise", () => {
    expect(masteryPct(topic(3, 4))).toBe(0.75);
  });
});

describe("overallMasteryTier — sums the 4 topics", () => {
  it("EMPTY_MASTERY_STORE sums to 0", () => {
    expect(overallMasteryTier(EMPTY_MASTERY_STORE)).toBe(0);
  });
  it("sums each topic's own tier independently", () => {
    const store = storeWith({
      addition: topic(5, 5), // tier 1
      subtraction: topic(15, 20), // tier 2
      multiplication: topic(30, 40), // tier 3
      comparison: topic(0, 0), // tier 0
    });
    expect(overallMasteryTier(store)).toBe(1 + 2 + 3 + 0);
  });
  it("maxes out at 12 (tier 3 on all 4 topics)", () => {
    const store = storeWith({
      addition: topic(30, 30),
      subtraction: topic(30, 30),
      multiplication: topic(30, 30),
      comparison: topic(30, 30),
    });
    expect(overallMasteryTier(store)).toBe(12);
  });
});

describe("foldTopicOutcomes — pure fold", () => {
  it("adds correct/attempts per topic without mutating either argument", () => {
    const store = storeWith({ addition: topic(2, 3) });
    const storeSnapshot = JSON.parse(JSON.stringify(store));
    const outcomes: Record<MathTopic, TopicMastery> = {
      addition: topic(1, 2),
      subtraction: topic(0, 0),
      multiplication: topic(0, 0),
      comparison: topic(0, 0),
    };
    const outcomesSnapshot = JSON.parse(JSON.stringify(outcomes));

    const result = foldTopicOutcomes(store, outcomes);

    expect(result.topics.addition).toEqual({ correct: 3, attempts: 5 });
    expect(result.topics.subtraction).toEqual({ correct: 0, attempts: 0 });
    expect(store).toEqual(storeSnapshot); // input untouched
    expect(outcomes).toEqual(outcomesSnapshot); // input untouched
  });

  it("crossing 15 correct on a topic unlocks EXACTLY that topic's blueprint id", () => {
    const store = storeWith({ addition: topic(14, 14) });
    const outcomes: Record<MathTopic, TopicMastery> = {
      addition: topic(1, 1), // 14 -> 15, crosses tier 2
      subtraction: topic(0, 0),
      multiplication: topic(0, 0),
      comparison: topic(0, 0),
    };
    const result = foldTopicOutcomes(store, outcomes);
    expect(result.blueprints).toEqual([BLUEPRINTS.addition.id]);
  });

  it("does NOT unlock a blueprint for a topic still below tier 2", () => {
    const store = storeWith({ addition: topic(4, 4) });
    const outcomes: Record<MathTopic, TopicMastery> = {
      addition: topic(1, 1), // 4 -> 5, only tier 1
      subtraction: topic(0, 0),
      multiplication: topic(0, 0),
      comparison: topic(0, 0),
    };
    const result = foldTopicOutcomes(store, outcomes);
    expect(result.blueprints).toEqual([]);
  });

  it("unlocking multiple topics in one fold yields a deduped, SORTED blueprints array", () => {
    const store = storeWith({ addition: topic(14, 14), multiplication: topic(14, 14) });
    const outcomes: Record<MathTopic, TopicMastery> = {
      addition: topic(1, 1),
      subtraction: topic(0, 0),
      multiplication: topic(1, 1),
      comparison: topic(0, 0),
    };
    const result = foldTopicOutcomes(store, outcomes);
    expect(result.blueprints).toEqual([...result.blueprints].sort());
    expect(new Set(result.blueprints).size).toBe(result.blueprints.length);
    expect(result.blueprints).toContain(BLUEPRINTS.addition.id);
    expect(result.blueprints).toContain(BLUEPRINTS.multiplication.id);
  });

  it("is idempotent to refold once a blueprint is already unlocked (no duplicate ids)", () => {
    const already = storeWith({ addition: topic(20, 20) }, [BLUEPRINTS.addition.id]);
    const noopOutcomes: Record<MathTopic, TopicMastery> = {
      addition: topic(1, 1),
      subtraction: topic(0, 0),
      multiplication: topic(0, 0),
      comparison: topic(0, 0),
    };
    const result = foldTopicOutcomes(already, noopOutcomes);
    expect(result.blueprints).toEqual([BLUEPRINTS.addition.id]);
  });
});

describe("blueprintItemsFor", () => {
  it("maps unlocked ids to their items", () => {
    const items = blueprintItemsFor([BLUEPRINTS.addition.id, BLUEPRINTS.comparison.id]);
    expect(items).toEqual([BLUEPRINTS.addition.item, BLUEPRINTS.comparison.item]);
  });
  it("ignores unknown ids defensively", () => {
    expect(blueprintItemsFor(["not-a-real-blueprint"])).toEqual([]);
  });
  it("empty input -> empty output", () => {
    expect(blueprintItemsFor([])).toEqual([]);
  });
});

describe("parseMasteryStore — persistence round-trip + validate-or-reset", () => {
  it("round-trips a well-formed store exactly", () => {
    const store = storeWith(
      { addition: topic(7, 9), comparison: topic(20, 25) },
      [BLUEPRINTS.subtraction.id, BLUEPRINTS.addition.id], // deliberately unsorted input
    );
    // Build a version whose `blueprints` is ALREADY the normalized (sorted) form, since a real
    // store would have come from `foldTopicOutcomes` (already sorted) — parse's OWN normalization
    // is exercised separately below.
    const normalized: MasteryStore = { ...store, blueprints: [...store.blueprints].sort() };
    const parsed = parseMasteryStore(JSON.stringify(normalized));
    expect(parsed).toEqual(normalized);
  });

  it("null -> EMPTY_MASTERY_STORE", () => {
    expect(parseMasteryStore(null)).toEqual(EMPTY_MASTERY_STORE);
  });

  it("garbage (unparseable JSON) -> EMPTY_MASTERY_STORE", () => {
    expect(parseMasteryStore("{not json")).toEqual(EMPTY_MASTERY_STORE);
  });

  it("a JSON value that isn't an object (e.g. an array or a number) -> EMPTY_MASTERY_STORE", () => {
    expect(parseMasteryStore("[1,2,3]")).toEqual(EMPTY_MASTERY_STORE);
    expect(parseMasteryStore("42")).toEqual(EMPTY_MASTERY_STORE);
  });

  it("wrong version -> EMPTY_MASTERY_STORE", () => {
    const store = storeWith({ addition: topic(10, 10) });
    const wrongVersion = { ...store, version: 2 };
    expect(parseMasteryStore(JSON.stringify(wrongVersion))).toEqual(EMPTY_MASTERY_STORE);
  });

  it("a missing topic key -> EMPTY_MASTERY_STORE (not a partial fill)", () => {
    const store = storeWith({ addition: topic(10, 10) });
    const { comparison: _dropped, ...rest } = store.topics;
    const malformed = { ...store, topics: rest };
    expect(parseMasteryStore(JSON.stringify(malformed))).toEqual(EMPTY_MASTERY_STORE);
  });

  it("a NaN topic field -> EMPTY_MASTERY_STORE", () => {
    const store = storeWith({ addition: topic(10, 10) });
    // JSON.stringify would drop a literal NaN to null, so build the string by hand.
    const malformed = JSON.stringify(store).replace('"correct":10', '"correct":null');
    expect(parseMasteryStore(malformed)).toEqual(EMPTY_MASTERY_STORE);
  });

  it("non-array blueprints -> EMPTY_MASTERY_STORE", () => {
    const store = storeWith({});
    const malformed = { ...store, blueprints: "not-an-array" };
    expect(parseMasteryStore(JSON.stringify(malformed))).toEqual(EMPTY_MASTERY_STORE);
  });

  it("blueprints are normalized: deduped + sorted, non-string entries dropped", () => {
    const store = storeWith({});
    const malformed = { ...store, blueprints: [BLUEPRINTS.multiplication.id, BLUEPRINTS.addition.id, BLUEPRINTS.addition.id, 42, null] };
    const parsed = parseMasteryStore(JSON.stringify(malformed));
    expect(parsed.blueprints).toEqual([BLUEPRINTS.addition.id, BLUEPRINTS.multiplication.id].sort());
  });

  it("ALL_TOPICS are always present on a successful parse, even a bare EMPTY_MASTERY_STORE round-trip", () => {
    const parsed = parseMasteryStore(JSON.stringify(EMPTY_MASTERY_STORE));
    for (const t of ALL_TOPICS) expect(parsed.topics[t]).toEqual({ correct: 0, attempts: 0 });
  });
});
