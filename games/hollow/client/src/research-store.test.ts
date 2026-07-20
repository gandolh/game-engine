/**
 * Unit coverage for the client-side research store (chunk hollow-10a) —
 * pure accumulate/read/subscribe behavior, no worker/DOM involved.
 */
import { describe, it, expect, afterEach } from "vitest";
import type { ChronicleEvent, MetricsRow } from "@hollow/sim-core/observe";
import {
  ingestEvents,
  ingestMetricsRow,
  getEvents,
  getMetrics,
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
});
