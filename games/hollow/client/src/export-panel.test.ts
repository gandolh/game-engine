import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { ONT_FAMILY } from "@hollow/sim-core/protocols";
import { metricsCsv, eventsJsonl, lineageJson } from "@hollow/sim-core/observe";
import type { LineageEntry } from "@hollow/sim-core/lineage";
import { ingestEvents, ingestMetricsRow, getEvents, getMetrics, resetResearchStore } from "./research-store";
import { createExportPanel } from "./export-panel";

let createObjectURL: ReturnType<typeof vi.fn>;
let revokeObjectURL: ReturnType<typeof vi.fn>;
let clickSpy: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  createObjectURL = vi.fn(() => "blob:mock-url");
  revokeObjectURL = vi.fn();
  vi.stubGlobal("URL", { createObjectURL, revokeObjectURL });
  clickSpy = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});
});

afterEach(() => {
  resetResearchStore();
  vi.unstubAllGlobals();
  clickSpy.mockRestore();
});

function buttonByLabel(root: HTMLElement, label: string): HTMLButtonElement {
  const btn = [...root.querySelectorAll<HTMLButtonElement>(".hollow-export-button")].find(
    (b) => b.textContent === label,
  );
  if (!btn) throw new Error(`no export button labeled "${label}"`);
  return btn;
}

async function capturedBlobText(): Promise<string> {
  const blob = createObjectURL.mock.calls[0]?.[0] as Blob;
  return blob.text();
}

describe("createExportPanel", () => {
  it("renders one button each for metrics/events/lineage", () => {
    const root = createExportPanel({ requestLineage: () => Promise.resolve([]) });
    expect(root.querySelectorAll(".hollow-export-button")).toHaveLength(3);
  });

  it("exporting metrics.csv downloads exactly metricsCsv(getMetrics())", async () => {
    ingestMetricsRow({
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
    });
    const root = createExportPanel({ requestLineage: () => Promise.resolve([]) });
    buttonByLabel(root, "Export metrics.csv").click();

    expect(clickSpy).toHaveBeenCalledOnce();
    expect(await capturedBlobText()).toBe(metricsCsv(getMetrics()));
  });

  it("exporting events.jsonl downloads exactly eventsJsonl(getEvents())", async () => {
    ingestEvents([{ tick: 20, ontology: ONT_FAMILY.DEATH, agentId: 1, cause: "oldAge" }]);
    const root = createExportPanel({ requestLineage: () => Promise.resolve([]) });
    buttonByLabel(root, "Export events.jsonl").click();

    expect(clickSpy).toHaveBeenCalledOnce();
    expect(await capturedBlobText()).toBe(eventsJsonl(getEvents()));
  });

  it("exporting lineage.json requests the worker round trip and downloads lineageJson(entries)", async () => {
    const entries: LineageEntry[] = [
      {
        id: 1,
        genome: { behavior: {}, aptitude: {}, appearance: { height: 1, build: 1, skinTone: "skin", hairTone: "hairBrown" } },
        parents: null,
        birthTick: 0,
        deathTick: null,
        deathCause: null,
        communityHistory: [],
      },
    ];
    const requestLineage = vi.fn(() => Promise.resolve(entries));
    const root = createExportPanel({ requestLineage });
    buttonByLabel(root, "Export lineage.json").click();

    await vi.waitFor(() => expect(clickSpy).toHaveBeenCalledOnce());
    expect(requestLineage).toHaveBeenCalledOnce();
    expect(await capturedBlobText()).toBe(lineageJson(entries));
  });
});
