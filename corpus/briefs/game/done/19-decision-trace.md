# Game Task 19 — Decision Rationale Trace ("Why")

## Context

Listed in [open-questions.md](../../../wiki/open-questions.md): during the design interview the user chose the lighter "visual emphasis + current/next intention" answer over a full reasoning log, with a note to *revisit once you start watching focused farmers and want to know why they decided things*. Brief 11 (focus-camera) shipped that focus mode — so the trigger condition is now met. Right now a focused farmer is opaque: you see them walk and trade but not *why*.

The BDI deliberation already computes the reasoning (it picks intentions from beliefs + desires under an AP budget). This brief surfaces a lightweight slice of it, not a full audit log.

## Goal

1. **Capture a one-line reason** when a personality enqueues an intention — e.g. `"plant radish: gold 60 > reserve 30, weather sunny"`, `"travel village: have crops to sell"`, `"skip buy: no offer under 110% shop price"`. Store the latest reason(s) on the farmer (a small `reason?: string` or a short ring buffer on the `Intentions`/beliefs component).
2. **Show it for the focused farmer**: when a farmer is focused (Brief 11), the observer (or a small adjacent panel) displays their current intention, next intention, and the captured reason.
3. **Keep it cheap**: at most the last 1–3 reasons per farmer. This is a narration aid, not an event-sourced trace (that would be a separate, heavier brief).

## Files in scope

- `packages/farm-valley/src/components.ts` — add an optional `reason` field (string or small `string[]`) to the relevant BDI component (likely `Intentions` or `Beliefs`). Read the file first to pick the right home.
- `packages/farm-valley/src/agents/conservative.ts`, `aggressive.ts`, `hoarder.ts`, `opportunist.ts` — at each `intentions.queue.push(...)` decision point, also record a short human-readable reason. Keep the strings terse and consistent across personalities.
- `packages/farm-valley/src/ui/observer.ts` — for the focused farmer, render the current/next intention + reason. (Coordinate with how Brief 11 marks the focused farmer.)
- `packages/farm-valley/src/ui/observer.test.ts` — add a test that the focused farmer's reason is rendered.
- Relevant `agents/*.test.ts` — assert that the reason field is populated for at least one representative decision per personality.

## Files you must NOT touch

- `systems/**` (the deliberation *dispatch* in `deliberate.ts` should stay thin — reasons are produced inside the personality functions, not the system).
- `world/**`, `world-setup.ts`, `sim-bootstrap.ts`, `protocols/**`.
- `render-systems.ts`, other `ui/**` panels, `screens/**`.
- Engine source.

## Determinism note

Reason strings are derived from already-deterministic sim state, so they don't affect determinism. Do not let reason computation pull in any wall-clock or random source. Reasons must be pure functions of the farmer's beliefs/desires at decision time.

## Acceptance criteria

- `npm run typecheck -w farm-valley` passes
- `npm run test -w farm-valley` passes (observer + at least one agent test updated)
- `npm run dev`: clicking a farmer to focus shows their current intention, next intention, and a one-line reason that updates as they act
- Reason strings are consistent in style across all four personalities
- No `.js` import suffixes; no new runtime deps

## Workflow

You're the sonnet executor. Read this brief, then `components.ts`, the four `agents/*.ts` files, and `ui/observer.ts` (plus how Brief 11 exposes the focused farmer). Implement. Run typecheck + tests before reporting done. Report files changed, test counts, and anything surprising. Do not commit — orchestrator handles that.
