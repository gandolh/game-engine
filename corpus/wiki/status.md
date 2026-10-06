---
summary: The current-state snapshot — where each game stands, current sim/determinism behaviour, which gates run, architecture milestones, and open gaps. Brief-by-brief history lives in log.md and the todos/briefs directories, not here.
updated: 2026-10-06
---

# Project Status

**What is true now.** This page was 119 KB (~30k tokens) until 2026-09-19, three times the next
largest page, because it had accumulated four things with four different lifetimes: current state, a
newest-first banner changelog, hand-maintained per-brief tables, and finished-programme records. Only
the first belongs here. The rest was not deleted — it moved to, or was already duplicated in, the
places that own it:

| what | where it lives now |
|---|---|
| the dated banners (a changelog) | [log.md](../log.md) — the chronological record, which already held a same-day entry for 55 of the 58 banners |
| per-brief one-liner tables | the directory itself: [todos/](../todos/) → [todos/closed/](../todos/closed/), which since 2026-09-19 is the **single** archive (the old `briefs/` tree was folded in) |
| the WebGL2 migration record | [decisions.md](decisions.md) → Renderer for the decision, [todos/closed/2026-08-18-webgl2-00-BUILD-ORDER.md](../todos/closed/2026-08-18-webgl2-00-BUILD-ORDER.md) + [-BUILD-STATE.md](../todos/closed/2026-08-18-webgl2-BUILD-STATE.md) for the build, [log.md](../log.md) for the bugs it found and the A/B probe technique |

**So: do not add a banner here.** Add a `log.md` entry and, if it changed what is *currently true*,
edit the matching line below.

## Where each game stands

- **Farm Valley** — shipped, in maintenance. 21 farmers over 100 in-game days, sim in a Node
  WebSocket server. [overview.md](overview.md) · [player-and-interaction.md](player-and-interaction.md)
- **Citadel** — shipped. Settlement sim; the 2026-06-28 **cozy pivot** is the design of record, and
  **multiplayer is deprecated** (decision #21). Challenge mode is built.
  [citadel-overview.md](citadel-overview.md) · [citadel-decisions.md](citadel-decisions.md) ·
  [citadel-mp-deprecated.md](citadel-mp-deprecated.md)
- **Hollow** — M1–M5 shipped (headless sim, 3D layer, research surfaces, governance/antagonism, Daily
  Life), plus hollow-13's LLM rationalizer seam (**off by default, byte-identical when off**). The 3D
  image is **no longer Chrome-gated** — it is WebGL2 and renders in-sandbox. The seam is **low-rate
  and genuinely live**: ~12% adoption under the contrarian diagnostic, and when an answer is adopted
  the world provably diverges (hollow-16, 2026-09-19 — every run now prints its own rate). One queued
  spec: [hollow-17](../todos/2026-09-19-hollow-17-rationalizer-attachment-point.md), moving the seam
  to a decision whose subject outlives the 40-tick answer-lag. Hollow also builds as an ImbatranimOS
  marketplace module (`npm run build:os -w @hollow/client` → `dist/os/hollow.mjs`, 2026-10-06);
  installing it waits on a push ([spec](../todos/2026-10-06-hollow-os-mount-build.md)).
  [hollow-overview.md](hollow-overview.md) ·
  [BUILD-STATE](../todos/2026-07-17-hollow-BUILD-STATE.md)
- **MateQuest** — built and playable, M0–M5 complete. Romanian-curriculum math roguelike; UI defaults
  to Romanian. **Grades I–IV** — settled 2026-09-19
  ([audit-54](../todos/closed/2026-09-18-audit-54-mathquest-grades-v-viii.md)): the repo used to
  advertise I–VIII, which was the curriculum the design was drawn from, not the build. Within I–IV it
  covers arithmetic and comparison; division, fractions, units and geometry are not implemented.
  [mathquest-overview.md](mathquest-overview.md)

## Current sim behaviour & determinism

- **Tests/typecheck:** green; latest counts in the newest [log.md](../log.md) entry (not tracked here). farm-valley runs node-by-default with jsdom scoped to the ~9 DOM test files (vitest `projects`); `CHECK_DETERMINISM` runs its passes in parallel `worker_threads`.
- **Determinism is load-bearing**, verified `MATCH ×3` (seeds `0xc0ffee/1/42`). The contract is *same seed reproduces itself byte-for-byte* — **not** equality to pre-change numbers. The 2026-06-09 radial reorg, briefs 41–46/48 (new systems), and 70/73/74/75 (balance/region/economy) each **re-baselined outcomes by design**; reproducibility was re-verified each time. Brief 48 verified MATCH ×3 at both `ticksPerDay=20` and `1200` (raw `Math.random` in ACT paths is a nondeterminism bomb — fishing/mining use forked rng channels; grep confirms zero `Math.random` in sim-core source).
- **Headless-probe pitfall:** a headless `bootstrapSim` check **must** pass `pathfinder: new JsPathfinder()`, or `TravelSystem` is omitted and every travel-gated action silently no-ops (false "dormant"). See [open-questions.md](open-questions.md) for the JS-vs-WASM route caveat.
- **Leader-runaway / peer-interaction:** the old "one farmer runs away, field flat, peer layer inert" premise is **stale** (21-farmer radial field self-distributes; brief 59 fixed the peer-trade price bug + added `OFFER_CROP`). Full detail + the residual drama gaps in [open-questions.md](open-questions.md).

## Gates that run

- **There is no hosted CI.** `.github/` and its Actions workflow were **removed 2026-09-19** at the
  user's request. The workflow is gone; the checks are not — the sequence it ran is now
  [`scripts/gates.mjs`](../../scripts/gates.mjs), run with **`npm run gates`**: typecheck → test →
  build → four **startup smokes** (`sim`, `sim:citadel`, `sim:hollow`, `preview`) → `pack-smoke`. It
  keeps going after a failure and exits non-zero with the list.
  - **The smokes are the part that matters.** `typecheck` and `test` both stayed green through a
    `.glsl` dynamic-import break that made every Node consumer of the renderer throw at import
    ([decisions.md](decisions.md) → Renderer). Only *starting* the real entry points caught it.
  - **Be honest about what was lost:** nothing schedules this any more. It runs when a human
    remembers, which is the state [audit-06](../todos/closed/2026-09-13-audit-06-ci-gate.md) existed
    to fix. The gate is reproducible; the *enforcement* is not.
  - `sim:hollow` takes **`MAX_YEARS`**, not `MAX_DAYS`/`TICKS_PER_DAY` like the other two sims —
    `tools/hollow-sim` reads a different env var for run length (`tools/hollow-sim/src/env.ts`), and
    passing `MAX_DAYS` silently no-ops into a full-length run.
- **Node `>=24`** is pinned in the root `package.json` `engines` field. It matches
  `infrastructure/Dockerfile`'s `node:24-alpine` — the one pin backed by a real deploy constraint —
  and clears both vite's and vitest's own `engines` ranges. (README's old "Node 20+" was the drift.)
- **`npm run pack-smoke`** proves the publish contract, not just that `npm pack` exits 0: it packs
  `@engine/core` + `@engine/ui` + `@engine/wasm-modules`, installs the tarballs into
  `examples/library-consumer` *outside* the workspaces, and runs its Node smoke. It is the last
  step of `npm run gates`.
- **Slow tests declare their budget.** No workspace sets a global `testTimeout`, so everything runs
  on vitest's **5s default** — and four sim/fuzz/property tests sat just over it, so a full
  `npm run test` failed 2–4 random tests per run depending on machine load (playtest-06, 2026-09-20).
  The pathological one was made cheap (`walkable-grid`'s adjacency scan, 5207ms → ~1100ms, via an
  exact bounds pre-filter); the three that are legitimately slow now pass an explicit `20_000` with a
  comment naming what makes them slow. **Do not fix a new instance by raising a global default** —
  that would also hide a test that got slow *because something regressed*.
- **In-canvas UI must fit `MIN_VIEWPORT` (1280×640).** `assertFitsViewport`
  ([fits-viewport.ts](../../engine/ui/src/layout/fits-viewport.ts)) walks a laid-out tree and fails
  naming every interactive node outside the box; each game calls it in its own HUD/screen tests.
  Pass `includeContent: true` where clipped *text* also matters (Citadel's goods chips, Farm's home
  screen) — the default watches interactive nodes only, and that alone would have missed half of what
  the playtest found.
- **Path-scoped guard tests** that fail on drift rather than on opinion: **determinism across all four
  `sim-core` packages plus `engine/core/src/{sim,ecs,runtime}`, the `.js`-suffix ban and the
  version-pinning rule** ([conventions.test.ts](../../engine/core/src/conventions.test.ts), sweep-01 —
  all three were previously enforced by comments and reviewer memory); the **client `build.target`**
  ([build-target.test.ts](../../engine/core/src/build-target.test.ts)); the **single
  `devicePixelRatio` reader** ([dpr-guard.test.ts](../../engine/core/src/dpr-guard.test.ts)); the
  **panel-prefs storage keys** ([panel-storage-keys.test.ts](../../engine/core/src/panel-storage-keys.test.ts));
  the per-game palette scan
  ([palette.test.ts](../../engine/core/src/render/palette.test.ts), which reads HTML and CSS too, not
  just TS), the layering rule ([layering.test.ts](../../engine/core/src/layering.test.ts), which
  classifies every workspace **on disk**), the per-directory GLSL lint, and the wasm drift check.
## Architecture milestones (no brief / cross-brief)

- **Seed-generated world (briefs 92 + 93, 2026-06-14):** the world is now **fully generated per seed** — rectangular islands (farms fixed-area/varied-aspect) placed by BSP, straight axis-aligned bridges with loops, ~60% land, runtime-varying via `WORLD_SEED`. Retired the radial-ring model + the brief-91 organic CA mask. Single funnel `generateWorld(seed)` + mutable `setActiveWorld` singleton; open-ocean boats (pass under bridges). Determinism: same `WORLD_SEED` → byte-identical (fast diff). Full detail in [world-generation.md](world-generation.md).
- **Client/server split (briefs 55–58):** the sim moved out of the browser into a Node server; the Vite app is a pure WebSocket client. Sim logic in `@farm/sim-core`; `@farm/server` hosts it; `npm run dev` runs both (Vite proxies `/sim`). Determinism held (WASM baseline). *(This bullet used to end with "Deploy gained a pm2 + Caddy-WS phase (dry-run-verified only)" — a mechanism that was never in the repo. Settled 2026-09-19, [audit-59](../todos/closed/2026-09-18-audit-59-deploy-not-in-version-control.md): this repo builds the sim server as a container ([`infrastructure/`](../../infrastructure/)); the **deployment configuration is maintained outside it** and deliberately not duplicated here. See [`infrastructure/README.md`](../../infrastructure/README.md).)* Found along the way: JS≠WASM pathfinder routes (server uses WASM), and a fixed module-global `lastFacing` bug (now per-run `SnapshotSpriteState`). See [architecture.md](architecture.md), [decisions.md](decisions.md).
- **Post-corpus (no brief):** Canvas2D renderer (replaced WebGPU), in-house ECS (replaced miniplex), WASM pathfinding infra, the sim↔render snapshot/interpolate boundary, home screen, headless run-sim, offline world-preview, README, **Pip** + interaction systems, and the **160×160 radial archipelago** (2026-06-09, since grown to 240×240 and **superseded 2026-06-14 by the seed-generated rect-island world** — briefs 92/93 above). A 2026-06-06 refactor split every >300-line file into module directories fronted by barrels — see [architecture.md](architecture.md) → *Module-directory convention*.

## Render backend

**WebGL2 is the only backend**, 2D and 3D, since 2026-08-18. `Canvas2dRenderer` and both WebGPU
backends are deleted; `createRenderer` takes no `backend` option. All four games were verified
rendering in a real browser at the time, and Hollow's 3D was re-verified in-sandbox 2026-09-19.
Decision and its rationale: [decisions.md](decisions.md) → Renderer. Build record, the six bugs the
migration exposed, and the reusable A/B probe technique: the 2026-08-18 entries in
[log.md](../log.md) and [todos/closed/2026-08-18-webgl2-BUILD-STATE.md](../todos/closed/2026-08-18-webgl2-BUILD-STATE.md).

## Open gaps

See [open-questions.md](open-questions.md) for the live list.

## Where spec and brief state lives

**The directory is the answer, not a table on this page.** A closed spec's own `status:` line is
frozen at authoring time, so it lies; a hand-maintained index here would be a third copy to keep in
step, and it was not kept in step.

- **Ready or in progress** — [todos/](../todos/). **Finished** — [todos/closed/](../todos/closed/).
- **Older briefs** — also [todos/closed/](../todos/closed/). The separate `briefs/` archive was folded in on 2026-09-19; numbered names (`117-…`) sit beside dated ones.
- **Why a thing was done that way** — [log.md](../log.md), newest first.
- **What must not be relitigated** — [decisions.md](decisions.md) and
  [citadel-decisions.md](citadel-decisions.md).

## Recent changes

Newest first, one line each. Detail is in the [log.md](../log.md) entry for the same date.

- **2026-09-20** — a **visual** pass over the six fixes produced two more closed specs and one
  correction. **The font silently substituted `?` for glyphs it had not baked:** MateQuest's map-pan
  edge arrows used `‹`/`›`, which the vendored UNSCII does not contain, so an affordance that has
  always existed had never once rendered — and playtest-05's claim that "nothing indicates the map
  pans" was wrong about the cause. Citadel's road-drag readout had two more (`—`, `·`). `glyphRows`
  now **reports** an uncovered code point once per glyph instead of substituting silently
  ([playtest-08](../todos/closed/2026-09-20-playtest-08-the-font-had-no-glyph-and-said-nothing.md)).
  Also: MateQuest's language toggle discards the run **by design** (now recorded in
  [decisions.md](decisions.md)) but never said so — it does now
  ([playtest-07](../todos/closed/2026-09-20-playtest-07-locale-toggle-silently-discards-the-run.md)).
  **The lesson of the pass:** the geometry guard added that morning has teeth, and is blind to paint
  order and glyph coverage — a draw-order regression that blanked the locale indicator passed all 14
  map-screen tests and was caught only by a screenshot.
- **2026-09-20** — first browser **playtest** of all four games, and all six specs it produced
  ([playtest-01..06](../todos/closed/)) **built, verified in a browser, and closed**. Two of them
  turned out to be one bug: an in-canvas root laid out with **no viewport bound** stranded MateQuest's
  submit + lifelines below the canvas and Citadel's `Pause`/speed past the right edge. Both HUDs'
  tests were green because they assert the retained *tree* and never asked **where it landed** — so
  the fix is a shared [`assertFitsViewport`](../../engine/ui/src/layout/fits-viewport.ts) plus a
  written floor, `MIN_VIEWPORT = 1280×640` ([decisions.md](decisions.md) → *Minimum supported
  viewport*), which did not exist before. Also: MateQuest's comparison teach step now reasons about
  single-digit pairs (~72% of grade 1) instead of quoting a place-value rule at them; Farm's home
  screen reads its rival count off the roster; Citadel gained `Space`/`1`/`2`/`4`; the bitmap font
  gained `→` (it had baked `←` only); and `npm run test` is no longer flaky — four tests were
  **timing out** against vitest's 5s default, not failing. `npm run gates` passes 8/8 and the suite
  passed three consecutive uncached full runs. **Hollow produced no defects.** Two premises
  corrected: **Farm's client does start in this sandbox** (the blocker was synthetic pointer events
  on in-canvas widgets, not the WebSocket proxy — route table in
  [architecture.md](architecture.md) → *Driving the clients headlessly*), and the `walkable-grid`
  adjacency test's tile×tile scan **could never have failed**, because every region pair is already
  ≥2 apart at the bounds level.
- **2026-09-19** — the reader-facing docs refreshed against this corpus. The root README was still a
  single-game Farm Valley README (Node 20, "fails CI", one palette, 4 farmers, `worker/sim-client/`);
  the Starlight site had never been told about MateQuest and still carried **WebGPU** claims,
  including Hollow's M2–M4 listed as *unbuilt* on a deleted backend. Both rewritten, a
  `games/mathquest` page added, and `hollow-overview.md`'s "branch `hollow`, local, unpushed / M1
  complete" opener corrected. Site builds clean (27 pages).
- **2026-09-19** — the `sweep-01`..`sweep-09` queue built out, all nine. Three repo-wide guards that
  can fail (determinism across every `sim-core`, `.js` suffixes, version pinning); the client bundler
  target pinned to `es2022`; one `effectiveDpr()` with Hollow's 3D finally applying the cap; Apollo-46
  collapsed from five copies to one; `panel-prefs` promoted to `@engine/ui`; Farm's boot no longer
  dies over plain HTTP; the UI moved off the CPU rasterizer onto the sprite batch. **The measurement
  that matters:** draw-group fragmentation is real (49 groups, 12.3× the floor) but lives in **one
  layer** — seven of eight coalesce perfectly.
- **2026-09-19** — audit sweep build-out: 23 of the 26 `audit-38..63` specs shipped. Four guards that
  could not fail now can (palette reads HTML/CSS, layering reads the filesystem, the `Rng` has golden
  vectors, the scheduler has a branch-agreement test); a Vickrey auction stopped charging the winner
  their own duplicate bid; `.dockerignore` stopped stripping the wasm the sim server reads.
  audit-53 corrected three pages that described deleted code.
- **2026-09-18** — a second six-lens audit sweep filed `audit-38..63` (46 raw findings → 26 filed).
- **2026-09-15** — hollow-13: the LLM seam exists and is anchored per-choice by identity. Its
  adoption rate was settled by
  [hollow-16](../todos/closed/2026-09-15-hollow-16-rationalizer-adoption-latency.md) on 2026-09-19.
  Also: the 2026-09-13 audit backlog (30 specs) and audit-32..37 all landed.
- **2026-09-14** — a CI gate was added (`audit-06`); **removed again 2026-09-19** by user
  request, with its checks preserved as `npm run gates` (see *Gates that run*).
- **2026-08-18** — WebGL2 became the single render backend; a corpus audit found the work queue was
  fiction and 452 links were dead.
