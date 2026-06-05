# Game Task 37 — Rivalries & Relationship Legibility

## Context

Spectator-sim research (Civ4 AI Survivor, RimWorld social opinion, CK2/CK3 emergent drama — sources: GDC "Emergent Stories in Crusader Kings II"; sullla.com AI Survivor) finds that **watchers attach to named pairwise conflict, not to the abstract leaderboard.** "Atticus vs. Hannah: 5 disputed trades" is a story; "rank 3 vs. rank 4" is a number. CK2's designer Henrik Fåhraeus named the minimal recipe for watchable drama: *many AI actors, AI personalities and opinions, changing conditions, and conflict.* Farm Valley has the first three (four personalities + a live trust matrix) but **never surfaces the opinions or names the conflict.**

The data already exists: [`TrustSystem`](../../../../packages/farm-valley/src/systems/trust.ts) maintains `farmer.trust.byId: Map<peerId, number>` in `[0,1]` (baseline `0.5`), updated by `applyTrustDelta` on ACCEPT/DECLINE/TRADE_COMPLETED/broken-CNP-commitment and (brief 24) bean gifts (+0.20). It is **entirely invisible to the viewer.** The [observer panel](../../../../packages/farm-valley/src/ui/observer.ts) shows per-farmer stats but no relationships.

## Goal

Make the trust matrix legible and turn accumulated negative history into **named rivalries**:

1. **Relationship matrix view** — a 4×4 (or 5×5 incl. Pip) opinion grid in the observer/right column: each cell color-coded by `trust.byId` (red = low/hostile, neutral, green = high/allied), readable in one glance. Follows the RimWorld "Relations Tab" precedent (red/neutral/green).
2. **Rivalry detection** — a passive system that tracks **cumulative adverse history** between ordered pairs (declined trades, broken commitments, bids lost to a specific peer, the same contested resource) and, when a pair crosses a threshold, **labels** it a rivalry: `Atticus ⚔ Hannah — 5 disputed trades`. Rivalries surface in the event feed when they *form* ("A rivalry is brewing: Atticus vs. Hannah") and feed the end-of-run recap (brief 36).
3. **Alliances (cheap symmetric case)** — when two farmers' mutual trust both exceed a high threshold, label it an alliance the same way. Optional if it falls out of the rivalry plumbing for free; don't over-build.

## Design decisions

- **Rivalry score is its own accumulator**, not just current trust — trust is a clamped `[0,1]` snapshot, but a rivalry is *history*. Track an unbounded `rivalryScore.byPair` (ordered pair key `min(a,b):max(a,b)`) incremented on each adverse event the rivalry cares about. A rivalry is "active" once score ≥ `RIVALRY_THRESHOLD` (tune to fire a handful per 100-day run, not zero and not constantly — verify against a live run).
- **Read-only snoop**, same discipline as `TrustSystem`/`EventFeedSystem`: observe the same messages `TrustSystem` already reacts to (place adjacent in the scheduler, before `PerceiveSystem` clears inboxes). Do NOT add bus traffic or mutate messages.
- **Deterministic labeling**: pair keys are ordered (id asc); the rivalry-formed event uses a stable key for the feed dedup set; same seed → same rivalries.
- **Matrix is render-side**: the snapshot carries each farmer's trust row; the panel is a pure reflection (like the leaderboard/slate panels).

## Files in scope

- `packages/farm-valley/src/systems/rivalry.ts` — NEW: passive accumulator + `RIVALRY_THRESHOLD`; exposes active rivalries (and alliances) on `BootedSim`. Emits a "rivalry formed" entry the event feed can pick up (or expose a list the feed reads — match the existing `EventFeedSystem` source pattern; do not double-count).
- `packages/farm-valley/src/systems/rivalry.test.ts` — NEW: N declined trades between a pair crosses the threshold and labels a rivalry; deterministic; mutual high trust → alliance.
- `packages/farm-valley/src/systems/event-feed.ts` — add a "rivalry formed" / "alliance formed" line (read the rivalry system's freshly-formed list; keep the dedup-by-key discipline).
- `packages/farm-valley/src/ui/relationship-matrix.ts` — NEW: a DOM panel rendering the trust grid (follow [ui/leaderboard.ts](../../../../packages/farm-valley/src/ui/leaderboard.ts) / `ui/slate-billboard.ts` pattern; colors from `ui/colors.ts` / `EDG.*` only).
- `packages/farm-valley/src/ui/relationship-matrix.test.ts` — NEW: renders a grid; cell color maps to trust band.
- `packages/farm-valley/src/ui/index.ts` + `ui/right-column.ts` — export + slot the matrix into the right column (mind the brief-25 flex container).
- `packages/farm-valley/src/worker/snapshot.ts` + `snapshot-builder.ts` — carry each farmer's trust row + active rivalries on the snapshot.
- `packages/farm-valley/src/worker/sim-client.ts` — expose `relationships` / `rivalries` getters.
- `packages/farm-valley/src/sim-bootstrap.ts` — register `RivalrySystem`; expose accessor.
- `packages/farm-valley/src/main.ts` — construct + `update()` the matrix panel from `onRender`.

## Files you must NOT touch

- `agents/**` — relationships are *observed*; do not change deliberation. (A future brief could let a rivalry *influence* bidding/trading; out of scope here.)
- `protocols/**` — read existing ontologies; add no new ones.
- Engine source.

## Determinism guarantee

The rivalry accumulator and matrix derive purely from sim state TrustSystem already reacts to. No `Date.now`/`Math.random`. Run `CHECK_DETERMINISM=1 npm run sim` across `0xc0ffee/1/42` after wiring — the snoop must not perturb outcomes.

## Acceptance

- `npm run typecheck` + `npm run test` green.
- `npm run dev`: a relationship grid is visible and updates; a live 100-day run forms at least one named rivalry surfaced in the feed; same seed reproduces the same rivalries.
- Feeds brief 36's recap when both are merged.

## Workflow

Sonnet executor. Read `TrustSystem` (the snoop + `applyTrustDelta`), `EventFeedSystem` (feed source/dedup pattern), and one `ui/*` panel. Implement, typecheck, test, run determinism. Report files changed + test counts. Do not commit.
