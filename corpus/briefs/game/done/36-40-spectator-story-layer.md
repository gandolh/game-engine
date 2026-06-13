# Game Briefs 36–40 — Spectator story layer

**Status:** Done.
> Merged on 2026-06-13; original specs in git history.

The five briefs in this wave add the narrative and legibility layer that turns the Farm Valley sim into a watchable story: a post-run recap with auto-generated arcs, named rivalries between farmers, per-event drama scoring, a wealth-over-time graph, and ambient intention bubbles with a highlight-skip control.

---

## 36 End-of-run recap

- `RunHistorySystem` (`systems/run-history.ts`) — passive per-day collector; one `{ day, farmerId, gold, rank }` row per farmer per `DAY_START`, 100-day buffer, deterministic rank tie-break (gold desc → farmerId asc).
- `run-recap.ts` — pure `summarizeRun(history, events, finalStandings)` → `RunRecap { standings, arcs, headline, rivalries? }`; generates one-line season-arc sentences (surge / collapse / steady) and a run headline keyed to the highest drama-score event.
- `createGameOverPanel` / `renderGameOver` in `main.ts` extended: standings + arc per farmer + run headline + seed badge; feeds brief 37's rivalry outcomes when available.

## 37 Rivalries and relationship legibility

- `RivalrySystem` (`systems/rivalry.ts`) — passive accumulator (no bus traffic added); tracks unbounded `rivalryScore` per ordered pair, fires "rivalry formed" / "alliance formed" events once `RIVALRY_THRESHOLD` is crossed; deterministic pair key `min(a,b):max(a,b)`.
- `RelationshipMatrix` (`ui/relationship-matrix.ts`) — 4×4 trust grid rendered in the right column; cells color-coded by `trust.byId` value (red/neutral/green, EDG palette).
- RivalrySystem was **DORMANT in practice until brief 59** fixed the price-bug and no-seed-surplus that prevented real peer interaction; the plumbing shipped but rivalries rarely fired before that fix.

## 38 Drama scoring and narrative escalation

- `drama.ts` — pure `dramaScore(kind, ctx)` with a day-weighted multiplier; act bands 1–30 / 31–70 / 71–100; top-rank flips and late-game blights score 0.8–1.0, routine buys score ~0.1.
- `EventFeedSystem` extended: sets `drama` on every `EventEntry`; emits rank-change events ("Otto overtakes Hannah for 1st!") and a one-shot "Final stretch" line when day ≥ 90 and top-two gap is within a small %.
- Feed panel renders high-drama lines with a `★` marker and brighter EDG color; feeds the recap headline (36) and highlight-skip threshold (40).

## 39 Wealth-over-time competition graph

- `WealthGraph` (`ui/wealth-graph.ts`) — Canvas2D multi-line chart; one line per farmer using personality colors from `ui/colors.ts`; redraws per in-game day (not per animation frame); crossing markers align with brief 38's rank-change events.
- Consumes `client.runHistory` from brief 36's `RunHistorySystem` snapshot series; render-only — no new sim state or determinism surface.
- Embedded in the game-over recap panel as a shareable run artifact.

## 40 Ambient thought bubbles + highlight/skip

- **Part A — Intention bubbles**: snapshot builder maps each farmer's current `Intention.kind` to an `indicator/*` glyph; bubble appears on intention change (10-tick window, mirrors meet-indicator); `render-systems.ts` draws it via the existing meet-indicator path.
- **Part B — Highlight/skip**: `skipToHighlight` worker control message runs `runOneTick()` in a loop until `EventFeedSystem` emits a `drama >= HIGHLIGHT_THRESHOLD` event (or a safety-cap day limit); same tick body — only the stop condition is new, determinism unaffected.
- Zoom-to-event: feed-entry click snaps focus camera via `applyFocusAndPan`; feed entries carry involved farmer id for this.
- Atlas recipes updated (`tools/atlas-builder/src/recipes.ts`); frame-count assertion in `render-systems.test.ts` updated accordingly.
