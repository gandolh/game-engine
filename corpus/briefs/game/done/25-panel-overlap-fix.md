# Game Task 25 — Fix Observer / Activity Panel Overlap

## Context

A live run (Playwright, 2026-06-03; see screenshot `fv-02-running.png` at repo root) shows the **Activity feed panel rendering behind the Observer panel** in the top-right corner — only "Ac…" / "Da…" peek out from under the observer. Root cause confirmed in the source:

- [ui/observer.ts](../../../../packages/farm-valley/src/ui/observer.ts) — `position: fixed; top: 0; right: 0; width: 280px; zIndex: 9999`.
- [ui/event-feed-panel.ts](../../../../packages/farm-valley/src/ui/event-feed-panel.ts) — `position: fixed; top: 0; right: 0; width: 300px; zIndex: 9997`.

Both are anchored to the exact same corner; the observer (higher z-index) simply covers the activity feed. The feed (Brief 20) is working — it just isn't visible. The other corners are occupied: TL = debug overlay, BL = leaderboard, BR = slate-billboard, bottom-center = playback controls.

## Goal

Make both the Observer and the Activity feed visible in the top-right, stacked, and **reflowing when the observer grows** (the focused-farmer "why" block expands the observer height — a fixed pixel offset would break).

## Design decision (locked via grilling 2026-06-03)

**Shared right-column flex container.** Introduce one `position: fixed; top: 0; right: 0` flex column (`flexDirection: column`) that holds the observer panel then the event-feed panel as children. The observer sits on top (who), the activity feed below (what's happening). Because it's a flex column, the feed reflows down automatically when the observer's height changes — no hand-computed `top` offsets. This is preferred over the cheaper "give the feed a fixed `top` offset" because the observer's height is dynamic.

## Files in scope

- `packages/farm-valley/src/ui/observer.ts` — drop the individual `top/right/position` anchoring; render into the shared right column.
- `packages/farm-valley/src/ui/event-feed-panel.ts` — same; render below the observer in the column.
- `packages/farm-valley/src/ui/right-column.ts` — NEW (or fold into `dom.ts`): the shared fixed flex container; both panels mount into it.
- `packages/farm-valley/src/main.ts` — construct the column, mount both panels into it.
- `packages/farm-valley/src/ui/index.ts` — export the container if new.
- Matching `*.test.ts` — the column stacks both panels; the feed sits below the observer; the layout survives an observer height change (jsdom: assert DOM order / parent, not pixels).

## Files you must NOT touch

- The panels' *content* rendering (`update()` bodies) — this is layout only.
- Leaderboard / slate-billboard / playback (other corners, unaffected).
- Engine source.

## Acceptance

- A live run shows both the Observer and the full Activity feed in the top-right, no overlap, feed below observer.
- Clicking a farmer (which expands the observer with the "why" block) pushes the feed down rather than overlapping it.
- `npm test` / `npm run typecheck` green.
