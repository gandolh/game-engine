/**
 * Unit coverage for the client-side research store (chunk hollow-10a) —
 * pure accumulate/read/subscribe behavior, no worker/DOM involved.
 */
import { describe, it, expect, afterEach } from "vitest";
import { CHRONICLE_CAP, type ChronicleEvent, type MetricsRow } from "@hollow/sim-core/observe";
import {
  ingestEvents,
  ingestMetricsRow,
  getEvents,
  getMetrics,
  getDroppedEventCount,
  onEvents,
  onMetricsRow,
  resetResearchStore,
} from "./research-store";

afterEach(() => {
  resetResearchStore();
});

function event(overrides: Partial<ChronicleEvent> & { tick: number; ontology: string }): ChronicleEvent {
  return { ...overrides };
}

function row(overrides: Partial<MetricsRow> = {}): MetricsRow {
  return {
    tick: 0,
    year: 0,
    population: 8,
    births_cum: 0,
    births_window: 0,
    deaths_window: 0,
    deaths_oldAge_window: 0,
    deaths_starvation_window: 0,
    deaths_violence_window: 0,
    community_count: 0,
    community_mean_size: 0,
    mean_pairwise_trust: 0,
    wealth_gini: 0,
    coop_window: 0,
    antag_window: 0,
    genes: {},
    ...overrides,
  };
}

describe("ingestEvents / getEvents", () => {
  it("accumulates deltas across multiple ingests, in arrival order", () => {
    ingestEvents([event({ tick: 1, ontology: "family.birth" })]);
    ingestEvents([event({ tick: 2, ontology: "social.gift" }), event({ tick: 2, ontology: "social.share" })]);

    expect(getEvents()).toEqual([
      { tick: 1, ontology: "family.birth" },
      { tick: 2, ontology: "social.gift" },
      { tick: 2, ontology: "social.share" },
    ]);
  });

  it("is a no-op for an empty delta", () => {
    ingestEvents([event({ tick: 1, ontology: "family.birth" })]);
    ingestEvents([]);
    expect(getEvents().length).toBe(1);
  });

  it("notifies subscribers with only the new batch, not the accumulated history", () => {
    const received: (readonly ChronicleEvent[])[] = [];
    const unsubscribe = onEvents((delta) => received.push(delta));

    ingestEvents([event({ tick: 1, ontology: "family.birth" })]);
    ingestEvents([event({ tick: 2, ontology: "family.death" })]);

    expect(received).toEqual([
      [{ tick: 1, ontology: "family.birth" }],
      [{ tick: 2, ontology: "family.death" }],
    ]);

    unsubscribe();
    ingestEvents([event({ tick: 3, ontology: "social.gift" })]);
    expect(received.length).toBe(2); // unsubscribed — no third call
  });
});

describe("ingestEvents cap (audit-12) — bounds the client-side chronicle heap", () => {
  it("below the cap, nothing is dropped and getDroppedEventCount is 0", () => {
    ingestEvents([event({ tick: 1, ontology: "family.birth" })]);
    ingestEvents([event({ tick: 2, ontology: "social.gift" })]);

    expect(getEvents().length).toBe(2);
    expect(getDroppedEventCount()).toBe(0);
  });

  it("past the cap, retention is bounded, oldest events are dropped, newest are kept, and the tally is exact", () => {
    const overflow = 137;
    // One big delta so this stays a single ingest call — still exercises the
    // same per-event eviction path pushEvent uses for a delta of any size.
    const delta: ChronicleEvent[] = [];
    for (let i = 0; i < CHRONICLE_CAP + overflow; i++) {
      delta.push(event({ tick: i, ontology: "social.gift", seq: i }));
    }
    ingestEvents(delta);

    const events = getEvents();
    expect(events.length).toBe(CHRONICLE_CAP); // bounded
    expect(getDroppedEventCount()).toBe(overflow); // exact tally

    expect(events[0]!["seq"]).toBe(overflow); // oldest retained
    expect(events[events.length - 1]!["seq"]).toBe(CHRONICLE_CAP + overflow - 1); // newest retained
  });

  it("keeps evicting correctly across multiple ingests once past the cap", () => {
    for (let i = 0; i < CHRONICLE_CAP; i++) {
      ingestEvents([event({ tick: i, ontology: "social.gift", seq: i })]);
    }
    expect(getDroppedEventCount()).toBe(0);

    ingestEvents([event({ tick: CHRONICLE_CAP, ontology: "social.gift", seq: CHRONICLE_CAP })]);
    ingestEvents([event({ tick: CHRONICLE_CAP + 1, ontology: "social.gift", seq: CHRONICLE_CAP + 1 })]);

    expect(getDroppedEventCount()).toBe(2);
    const events = getEvents();
    expect(events.length).toBe(CHRONICLE_CAP);
    expect(events[events.length - 1]!["seq"]).toBe(CHRONICLE_CAP + 1);
    expect(events[0]!["seq"]).toBe(2); // the two oldest (seq 0, 1) were evicted
  });

  it("still delivers the FULL new batch to subscribers even when part of it is immediately evicted", () => {
    for (let i = 0; i < CHRONICLE_CAP - 1; i++) {
      ingestEvents([event({ tick: i, ontology: "social.gift", seq: i })]);
    }
    const received: (readonly ChronicleEvent[])[] = [];
    onEvents((delta) => received.push(delta));

    // This batch of 3 pushes 2 over the cap — the DOM panel subscriber still
    // gets to see all 3 (it applies its own, much smaller display cap).
    const batch = [
      event({ tick: 900, ontology: "social.gift", seq: 900 }),
      event({ tick: 901, ontology: "social.gift", seq: 901 }),
      event({ tick: 902, ontology: "social.gift", seq: 902 }),
    ];
    ingestEvents(batch);

    expect(received).toEqual([batch]);
    expect(getDroppedEventCount()).toBe(2);
  });
});

describe("ingestMetricsRow / getMetrics", () => {
  it("accumulates rows in sample order", () => {
    ingestMetricsRow(row({ tick: 0, year: 0 }));
    ingestMetricsRow(row({ tick: 20, year: 1, population: 9 }));

    const rows = getMetrics();
    expect(rows.length).toBe(2);
    expect(rows[0]!.year).toBe(0);
    expect(rows[1]!.year).toBe(1);
    expect(rows[1]!.population).toBe(9);
  });

  it("notifies subscribers with each new row", () => {
    const received: MetricsRow[] = [];
    onMetricsRow((r) => received.push(r));

    ingestMetricsRow(row({ year: 0 }));
    ingestMetricsRow(row({ year: 1 }));

    expect(received.length).toBe(2);
    expect(received.map((r) => r.year)).toEqual([0, 1]);
  });
});

describe("resetResearchStore", () => {
  it("clears accumulated events/rows/listeners", () => {
    ingestEvents([event({ tick: 1, ontology: "family.birth" })]);
    ingestMetricsRow(row());
    onEvents(() => {});
    onMetricsRow(() => {});

    resetResearchStore();

    expect(getEvents()).toEqual([]);
    expect(getMetrics()).toEqual([]);
  });

  it("resets the dropped-event tally", () => {
    for (let i = 0; i < CHRONICLE_CAP + 5; i++) {
      ingestEvents([event({ tick: i, ontology: "social.gift" })]);
    }
    expect(getDroppedEventCount()).toBe(5);

    resetResearchStore();

    expect(getDroppedEventCount()).toBe(0);
  });
});
