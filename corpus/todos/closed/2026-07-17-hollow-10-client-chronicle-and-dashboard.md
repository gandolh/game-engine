# hollow-10 — client chronicle + metrics dashboard

status: todo
milestone: M3
depends-on: hollow-09 (3D scene), hollow-07 (event/metrics streams + export format)
created: 2026-07-17

## Goal
Turn the 3D viewer into a research instrument: a live event chronicle wired to the camera, and
a live metrics dashboard with in-app export. Deep "what led here" analysis is served by the
export, NOT by rewinding the world (locked M3 decision).

## Scope
### App shell
- Layout: the WebGPU 3D view + DOM side panels (chronicle, dashboard, inspect). DOM for the
  analytical UI (charts/lists); the 3D view stays the canvas. (Farm/Citadel already mix DOM
  panels with a canvas — reuse that pattern; `@engine/ui` for any in-canvas bits if needed.)

### Live chronicle (forward-only)
- A scrollable, filterable list of **significant events** streamed from the sim as they happen:
  births, deaths (by cause), pairings, community formed/joined/left/split/merged/dissolved,
  betrayals, sabotage, sanctions, famines/shocks. Human-readable lines ("Y12: North community
  splits after Bram betrays Ada").
- **Click an event → the camera jumps** to the actors in the *live* sim and highlights them
  (follow-cam). No world rewind; if the actors are dead, jump to the location / show the record.
- Filter by event type / community / family.

### Metrics dashboard (live time-series)
- Live-updating charts (sampled per sim-year, same sampler as hollow-07): population; births;
  deaths by cause; community count + mean size; mean pairwise trust; **wealth Gini**;
  cooperation-vs-sabotage rate; mean genome-trait drift.
- Charts are DOM/Canvas in the side panel; follow the project `dataviz` conventions for a
  consistent, accessible, palette-clean look.
- **In-app export**: dump `metrics.csv` + `events.jsonl` + `lineage.json` for the current run,
  reusing hollow-07's exact serializers (one source of truth for the format).

## Approach / notes
- The event stream + metrics sampler already exist headless (hollow-07). This brief consumes
  them in the browser over the Worker channel — do not fork a second event model; the Worker
  forwards the same structured events the CLI writes.
- Keep chronicle + dashboard read-only observers of snapshots/events → zero sim/determinism
  impact.

## Acceptance / gates
- Running a seed in-browser: chronicle fills with real events; clicking one moves the camera to
  the right agents; dashboard charts update live and match the headless CLI's numbers for the
  same seed (cross-check a short run).
- In-app export produces files byte-identical to the CLI's for the same seed + no perturbation.
- Read-only: `CHECK_DETERMINISM` unaffected.
- `typecheck` + client tests green; charts palette-clean.
