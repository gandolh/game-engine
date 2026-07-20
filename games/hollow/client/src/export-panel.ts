/**
 * `export-panel.ts` — in-app export buttons (chunk hollow-10b):
 * `metrics.csv`, `events.jsonl`, `lineage.json` for the CURRENT run. Uses
 * the SAME serializers the headless CLI (`@tool/hollow-sim`) does
 * (`@hollow/sim-core/observe`'s `metricsCsv`/`eventsJsonl`/`lineageJson`) —
 * byte-identical output for the same seed/no-perturbation is the whole
 * point of promoting them in chunk hollow-10a; this module does not
 * reformat anything.
 *
 * `metrics.csv`/`events.jsonl` read straight off `research-store.ts`
 * (already accumulated client-side). `lineage.json` needs data that ISN'T
 * in the client store — the lineage registry lives in the sim, which lives
 * in the Worker — so this module takes a `requestLineage` callback (backed
 * by `main.ts`'s `"requestLineage"`/`"lineage"` round trip on
 * `worker/sim-worker.ts`, the one read-only worker addition this chunk
 * makes) rather than reaching into worker plumbing itself.
 */
import { getEvents, getMetrics } from "./research-store";
import { metricsCsv, eventsJsonl, lineageJson } from "@hollow/sim-core/observe";
import type { LineageEntry } from "@hollow/sim-core/lineage";
import { HOLLOW_PAL } from "./render/hollow-palette";

export interface ExportPanelOptions {
  /** Round-trips a `"requestLineage"` query to the sim worker and resolves
   *  with every ever-recorded lineage entry (living or dead) — READ-ONLY,
   *  see `worker/sim-worker.ts`'s header. */
  requestLineage(): Promise<readonly LineageEntry[]>;
}

function el(tag: string, className: string): HTMLElement {
  const node = document.createElement(tag);
  node.className = className;
  return node;
}

function exportButton(label: string, onClick: () => void): HTMLButtonElement {
  const btn = el("button", "hollow-export-button") as HTMLButtonElement;
  btn.type = "button";
  btn.textContent = label;
  btn.style.color = HOLLOW_PAL.cream;
  btn.style.background = HOLLOW_PAL.slate;
  btn.addEventListener("click", onClick);
  return btn;
}

/**
 * Builds a `Blob` for `content` and triggers a browser download named
 * `filename` via a transient, off-DOM `<a download>` click, then revokes the
 * object URL. Takes `doc` (defaults to the real `document`) purely so tests
 * can pass a stub without touching module-level globals — same rationale as
 * `inspect-panel.ts`'s pure-DOM-building split, just for a side-effecting
 * browser API instead of a return value.
 */
export function triggerDownload(filename: string, content: string, mime: string, doc: Document = document): void {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const anchor = doc.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  doc.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

/** Builds the (unattached) export-buttons row. Each button reads the
 *  CURRENT accumulated state at click time (not a snapshot taken at mount),
 *  so exporting mid-run always reflects everything captured so far. */
export function createExportPanel(opts: ExportPanelOptions): HTMLElement {
  const root = el("div", "hollow-export-panel");

  const metricsBtn = exportButton("Export metrics.csv", () => {
    triggerDownload("metrics.csv", metricsCsv(getMetrics()), "text/csv");
  });
  const eventsBtn = exportButton("Export events.jsonl", () => {
    triggerDownload("events.jsonl", eventsJsonl(getEvents()), "application/jsonl");
  });
  const lineageBtn = exportButton("Export lineage.json", () => {
    void opts.requestLineage().then((entries) => {
      triggerDownload("lineage.json", lineageJson(entries), "application/json");
    });
  });

  root.appendChild(metricsBtn);
  root.appendChild(eventsBtn);
  root.appendChild(lineageBtn);
  return root;
}
