/**
 * Regression coverage for the promoted serializers (chunk hollow-10a) —
 * adapted from `tools/hollow-sim/src/export.test.ts` (chunk hollow-07),
 * which still runs unchanged against these same functions via a re-export
 * shim. Kept here too so `@hollow/sim-core`'s own test run exercises the
 * code it now owns directly, not only transitively through the tool.
 */
import { describe, it, expect } from "vitest";
import { BEHAVIOR_GENES } from "../components";
import {
  METRICS_COLUMNS,
  metricsCsv,
  metricsJson,
  eventsJsonl,
  lineageJson,
  type MetricsRow,
} from "./export";
import type { ChronicleEvent } from "./chronicle";
import type { LineageEntry } from "../lineage";

function row(overrides: Partial<MetricsRow> = {}): MetricsRow {
  return {
    tick: 100,
    year: 1,
    population: 24,
    births_cum: 3,
    births_window: 3,
    deaths_window: 1,
    deaths_oldAge_window: 0,
    deaths_starvation_window: 1,
    deaths_violence_window: 0,
    community_count: 2,
    community_mean_size: 3.33333,
    mean_pairwise_trust: 0.512345,
    wealth_gini: 0.10005,
    coop_window: 5,
    antag_window: 1,
    genes: {},
    ...overrides,
  };
}

describe("METRICS_COLUMNS", () => {
  it("ends with one mean_gene_<name> column per BEHAVIOR_GENES entry, in order", () => {
    const tail = METRICS_COLUMNS.slice(METRICS_COLUMNS.length - BEHAVIOR_GENES.length);
    expect(tail).toEqual(BEHAVIOR_GENES.map((g) => `mean_gene_${g}`));
  });

  it("starts with tick, year, population", () => {
    expect(METRICS_COLUMNS.slice(0, 3)).toEqual(["tick", "year", "population"]);
  });
});

describe("metricsCsv", () => {
  it("writes a header row matching METRICS_COLUMNS", () => {
    const csv = metricsCsv([]);
    const [header] = csv.split("\n");
    expect(header).toBe(METRICS_COLUMNS.join(","));
  });

  it("renders integer columns as plain integers and float columns to 4 fixed decimals", () => {
    const csv = metricsCsv([row()]);
    const lines = csv.trim().split("\n");
    expect(lines.length).toBe(2);
    const cells = lines[1]!.split(",");
    const colIndex = (name: string) => METRICS_COLUMNS.indexOf(name);
    expect(cells[colIndex("tick")]).toBe("100");
    expect(cells[colIndex("population")]).toBe("24");
    expect(cells[colIndex("community_mean_size")]).toBe("3.3333");
    expect(cells[colIndex("mean_pairwise_trust")]).toBe("0.5123");
    expect(cells[colIndex("wealth_gini")]).toBe("0.1001");
  });

  it("is byte-identical across two calls with the same input (determinism)", () => {
    const rows = [row({ tick: 0, year: 0 }), row({ tick: 100, year: 1 })];
    expect(metricsCsv(rows)).toBe(metricsCsv(rows));
  });

  it("fills missing genes with 0 rather than omitting the column", () => {
    const csv = metricsCsv([row({ genes: { sociability: 0.75 } })]);
    const cells = csv.trim().split("\n")[1]!.split(",");
    const colIndex = (name: string) => METRICS_COLUMNS.indexOf(name);
    expect(cells[colIndex("mean_gene_sociability")]).toBe("0.7500");
    expect(cells[colIndex("mean_gene_risk")]).toBe("0.0000");
  });
});

describe("metricsJson", () => {
  it("rounds floats to 4 places but keeps them as JSON numbers", () => {
    const json = metricsJson([row()]);
    const parsed = JSON.parse(json) as Array<Record<string, number>>;
    expect(parsed).toHaveLength(1);
    expect(parsed[0]!["wealth_gini"]).toBeCloseTo(0.1001, 10);
    expect(typeof parsed[0]!["wealth_gini"]).toBe("number");
    expect(parsed[0]!["population"]).toBe(24);
  });
});

describe("eventsJsonl", () => {
  it("is empty for no events", () => {
    expect(eventsJsonl([])).toBe("");
  });

  it("writes one JSON object per line, tick/ontology first", () => {
    const events: ChronicleEvent[] = [
      { tick: 5, ontology: "family.birth", childId: 9, parentAId: 1, parentBId: 2 },
      { tick: 6, ontology: "family.death", agentId: 3, cause: "oldAge" },
    ];
    const jsonl = eventsJsonl(events);
    const lines = jsonl.trim().split("\n");
    expect(lines).toHaveLength(2);
    expect(JSON.parse(lines[0]!)).toEqual(events[0]);
    expect(JSON.parse(lines[1]!)).toEqual(events[1]);
    expect(lines[0]!.startsWith('{"tick":5,"ontology":"family.birth"')).toBe(true);
  });
});

describe("lineageJson", () => {
  it("sorts entries ascending by id even if given unsorted", () => {
    const entries: LineageEntry[] = [
      {
        id: 3,
        genome: { behavior: {}, aptitude: {}, appearance: { height: 1, build: 1, skinTone: "skin", hairTone: "hairBlack" } },
        parents: null,
        birthTick: 0,
        deathTick: null,
        deathCause: null,
        communityHistory: [],
      },
      {
        id: 1,
        genome: { behavior: {}, aptitude: {}, appearance: { height: 1, build: 1, skinTone: "skin", hairTone: "hairBlack" } },
        parents: null,
        birthTick: 0,
        deathTick: null,
        deathCause: null,
        communityHistory: [],
      },
    ];
    const parsed = JSON.parse(lineageJson(entries)) as LineageEntry[];
    expect(parsed.map((e) => e.id)).toEqual([1, 3]);
  });
});
