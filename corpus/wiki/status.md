---
summary: The current-state snapshot — where each game stands, current sim/determinism behaviour, which gates run, architecture milestones, and open gaps. Brief-by-brief history lives in log.md and the todos/briefs directories, not here.
updated: 2026-09-19
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
  to a decision whose subject outlives the 40-tick answer-lag. [hollow-overview.md](hollow-overview.md) ·
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
