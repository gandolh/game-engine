---
title: "Engine — extract @engine/* as a reusable library (no publish) + stabilization sweep"
created: 2026-07-17
status: open
tags: [engine, packaging, library, stability, batch]
---

# Engine library extraction + stable point

User direction (2026-07-17): finish the engine to a stable point and make the engine
family reusable as a library — **without publishing**. Decisions taken:

- **Scope**: `@engine/core` + `@engine/ui` + `@engine/wasm-modules` (the full reusable
  seam; the two games stay in-repo as reference consumers).
- **Naming**: keep `@engine/*` for now; the public npm name is chosen at publish time
  (one rename commit then). **MIT license** fields + LICENSE files added now so
  tarballs are legally reusable.
- **Stable point includes everything open**: Challenge raider render hop,
  dither-specks/hillshade unification, Citadel UI Tab-reachability batch, festival
  venue (decision: **move to the market plaza AND make it multi-day, 2–3 days**), and
  starve-softness (decision: **accepted as intended** — cozy forgiving, Challenge
  slightly softer at real pace; documented, fixture unchanged).

## Library shape

Today all three packages export raw TS source (`main: ./src/index.ts`) — fine for the
monorepo (Vite/tsx/vitest compile TS), unusable outside it. Target:

1. **Build**: emitted `dist/` (ESM `.js` + `.d.ts`) per package, per subpath export.
2. **Exports**: tarball consumers resolve `dist`; internal monorepo dev keeps
   resolving TS source with zero churn (candidate mechanisms: `publishConfig.exports`
   rewrite at pack time, or a `development` exports condition — the packaging chunk
   owns this call and must prove BOTH internal dev and external consumption work).
3. **Metadata**: MIT license field + LICENSE file, description, repository, sane
   `files` allowlist (no tests, no repo-coupled files in the tarball), version 0.1.0.
4. **Pack-safety**: no runtime code may read outside the package (note: the palette
   guard test walks the repo — tests are excluded from the tarball, but audit for
   any runtime equivalent). `@engine/wasm-modules` must ship its wasm artifacts
   in-package (games keep their committed copies as consumers).
5. **Acceptance**: an out-of-workspace consumer fixture (`examples/library-consumer`,
   NOT in the npm workspaces list) installs the three `npm pack` tarballs via
   `file:` and runs a Node smoke (ECS world + scheduler tick, seeded Rng fork,
   message bus, wasm pathfinder from bytes; UI layout under jsdom) — green without
   any reference back into the monorepo source. **No `npm publish` anywhere.**
6. **Docs**: engine README(s) documenting the reusable seam (ECS, scheduler,
   deterministic Rng, message bus, snapshot/interp pattern, UI toolkit, wasm
   kernels) + a game-leakage audit of the export surface.

## Acceptance (overall)

- All three tarballs build, pack, and drive the consumer fixture green.
- Both games still fully green (typecheck 14/14, suites, determinism, scenarios).
- The stability items above closed (each with its own evidence), festival decision
  implemented with probe evidence, starve decision documented.
- Corpus updated (architecture/status/log; open-questions festival item resolved).

---

## RUN STATE / HANDOFF (written 2026-07-17 evening — resume from here)

**All build work is DONE and sits UNCOMMITTED in the working tree.** Remaining:
full verify gate → per-chunk commits → corpus closeout. No push, no publish, no
Claude co-author trailer; corpus committed separately from code.

### Chunks completed (all in working tree, evidence already gathered)

1. **@engine/core packaging** — v0.1.0, MIT, `tsconfig.build.json` + `scripts/postbuild.mjs`
   (rewrites extensionless imports → `.js`, copies 6 .wgsl) + `scripts/pack-swap.mjs`
   (prepack/postpack manifest swap — **`publishConfig.exports` does NOT work on npm**,
   empirically proven). Dev exports stay on `./src/*.ts` (zero monorepo churn).
2. **Three engine READMEs + game-leakage audit** — engine/core, engine/ui,
   engine/wasm-modules READMEs are signature-verified; only leak found (repo-walking
   palette.test.ts) is excluded from the tarball. I hand-fixed the ui README example
   to real signatures (`label("Score: 0")`, `button("Pause", { onActivate })`).
3. **@engine/ui + @engine/wasm-modules packaging** — same pattern; ui's dep pin
   bumped `@engine/core` 0.0.0→0.1.0 (0.0.0 404s external installs). wasm-modules
   diverges deliberately: no tsc, `exports` maps raw `./pathfinding.wasm` etc. from
   dist/, `prepack: npm run build` (asc).
4. **Festival plaza + multi-day** (opus agent, DONE_WITH_CONCERNS) — venue was
   ALREADY the market plaza (`festivalPodiumTile()` = `AUCTION_PODIUM_TILE` =
   snapNear('village',0,0)); the real lever was **`FESTIVAL_DAYS = 2`** in
   `protocols/festival.ts` (3 works by changing the constant; window fits its season:
   offset 12 + DAYS ≤ 25). Announce once on start day, submissions accumulate across
   the window, resolve day after last day. Evidence (1200 t/d, WASM pathfinder, one
   seed per process): cumulative-visited majorities went **0/12 → 8/12** across seeds
   0xc0ffee (4/4), 1 (3/4), 42 (1/4 — geometry-capped). **Simultaneous majority is
   physically impossible** (~5/20 ceiling even with forced top priority; 150–360-tile
   trips at 8 ticks/tile vs 1200-tick day). Priorities deliberately untouched (a −3
   bump breaks the coral excursion integration test). probe-festival.ts rewritten as
   the region-attendance evidence probe (honors `SEED=` for per-process runs).
   Gates it ran: typecheck 14/14, @farm/sim-core 88 files/867 tests, determinism
   byte-identical.
5. **Raider march glide** — `EntityInterpolator(segmentIntervals)` in
   entity-interp.ts; fx.ts passes `scaleTicks(RAIDER_MOVE_INTERVAL_TICKS, TICKS_PER_DAY)`;
   27 tests.
6. **Dither-specks/hillshade unification** — `speckLightBias(shade)` biases
   ditherClusters via `hillshade()`; `elevationField` kept (feeds makeHeightSampler).
7. **Tab-reachability** — `siegeDispatcher` wired into the keydown chain in
   citadel client input.ts (+ input.test.ts, dynamic-import trick vs Worker).
8. **Consumer fixture** (`examples/library-consumer`, OUTSIDE workspaces) — installs
   all three tarballs via `file:./tarballs/*.tgz`, smoke green: ECS spawn/query,
   `createRng(123).fork()` determinism, message bus, wasm pathfinder route from
   in-package bytes, ui widget/layout/theme in plain Node; isolation proven (all
   resolutions under fixture node_modules/…/dist). `tarballs/` + node_modules
   gitignored (README documents regen: `npm pack --pack-destination` ×3); lockfile
   committed. Typecheck stayed 14/14 after the pack cycle.
9. **connectivity.ts world-swap fix** (controller, inline) — festival agent found
   `componentMap` was never reset on world swap (unlike coral.ts/ports.ts) →
   multi-seed-in-one-process reuse of seed 1's map. Added `onWorldSwap(_resetComponentMap)`;
   connectivity.test.ts 9/9 green.

### Browser verification — DONE 2026-07-17 (Playwright vs vite :5174, Cozy)

- **Tab-reachability**: fresh boot → 20 Tabs walk build toolbar (House…Cancel) →
  **Status toggle focused** → Enter collapses to chip → Enter re-expands. ✔
- **Persisted-collapsed**: collapse → reload (`citadel.ui.panels.v1: {"status":false}`)
  → boots collapsed → Tab still reaches toggle → Enter re-expands. ✔
- **Terrain specks**: render cleanly with hillshade-biased density, no banding. ✔
- **Raider glide**: NOT live-verified (needs a raid; ~minutes of threat buildup at
  60 s/day) — accepted on the 27 interpolator unit tests + earlier live pace
  verification (20.0 ticks/s). Note for a future playtest.
- Quirks for next time: a11y mirror sits behind the canvas — activate via
  `document.querySelector('button:text')`.click() in evaluate, NOT Playwright click
  (canvas intercepts); synthetic KeyboardEvents don't move focus (needs trusted
  presses); new-game modal keeps Tab inside canvas UI until a ruleset is chosen.

### REMAINING WORK (in order)

1. **Full verify gate** (nothing has run the WHOLE matrix since all chunks merged):
   - `npm run typecheck` (expect 14/14)
   - `npm run test` all workspaces — citadel client needs `--maxWorkers=2`;
     farm world-gen property tests (bridge-graph, generate-world.property,
     walkable-grid) are load-flaky → re-run in isolation before trusting a red
   - Farm determinism: `npm run check-determinism -w @tool/run-sim`
   - Citadel determinism + sack/starve scenario gates (headless @tool/citadel-sim)
2. **Commits — one per chunk** (no Claude trailer, no push). Suggested seams from
   `git status`: (a) engine/core packaging + LICENSE/README/scripts + root
   package.json/.gitignore; (b) engine/ui + engine/wasm-modules packaging/READMEs;
   (c) examples/library-consumer; (d) festival multi-day (farm protocols/systems/
   agents + probe-festival); (e) connectivity fix (can fold into d — festival agent
   found it — or stand alone); (f) raider glide (citadel entity-interp/fx/
   raider-movement/index); (g) dither/hillshade (terrain-dither + 2 tests);
   (h) Tab-reachability (input.ts + input.test.ts).
3. **Corpus closeout** (separate commit): close THIS todo +
   2026-07-16-citadel-ui-pass-tab-reachability + 2026-07-16-citadel-dither-specks-hillshade
   (verify exact filenames in corpus/todos/); resolve open-questions.md festival item
   with the 0/12→8/12 numbers + "simultaneous majority physically impossible; residual
   levers (STEP_TICKS, world scale) are a separate call"; record the wiki-worthy trap
   (measure festival attendance CUMULATIVELY over the window, not same-day);
   document starve-softness as accepted-as-intended (user decision); architecture.md
   library-packaging section (dist build, pack-swap because publishConfig.exports
   is dead, wasm-modules divergence, fixture); status.md banner; log.md entry; lint.
4. **Deferred flags to note at closeout** (not fixed, intentional):
   - siegeMirror lacks `onFocusNode` wiring other mirrors have (inert in practice)
   - stale `@engine/core@0.0.0` pins in games/**/package.json (harmless in-workspace)
   - `?raw` .wgsl imports make `@engine/ui` root + `/render` bundler-only in bare Node
   - fixture `file:` deps dangle on fresh clone until tarballs regenerated (README'd)
   - farm world-gen property-test flakes under load (machine quirk, documented)
