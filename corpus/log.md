# Corpus Log

Append-only chronological record. Each entry starts with `## [YYYY-MM-DD] <kind> | <title>` so `grep '^## \[' log.md` produces a readable timeline.

**Compaction note (updated 2026-07-02):** older entries are collapsed into dated **era summaries** (2026-06-11/06-12, and now the 2026-06-19 → 2026-06-30 Citadel wave). Only 2026-07-01 onward is kept as full prose. Full text for every trimmed entry is in git history (`git log -p -- corpus/log.md`); each brief's detail lives in [briefs/](briefs/) (done/superseded), closed todos in [todos/closed/](todos/closed/), and durable synthesis in [wiki/](wiki/). Treat the trimmed git prose as **obsolete** — if an old decision resurfaces and can't be justified from current code + the wiki + the brief, re-derive it rather than trusting the archived narrative.

## [2026-07-20] build | Hollow — M2 COMPLETE (engine WebGPU 3D renderer + cozy gene-driven town)

Continued straight into M2 on branch **`hollow`** (local, unpushed) after M1's exit-bar. M2 adds the
first true-3D path in the repo. Built in five Sonnet-executor slices, controller-verified + committed
per slice; details folded into [wiki/hollow-overview.md](wiki/hollow-overview.md) "M2".

- **hollow-08a engine render3d core** (`b5f146e`) — promoted Citadel's generic primitive→mesh
  generators into `@engine/core/render3d` (material key generalized to `string`; engine ships no
  palette) + the 3D math that did not exist: column-major `mat4` (`perspective` targets WebGPU clip
  z∈[0,1]), `OrbitCamera`, ray-`pick`. Pure, 37 headless tests (incl. the WebGPU-z trap).
- **hollow-08b WebGPU render layer** (`575b9d0`) — standalone (not the 2D sprite-batch path):
  device/pipeline-cache/instanced drawIndexed + `scene3d.wgsl` (flat-shade via dpdx/dpdy → 3-step
  warm toon ramp + hemispheric ambient + day/night + emissive glow). All CPU packing factored into
  pure unit-tested fns; GPU orchestration is the only untestable-here part.
- **hollow-09a town shell** (`0848664`) — `@hollow/client` 3D app off the Worker snapshot stream:
  ground+relief, community territory tints, family-growing clustered homes, stock-scaled resource
  nodes, orbit god-cam, day/night. Added a render-only per-agent **`action`** snapshot field
  (determinism-safe — written by ACT, read only by the snapshot builder; proven byte-identical).
- **hollow-09b gene-driven humanoids** (`c3b8441`) — low-poly humanoids colored by appearance genes
  via the **mesh-variant scheme** (skin×hair×pose, instanced), gene/stage scale + walk cycle +
  action poses on the render clock.
- **hollow-09c legibility + interaction** (`4bd5994`) — 2D overlay glyphs, `[T]` name/need tags,
  click ray-pick → read-only worker `inspect` round-trip → DOM inspect panel (BDI/genome/needs/
  relationships/kin/community), follow-cam.

**Verified:** `@hollow/client` 143 + `@engine/core` 269 tests green, whole-workspace typecheck clean
(all 18 packages, Farm/Citadel untouched), palette guard green. **NOT self-verified:** the live 3D
image — WebGPU can't render headless here (Citadel finding), so M2's visual acceptance is
**Chrome-gated** (`npm run hollow`; engine demo `npm run demo3d -w @hollow/client`). **Lesson
reinforced:** for a milestone whose value is visual + un-headless-verifiable, maximize the
headless-testable surface (all CPU packing/mesh/math/projection factored into pure tested fns) and
hand the human a precise open-in-Chrome checklist rather than claim a visual pass.

## [2026-07-20] build | Hollow — M1 COMPLETE (05–07 done, exit-bar PASSED); new wiki/hollow-overview.md

Resumed the Hollow backlog and finished M1 on branch **`hollow`** (local, unpushed). New synthesis
page [wiki/hollow-overview.md](wiki/hollow-overview.md) is the durable Hollow entry point + M1
exit-bar findings; live tracker stays [todos/2026-07-17-hollow-BUILD-STATE.md](todos/2026-07-17-hollow-BUILD-STATE.md).

- **hollow-05 lifecycle/pair-bonding/genetics** (`c8c3c2b`) — re-dispatched fresh (old stash
  dropped/ignored). Controller caught a population-dynamics defect the green unit tests hid (ample
  food removed the carrying-capacity brake → 3000-tick test near-hang). Root finding: food scarcity
  alone is **bistable** at test timescales. Fix (user-approved): a **density-dependent birth brake**
  (`BIRTH_PERCAPITA_FOOD_TARGET`) → seed-robust plateau. Lesson: compressed test profiles must copy
  EVERY knob — a dropped `gestationTicks` silently reverts to the 250 default and inverts dynamics.
- **hollow-06 social verbs** — split 6a mechanics (`5bd92c5`: 9 verb effects + `Skills` + witness
  fan-out) + 6b deliberation (`b802738`: deterministic genome-gated verb choice). Verified in real
  headless runs: cooperation AND antagonism emerge, diverge ~10× by seed, population stays bounded.
  Known limitation logged: `steal`/`trade` dormant in the current economy (correct + unit-tested;
  activate under persistent-inventory/scarcer economy).
- **hollow-07 headless research CLI** (`@tool/hollow-sim`) — metrics.csv + events.jsonl +
  lineage.json + `CHECK_DETERMINISM`; defaults to the validated compressed-stable research profile.
- **M1 EXIT-BAR PASSED** — read real exports (seeds 7 & 101, 1200 ticks): communities form+dissolve,
  cooperation-vs-sabotage diverges by seed (27% vs 7% antag), 16-generation lineages with trait
  drift, bounded population, deterministic. Details in wiki/hollow-overview.md.

Note: a **concurrent session** is building an Astro docs site (`docs/` + root config +
`package-lock.json` churn) in the same tree — those paths are NOT part of the Hollow commits (shared-
tree rule: commit only your own paths).

## [2026-07-17] build | Hollow — M1 waves 01–04 done (branch `hollow`), paused before hollow-05

Building the Hollow backlog via plan-split-dispatch (backlog/wave mode; opus controller,
Sonnet executors except hollow-02 on opus). On branch **`hollow`** (local, unpushed). **Done +
verify-gate-green + committed:** hollow-01 skeleton (`411a561`), hollow-02 engine agent-kernel
promotion + Farm refactor (`a9d2a5f`), hollow-03 needs/economy/scarcity (`1790d59`), hollow-04
relationships/emergent-communities (`9bbc90f`). Each passed typecheck 17/17 + narrow Hollow
tests. hollow-02's Farm behavior-preservation was gated on unit tests only (byte-identity diff
skipped per user; fallback = revert the encounter-trade `OfferLedger` swap).

**Paused before hollow-05** (lifecycle/genetics) at the quota limit. Its partial WIP (mid
pair-bonding, non-compiling) is in `git stash@{0}`, NOT committed — plan is to DROP it and
re-dispatch hollow-05 fresh. Full resume state + the 01–04 API handoffs are in
`corpus/todos/2026-07-17-hollow-BUILD-STATE.md` (the live tracker). Remaining M1: 05 → 06 → 07 →
**M1 exit-bar gate** before M2/3D.

## [2026-07-17] plan | Hollow — third game: multi-generational social sim (full M1–M4 briefs queued)

New game **Hollow** designed via a two-round grill-me interview and queued as
`todos/2026-07-17-hollow-*`: a `00-BUILD-ORDER` design-of-record + **fourteen briefs `01`–`13`**
covering all four milestones (M1 `01`–`07`, M2 `08`–`09`, M3 `10`–`11`, M4 `12`–`13`). No code
yet — planning only.

**What it is.** A director/observer **multi-generational social simulation** on the shared engine.
User authors personas + seeds a ~30–60-agent, ~64² town, then observes/perturbs (no player avatar).
BDI substrate, **no LLM in v1** (genome trait-vector is the LLM plug-in seam). Motivated by the
user's prior LLM agent-society study (github.com/gandolh/agent-society), where unanchored agents
hallucinated — so Hollow's thesis is that **decisions must have weight**: needs + scarce located
resources + a real economy anchor every choice; scarcity regulates population.

**Locked decisions of record** (full list in the BUILD-ORDER):
- Rendering = **true 3D, raw WebGPU, promoted into `@engine/core`**; cozy = flat-shade-by-normal +
  AO + warm Apollo-46 ramps; meshes **baked from parametric primitives** (Citadel's mesh generators,
  rendered live not rasterized). M2 work.
- **Emergent** communities (crystallize from trust ties; grow/split/merge/dissolve) — not authored.
- **Multi-generational**: aging, death (age/starvation/violence), pair-bond→children, open-ended run.
- **Genome = behavior(BDI) + aptitude + appearance**, heritable + *visible* in 3D; crossover+mutation.
  `Personality` = genome (fixed); `Beliefs/Desires` = lived (not inherited).
- Social verbs: cooperative + antagonistic + kinship in v1; governance in M4.
- **Isolation answer**: promote Farm's generic agent kernel (needs, FSM, deliberate-registry, CNP
  trade, trust) into `@engine/core`, refactor Farm to consume it (behavior-preserving via multi-seed
  `EXPORT=json` diffs) — shared mechanics leave Farm's package, so the two games get *more* isolated.
- Output: timeline + metrics dashboard + CSV/JSON export + headless `@tool/hollow-sim`. Web-Worker
  transport (Citadel-style). Packages `@hollow/sim-core`, `@hollow/client`, `@tool/hollow-sim`.

**Phasing (headless-first):** M1 sim vertical slice (prove emergence in exported data) → M2 WebGPU 3D
cozy view → M3 client research surfaces → M4 governance + LLM-rationalizer seam. M1 exit bar: a seed
run over ≥5 generations shows communities forming/dissolving, seed-dependent coop-vs-sabotage
divergence, ≥3-gen lineages with trait drift, scarcity-stable population — deterministic.

**M2–M4 locked decisions** (round 2): camera = free orbit+pan+zoom perspective god-cam (ray-pick);
legibility = subtle-diegetic (action glyph + territory tint + kid-scale) with a `[T]` name/need-bar
toggle, full detail on click; fidelity = living cozy town (gene-driven low-poly humanoids w/ walk +
action poses, per-household homes, readable nodes, day/night). Timeline = **live chronicle +
camera-jump, NO world rewind** (deep analysis via export). Authoring = guided archetypes+sliders
writing the CLI-shared persona-seed. Perturbation = **time controls + environmental shocks only**
(logged → seed+persona+intervention-log reproduces a run); agent-edits/rule-tuning deferred.
Governance = emergent leaders (standing→contestable) + votable norms + collective sanctions + splits.
**LLM seam = bounded**: BDI yields the grounded feasible candidates, LLM *chooses among them +
narrates why* (cannot invent actions — anchoring enforced by schema, the fix for the prior study's
hallucination); **event-triggered, async, BDI fallback**; **off by default = byte-deterministic**, on
= labeled non-deterministic live mode with a prompt-keyed cache for reproducible replay; pluggable
provider, default Claude Haiku 4.5, stub impl is the CI default.

## [2026-07-17] stable-point | Engine library extraction DONE + 4 stability items — todo queue EMPTY (`7212575`…`c67d6d8`)

The engine-library-extraction todo — the declared **stable point** — is closed, emptying the todo
queue. Build work had been committed across an earlier session (`7212575` `@engine/core` packaging,
`4297341` `@engine/ui`+`@engine/wasm-modules`, `ff6322f` consumer fixture, `98f66d0` festival multi-day,
`4822ecc` connectivity world-swap reset, `821d304` raider glide, `1aba7c0` dither/hillshade, `e3660fa`
Tab-reachability); this session ran the closeout: verify gate → the one fix it surfaced → corpus.

**The reusable seam.** `@engine/core` + `@engine/ui` + `@engine/wasm-modules` are MIT libraries at
v0.1.0, **not published** (games stay as in-repo reference consumers). Dual resolution: monorepo dev
resolves raw TS source; tarballs resolve emitted `dist/` via a **prepack/postpack manifest swap**
(`pack-swap.mjs`) — `publishConfig.exports` was empirically proven **not to work on npm** (dead end).
`postbuild.mjs` rewrites extensionless imports→`.js` and copies `.wgsl`; `@engine/wasm-modules` ships
its wasm in-package with no tsc. `examples/library-consumer` (outside the workspaces list) installs the
three `npm pack` tarballs via `file:` and drives them green in plain Node — proving external
consumption with no monorepo reference. Only game-leak found (repo-walking palette test) is excluded
from the tarball. Full mechanics in [wiki/architecture.md](wiki/architecture.md) "Library packaging".

**Four stability items** landed with the packaging: festival made **multi-day** (`FESTIVAL_DAYS=2`) —
the venue was already the market plaza, so multi-day was the real lever; cumulative attendance rose
0/12→8/12 across seeds and **simultaneous same-day majority is physically impossible** (open-question
resolved). Citadel **raider-march glide** (`EntityInterpolator` segment intervals), **dither-specks
biased by `hillshade()`**, and **Status-toggle Tab-reachability** (`siegeDispatcher` in the keydown
chain). **Starve-softness** at the new 1× pace is **accepted as intended** (documented, fixture
unchanged).

**Trap (wiki-worthy):** measure festival attendance **cumulatively over the window, not same-day** —
150–360-tile trips at 8 ticks/tile against a 1200-tick day cap same-day gatherings at ~5/20 even at
forced top priority. Probes MUST run at 1200 t/d with the WASM pathfinder (20 t/d yields zero
encounters; JS pathfinder can't route some excursion targets).

**Closeout fix (`c67d6d8`).** The todo's "deferred, harmless in-workspace" flag for the stale
`@engine/core@0.0.0` consumer pins was **wrong**: with the engine bumped to 0.1.0, a clean `npm install`
can't satisfy `0.0.0` and 404s the registry (it only looked harmless because node_modules symlinks were
already present, and turbo wasn't even installed). Bumped all 9 consumer manifests to 0.1.0 (exact-pin
convention). **Lesson: on any engine version bump, keep consumer pins in lockstep** — the symlinked dev
tree hides the break until a fresh install.

**Verify (medium+determinism, user-chosen):** typecheck 14/14; touched-workspace tests green
(engine/core 194, engine/ui 166, farm/sim-core 867, citadel/client 549 `--maxWorkers=2`); Farm
determinism MATCH (30d, covers the festival window); Citadel grow stdout byte-identical ×2, `sack` PASS
(keep sacked day 71), `starve` gameOver. Deferred-by-choice: siegeMirror `onFocusNode` (inert), `?raw`
.wgsl keeps `@engine/ui` bundler-only in bare Node, raider glide not yet live-verified in a raid.

## [2026-07-17] wave | 2026-07-16 build queue DONE — 5 todos built, 2 premises overturned (`b89c317`…`bbf6e43`)

Two-wave `plan-split-dispatch` run ({surplus ∥ citadel-pace ∥ skill-gating} → tiered-contracts →
festival). The opus skill-gating chunk was killed twice by session limits; the controller finished
it inline (tests, WASM-pathfinder evidence probe, economy.md model). Two todo premises were
overturned by measurement — the wave's most valuable output:

- **Brief 70's "no-stock" was a probe artifact** ([surplus closeout](todos/closed/2026-07-16-farm-starting-crop-surplus.md)):
  probe-70 hardcoded 20 t/d, at which EncounterSystem yields ZERO meets; at the real 1200 t/d peer
  trades already closed by day 4-10. Surplus kept as flavor by user call (`b89c317`).
- **"The festival venue is fine" is false** ([festival closeout](todos/closed/2026-07-16-farm-festival-priority-bump.md)):
  3 real deliberation bugs fixed (`bbf6e43` — ap<40 gate on a 0-AP travel, tavern-first stable-sort
  tie, deliberateSleep same-tick podium eviction) but farms are 200+ tiles from the podium at
  8 t/tile vs a 1200-tick day → majority attendance is geometry-bound. Reopened in
  [open-questions.md](wiki/open-questions.md) (venue / travel speed / multi-day).
- **Citadel pace** (`186dc5e`): 60 s/day at 1×, browser-measured; per-day outcomes invariant via
  `pacing.ts` re-denomination; sack day 71 + starve + determinism green at BOTH tick rates; old
  saves replay byte-identically (saves carry ticksPerDay). Watch: haul efficiency ×60 → starve
  fixture survives at real pace; Challenge raiders hop visually (~1 tile/9 s) — render follow-up.
- **Skill-gating** (`4649bd1`): shared g/AP valuation derived from live tables; 10/10/9 of 21
  farmers lean non-farm (19/20/15 distinct sheets), farming still #1 every seed. Foraging is the
  dominant lean (~8/seed) — tuning note. Synthesis in [economy.md](wiki/economy.md).
- **Harbor tiers** (`7d8bc7e`): size axis at the normal reputation tier only; zero personality-file
  edits needed (the have≥quantity gate was already size-agnostic). All 3 non-hoarder kinds commit
  on every seed; hoarder niche intact.

**Standing methodology rule** (now in status.md + probes): behavior probes run at 1200 t/d with the
WASM pathfinder — 20 t/d under-reports every travel-gated behavior; the JS pathfinder cannot route
some excursion targets. Gates on the integrated tree: typecheck 14/14; farm sim-core 866 (with the
3 world-gen property tests confirmed as pre-existing load-flaky — pass on re-run/isolation);
citadel 309+536; farm client 246; sack/starve exit 0; Farm determinism MATCH; Citadel determinism
byte-identical at 20 and 1200 t/d; pace verified live in-browser (20.0 ticks/s → 60 s/day).

## [2026-07-16] decisions | Direction call + fresh 7-todo queue (both games active, polish phase)

User adjudicated the open-questions variants and set direction: **both games are in active
development; focus = polish, improvements, fixes toward a stable version** (the "Farm is in
maintenance" premise is retired — recorded in open-questions.md settled premises). Filed 7 todos:
four Farm sim items (starting crop surplus, tiered harbor contracts, skill-gated intentions,
festival priority bump), Citadel pace slowdown (with the ticks-per-day-is-a-balance-lever trap
note), the Citadel UI-pass batch file (Status-toggle Tab reachability), and the dither-specks/
hillshade unification (fold into next terrain pass). Terrain relief approved as-is at 1x eyeball;
perishability stays parked by explicit choice. The live-drama spare-capacity cluster in
open-questions.md is resolved into these todos.

## [2026-07-16] hygiene | Todo queue emptied — the two 2026-06-22 stragglers closed

[farm-perishability-distance-pricing](todos/closed/2026-06-22-farm-perishability-distance-pricing.md)
closed as **parked, not built** (its double deferral stands: 2026-06-27 deliberate skip + brief 101
closed unbuilt 2026-07-15 with Farm in maintenance; the file remains the spec of record — refile a
fresh brief if Farm resumes).
[openttd-art-and-gameplay-influence](todos/closed/2026-06-22-openttd-art-and-gameplay-influence.md)
closed as **absorbed** (all concrete children shipped or parked; rationale lives in
citadel-art-style + the shipped briefs). Inbound links repaired (superseded brief 101, an old log
entry, citadel-road-builder-ux). **`corpus/todos/` now has zero open items.**

## [2026-07-16] wave | 2026-07-15 todo batch wave 2 — final 3 todos closed; batch complete 10/10 (`43617b9`, `d3952ad`, `96ec2f0`)

Wave 2 of the same `plan-split-dispatch` run: {debug overlay (Sonnet) ∥ farm art (opus)} → status
panel (Sonnet). The overlay chunk was demoted senior→junior after recon showed the engine hoist
already existed — the reference-pattern rule paying off.

- **[Citadel debug overlay](todos/closed/2026-07-15-citadel-fps-debug-overlay.md)** (`43617b9`) —
  pure reuse of `engine/core/src/debug/overlay.ts`; dev-only, bottom-right (top-left is the
  resource/siege corner) via a new additive `OverlayCorner` engine option, Farm pixel-identical.
- **[Citadel collapsible Status](todos/closed/2026-07-15-citadel-status-collapsible-panel.md)**
  (`d3952ad`) — brief-117 pattern + `citadel.ui.panels.v1` prefs port; **defaults OPEN** (siege
  warning signal); the 117 zero-rect trap pre-empted with a size-key sentinel. **Follow-up worth a
  todo if it bites:** `input.ts` doesn't forward keydown to `siegeDispatcher`, so the toggle isn't
  canvas-Tab reachable (pre-existing; mouse + a11y-mirror paths work).
- **[Farm big-asset art](todos/closed/2026-07-15-farm-big-asset-quality.md)** (`96ec2f0`) — 23
  recipes (5 cottages, 4 trees, stones/cairn, 12 props) to Citadel's technique bar strictly on
  EDG32; frames unchanged; committed atlas artifacts regenerated in-commit; before/after =
  `npm run preview` at `96ec2f0` vs parent.

Gates on the integrated tree: typecheck 14/14; farm-client 246, citadel-client 535 (+16 from the
panel chunk), engine-core 194, atlas-builder 7, atlas-recipes 8; integrated browser pass (Status
toggle open-by-default + overlay bottom-right in one Citadel session; Farm world loads the new art;
bonus — the day's shop slate led with Pumpkin, re-confirming wave 1's height fix on the original
offending item). Citadel client vitest hit the documented default-concurrency flake once mid-wave;
`--maxWorkers=2` remains the rule on this machine.

## [2026-07-16] wave | 2026-07-15 todo batch wave 1 — 5 UI/render todos closed (`0cae160`…`b389832`)

Orchestrated via `plan-split-dispatch` in waves: {farm panel trio ∥ pip marker ∥ citadel placement}
→ citadel walkers → citadel terrain (the three citadel chunks serialized on the `citadel-renderer.ts`
hub after recon showed they'd collide). Five chunks, 3 Sonnet + 2 opus; one opus chunk (walkers) was
killed mid-edit by a session limit and resumed from its own transcript cleanly.

- **Farm panel trio** ([flicker](todos/closed/2026-07-15-farmers-window-flicker.md),
  [shop height](todos/closed/2026-07-15-shop-window-too-short.md),
  [inventory overlap](todos/closed/2026-07-15-inventory-items-overlap-labels.md)) — three caller-side
  misuses of the `@engine/ui` layout model, no engine defect; the reusable rules (never reassign
  `.layout`; box-mirror lists need their own bottom-edge cull; icon-over-label needs the label to
  reserve icon size) are in [player-and-interaction.md](wiki/player-and-interaction.md).
- **[Pip's-farm marker](todos/closed/2026-07-15-pip-farm-zoom-out-highlight.md)** — screen-space pin
  at zoom ≤ 1.2, anchored to the static `farm-pip` region (stable under `WORLD_GEN_SEED`), not to Pip.
- **[Citadel walker stepping](todos/closed/2026-07-15-citadel-smooth-walker-movement.md)** — the
  diagnosis overturned the todo's premise (interp already existed; sim moves 1 tile/tick cleanly):
  live measurement showed snapshot-arrival jitter (p99 76ms on a 50ms cadence) causing hold-then-jump
  on 41% of gaps; fixed with a 1.5-interval render-delay buffer, hold rate → ~2%.
- **[Placement coverage under buildings](todos/closed/2026-07-15-citadel-placement-highlight-under-buildings.md)**
  — `LAYER_COVERAGE` 38 → 6; layer ordering now export-pinned by tests.
- **[Terrain landforms](todos/closed/2026-07-15-citadel-terrain-landform-readability.md)** — key
  finding: no elevation channel exists in sim data and the old "relief" was fBm uncorrelated with the
  map; new `hillshade.ts` shades a terrain-kind-derived heightfield under the NW sun, on-palette via
  `DITHER_ACCENTS`. Render machinery notes: [citadel-rendering.md](wiki/citadel-rendering.md).

Gates run by the controller on the integrated tree: typecheck 14/14; farm-client 246, engine-core
194, citadel-client 519 tests green; real-browser Playwright pass on both games (panel stability
under live data churn, 5-offer shop, inventory grid, zoom-out marker, place-well coverage under
buildings, hillshaded town map). **Machine note:** full `@citadel/client` vitest fails to start at
default concurrency on this machine — use `--maxWorkers=2` (pre-existing, not from this wave).
Open follow-ups: open-grass relief may want a `SLOPE_GAIN` tune after a human eyeball; walkers render
~1 tile behind the sim (vanish-into-door slightly early — raise toward 2.0 only if stepping is still
reported); `ditherClusters` specks still bias by the retired absolute-fBm field.

## [2026-07-15] fix | The `sack` regression was decision #27 working — horizon 70 → 90 (`9651a57`)

Closed the [P1 todo](todos/closed/2026-07-15-citadel-sack-regression.md). Bisected over the
sim-touching candidates: PASS at `bbca1e9` (Wave 3.5) and `f65112d`, **FAIL at `c2caecc`**
(Wave 4 / brief 103 scope 2) — notably the one closeout that consciously skipped the scenario
gates, and the fixture is the ONLY end-to-end sharp-raid check. **Adjudication: intentional
balance change, not a sim bug.** The re-pointed autonomous sharp conscription adds
~floor(pop/2) defense to every arriving raid, and the same commit's sharp-famine rationing
lifts the fixture town's pop to ~23 (feeding the conscript count) — so strength 20-45 arrivals
moved from `resolveSiege`'s weak band (85% sack) into the mid band (10% sack) and the town
holds out, which is exactly what decision #27 was for. The scenario's designed +5/raid
escalation still ends it: strength-65+ raids (spotted ~day 58+, ~15-day march) push the ratio
back under 0.5 and the keep is honestly sacked on **day 71** at the default seed (was day 50).
Fix: `SACK_MAX_DAYS` 70 → 90 with the original +20 headroom pattern; lattice/keep layout
untouched (no tier poking); the fixture header's ratio arithmetic re-documented for the
conscription era. `SCENARIO=sack` exits 0; typecheck 14/14. **Lesson repeated:** a
sharp-path-touching change must re-run the `sack` scenario at closeout — the 2026-07-11 entry
below says the same thing about the same fixture.

## [2026-07-15] brief | 117 DONE — collapsible HUD panels, collapsed by default (`931694a`)

Built via `plan-split-dispatch`: 3 parallel Sonnet chunks on disjoint lanes (panel-prefs store /
right-column / relations+wealth) + 1 wiring chunk + 2 Sonnet review finders; controller applied
the fixes inline. Farmers/Shop/Activity (independent right-column sub-panels), Relations, and
Wealth each sit behind an always-visible labeled toggle button — the button is the open AND
close affordance, with the panel body below it while open. State persists write-through in
`localStorage` (`farm.ui.panels.v1`) via the new
[panel-prefs.ts](../games/farm/client/src/ui/canvas/panel-prefs.ts) (default closed, in-memory
fallback on storage throws, allowlisted parse). Shortcuts **F/O/T/R/G** (help modal updated —
the `KEY_BINDINGS` rows live in `playback-controls.ts`, on the brief's not-touch list; data-only
edit, controller-authorized deviation). Wheel routing is gated on open state, so a collapsed
panel's stale rect never swallows a zoom.

**The review pass earned its keep — 4 real defects, none visible to the unit suites:**
(1) a default-closed matrix's first `refresh()` returns `false`, so the refresh-gated layout
never ran and the Relations button sat at the zero rect — **unclickable**, keyboard-only
(size-key sentinel added, also covers canvas resize); (2) keys typed into the home-screen
seed input accumulate in `Keyboard.justPressed` — nothing calls `endFrame()` before the game
loop's first frame — so typing "frog" as a seed **opened four panels and persisted that state**
(stale input drained once at first frame; incidentally fixes the pre-existing E/J/Tab leak);
(3) panel-prefs merged stored JSON wholesale — a literal `__proto__` key reached
`Object.assign`'s [[Set]] path (allowlist to the 5-id union + boolean values); (4) at 1280×720
with the matrix open, the wealth graph overlapped the playback bar (bottom edge now clamps
above the bar's last-laid-out rect). Proofs in the browser pass: fresh load shows only the five
buttons and a "frogtr" seed leaves prefs null; all-open at 1280×720 + 1600×900 overlap-free;
persistence round-trips a reload; Tab/E/J unchanged. Gates: typecheck 14/14, full suite green
(client 230, incl. 36 new/updated widget tests). Side benefit visible live: collapsed-default
now boots at ~109 fps (118's cache + fewer quads). Synthesis (incl. the three traps for future
panels): [player-and-interaction.md](wiki/player-and-interaction.md); brief:
[briefs/game/done/117](briefs/game/done/117-collapsible-hud-panels.md).

## [2026-07-15] brief | 118 DONE — 5 fps regression: the UI glyph tint composite, cached (`4fd48dc`)

The profile gate ran first and confirmed the filed hypothesis exactly: a new
`PROFILE_ENABLED`-gated `ui.flush` sub-timer (+ `ui.quads` count) around the Overlay2D flush in
`WebGpuRenderer.endFrame` measured **106.0 ms of the 116.6 ms mean frame (~91%)** in the UI quad
flush at ~1,950 quads/frame, fps 3.36, on the affected machine (real AMD GPU via ANGLE/D3D11,
1600×900, all panels open, seed `0xc0ffee`) — `panels` 2.9 ms and `pushSprites` 5.6 ms were
noise, and F3's `_ghostCovered` fit inside the ~1.3 ms endFrame remainder (dismissed). Every
tinted glyph quad paid the 5-op multiply→destination-in Canvas2D composite per draw, per frame.

**F1 shipped** ([ui-draw.ts](../engine/core/src/render/ui-draw.ts)): the composite now runs once
per distinct (atlas, frame, rgb) into a cached canvas — a `WeakMap` keyed by the
`LoadedAtlasImage` **object** (so a re-baked atlas orphans its entries instead of serving stale
pixels), per-atlas `Map` with a 4,096-entry reset valve, draw-time `globalAlpha` never baked in,
white/no-tint and missing-atlas/frame paths byte-unchanged. Re-measured same scene: **fps 57.06,
`ui.flush` 5.2 ms, `render.endFrame` 6.1 ms, frame 9.4 ms** — ~20× on the flush at the same quad
count; Citadel inherits the fix through the shared rasterizer. **F2 (overlay dirty-skip) not
taken** — its gate was "only if F1 leaves the flush hot". Gates: typecheck 14/14, full suite
green (4 new cache tests + a `ga` recorder extension in `ui-draw.test.ts`), Farm
`CHECK_DETERMINISM=1` MATCH, panels visually correct in-browser. Also proven while gating: the
three `@farm/sim-core` "failures" during the first full-suite run were 5 s-timeout flakes from
CPU contention with the live dev stack + browser (all pass standalone and on clean main;
`bridge-graph.test.ts`'s multi-seed property runs 3.3 s standalone — borderline under turbo).
Wiki: [performance.md](wiki/performance.md) new Tier-0 banner,
[performance-measurements.md](wiki/performance-measurements.md) 2026-07-15 table;
brief: [briefs/game/done/118](briefs/game/done/118-fps-regression-ui-glyph-tint-path.md).
**117 is now unblocked.**

## [2026-07-15] fix | Atlas EOL pinned — a test run no longer dirties the tree (`d4d0222`)

Closed [todos/closed/2026-07-15-atlas-eol-gitattributes.md](todos/closed/2026-07-15-atlas-eol-gitattributes.md)
(filed at engine brief 21 closeout). New repo-root `.gitattributes` pins
`games/farm/client/public/atlas/* -text` (no EOL conversion — the atlas-builder test regenerates
the JSON with LF, and Windows autocrlf checked it out CRLF, so every test run left the file
"modified" and wobbled turbo's warm-cache hash for `@farm/sim-core#test`). Worktree renormalized
by re-checkout (index was already LF); verified by running `@tool/atlas-builder`'s tests (7 green)
and confirming `git status` stays clean. Also repaired this log's ordering: two 2026-07-15 entries
had been appended after the era summaries at the bottom of the file — moved into newest-first
position (this file reads newest-first from here down to the era-summary tail).

## [2026-07-15] todo | Briefs 117 + 118 filed — collapsible HUD panels; 5 fps regression (UI glyph-tint path)

Two Farm briefs filed from a user session (screenshot showed 5 fps / ~216 ms frame, 583 entities):

- **[117 — Collapsible HUD panels](briefs/game/done/117-collapsible-hud-panels.md).** Relationships
  matrix, the right column's three sub-panels (observer/slate/activity, independently), and the
  wealth graph go behind labeled toggle buttons, **collapsed by default**, with keyboard shortcuts
  + localStorage persistence. Playback controls, help, clock, hotbar, and existing toggles unchanged.
- **[118 — FPS regression: profile gate + per-glyph tint cache](briefs/game/done/118-fps-regression-ui-glyph-tint-path.md).**
  Exploration attributes the regression (99 fps 2026-06-12 → 5 fps 2026-07-15) to the 2026-07-01
  in-canvas UI migration: one tinted quad per glyph, each paying a 5-op Canvas2D composite in
  `drawUIQuad` on the Overlay2D flush inside `endFrame`. Plan: profile gate first (new `ui.flush`
  sub-timer), then a bounded per-(atlasId, frame, rgb) tint cache in `ui-draw.ts`; overlay
  dirty-skip only if measured necessary. **Ordering:** 118's baseline profile before 117 lands
  (117 hides most glyphs and would mask the regression).

## [2026-07-15] done | Engine brief 21 — Turborepo task runner (`a71e6f6`)

Wave 2 of the structure backlog; senior/opus executor, controller-verified. `turbo@2.10.5`
exact-pinned; root `typecheck`/`test` → turbo with `--continue` (the flag that makes every red
workspace report instead of the first one cancelling the rest — the 2026-07-09 gate-rot
mechanism is now structurally gone). Typecheck 44s serial → ~18-32s cold / **88ms warm FULL
TURBO**; atlas-byte cache-MISS proof + two-workspace failure proof both passed. The input sweep
found three undeclared cross-package reads (engine/core's repo-walking palette guard, Farm's
atlas, wasm dist ×2) and that nobody declares `@engine/wasm-modules` as a dependency — all
declared as explicit `inputs`. Deviation: `test` runs `--concurrency=1` (nested-vitest flake +
an atlas write/read race between atlas-builder and sim-core tests; rationale in turbo.json), so
the test win is caching, not cross-suite parallelism. Two todos filed:
[atlas EOL pin](todos/closed/2026-07-15-atlas-eol-gitattributes.md); CLAUDE.md's stale market.test.ts
path fixed in the same commit. **The 2026-07-15 structure backlog (114-116, engine 20-21) is
fully landed.**

## [2026-07-15] done | Structure wave — briefs 114 + 115 + 116 + engine 20 (`e21e5fd`, `99558bd`)

Wave 1 of the structure-survey backlog, built via `plan-split-dispatch` (4 parallel Sonnet
chunks, disjoint lanes, one tree; interrupted mid-run by a session limit — in-flight work landed
as `e21e5fd  save`, controller re-verified everything after resume). What shipped: **114** the
Citadel client main.ts split (20-module `src/main/` + barrel, thin entry) + doc-map fix; **115**
Farm `worker/`→`net/` + 14 `Worker*`→`Sim*` protocol renames + run-sim probes → `probes/`;
**116** citadel-sim runner split to run-sim's shape, stdout byte-identical ×5; **engine 20**
`Animator` deleted (only after the executor's BLOCKED report proved `AnimationClip` is live —
both of the brief's deletion premises were part-wrong; assets stays too, Farm's client loads its
atlas through it). Gates: typecheck 0, 2,267 tests, Farm determinism MATCH, byte-identity ×5,
Playwright passes on both games. **Two lessons worth keeping:** (1) the browser gate caught a
boot-killing silent self-import (`import "./main"` in `main.ts` resolves to the file, not the
directory) that 503 green unit tests and a clean typecheck sailed past — fixed in `99558bd`;
(2) baselining exposed a pre-existing P1: `sack` fails on main again
([todo](todos/closed/2026-07-15-citadel-sack-regression.md)). Wiki folded: architecture.md (Sim* names,
net/ path, workspace map), animation.md (Animator correction). Next: engine 21 (Turborepo).

## [2026-07-15] todo | Engine brief 21 filed — Turborepo task runner

Research outcome of "should we add turbo?": yes — filed as
[engine 21](briefs/engine/done/21-turborepo-task-runner.md), not built. Measured baseline:
`npm run typecheck` 44s serial across 14 workspaces, and `--workspaces` stops at the first red
workspace (the 2026-07-09 gate-rot mechanism). Turbo layers on npm workspaces (the locked
decision stands); all internal packages are Turbo "JIT packages" (no build step), so the win is
parallel + cached typecheck/test, not build caching. The brief's load-bearing scope item: sweep
for undeclared cross-package task inputs — known offender `farmer-frames.test.ts`
(`@farm/sim-core`) reads the Farm client's atlas without a dependency edge, which would be a
stale-green cache hit unless declared. Determinism runs stay outside the cache by contract.

## [2026-07-15] todo | Briefs 115, 116 + engine 20 filed — wide structure-survey batch

Second pass of the 2026-07-15 structure survey (checked against external best practice: the
macro layout — engine/game separation, feature-first sim-cores, per-subsystem engine exports —
already matches consensus; the wins are one level down). Filed, not built:
[game 115](briefs/game/done/115-farm-client-net-rename-and-tool-hygiene.md) (Farm client
`src/worker/` → `src/net/` — the sim left the Worker in brief 58 — plus the `Worker*` protocol
type renames and grouping run-sim's 12 fossil `probe-*.ts` diagnostics),
[game 116](briefs/game/done/116-citadel-sim-runner-split.md) (split citadel-sim's 1,196-line
`index.ts` to mirror run-sim's module layout; byte-identical-stdout gate), and
[engine 20](briefs/engine/done/20-engine-ghost-subsystems.md) (delete the consumer-less
`Animator`/`Clip` ghost — keep the easing curves `@engine/ui` re-exports — and adjudicate
`@engine/core/assets`, whose only consumer is world-preview). Checked-and-fine, recorded so it
isn't relitigated: `commands`/`placement` are genuinely generic engine primitives; the two
clients' interp modules solve different problems (sprite lerp vs tile-snap smoothing) and should
not merge; `@engine/ui/anim` re-exporting core easing is deliberate, not duplication.

## [2026-07-15] todo | Brief 114 filed — Citadel client main.ts decomposition

A 2026-07-15 project-structure survey found `games/citadel/client/src/main.ts` at **1,949 lines**
(largest source file in the repo), violating the module-directory convention the Farm client
already follows (`src/main/` split). Filed as
[brief 114](briefs/game/done/114-citadel-client-main-decomposition.md): behavior-preserving split
into `src/main/` along the file's own banner seams, with the known hazards named (boot-gap guard,
the single `newEventsSince` pass feeding toasts+audio, shared mutable state, the Vite entry).
Also carries the doc-drift fix: `@engine/ui` is missing from both workspace maps (root CLAUDE.md +
wiki/architecture.md; the latter also omits `@farm/atlas-recipes` and `@citadel/server`). Sibling
monoliths (`citadel sim-bootstrap.ts` 1,302, `tools/citadel-sim/index.ts` 1,196) noted out of scope.
Not implemented — brief only.

## [2026-07-15] maintenance | Closed the last three open briefs (queue emptied)

Cleared both `todo/` queues by closing the three remaining open game briefs, none of
which was built:

- **101 — Farm perishability + distance pricing** → `superseded/` (closed unbuilt). Large,
  balance-sensitive Farm feature; Farm is in maintenance mode. Spec retained in
  [todos/closed/2026-06-22-farm-perishability-distance-pricing.md](todos/closed/2026-06-22-farm-perishability-distance-pricing.md).
- **107 — Farm visual verification session** → `superseded/` (closed unbuilt). The eyeball
  debt is still recorded on the source briefs + the status.md "Pending" banner; run it
  opportunistically at a real GPU rather than as a tracked task.
- **96 — Citadel building art-style reference** → `superseded/` (not-a-task). Always a living
  art-direction reference mis-filed in `todo/`; its reference-asset section should fold into
  [wiki/citadel-art-style.md](wiki/citadel-art-style.md).

The two `todos/` standing notes (the OpenTTD `reference` note and the perishability spec) were
left in place — they are durable references, not queue items. `engine/todo/` + `game/todo/` are
now both empty.

## [2026-07-15] brief | engine audio subsystem + 3 test sounds per game (engine brief 19)

Closes engine brief 19 / the [2026-07-08 todo](todos/closed/2026-07-08-engine-audio-subsystem.md).
Code landed in `33f9a38`; corpus in this commit. New synthesis: the **Audio** section in
[architecture.md](wiki/architecture.md).

- **New off-sim client subsystem** `@engine/core/audio` (`AudioEngine`) — same layer as
  particles/toasts/juice, **never on the deterministic sim path** (`sim-core` untouched; both games'
  determinism runs stay byte-identical, which is the acceptance proof). Signal chain per-voice source →
  per-voice gain → **master gain** → destination; `muted`/`volume` gate at master; voice cap (16, skips
  when saturated); voices reaped on `onended` + a scheduled-end backstop.
- **The unlock rule** (durable): browsers start an `AudioContext` **suspended** until a gesture →
  `unlock()`; **pre-unlock `play()` is a safe no-op returning false** (no throw, no node, no
  autoplay-gate error). Headless-testable via an injected `AudioContextLike` factory; **silent stub**
  where Web Audio is absent (node/jsdom).
- **v1 sounds are procedural synth — zero committed binary assets.** A `buffer` `SoundSpec` for future
  real assets exists but is wired to no `.wav`.
- **Proven per game (3 sounds each):** Farm's `FarmAudio` = an injected `JuiceAudioSink` off
  `JuiceLayer`'s existing new-event pass (inherits the resync-skip guarantee — do NOT add a second
  diff); Citadel's `CitadelAudio` keys off `toast.ts`'s `toneOf`, fed from the same `newEventsSince`
  loop as toasts, + a settings-modal mute checkbox.

### Load-bearing findings (do not re-derive)

- **A wiki-drift catch justified the pre-dispatch code re-grounding.** The brief's Farm hook named a
  `lastEventCount` cursor that **brief 97 had already replaced** with a tick high-water mark; an
  executor following the brief literally would have hunted a dead field and likely re-invented its own
  event diff — the exact double-fire/backlog-replay bug the hook reuse was meant to avoid. Verifying the
  named hooks against real code *before* dispatch is what caught it.
- **The determinism gates are the load-bearing acceptance check**, not the unit tests — they're what
  proves a client/render subsystem didn't leak into the sim. Byte-identical Farm `CHECK_DETERMINISM` +
  Citadel headless run both passed.
- **Owed: a real-browser audio sign-off.** A code-only session can't hear the output; the objective
  gates all pass but "each event makes a distinct, non-annoying sound; mute silences; no console
  autoplay errors" needs a human at a real GPU — flagged specifically for Citadel's every-warn/info tick
  frequency.

Dispatch: `plan-split-dispatch`, Wave 1 Chunk A (opus, engine) → Wave 2 Chunks B+C (Sonnet, parallel
client wiring). `/code-review` (high) surfaced only low-severity cleanup; the one applied was a
`pitch<=0` guard on the future buffer path.

## [2026-07-14] brief | @engine/ui authored typography + icon glyphs (engine brief 18)

Closes engine brief 18 / the [2026-06-30 todo](todos/closed/2026-06-30-engine-ui-authored-typography-and-icons.md).
The in-canvas UI now renders a real pixel font and a real icon set. New wiki page:
[engine-ui.md](wiki/engine-ui.md).

- **Font: UNSCII (public domain).** The hand-coded 5×7 ASCII font is gone. `.hex` sources vendored
  ([engine/ui/vendor/](../engine/ui/vendor/)) and converted ONCE into committed glyph tables, so the
  boot-time atlas bake stays deterministic and asset-free. `BODY_FONT` (8×8, default) +
  `DISPLAY_FONT` (8×16). ⚠️ `unscii-16-full.*` is Unifont-derived **GPL** — never vendor it; the base
  files used here are outside that carve-out.
- **Icons: 34 glyphs at 16×16, as SHADE-INDEX MASKS.** Colour is never baked in; the consumer passes
  a 3-colour ramp from its own palette. That is the only design that lets ONE icon set serve Citadel
  (Apollo-46) and Farm (EDG32) while the engine imports neither game. The renderer tints one colour
  per quad, so each icon bakes to three pixel-disjoint 1-bit masks drawn as three stacked quads — no
  renderer change needed.
- **Citadel's build bar is a compact icon grid again** (it had been downgraded to wide text labels
  precisely because the old font was ASCII-only); the goods strip is iconified.

### Load-bearing findings (do not re-derive)

- **The visual loop is mandatory, and we nearly skipped it AGAIN.** The first icon pass was authored
  blind at 12×12: `wheat` rendered as mush, `hammer` as a slab on a stick — the exact failure that
  forced the Citadel building art to be rebuilt as 3D meshes. Fixed by *rendering and looking*
  ([tools/icon-sheet.ts](../engine/ui/tools/icon-sheet.ts), now committed as the loop) and by moving
  to 16×16, which 12×12 could not match for `grain`/`flour`/`bread` (needs a readable silhouette AND
  two shade bands).
- **Changing a text metric reflows every layout that consumed it — and unit tests will NOT catch it.**
  5px → 8px glyphs produced four bugs, every one found only in a browser, all the same shape:
  *positioned by a constant or a guess instead of by the laid-out rect.*
  1. Fixed pixel widths tuned to the old advance (Farm hotbar/inventory/tooltip/observer/slate/feed).
  2. A **magic placement fraction** — Farm's DOM seed `<input>` sat at `panel.height * 0.52`; the
     taller panel made it collide with the Randomize button. Now the canvas row reserves an empty
     slot and the input is positioned onto *that node's rect*.
  3. **A container shorter than the theme padding.** The slate's 5px stock-bar track inherited the
     default 6px padding, laying its fill out at `track.y + 6` — entirely below its own track, on top
     of the caption. Such containers need an explicit `padding: 0`.
  4. **A node reserving a text line where a sprite is drawn.** Farm's hotbar painted a 26px item
     sprite over an empty `label("")`, spilling the art onto the item's own caption.
- **Labels could not wrap.** `LabelNode` never exposed the text engine's wrap support, so a
  fixed-width panel full of dynamic sim-authored text overflowed by construction. Added
  `label({ maxWidth })`; Citadel's inspect panel now wraps instead of running off the side.
- **The in-canvas font is printable ASCII (0x20–0x7e) only** — `✕` and `·` in labels were rendering
  as the `?` fallback box. Replaced with ASCII.

Gates: typecheck 0; full suite **2241 green**; both games browser-verified on a real GPU.

## [2026-07-14] brief | Citadel mesh Phase 3 — @lit night frames + retire the char-recipe building path

Closes the [Phase-3 follow-up](todos/closed/2026-07-14-citadel-mesh-phase3-cleanup.md) filed the same
day (`dfd754d`). Items 1–3 shipped; item 4 (mill/smith model tuning) skipped — the todo marked it
optional and "fine as-is".

- **`@lit` night frames are meshes.** house/bakery/smith/healer kept their OLD char `@lit` frames
  while their day frames were meshes, so those four visibly reverted to the old art style at dusk.
  The mesh renderer gained an **emissive material** path (emissive → one flat tone for every face
  orientation, skipping the normal-quantized ramp) and the four models gained real **window
  geometry** — dark recessed pane by day, warm `lampGlow` at night; the smith's hearth also runs
  hotter (`hotEmber`). **Anti-drift by construction:** a lit frame calls the SAME day-frame factory
  and remaps tri materials, so the two can only differ in which materials emit, never in shape.
- **Char-recipe building path deleted:** `iso-draw.ts` (1990 lines) + the `BUILDING_RECIPES` bodies +
  `roof.test.ts`. Net **−1,964 lines**. `recipes/buildings.ts` survives as a frame-NAME-only leaf.
- **Tests grade what renders:** the silhouette/recipe guards read `BUILDING_RECIPES`, so they passed
  while covering art the game no longer drew. Re-pointed at `MESH_OVERRIDES`, plus new guards that
  the renderer's night frame selection resolves to real mesh art, and that burning / non-lit types
  keep their day frame.

### Load-bearing findings (do not re-derive)

- **`BUILDING_SPRITE_TYPES` is the dangerous seam.** It + the atlas derived from `BUILDING_RECIPES`;
  deleting the recipes without re-deriving from `MESH_MODELS` would have made every building
  **silently fall back to a tinted box** — no crash, no failing test. Derive the type set from the
  thing that actually rasterizes.
- **Import cycle:** the barrel (`recipes/index.ts`) now imports `MESH_MODELS`, so anything under
  `mesh/models/` reaching back through the barrel closes a cycle and leaves `MESH_MODELS` **undefined
  at module-eval time** (it bit `industry.ts`, which wanted `millFrameName`). Mesh models import
  frame names from the **leaf** `recipes/buildings`, never the barrel.
- **One threshold moved, deliberately:** the mesh `well` is ~0.198 opaque vs a 0.2 floor. The well is
  an open form (a well-head on an open plot, not a walled box) and `silhouette.test.ts` **already**
  classified it as one — the opaque-floor list had simply never been reconciled with it. The 0.06
  open-form floor still fails a blank frame.
- **Real-GPU verification still required + still works:** system Chrome + `--enable-unsafe-webgpu`
  (the Playwright-bundled Chromium still cannot create a WebGPU device here). Driving
  `?showcase` and mutating `window.__citadelShowcase.toggles.dayFraction` (0.9 ⇒ nightFactor ≈ 0.905,
  past the 0.45 lit threshold) renders night. **A wide screenshot is a weak instrument** for
  frame-selection questions — the panes are a few pixels at gameplay zoom; importing
  `MESH_OVERRIDES` in-page and blitting day-vs-lit frames scaled up is the high-signal check, and the
  permanent guard belongs in `quads.test.ts`, not a screenshot.

Gates: typecheck clean; full suite **1376 passing**; Apollo palette guard green.

## [2026-07-14] lint | Fold the mesh renderer into citadel-rendering.md; close the done economy todo

Corpus catch-up after the mesh wave. Three drifts fixed:
- [wiki/citadel-rendering.md](wiki/citadel-rendering.md) (stale since 2026-07-02) presented the
  `iso-draw.ts` char-recipe form builders as the *current* building-art path. Added a
  **Mesh building renderer** section (model → software rasterizer → `MESH_OVERRIDES` into the same
  atlas) and a banner marking the char-recipe building prose as superseded. The char path still runs
  for the four `@lit` night frames + non-building sprites — that's the Phase-3 cleanup todo.
- Same page still listed the **flat-box anomaly as open**. It isn't: it was a host-specific artifact
  of the Playwright-bundled Chromium and does not reproduce on a real GPU. Marked closed, with the
  system-Chrome requirement for visual checks.
- `2026-06-22-citadel-two-way-service-economy.md` was `status: done` (shipped as brief 100) but still
  sat in `todos/`. Moved to `todos/closed/`.

Open todos are now: farm perishability, engine audio, `@engine/ui` typography, OpenTTD influence
(reference), and the Citadel mesh Phase-3 cleanup (in progress).

## [2026-07-14] initiative | Citadel building art rebuilt from scratch as in-code 3D meshes

The 2D ASCII pixel-recipe art (`iso-draw.ts` primitive composition) couldn't reliably produce
recognizable complex buildings — blind procedural pixel art needs a render→look→adjust loop we kept
skipping (Wave 5's silhouette forms shipped broken, unseen). After the user asked whether generation
was "not good enough," the honest answer was: it's the *workflow* (no visual loop) + representational
pixel art is a weak spot — and their instinct (use a real 3D approach) was right. Two inline research
passes (how pros make iso art; how to store 3D in memory) landed on: model buildings as **indexed
triangle meshes** built from parametric primitives, project dimetric, z-buffer + flat-shade. Committed
`6cc32fb` (Phase 1 pipeline) + `d1e7c7c` (Phase 2 all-21) + corpus here.

**Pipeline** (`games/citadel/client/src/render/sprites/mesh/`): `Mesh {positions:Vec3[]; tris:{a,b,c,material}[]}`
(the universal indexed face set — not half-edge, we generate-then-render); primitive generators
`box/cylinder/cone/pyramid/gable` + `translate/scale/rotate/merge` + helpers (crenellation rings,
spire, windmill sails, water-wheel disc, banner, furrows, terraced pit). `renderMeshModel` projects
each vertex with the 2:1 dimetric transform matching `iso.ts`, back-face culls, runs a **per-pixel
z-buffer** (replaced a fragile primitive painter's sort), flat-shades each triangle by face-normal
onto 3 adjacent **Apollo** ramp steps (top brightest→right darkest), and draws a 1px silhouette/
depth-crease outline. Output is the existing `RasterizedRecipe`, so `atlas.ts` drops each in via
`MESH_OVERRIDES` — now all 21 base `bld/*` frames + the mill's 8 animation frames.

**All 21 modeled**, heights matching `BUILDING_HEIGHT_TILES` (keep/tower/mill 3, garrison/chapel/
town-hall/healer/mine/watchpost 2, rest 1): crenellated keep/tower/garrison, steepled chapel, green-
roof+cross healer, round-oven bakery, open-forge smith (distinct from bakery), water-wheel sawmill,
headframe mine, terraced-pit quarry, open-stall market, plaza public-square, cupola town-hall,
warehouse storehouse/tradingpost, furrowed-field farm, roofed well, log-pile woodcutter, and a
real **windmill** whose 4 sail blades animate across 8 mesh frames. The watchpost was reworked from a
"table + bowl" into a raised railed cabin (height bumped 1→2 in `citadel-renderer.ts` + matching
`showcase.ts`).

**Process worked because it was screenshot-gated:** built incrementally (3-building slice → browser
eyeball → all 21 → eyeball → fixed the 4 weak reads → eyeball), and the user's "mill still uses old
assets" catch surfaced the real bug — the mill is *animated*, so overriding only the base frame left
the renderer cycling old char frames; the fix overrides all 8. Gates every round: typecheck 0; Apollo
palette guard 8/8; @citadel/client 490/490. **Deferred to [Phase 3](todos/2026-07-14-citadel-mesh-phase3-cleanup.md):**
`@lit` night frames (4 buildings still char at night), `iso-draw.ts` dead-code removal, and routing
the silhouette tests through the atlas (they currently test the now-unused char recipes).

## [2026-07-13] decision | Citadel adopts the Apollo-46 palette; the fixed-palette rule is now per-game

User request ("change the palette for the Citadel assets" → "do apollo for citadel"), acting on the
[palette-evaluation todo](todos/closed/2026-07-13-citadel-palette-evaluation.md) I'd filed as a follow-up to
Wave 5. Committed `83efacc` (code) + this corpus change. Run via `plan-split-dispatch`: 1 opus foundation
chunk (the palette module + role→colour mapping + the per-scope guard) + 3 Sonnet chunks (art import redirect,
UI + theme, test-expectation updates).

**Why:** EDG32's gamut has no desaturated olive-grey midtones — its greys are blue-tinted (`#5a6988`,
`#3a4466`), its mid-browns are rusts (`#be4a2f`) — which the [CC0-ingest spike](todos/closed/2026-07-11-citadel-external-cc0-art-ingest.md)
already proved is a poor fit for muted medieval naturals, and colour is the axis the day/night wash degrades
(the same reason Wave 5 leaned on silhouette). Apollo-46 (AdamCYounis) is built around natural material ramps
with exactly those earthy midtones. **Decision #28** in [citadel-decisions.md](wiki/citadel-decisions.md);
the repo-wide EDG32 rule in [decisions.md](wiki/decisions.md) is now **per-game** (engine + Farm stay EDG32).

**The migration was cheap because of an existing indirection.** Every Citadel colour already routed through
named `EDG.*` role constants with **zero raw hex**, so this was an *import redirect*, not a ~200-site rewrite.
New `games/citadel/client/src/render/citadel-palette.ts` exports `CITADEL_PAL` — the **same 32 role keys** as
engine `EDG`, remapped to Apollo hex **by role** with luminance ordering preserved within each ramp (verified
monotonic: neutral black→white, timber bark→cream, greens, blues). Citadel files import it as
`CITADEL_PAL as EDG`, so `EDG.rust` etc. keep working unchanged. One intentional overlap (`tan` shares
`yellow`'s swatch — Apollo has no distinct light orange-tan; pigeonhole, documented). Shared `@engine/ui`
chrome is re-skinned by injecting a Citadel Apollo `Theme` (`ui/citadel-theme.ts`) into the ~10 `renderTree`
calls — engine defaults untouched, so Farm keeps EDG32. `style.css`'s 5 raw hex → Apollo role equivalents.

**The guard is now per-scope.** `palette.test.ts` validates files under `games/citadel/` against Apollo and
everything else against EDG32. Because the engine never imports a game (locked dependency rule), the 46 Apollo
swatches are **inlined** in the engine-side scan and **pinned** to the Citadel module by a colocated Citadel
test (`citadel-palette.test.ts`) so the two copies cannot drift — the opus chunk caught that an
`@engine/core`→Citadel import would violate the dependency rule and took this route instead. Also removed a
stale-doc-comment allowlist entry (`siege-hud.ts` had `#fee761` in a provenance comment).

**Test-expectation fallout, fixed faithfully:** ~15 render/UI `*.test.ts` files built EXPECTED colours from
EDG32 and broke the instant the source went Apollo. Each was fixed by redirecting its `EDG` import to
`CITADEL_PAL` (or a raw EDG32 literal → the role reference / `nearestApollo`), preserving assertion intent —
no matcher weakened, nothing skipped.

Gates: typecheck 0; @engine/core **186/186** (Farm + engine still EDG32-clean under the per-scope guard);
@citadel/client **490/490**. **Caveat — first-pass colours:** the role→Apollo choices are picked for
hue/luminance fidelity but **not yet eyeballed in a real browser**; a `?showcase` pass to tune them is the
natural follow-up (objective per-scope guard + tests already pass, so the migration is sound; only the
aesthetic tuning is open).

## [2026-07-13] wave | 5 DONE — distinct silhouettes for the 8 look-alike box-buildings; the dispatch plan is complete

Wave 5, the last wave of the [remaining-work dispatch plan](todos/closed/2026-07-10-remaining-work-dispatch-plan.md)
(now complete — all of 1, 2, 2.5, 3, 3.5, 4, 5 landed). Brief-less; spec was the
[art-ingest todo](todos/closed/2026-07-11-citadel-external-cc0-art-ingest.md) whose CC0-ingest spike was
rejected, leaving silhouette differentiation as the real work. Committed `0d6c1b3` (code) + this corpus change.
Run via `plan-split-dispatch`: 1 opus chunk (pixel-art) + 1 Sonnet chunk (the independent test).

**The defect:** 8 of 21 `BUILDING_RECIPES` (`house`, `bakery`, `woodcutter`, `market`, `public-square`,
`watchpost`, `quarry`, `smith`, `sawmill`) rasterized to the same ~128×92 box with only a different roof
colour — and colour is the axis the day/night wash degrades, so at dusk a bakery and a house converged. This
contradicted `buildings.ts`'s own long-stated silhouette-first goal.

**The fix:** each now reads with colour stripped, via new `iso-draw.ts` form-styles/primitives (all EDG32,
within the 128×92 frame → zero atlas growth): `cottageStyle` gained `"cabin"` (woodcutter, reduced footprint)
and `"forge"` (smith, open-sided canopy on posts + back hearth); bakery got a hipped roof + larger domed oven
bulge + smoke plume; watchpost became a stilted raised platform that no longer reads as a house. `house` was
kept as the plain reference the rest diverge from. The opus chunk judged `market`/`public-square`/`quarry`
already distinct (alpha-mask evidence: market min pairwise 135, quarry's `openPit` already hutless) and left
them to avoid regression — a defensible narrowing, confirmed by the test.

**The independent test** (`buildings-silhouette.test.ts`, written by a separate chunk so the check stays out of
the hand that drew the art) proves all 8 pairwise-distinguishable on `silhouette.test.ts`'s bottom-anchored
alpha-mask Hamming metric: observed min house~bakery=19, floor set at 12, and RED-verified by forcing a
collision. Scoped to the 8 targets — the pre-existing untouched near-pairs (mine~healer=6,
storehouse~tradingpost=15) are out of this todo's scope.

Gates: typecheck 0; EDG32 palette guard 6/6; @citadel/client 485/485. Per the user the `?showcase` browser
verification was **skipped** at closeout (objective silhouette test stands; the visual eyeball is deferred).
Follow-up filed: a Citadel palette re-evaluation todo (EDG32's gamut lacks the desaturated olive-grey midtones
muted medieval naturals want — the same gap that sank the CC0-ingest spike).

## [2026-07-13] wave | 4 DONE — Challenge mode closed out; the dead decree levers re-point to autonomous sharp-mode behaviors

Wave 4 of the [remaining-work dispatch plan](todos/2026-07-10-remaining-work-dispatch-plan.md) — brief 103,
committed `c2caecc` (code) + this corpus change. Run via `orchestrate` → `plan-split-dispatch` (opus
controller, 1 junior + 1 senior chunk).

**Scope 1 was already in code.** The mode plumbing (worker presets `cozyThreats:false`/`seedTown:false`/
`deferThreatsUntilBuildings:0`/`enableArmy:false` for `mode:"challenge"`) and the in-canvas cozy/challenge
picker landed earlier (`658bbeb`/`f65112d`) but were never closed out or tested. A read-only audit confirmed
all four flags round-trip correctly through `serializeSave`/`loadFromSave` and the modal→worker wiring is
intact — so scope 1 only needed the missing **test coverage** (a worker `mode→flags` mapping test, and
`enableArmy`/`deferThreatsUntilBuildings` save/load round-trips).

**Scope 2's real work was dead decree branches, not a broken sharp path.** The headline "what rotted" — the
inert `sack` fixture — was already fixed 2026-07-11 (`sharp-raid-path.test.ts` guards reachability). What
remained: three branches reading `p.activeDecrees`, a set nothing has written since the Phase-G purge of the
`setDecree` lever. Per **[decision #27](wiki/citadel-decisions.md)** they were **re-pointed to autonomous
behaviors gated on the sharp path** (`cozyThreats:false`), not resurrected as UI:
- conscription → the wall-manning defense term applies during an active sharp raid;
- rationing → the 25% consumption cut auto-engages only in sharp mode *and* only in bread deficit;
- tithe → relief-reserve cushion → siphons **bread only** into the reserve in sharp mode.

Cozy is byte-identical **by construction** (the `!cozy` branches never execute when `cozy=true`), confirmed by
the existing cozy guards. Falsified decree tests were rewritten to the new truth (trigger via
`cozyThreats:false`, cozy negatives kept as byte-identity guards) with **un-weakened** assertions.

**The bread-only tithe was a design call the build surfaced.** The first pass re-pointed the tithe as
"siphon 10% of *every* good" (its historical decree semantics). Both a parallel chunk and the verify gate
caught that this silently eroded `army.test.ts`'s exact tool counts. The controller adjudicated: the
tithe→reserve→cushion chain exists solely to buffer *bread* famine (the cushion only ever withdraws
`reliefReserve.bread`), so taxing tools/wood/stone was a purposeless drag — narrowed to **bread only**, which
made the mechanic purposeful *and* resolved the collision with no contortion of the army tests.

**Gates:** typecheck 0; @citadel/sim-core **309/309**; @citadel/client **483/483** (a pre-existing
`@engine/ui` symlink gap that broke client test-loading was fixed with `npm install` — untracked `node_modules`,
no source change). Pure integer arithmetic, **no new RNG draws**. The determinism ×3 + real-browser
`playtest-citadel` acceptance gates were **consciously skipped at closeout** (user call): no RNG change ⇒
reproducibility unaffected, cozy byte-identical by construction, and `sharp-raid-path.test.ts` already proves
the challenge start→Town→keep→raid→sack chain is reachable headlessly.

`activeDecrees` itself is left in place (a harmless always-empty set + snapshot passthrough); removing it is a
separate cleanup. **Next: Wave 5** (building silhouette differentiation, render-only — the last wave).

## [2026-07-13] wave | 3.5 DONE — the pop-6-7 deadlock breaks; the blocker was worker allocation, not immigration

Wave 3.5 shipped as `bbca1e9`. The P1 [solo-town-tier deadlock](todos/closed/2026-07-11-citadel-solo-town-tier-unreachable.md) had its root-cause narrative **corrected a second time**. The todo (itself the corrected replacement of an even-earlier "unreachable" claim) diagnosed an *immigration hard-stop at zero bread surplus* and scoped an immigration trickle floor. Built that first — it is clean, byte-identical on every baseline, unit-tested (10 tests), covers the isolated single-bakery break-even case — **and it made zero difference to the actual deadlock** (the todo-exact drip ended at pop 7/Village with *and* without it).

The census settled it: **25 population increases** over the run. Immigration was never the wall — arrivals come freely on the ~40 surplus/break-even days. The deadlock is **worker allocation**, and it took three peeled layers to see the whole shape:

1. **`removeOneVillager` removed the NEWEST villager on starvation** (highest id, LIFO). At bread-carrying-capacity (one bakery feeds ~6) any 7th arrival — the one heading to staff the idle second bakery — was exactly who starvation dropped next. **Growth was structurally reversed.** The starvation path now passes `{ preferRedundant: true }` and drops a *redundant* worker (one on a glutted-output producer) instead; disease/raid casualties still take the newest, so their semantics are untouched. This one change **alone** reaches Town (day 99).
2. **Assignment staffed the second farm/mill before the second bakery.** Villagers commit to a job and don't switch, so early arrivals staffed the 2nd farm (grain) and 2nd mill (flour) — gluttng both to 500+ — while the 2nd *bakery* (the bread bottleneck) stayed idle. A **glut-skip** steers a second worker past a producer whose output is already ≥8 days of supply toward the scarce good; bounded to already-staffed types (bootstrap's first-of-type never skipped) with a no-skip fallback pass so nobody idles for it. With both, the escape accelerates to **Town day 53**.
3. The immigration trickle is **kept but demoted** — a mis-scoped fix for a mis-diagnosed cause, retained only because it is genuinely byte-identical and does help the clean break-even case.

**The lesson (third telling of this same P1):** a determinism/byte-identity gate proves *reproducibility*, and a unit test proves a *mechanism*, but neither proves the *diagnosis*. Both earlier root-cause stories ("unreachable", then "immigration hard-stop") were internally coherent and wrong; only a per-day **census of the actual failing run** — counting arrivals, watching which building each staffs, seeing which villager starvation drops — exposed the real loop. When a fix built exactly to spec changes nothing, re-measure the premise, don't re-tune the fix.

Gates: typecheck 0; full repo tests 0 (citadel sim-core **301**, +15: `immigration.test` + `deadlock-allocation.test`); Citadel determinism **MATCH ×3 seeds**; grow/sack baselines drift **only in grain counts** (redundant-removal drops a grain worker vs the newest; pop/bread/happiness/tier/outcomes identical); `starve` still `gameOver=true`. **Deferred P2:** the town reaches Town then oscillates back to Village — bread sits at break-even and grain/flour still glut — the cadence imbalance (farms≫mills≫bakeries) + the happiness throttle (services unstaffed → low happiness → throttled output). A balance pass on cycle rates + service coverage, not an allocation fix.

## [2026-07-11] wave | 3 DONE — disease counterplay + the departing raid, and the playtest found the real wall

Briefs [102](briefs/game/done/102-citadel-disease-counterplay.md) + [113](briefs/game/done/113-citadel-raid-gets-a-body.md) shipped as `c22145e` (three parallel junior/Sonnet chunks, disjoint lanes, controller design gate first). The gate's biggest catch was **113's premise being stale**: the raid body — positioned raiders, BFS march, *spatial* garrison interception, snapshot, client interp render — had existed since `af31818` (2026-06-26); the grilled brief specced a system that was already built. The actual gap was one behavior: a cozy raider vanished at the keep the tick it pilfered. It now walks home (`RaiderState.leaving`, the walked path reversed), with arrival effects and the event stream byte-unchanged and the sharp path proven byte-identical. 102 landed the settled smallest set — well coverage multiplies onset (×(1−0.5·fraction), no-op at zero wells, draw-count pinned by an rng-stride test), healer named in outbreak copy, both mechanics stated in the inspect panel.

**The verification story matters more than the diff.** Unit tests and byte-identity were green in minutes; the browser acceptance ("a raid must be *seen*") took five probe iterations and ended somewhere unexpected: three live solo runs (290, 300, and 536 in-game days, three escalating strategies) all equilibrated at **pop 7–9, wood pinned at ~1, Town tier never reached** — services steal bread-chain workers, the chain never banks the surplus immigration needs, and wood income is the first casualty. The headless `sack` scenario "reaches Town honestly" only because it **injects 5 wood + 2 stone per day**. So the raid was verified through `?mp` (the town-hall anchors the raid clock at Hamlet and placement is free — same client render path, same sim systems): raid seen marching in ~17 days, pilfering at distance 2, the distance series retracing 2→113 over 16 days, edge despawn — screenshots + a 2599-sample trajectory. The wall itself is filed as **P1** [solo-town-tier-unreachable](todos/2026-07-11-citadel-solo-town-tier-unreachable.md): keep/garrison/raids are currently unreachable content in solo, and it — not anything in brief 103 — is what gates 103's "challenge run playable in a real browser" acceptance. The [2026-06-22 playtest-findings todo](todos/closed/2026-06-22-citadel-playtest-findings.md) closed fully (P3 was its last open item).

## [2026-07-11] wave | 2.5 DONE — headless JSON run reports for both games

Wave 2.5 of the [dispatch plan](todos/2026-07-10-remaining-work-dispatch-plan.md) shipped as `d224b09`: a generic `RunReport<TDay,TEnd>` envelope in `@engine/core/sim` plus symmetric `REPORT=1` / `REPORT_FILE=` flags on both headless runners, so "how did this run go?" is now a JSON file instead of console-prose archaeology. Two parallel junior/Sonnet chunks on disjoint lanes (engine envelope + run-sim; citadel-sim against the controller-pinned contract) — the contract was settled up front, which is what let both run at once.

Two design points worth keeping: **(1) reports carry no timestamps or git info by contract**, so the same seed yields a byte-identical file — the report itself becomes determinism evidence, and double-run `cmp` is the cheap check. **(2) The two event feeds needed different collectors** because their caps differ in kind: Farm's `EventFeedSystem` entries carry their own ticks, so a per-tick high-water harvest is provably complete (`missed: 0`); Citadel's `recentEvents` is a capped 20-tail of bare strings, so the collector samples every tick (gated behind `REPORT` — zero cost otherwise) and reconciles against the monotonic `eventsSeq`, reporting any unattributable gap as `missed` instead of silently losing events — the same honesty the toast dedup needed in brief 97.

Also learned: the `play.mjs` DOM-scrape staleness extracted from the closed phase-A playtest todo was **already fixed** — `main.ts` exposes `__citadel.snapshot()` and `readHud()` prefers it. The scripted-action layer ("play headlessly") was deliberately deferred; file a fresh todo when something needs it. Gates: typecheck 0, full repo tests exit 0, Farm determinism MATCH ×3, Citadel byte-identical ×3 seeds + vs pre-change code on grow/sack. Todo → `closed/`. Next: Wave 3 (102 + 113).

## [2026-07-11] maintenance | todo-queue closure sweep + the dispatch plan rebuilt (Waves 2.5 and 5 added)

A corpus maintenance pass ahead of the Wave-3 run: audited all 16 open `todos/` files against what has actually shipped, **closed the 7 whose work is fully discharged**, and rebuilt the [dispatch plan](todos/2026-07-10-remaining-work-dispatch-plan.md) around what remains.

**Closed** (moved to `todos/closed/`, each with a closure note): the three historical **build-order docs** (2026-06-12 Farm set — every child done; 2026-06-18 Citadel — superseded by the cozy pivot; 2026-06-28 cozy pivot — all phases A–I shipped and playtested); the **2026-07-02 full-repo review findings** — all 40 findings executed via briefs 97/98/99/110, every one now done, so the triage doc is discharged; the two **2026-06-27 entity todos** (movement feel → brief 104 done; count-matches-population → brief 105 scope 1 done, the MP owner-filter half parked and tracked on [citadel-mp-deprecated.md](wiki/citadel-mp-deprecated.md)); and the **2026-07-01 phase-A playtest log** — its one live finding (the `play.mjs` driver still DOM-scrapes a HUD that moved in-canvas 2026-06-30) was **extracted into the [headless-JSON todo](todos/2026-07-11-headless-json-run-for-both-games.md)** before closing, as the browser-side sibling of the same "runs must be machine-readable" problem. Inbound links from live pages (wiki, log, citadel-apr, brief 107) repointed to `todos/closed/`; immutable done-briefs left untouched per convention.

**Stays open, deliberately:** the OpenTTD influence note (standing reference by its own header), the perishability / typography / audio todos (they are the specs for parked briefs 101 / engine-18 / engine-19), and the citadel-playtest-findings todo (its last finding, P3, is brief 102 — Wave 3 closes it).

**The plan rebuilt:** Waves 1–2 are done, so the remaining order is **Wave 2.5** (new: [headless JSON run mode](todos/2026-07-11-headless-json-run-for-both-games.md), read-only scope, sequenced first because 102/113/103 all carry headless-verification gates and today both runners emit console prose) → **Wave 3** (102 disease counterplay + 113 raid body, design gate first) → **Wave 4** (103 challenge mode — its `sack` blocker was fixed 2026-07-11, `7c76522`/`36382d2`, so the wave is unblocked; the brief's stale "army/territory active" acceptance line still needs fixing before the split) → **Wave 5** (new: [building silhouette differentiation](todos/2026-07-11-citadel-external-cc0-art-ingest.md), render-only, sequenced last so gameplay isn't queued behind art polish). Lint green.

## [2026-07-11] spike | free CC0 art can't be baked into EDG32 — and the attempt found the real art defect

Asked to find free online assets for Citadel, download them, bake them, and use them. **Prototyped it; it does not work.** Recording the negative result so nobody spends the day re-deriving it. Evidence page: [verify/2026-07-11-citadel-art/](verify/2026-07-11-citadel-art/README.md).

**Geometry and licence were never the problem — which is why it was worth testing rather than dismissing.** [rubberduck's iso medieval buildings](https://opengameart.org/content/isometric-medieval-buildings) are genuinely CC0, no attribution, and the fit is almost suspiciously good: Citadel is 2:1 dimetric on a 32×16 tile at `ISO_ART_SCALE = 2`, its real frames run 64×62 → 192×186 (typically 128×92), and the pack's "64×32" variant trims to ~255×269 and downscales straight into that box. Everything lined up except the pixels.

**Two mapping strategies, one failure.** Nearest-colour quantization (weighted RGB → `nearestEdg32`) snapped **every** timber and shingle to hot rust; Bayer dithering added noise without moving the hue. A deliberately smarter second pass — classify each pixel into a material (roof/timber/plaster/stone/foliage) by hue+saturation, then map its *luminance* onto a hand-picked EDG32 ramp per material, so colour is never chosen by proximity and *cannot* snap to rust by accident — fixed the hue story and produced **per-pixel speckle** instead.

**The mechanism, which is the durable part.** Plotting the source's 60 heaviest colours against all 32 swatches shows EDG32 holds exactly **two** low-saturation mid-tones — `#c0cbdc` and `#8b9bb4` — and **both are cool blue-greys**. The palette has **no warm neutral at all**; its warm family leaps from a near-black brown (`#733e39`) to saturated rusts (`#b86f50`, `#be4a2f`). Photoreal renders are made almost entirely of the weathered grey-brown that falls in that hole, so the nearest available colour is *always* a rust. Compounding it, the source carries photographic texture (individual shingles, wood grain) that survives downscaling as high-frequency noise, which any 32-colour mapping quantizes into confetti. This is a **gamut + texture-frequency mismatch, not a tuning bug** — no third quantizer is worth writing. The corollary: only ingest art that is *already* low-bit pixel art on a limited vivid palette. A survey (OpenGameArt CC0-Isometric, Kenney Medieval RTS, josepharaoh99) found the CC0 iso-medieval ecosystem is **dominated by rendered art** — there is no easy win waiting to be downloaded. The *"no external art pipeline"* line in [decisions.md](wiki/decisions.md) **stands unamended**, and EDG32 is untouched. Also flagged [400+ Isometric Town Tiles](https://opengameart.org/content/400-isometric-town-tiles) as a licence trap: its own page admits some tiles are 20+ years old with *authors lost to time*, which is an unverifiable chain of title, not a formality.

**What the spike found instead is worth more than the imports were.** Rasterizing all 21 `BUILDING_RECIPES` to compare against the candidates shows **8 of them are the same 128×92 box with a different roof hue** — `house`, `bakery`, `woodcutter`, `market`, `public-square`, `watchpost`, `quarry`, `sawmill`, `smith`. That flatly contradicts the file's own header, which claims each type uses "a distinct FORM … so the *silhouette* — not just the colour — tells a mill from a mine." For those eight it does not. Colour is also the **worst** axis to lean on here, because the day/night wash tints everything: at dusk a red-roofed bakery and an orange-roofed house converge. And `iso-draw.ts` already exports the primitives to fix it (`isoAnvil`, `isoLogPile`, `isoWaterWheel`, `isoQuarryPit`, `isoChimney`, `isoBanner`…), simply unused by these types. The todo is therefore repointed at **silhouette differentiation**, gated on a colour-stripped silhouette test, with the CC0 renders kept as **visual reference only** — no pixels ingested, no licence obligations, no decision amended.

## [2026-07-11] fix | the `sack` fixture was inert, and three green tests said otherwise

Chased the `sack` drift before Wave 3, because brief 113 is about to rebuild the raid on exactly that machinery. It was not drift. **The fixture was structurally inert, and had been since 2026-07-01.**

**Four defects, each hiding the next.** (1) `cozyThreats` defaults to **true**, and under the cozy contract a raid pilfers and leaves — it *cannot sack*. The `siege`/`sack` scenarios never passed the flag, so from the day the cozy pivot landed they asserted nothing. (2) Fixing that exposed the keep being **Town-locked** (`TIER_LOCK.keep`) while the scenario ordered it on **day 0 at Hamlet** — rejected, so `RaidSpawnSystem` short-circuited on `keepPosition === null`: no keep, no raid clock, no threat, nothing to sack. **This was never a silent reject** — the run *printed* `a keep needs Town tier`, then **exited 0** and printed a cheerful economy summary. The fixture logged its own failure and reported success; that, not silence, is the trap. (3) The `popCap 6` vs the promised `24` was **created by fixing (1)**: the sharp path also un-gates sharp fire, which *razes* instead of smouldering, and the old 3-tile pitch sat every house inside `FireSystem`'s Manhattan-4 ignition window. Cozy fire had been masking a layout that could not survive the rules the fixture claims to test. (4) Brief **110 doubled the world to 192×192**; raiders march ~6.7 tiles/day from a **map edge**, so a raid is now **~15 days in transit, not ~7**, and the scenario's "40 days is enough" comment was arithmetic done on the old map. The sack now lands on day 50, and `sack` defaults to 70 days.

**The fix is a real playthrough, not a forced flag.** Tier was deliberately **not** pre-unlocked — `TIER_LOCK` is the gate Challenge (103) must honour, and pre-unlocking would have asserted *around* the mechanism that broke. Instead the town is re-laid for a principled reason (the brief-100 `starve` precedent): a **4-column / 5-row lattice** holds every wooden building to **≤2 wooden neighbours** inside the ignition window, so spontaneous fire is *structurally impossible*. The town is fireproof **by layout** — the exact lesson sharp fire exists to teach. It grows honestly, earns Town on day 12, and raises the keep through the real gate. The fixture now prints `PASS`/`FAIL` and **exits 1 on failure**; it rotted because nothing ever said it had.

**The finding worth carrying forward — three guards, three different claims, and the gap between them is where this lived.** Two sharp-sack tests already existed and **passed for the entire time the fixture was rotting**, because they poke `lp.tier = "Town"` directly and walk straight past `TIER_LOCK`. So the sharp *resolution* was never broken; its **reachability** was, and no test could see it. The byte-identity guard proves the path is **unchanged**. Those two prove **the math still works**. **Nothing proved a player could get there.** New `sharp-raid-path.test.ts` covers precisely that third claim — it never assigns `tier`, and fails if any link in `grow → earn Town → keep clears TIER_LOCK → raid clock anchors → raider marches → sacked` breaks. Scope notes were added to both older guards so the next reader cannot mistake "unchanged", or "the math works", for "it works". Cozy path byte-identical throughout; 270 tests. Unblocks **103**; de-risks **113**, whose "the sharp resolution stays reachable, byte-identical" acceptance would otherwise have been *vacuously satisfiable*.

## [2026-07-11] brief | 98 DONE — the market wall closes a trade, and escrow makes three bugs unrepresentable

The wall had been **charging AP for a loop that never closed**. `BUY_REQUEST` was dutifully forwarded to the seller's inbox and consumed by nobody; `TRADE_COMPLETED` was never sent in production code although three readers waited for it; the `marketOffers` belief that aggressive/hoarder/opportunist all gate their buying on was written **only by test fixtures**, so the buy path could not fire in a live run; and `sell-from-wall` carried an AP cost with no ActSystem case behind it. A designed protocol, fully specified, entirely inert — and still billing the agents for it.

**The design choice that carried the brief was escrow-at-post.** `POST_OFFER` now debits the seller immediately and parks the consumed **quality tiers** on the offer itself (a new `debitCropDetailed` reports which tiers a debit ate, which the plain `debitCrop` from brief 99 didn't need to). The consequence is that **the wall, not the seller, owns listed stock** — and that single relocation of ownership makes three separate bugs *unrepresentable* rather than merely guarded: an uncovered listing is never stored, so oversell cannot occur; two buyers racing one offer cannot both be filled, because `settleBuy` is all-or-nothing and deletes the offer; and "the seller's stock vanished before settlement" cannot happen, because the goods already left their inventory at post time. That is the difference between checking for a bad state and arranging for it not to exist.

**Scheduler placement was the other thing that could only be gotten right once.** The new `WallTradeSystem` reads the forwarded request out of the seller's farmer inbox, so it must run **after** `InboxDispatchSystem` delivers it and **before** `PerceiveSystem` unconditionally wipes every farmer inbox. **SNOOP is the only band satisfying both.** Its `TRADE_COMPLETED` is `bus.send`-queued rather than delivered inline, so trust and event-feed snoop it on the following tick — meaning the *band* is load-bearing but the position within it is not. Settlement always uses the **offer's** price, never the buyer's possibly-stale claimed price. Escrow returns to the seller on `CANCEL_OFFER`, on the `OFFER_TTL_DAYS = 3` sweep, or through the new `sell-from-wall` intent (personalities pull their own listings near run end), so `offersById` is bounded and no stock strands.

**Acceptance was an actual run, not a code read** — the brief insisted on it, and rightly: **42 / 36 / 40 completed wall trades** on seeds `0xc0ffee` / `1` / `42` over 40 days. Goods now circulate peer-to-peer at sellers' prices instead of only through the shopkeeper's ~64% haircut, and listed crops leave the net-worth leaderboard until they sell or the TTL returns them. Baseline moved by design. Gates: typecheck 0; `@farm/sim-core` **834** (+5 — gold+stock conservation, bounded offers, escrow-rejects-uncovered, insolvent-buyer-moves-nothing, two-buyer race); full-repo test exit 0; determinism **MATCH ×3**, with no new RNG draws (the `market.offerId` fork is untouched). `economy.md` + `system-ordering.md` updated. **Wave 2 is complete.**

## [2026-07-11] brief | 99 DONE — the P2 debt batch, and the gate that was blind where it mattered

Findings 28–34 plus the `maxDays` deletion (#18), dispatched as five chunks on disjoint file lanes. **The classification call worth recording: the rng+auction chunk was promoted to senior/opus not because it was large but because the determinism gate is blind exactly there.** `CHECK_DETERMINISM` proves a run *reproduces*; it cannot tell a *correct* rng change from a *wrong-but-still-deterministic* one — a botched fork produces a different, perfectly stable baseline and passes every gate. Where the safety net doesn't reach, put the stronger seat. Everything else stayed junior.

**The substance.** Item 28's `debitCrop` is now the only path that decrements crops (zero `crops[…] -=` sites survive outside it), and `moveNormalQuality` was **deleted rather than fixed** — it only ever touched the `normal` tier regardless of what the giver actually held, which *was* the phantom-tier bug rather than a site suffering from it. Item 30's "wire or delete" was decided as **delete**: the `deliver-contract` paid no-op and the entire CNP contract-net (coordinator, registry, protocol) are gone. Item 31: ShopSlateSystem moved to a named `fork("shop-slate")`; the auction took the **runner-up ladder over escrow**, because escrowing at bid time would have to reach into farmer inventory on every bid *and* duplicate the shopkeeper's gold accounting, racing its own debit — the less invasive fix was the more correct one; and the festival tie-break now **spends** the rng draw it was already taking (uniform pick among tied leaders) instead of discarding it, which removes a low-id bias for free, at an identical draw count. Items 33/34 (Citadel perf) were held to **byte-identity** and proven against the pre-wave commit in a throwaway worktree.

**The Farm baseline moved and explains itself** (40 days, seed `0xc0ffee`): unsold crops **13,404 → 9,037** while total gold **21,475 → 19,687**. More crops selling for *less* money is not a regression — it is exactly the mispricing item 28 predicted, now corrected: phantom quality tiers had been inflating sale prices, so honest accounting means higher volume at truthful (lower) prices. Weather flips on day 1, which is the fingerprint of the shop-slate fork no longer draining the shared top-level stream — the decoupling *is* the fix.

**One adjudication.** The wave's single failing test was item 32's own new one, and the **test** was wrong, not the fix. It asserted `lastFacing.size > 0`, but `resolveFacing` only writes `lastFacing` when a farmer is actually moving (`dx`/`dy` ≠ 0) — a few ticks into a fresh sim they can all be standing still, so an empty map is *correct behaviour*. Repointed at `lastIntention`, which is recorded for every AI farmer the first time it is seen and therefore witnesses the same claim (this object was threaded through) without depending on movement. A test that only passes when someone happens to be walking was never testing what it said it was.

**Operational note:** a session-limit kill took three of the five chunks down mid-*verification* (their edits had already landed). The recovery was to re-derive the tree's actual state from the gates rather than trust the agents' last words — typecheck, all seven suites, both determinism checks, and a worktree byte-compare. Gates: typecheck 0; farm sim-core 829/829, citadel sim-core 267, citadel client 471, engine core 184, farm client 196, farm server 31, citadel server 10. Farm **MATCH ×3** (moved by design); Citadel **MATCH ×3 + byte-identical**. Next: **brief 98** (wire the market wall).

## [2026-07-10] brief | Wave 1 DONE (106, 104, 105) — Citadel client render polish, dispatched

First wave of the remaining-work dispatch plan, run through `plan-split-dispatch`: two junior/Sonnet chunks in parallel on **disjoint file lanes** — 1A owned `main.ts` + `ui/`, 1B owned `render/*` — so a single shared working tree was safe without a worktree. Both render-only, zero sim/determinism exposure. **106** (`242dbbe`): the five siege/hazard DOM readouts + the mode label migrate onto a retained `@engine/ui` widget (`ui/siege-hud.ts`), built once and `refresh`ed per frame on the `resource-hud` pattern (EDG-only, aria-live mirror, click-consuming rect) — the Citadel client now has **zero gameplay DOM UI except the load/save file-input**. **104** (`26deb45`) is now complete on all four items: item 2 added a **hysteretic** L/R facing flip to `VillagerHeadingTracker` (commits a new facing only when the smoothed horizontal heading `|ux|` clears `FACING_FLIP_DEADZONE=0.3`, else holds — so a 4-connected staircase path doesn't strobe the sprite), reusing the pre-existing `Canvas2dSprite.flipX`; item 4 routed the ambient crowd's bob through the same `gaitOffset` villagers use. **105 scope 1** (`26deb45`): ambient pedestrians made clearly non-villager (`PED_SIZE` 0.8→0.6 tile, `alpha 0.55`). **The one non-obvious find:** the crowd dim had to be applied as the sprite's own `alpha`, **not** the tint's alpha byte — the subagent traced `tintFloats` in `webgpu/renderer.ts` and confirmed the WebGPU backend discards a tint's alpha channel, so a tint-alpha dim would have silently no-op'd on real hardware while passing every unit test. **105 scope 2** (MP snapshot owner-filter) stays parked with MP (#21). Gates: typecheck 0, `@citadel/client` 471/471, `@engine/core` palette guard 184/184; browser-verified on real WebGPU (the 106 HUD renders and updates live; town renders cleanly with figures on the roads, no smearing, `reloads:0`). The facing hysteresis and the crowd/villager bob-parity are additionally pinned by numeric tests (hand-derived iso heading sequences; an exact `gaitOffset` frame-for-frame proof), which is the right division of labour: the browser proves no integration/render breakage, the tests prove the sub-pixel temporal behaviour a static frame can't show. Next: **Wave 2** (Farm sim-core economy — 99 then 98, baseline-moving).

## [2026-07-10] plan | the remaining-work dispatch plan, and two things the briefs got wrong about themselves

With #26's two gating briefs (**110**, **100**) landed, the rest of the queue — `{102, 99, 106, 104, 105, 98}` plus the unblocked **103** and **113** — is planned as four sequential `plan-split-dispatch` waves in [todos/2026-07-10-remaining-work-dispatch-plan.md](todos/2026-07-10-remaining-work-dispatch-plan.md): (1) Citadel client render-only, (2) Farm sim-core economy, (3) Citadel gameplay behind a design gate, (4) Challenge mode last. The ordering is not #26's — it is #26's set, re-sequenced by what the briefs actually depend on.

**Planning found more than it expected, which is the argument for planning against the code rather than the queue.** Three collisions: 104 item 4 and 105 scope 1 edit the same `ambient-crowd.ts` (they ship as one chunk, and 104 says so itself); 99's Citadel item 34 touches the Citadel client render path, so it cannot run beside Wave 1; 99's `maxDays` deletion (#18) is wide and merge-hostile and wants its own serialized chunk. Two briefs are stale about their own state: **113's scope 1 is already done** — it landed early inside brief 110 (`0fd66c0`), and the brief says "do not redo this step" — and **103's dependency on brief 97 chunk 4 is already satisfied**, since 97 closed 2026-07-10 with `releaseWorkersAt` at all four removal sites. **103 also contradicts itself**: its 2026-07-10 reshape header says `enableArmy` stays `false` (decisions #23/#24), while its Acceptance section still demands "army/territory active". The acceptance line is stale and must be fixed before Wave 4 splits.

**The load-bearing find is a bug no brief owns.** Brief 100's closeout noted in passing that `SCENARIO=sack` "already failed to sack at HEAD — pre-existing drift", correctly disclaimed it, and moved on. It is now captured as [todos/closed/2026-07-10-citadel-sack-scenario-drift.md](todos/closed/2026-07-10-citadel-sack-scenario-drift.md), because `sack` is the **only fixture that exercises the sharp (`cozyThreats:false`) raid resolution end to end** — the path frozen since the cozy pivot and guarded solely by a byte-identity regression test, which proves the path *hasn't changed*, not that it *works*. That makes it a hard blocker for **103**, whose acceptance is literally "start→sack-or-survive", and a live risk to **113**, whose "sharp resolution stays reachable, byte-identical" is vacuously satisfiable if the sharp resolution is already unreachable. Prime suspect: the scenario may not pass `cozyThreats:false` at all, in which case it has been running the cozy pilfer-and-leave resolution — which by contract *never* sacks — since 2026-07-01, and the fixture has been meaningless ever since.

## [2026-07-10] brief | 100 DONE — the service loop's upside, and the rounding change that nearly took its credit

The OpenTTD-style downside shipped 2026-06-27 and Phase H softened it into a throttle. The **upside** — a reward for a *well-served* building — never did, and it was the largest tracked gameplay gap in Citadel: *"it bloomed because of what I built"* had no mechanic. It has one now, built as the brief insisted: **one curve, not two mechanisms.** `bufferServiceFactor(buffer, cap, serviceEma)` **replaces** `bufferThrottleFactor` at the call site. Above the 0.6 fill knee it *is* the stockpile-pressure throttle; below it, a producer whose rolling service EWMA clears `SERVICE_BONUS_BAND = 0.75` ramps to `PRODUCTIVITY_BONUS_CEIL = 1.25`. A backed-up buffer can never earn a bonus (it is above the knee by definition); a well-served one can never be throttled. Thriving/starved = `1.25 / 0.6 ≈ 2.08×`, and nothing returns 0 — the cozy floor (#9) is untouched. Growth: `arrivalFactor(happiness, townService)` carves `SERVICE_ARRIVAL_WEIGHT = 0.1` **out of** the immigration roll's existing `0.7..1.0` band rather than adding a second growth source beside the bread gate, so happiness alone now tops out at `0.9` and a stocked-but-stagnant town stops attracting people.

**The finding: a rounding change nearly took the credit for the mechanic.** The in-progress implementation floored output **once**, at the end, carrying the fractional remainder — across *every* multiplier (`base × season × hall × happiness × service`). Its premise was right (producers emit 2–3/cycle, so `floor(2 × 1.25) === 2` rounds the bonus to nothing); its scope was not. Measured on the 60-day headless `grow` run, with a third house added so population is **food-limited rather than housing-capped** (the old 2-house fixture pinned pop at its cap of 12 and hid the equilibrium entirely): `main` **9–10** → global carry with the bonus neutralized **14** → global carry + bonus **15** → **carry scoped to the service factor + bonus 12**. The carry alone did the work; the brief's own mechanic was worth a single villager on top. It was also silently strengthening the happiness throttle, the town-hall lift, and the seasonal grain multiplier — three numbers tuned in a floor-per-step world. Scoped to the service factor, the bonus still pays out (9–10 → 12, inside the brief's 12–15 band), which **disproves the WIP's justification**: a global carry was never needed to make 1.25× mean 1.25×. When the curve returns exactly 1 (the common case) `outputRemainder` stays 0 and a building is bit-for-bit unchanged.

**Two bugs no test would have caught.** (1) The service EWMA was sampled at the **cycle timer**, above the converter's input-draw guard. A bakery with no flour `continue`s there — but had already recorded `fill = 0`, because its buffer is empty *precisely because it never baked*. Measured: `serviceEma ≈ 1.0` on a bakery that produced zero bread. It would have collected the 1.25× the instant flour returned and lit the new render cue while starving. The EWMA is now folded in **at the emit**, so every `continue` between the timer and the emit earns nothing. (2) The `starve` scenario stopped starving — the economy got strong enough that a *connected* minimal town survives. Rather than re-fit its food numbers, the fixture is now **deliberately badly laid out**: each producer at the end of a 16-tile spoke from the storehouse. Everything is connected (production requires it), but hauler round trips dominate the cycle, buffers back up, the EWMA never clears the band, and the throttle pulls output to the floor. It starves *because of how it was built* — the brief's thesis restated as a fixture. (`sack` already failed to sack **at HEAD**; pre-existing scenario drift, not caused here.)

**Legibility (scope 3).** `BuildingSnapshot.wellServed` is render-only (the sim never reads it back) and false for houses, unstaffed buildings, and non-producers. It drives `wellServedGlowQuads` — a soft, slowly-breathing cream ground pool (`EDG.cream`, deliberately not `orange` = fire nor `gold` = the disconnected pip), stamped through the same `pushLightPool` helper as the night light pool but **ungated by `nightFactor`**: the question "which buildings is the town keeping up with?" must be answerable at any hour without opening the coverage overlay. First cut was one ring at `alpha 0.1` and was **invisible over the terracotta road carpet** in a real-GPU screenshot at default zoom; it is now a two-ring falloff at `0.18`, mirroring `fireGlowQuads`. Lesson repeated: a render cue is not verified until it has been *looked at* on a real GPU.

**Gates.** Typecheck 0; **2108 tests** across all ten workspaces (+20 sim-core `service-economy.test.ts`, +7 client fx). Citadel determinism **MATCH ×3** (seeds `0x1a2b3c4d`/`0xc0ffee`/`0x2a`, `grow`, 40d, byte-identical paired runs). Headless: `grow` 60d **pop 12/18** food-limited (baseline **moved by design**), `starve` → `gameOver=true`, `siege`/`sack`/`fire`/`disease` as documented. Browser-verified on real WebGPU: 4 producers flagged `wellServed` (2 farms, 1 mill, 1 bakery), **0 houses, 0 unstaffed, 0 roads**. Source todo [2026-06-22-citadel-two-way-service-economy](todos/2026-06-22-citadel-two-way-service-economy.md) closed — both halves of the loop now exist.

## [2026-07-10] brief | 110 DONE — the solo world grows to 192×192; the windowed bake goes live

Part 1 (`8e930f3`) had made the iso projection a runtime object and fixed the windowing maths, but nothing generated a world big enough to exercise either. Part 2 (`0fd66c0`) grows the **solo** world to 192×192 per decision #22 — the smallest size whose iso texture (6144×3088) crosses the `4096²` threshold — so briefs 21/22's windowed bake stops being dead code. **Browser-verified on a real WebGPU GPU**, the acceptance bar precisely because that path had *never executed*: `terrain()` → 192×192, `windowed` → true, panning to all four corners re-bakes 6× with the `IncrementalQueue` draining to 0 each time and the baked window containing the camera every time; a house placed at tile (100,100) — past the old 96 bound — lands and renders registered with its terrain. That last check is brief 108's item 4 and review-findings item 35, verified in solo.

**Three bugs surfaced that no test could see**, sharing one shape: *a value derived from a mutable default, or from a world size, that nothing forced to agree.*

**(1) Resource density was keyed to the mutable default world size** — the nastiest. `generateTerrain` scaled its blob counts (5 groves / 3 veins, tuned for 96×96) by `areaScale = width·height / (WORLD_WIDTH · WORLD_HEIGHT)`. But `WORLD_WIDTH` is the *default*, so the default world **always** scored `areaScale = 1` however large it grew. Raising the default to 192 quartered resource density across the whole game, silently, with every test still green: measured over 100 seeds, the walk from the core box to the nearest grove doubled (forest p50 17 → 41; stone p50 22 → 57, max 152). Anchored now to a fixed `RESOURCE_DENSITY_REFERENCE_AREA = 96*96`; with density restored, 192×192 reads like 96×96. This is exactly the trap the brief's own Notes warned about — *"an exported constant is what let the client silently disagree with the sim"* — surfacing where nobody was looking for it.

**(2) `tileKey` was non-injective at the map edges, at every world size.** It packed `ty·WORLD_WIDTH + tx`, while `neighbourMask` probes `tx±1`: so `tileKey(W, ty) === tileKey(0, ty+1)` and `tileKey(-1, ty) === tileKey(W-1, ty-1)`. A road on the east-edge column reported a connection to a road on the opposite edge one row down — never *visible* only because a centred town never touches the map edge. Now a fixed `TILE_KEY_STRIDE = 4096`, the precedent `ambient-crowd.ts` already used. Along the way: **two of the three hardcoded `const W = 96` strides in `sim-bootstrap.test.ts` were passing for the wrong reason** (a wrong index that happened to hold the expected value); only the third failed when the world grew.

**(3) `launchAttack` was not gated on `enableArmy`.** Decision #23 freezes `ArmySystem`, but `enableArmy:false` only unregisters the *system* — the handler still debited `attacker.stockpiles.tools` and pushed an `ArmyState` nothing resolved or removed. Confirmed by removing the gate: 20 commands leave `state.armies.length === 20` and the tools gone. Flip and gate landed in one change, as #15 warned and #23 inherited. Brief 113's scope 1 is therefore already done.

**Decision #25's bound is measured, not assumed.** `repairSolvability` guaranteed resources were *reachable*, not *near*; on 96×96 the map bounded the distance, on 192×192 it does not. Over 100 seeds with density held constant the 96×96 world's nearest-resource walk distance never exceeded **67**, so `RESOURCE_MAX_DISTANCE = 70` makes the big world *never worse than the small world ever was* — clipping the 192 stone tail from 86 to 70 while repairing ~5% of stone seeds and 0% of forest, so Phase I's resource-poor maps (and the trading post that serves them) survive. The flood-fill became a BFS to carry walk distance; the reachable *set* is unchanged.

Also: engine `assertTextureWithinLimits()` guards `maxTextureDimension2D` — nothing in `render/` checked it, and an oversized bake raised a validation error on the device's error scope and painted **black** with nothing naming the world size. `init` now carries `worldWidth`/`worldHeight`, so solo's client (which generates the terrain it renders) tells the worker what size to build rather than both trusting a shared constant.

Gates: typecheck 0 · **2081 tests** green · Citadel determinism **MATCH ×3** · Farm determinism MATCH, untouched. The **headless Citadel baseline did not move** (`pop 9/12, bread 10, gameOver=false`) — the scripted `grow` scenario places near the core box, so a 4× map does not shift it, which also means the headless runner does not exercise the resource-distance concern (`terrain.test.ts` does). MP's terrain-shipping half is parked with MP; the late-joiner seed bug is **real and still present** there. Next: brief 100. See [briefs/game/done/110-citadel-client-world-size.md](briefs/game/done/110-citadel-client-world-size.md).

## [2026-07-10] decision | Second grilling session — multiplayer is deprecated; the solo world grows to 192×192

Ran hours after the session below, against the same code, and **reverses much of it**. Decisions **#21–#26** in [citadel-decisions.md](wiki/citadel-decisions.md). No code changed.

The earlier session asked *how do we make MP correct* and produced four briefs of work. This one asked the question underneath it — **who plays it** — and found no answer. Cozy MP had been stripped by its own prior decisions: **#7** removed the score, **#9** the ending, **#15** the armies, **#17** the save. What remained was a scoreless, endless, unsaveable co-op sandbox, and 110+111+112+105+109 was the largest block of work in the queue, serving no identified player. **#21 deprecates MP** — kept in-tree, compiling, unmaintained. Its three real defects (one room per process, so a stranger joins *your* game; late joiners regenerating terrain from their own hardcoded `SEED`; `request-save` handing out a blob MP cannot load) and the revival checklist are consolidated on a new page, [citadel-mp-deprecated.md](wiki/citadel-mp-deprecated.md). They are unreachable only because nothing hosts Citadel publicly — **recorded, not fixed**.

The deprecation cascaded further than the MP briefs. **#22:** the server ran 256×256 because it was typed into `index.ts:16`, not because anyone argued for it — and with MP gone, *nothing in the repo consumed a 256×256 world at all*, which would have made brief 110 a renderer for a world with no inhabitant. So the **solo** world grows 96→**192×192**: the smallest size crossing the `4096²` iso-pixel windowing threshold, so brief 110's already-landed part 1 (`8e930f3`) and briefs 21/22's windowed bake stop being dead code. 256 was rejected for sitting exactly on WebGPU's default `maxTextureDimension2D` (8192 px) with zero margin.

**#23 reverses #15.** #15 removed armies from cozy MP on the grounds that lethal PvP would *relocate* to Challenge mode, "which must at minimum support MP". With MP deprecated there is no destination. Grounding it in code settled the shape: `ArmyState` is PvP **down to its fields** (`attackerId` is a player, `targetPlayerId` a building's owner, `findTargetBuilding` filters on `ownerId`), so there is no AI attacker to repoint it at — and `applyRaidDamage` already does the PvE job. What armies have that raids don't is **a body**: `ArmyState` carries `x, y, tileX`, a unit that marches, where the cozy raid is an abstract `raidStrength` applied at the keep. So `ArmySystem` freezes (`enableArmy` default → `false`, with the `launchAttack` handler gated **in the same change** or it *creates* the unbounded-`state.armies` bug #15 warned of), and its machinery is reborn as the raid's embodiment — raiders you watch approach, pilfer, and leave. Filed as [brief 113](briefs/game/todo/113-citadel-raid-gets-a-body.md), not built.

**#25** is the consequence nobody had costed: `repairSolvability` guarantees resources are *reachable* by flood-fill, not *near*. On 96×96 the map bounds the distance; on 192×192 it does not, so a guaranteed stone can sit 100 tiles from the core box across terrain the player must road toward with wood they don't have — **the Phase C cold open would open on a living town that cannot grow**, and no existing test would see it. The guarantee gains a distance bound, with N calibrated from a measured 100-seed distribution rather than assumed.

**#24** makes Challenge mode solo-only (it sheds PvP and the MP bundle; #19's call-site-preset shape lets it do that for free) and unblocks it. **#26** sets the order: **110 → 100 → {102, 99, 106, 104, 105, 98}** — the world before the economy, since brief 100's balance numbers are meaningless on a map about to quadruple.

Also settled: Farm Valley is in **maintenance** (98 + its slice of 99; 101 and 107 parked — 101's own brief forbids autonomous execution, 107 needs the user's real GPU). Engine 18 and 19 parked. Brief 100's numbers fixed at a single `0.6 → 1.0 → 1.25` curve and a **pop 12–15** target. Superseded, never built: [109](briefs/game/superseded/109-citadel-vps-deploy.md), [111](briefs/game/superseded/111-citadel-mp-room-keys-and-session-semantics.md), [112](briefs/game/superseded/112-citadel-cozy-mp-drop-armies.md).

## [2026-07-10] decision | Grilling session — MP is a real feature; the cozy contract extends to it; Challenge mode gets built

A grilling pass over the open queue, prompted by brief 108's findings. Six answers, recorded as decisions **#11–#14** in [citadel-overview.md](wiki/citadel-overview.md). **Two of them reverse earlier commitments** and win over anything older.

The session surfaced a contradiction nobody had noticed: the design of record said *"MP/PvP is a future mode, not the core"*, yet the server ran a 256×256 world built for MP and three open briefs (105, 109, 110) existed only to serve it. Resolved — **#11: MP is a real feature**, the committed 256×256 world stays, and [brief 110](briefs/game/done/110-citadel-client-world-size.md) is the work standing between that claim and reality.

It also surfaced a live incoherence that fell out of two defaults rather than any decision: the MP server passes neither `cozyThreats` nor `enableArmy`, so both default true. MP therefore runs **cozy PvE beside lethal PvP** — NPC raiders pilfer and leave, while a rival's army sacks your town-hall and ends your run (`army.ts:127-128` sets `keepSacked` + `gameOver`). The cozy contract held against the AI and was broken by other players. **#12** resolves it the cozy way: *nothing you built is taken from you* is a whole-game promise, so a sacked hall must **dent, not end** a run. Lethal elimination is not deleted — **#13** moves it to Challenge mode, which is now approved and becomes the frozen sharp path's first real consumer, so its two-branch test burden stops being dead weight.

**#14** settles brief 110's transport fork: the server **ships the terrain grid** (256×256 = 65,536 bytes; `perMessageDeflate` is already on above 1 KiB and terrain compresses hard) rather than sending dims + a seed for the client to regenerate from. This makes terrain desync structurally unrepresentable, and retires a latent bug the alternative would have kept alive — `init` carries the *client's* hardcoded `SEED`, and only the first peer's seed starts the sim, so a late joiner regenerating from its own constant would silently render a different world.

Two questions were **opened rather than answered**, and are parked in [open-questions.md](wiki/open-questions.md): what a cozy PvP army attack actually *does* (pilfer / dent happiness / capture territory — nothing in the code answers it, and #12 cannot be implemented without a call), and whether Challenge is a solo difficulty, an MP ruleset, or one flag meaning both (the two axes are independent bootstrap options today).

Also decided: **brief 98 → Option A, wire the market wall** (complete the FIPA loop rather than strip it; baseline moves by design). Briefs 96, 101, 107, 109 scheduled as interactive sessions; 109 gated on 110. `open-questions.md` refreshed — it had been stale since 2026-06-12 and carried no Citadel content at all.

### Second round — what MP is *for*, and what that costs (#15–#18)

Pushing on #12 exposed that it had removed MP's only ending. There is **no win condition anywhere** in `@citadel/sim-core` (no `victory`, no `winner`); decision #7 forbids score; and `maxDays` is a **required** `CitadelSimOptions` field that **no system reads** — every caller passes it, nothing consumes it, which is why a live MP room sailed past day 200. The three writers of `gameOver` are `army.ts:128` (rival sack — removed by #12), `siege-resolution.ts:408` (raider sack — unreachable under cozy defaults) and `immigration.ts:255` (town dies out — which #9 exists to prevent). So "soften PvP into a dent" would have shipped a lever with nothing on the other end.

**#15** takes the honest route: cozy MP is a **co-op sandbox and armies come out of it entirely**, rather than being softened. Lethal PvP is not deleted — it relocates wholesale to Challenge mode (#13), where a run *can* end and the mechanic means something. This closes the open question "what does a cozy army attack do?": there isn't one. Filed as [brief 112](briefs/game/superseded/112-citadel-cozy-mp-drop-armies.md).

Grounding that brief turned up a live trap. The `launchAttack` handler ([sim-bootstrap.ts:779-822](../games/citadel/sim-core/src/sim-bootstrap.ts)) is **not gated on `enableArmy`**: it debits `stockpiles.tools` and pushes an `ArmyState`, while `enableArmy:false` merely unregisters `ArmySystem` — so the army never resolves, the tools are gone, and `state.armies` grows unbounded. It is latent today only because the handler returns early without a rival building (so a one-player solo sim can't reach it) and MP runs `enableArmy:true`. **Setting `enableArmy:false` in MP without gating the handler would create the bug** — the same shape as brief 98's Farm market wall: intents queued, cost paid, nothing resolves. Brief 112 must do both in one change.

**#16/#17** cover the other two things nobody chose. The server is **one room per process** — its own header calls a multi-room lobby "a follow-up" — so every peer who connects joins the *same game*, and brief 109 would put that on a public VPS. Rooms become keyed and invite-only (`?mp=<roomId>`, porting the Farm `RunRegistry` that citadel-38 item 7 already names as the model). And an MP run is **ephemeral by design**: `request-save` hands a peer a blob that `load-save` refuses to load in a shared room ("would desync live peers"), and the room reaps 10 s after the last peer leaves — so the save API promises a recoverability MP does not have. Both filed as [brief 111](briefs/game/superseded/111-citadel-mp-room-keys-and-session-semantics.md), which now also gates 109.

**#18** deletes `maxDays` rather than wiring it (MP is endless by #15); folded into [brief 99](briefs/game/done/99-p2-debt-cleanup-batch.md).

### Third round — what a "mode" is, and a save that could not replay (#19–#20)

The Challenge question turned out to be the wrong shape. Saves already persist `chargeBuildCost`, `cozyThreats`, `enableArmy` and `seedTown` **individually**, each with a comment saying *"a save taken with X must replay with X"* — because `loadFromSave` reconstructs state by re-running the command log, so the rules must match. A "mode" is therefore already a **bundle of persisted flags**, not a thing the sim knows about. **#19**: Challenge introduces no new sim state; "cozy" and "challenge" are presets chosen by the caller, and Challenge-solo vs Challenge-MP fall out for free. Adding a `mode` enum would duplicate state and let mode and flags disagree. **#20** sets the order: finish the MP arc (110 → 111 → 112) before Farm or engine; audio (engine 19, approved and dispatch-ready, zero `sim-core` changes) runs after it.

That decision has teeth, and they bit immediately. **Brief 108 added `multiplayer` — which decides `actsAsKeepAnchor` — and did not persist it.** Writing the round-trip test for that found a *second, larger* omission: **world dimensions were never persisted either.** `loadFromSave` rebuilt the engine-default 96×96 grid, so every replayed command beyond tile 95 was silently rejected as out-of-bounds — **a 256×256 MP save was unreplayable, its buildings simply gone.** Both are reachable today: `request-save` hands out a valid `CitadelSave` in MP (decision #17 removes it), and the solo client's Load button accepts any file.

Fixed in `19d6d98`: `multiplayer`, `worldWidth`, `worldHeight` persisted, all optional for backward-compat (absent ⇒ the bootstrap defaults, which is what every older save effectively recorded, since only solo could ever load one). The test places a hall past tile 95 in a 256×256 multiplayer sim, saves, reloads, and asserts the building survives replay *and* keeps its `keepPosition`. Each half was proven to go red on its own. typecheck 0, 2053/2053.

The general lesson, now recorded in #19: **every mode-affecting bootstrap option must be persisted in `CitadelSave`.** Challenge mode will add more of them.

No Citadel design questions remain blocking; both questions opened earlier today were closed by the end of it.

## [2026-07-10] done | Brief 108 — Citadel live-MP verification: the client renders a 96×96 corner of a 256×256 world

[Brief 108](briefs/game/done/108-citadel-live-mp-verification.md) is the first time Citadel multiplayer was driven **live**: `npm run citadel`, two real browser tabs on `?mp` against the WebSocket server, driven through the `window.__citadel` dev hook, plus a raw-WS harness where the browser was too coarse an instrument. It found one root-cause defect and one independent gameplay bug. Code fix in `16b0191`.

**Room lifecycle passes (item 1).** Join, late-join replay (the joiner receives the founder's buildings with the correct `ownerId`), owner handoff on host departure in **211ms**, and the reap grace: reconnect at **3.1s** rejoins the live run (tick 58, hall intact), reconnect at **12s** gets a fresh one (tick 1, playerId reset to 0). `reapGraceMs`/`reset()` behave as documented; citadel-38 P1#7 is verified live. *Method note:* the first attempt measured this through Playwright tab close/open and read a false "fresh run" — tab churn exceeds the 10s window. Timing a grace period needs a client you can open on demand.

**The raid-anchor bug (item 3) — fixed.** The town-hall's keep/raid-anchor role was gated on `state.players.length > 1`, a **live** count, while `keepPosition` is assigned exactly once, at placement. A real MP room is founded by **one** peer and grows. So the founder's hall never anchored, and since raid-spawn gates entirely on `keepPosition`, the founder was **permanently raid-immune**. Worse, the snapshot's `keepPresent` re-evaluated that same predicate every tick, so it flipped to `true` the moment a second peer joined: the founder read "Keep: standing" while nothing could ever attack them. Isolated live — two identical halls, opposite behaviour: the hall placed alone reported `keepPresent true, nextRaidDay -1`; the hall placed with two players present reported `keepPresent true, nextRaidDay 213`.

The lesson generalises: **`players.length` tracks who is connected, not which mode this is.** Mode is now a bootstrap-time fact — `CitadelSimOptions.multiplayer`, default false; the MP server passes `true`, the solo worker states `false` explicitly. Solo, the headless runner, and the determinism baseline are unchanged *by construction*: at one player both the old and new predicates evaluate false, with no RNG draw between them. The regression test was confirmed to go red under the old predicate while its four siblings stayed green, and the fix re-verified against the live server (`keepPresent true` **and** `nextRaidDay 5`).

**The root cause (items 2/4/5 blocked → [brief 110](briefs/game/done/110-citadel-client-world-size.md)).** The server runs a **256×256** world ([server/src/index.ts](../games/citadel/server/src/index.ts)); the **client is hardcoded to 96×96**. `main.ts:1120` calls `generateTerrain(SEED)` with no size args, and `iso.ts`'s `ISO_ORIGIN_X`/`ISO_WORLD_W`/`ISO_WORLD_H` are module-level consts derived from the compile-time `WORLD_WIDTH/HEIGHT` — they cannot track a runtime world. Confirmed in-browser: an MP tab reports `terrain() → 96×96`. Consequences, all reproduced:

- Players are **silently confined to the top-left 96×96 corner** — `placement-state.ts`'s bounds check rejects any tile ≥96, and the camera only frames the 96×96 iso world. 86% of the map is unreachable through the UI.
- A hall at the world's own centre (128,128), where `coreBoxCenter` puts settlements, projects to screen **y≈712 on a 640px-tall canvas**. Off-canvas, over untextured background.
- **Raiders spawn in that void:** `pickEdgeSpawn` uses `state.width/height` (256), so they enter at the true map edges.
- Tile-key packing (`ty*96 + tx`) is **not injective** over a 256-wide grid. Masked today only by the bounds check above.
- **Briefs 21/22 are unreachable in production.** `shouldWindow(1536,1536)` is false, so `windowed` is *always* false: the windowed bake never runs and `IncrementalQueue` never drains. citadel-38 item 8's "one-line fix" — call `windowController.update(camera)` each frame — **was applied**, sits at `main.ts:1221`, and is **inert**. A fix that was never verified to take effect.
- Review findings **item 35** (window mixes iso and axis-aligned space) is real but **latent behind** all of this: the drift can only appear once the client actually windows. It is therefore a sub-task of brief 110, not a standalone cleanup.

This is the half of [citadel 29](todos/closed/2026-06-19-citadel-29-world-256-townhall.md)'s acceptance — *"world dimensions read from config"* — that landed in the sim and never in the client. Brief 110 carries 108's three blocked items as its own acceptance.

**Why it survived this long.** Solo is 96×96 and entirely self-consistent; every sim test bootstraps its own world; the server tests never render. Neither defect is reachable from unit tests or from solo play. Both required two real clients against the real server. Gates: typecheck 0, **2051/2051 tests** across 212 files.

## [2026-07-10] done | Brief 97 wave 2 — brief 97 CLOSED (inbox leak, MP pause/speed authority, toast dedup + trade race)

The last three chunks of [brief 97](briefs/game/done/97-review-fix-wave.md) landed in `c8ee284`; the brief moves to `done/`. Dispatched via `plan-split-dispatch` (opus controller; 2 senior/opus chunks in parallel on disjoint game lanes, then 1 junior/Sonnet chunk serialized behind them on the shared snapshot file; 3 scoped review finders + 1 fix agent). **Unlike wave 1, wave 2 moved neither game's baseline** — Farm and Citadel are both byte-identical to `main` on three seeds, verified against a *properly-installed* `main` worktree (a bare worktree resolves the workspace symlinks back to the branch and silently compares the branch against itself).

**Farm station inbox leak (item 11).** `InboxDispatchSystem` fans every broadcast into *every* entity with an `inbox`, but `PerceiveSystem` clears only farmers — its query is `("inbox","beliefs","fsm")`. The stations accumulated forever while ~10 systems re-scanned them each tick. New `StationInboxClearSystem` in a new final **`CLEANUP` band** (band 10 — see [system-ordering.md](wiki/system-ordering.md)), after the last consumer. `WeatherSystem` drains its own inbox *pre-dispatch* (it is registered one line before `InboxDispatchSystem`, so `flush()` refills it in the same stage); the shopkeeper keeps a winner's un-credited `AUCTION_RESULT` because that is a live cross-tick settlement retry, and drops the inert ones. Peak station inbox over 40 days: **11**, flat in day count. Proven behavior-preserving by multi-seed `EXPORT=json` diff — the determinism check alone could not have shown this, since it only asserts a seed reproduces itself.

**Citadel pause/speed authority (item 13).** `paused`/`speed` were optimistic client locals; the server silently dropped a non-host's commands and the snapshot carried no `paused` at all, so a non-host HUD lied permanently and a load-save left `interpAlpha` pinned to 1. The snapshot now carries authoritative `paused`/`speed` + `isHost`; `main.ts` rederives all three instead of shadowing them; non-host room controls render disabled. Corrections **re-broadcast immediately** — no tick runs while paused, so a correction cannot ride one. The vestigial "ticks per second" `speed` field had no consumer and became the multiplier it was already being overwritten with.

**Citadel toast dedup + trade race (items 20, 21).** `recentEvents` is a capped tail, so diffing it by matching the last-seen *string* drops the second of two identical events (the rightmost match is the new one). Added a monotonic `eventsSeq` to sim state and the snapshot; the toast diff is sequence-based. The `trade` command sent a bare positional `offerIndex` that raced the daily re-roll, buying something the player did not pick — it now sends the offer's content and the sim resolves by content match against the live menu, no-op on mismatch.

**Two durable lessons, both about tests that certify nothing:**
1. The toast **regression test passed on the unfixed code**. With `prevSeq=1` the old string-match anchors on a unique `"a"` and splits correctly; the bug only bites when the *last-shown* event is itself the duplicate (`prevSeq=2`). Reconstructing the old algorithm and running it against the shipped assertion is the only thing that revealed this.
2. The Farm inbox test guarded inbox **size**, but the failure mode is message **visibility** — a clear registered too early keeps inboxes bounded (more so, in fact) while the band-3 snoopers silently stop seeing their broadcasts. Both guards were rewritten and **proven to go red** against the broken code before being accepted.

**A regression the fix pass itself introduced, caught before closeout:** gating interpolation ingest on `tick > lastIngestedTick` froze every entity after a solo load-save, because `load-save` sets `tick = save.currentTick` and so rewinds. The predicate must be `!==` — an identical tick means "correction re-broadcast"; a *changed* tick, in either direction, is real new state. Verified live in a browser: loading a tick-1252 save at day 284 walks the clock back to day 68 and rendering continues.

Two finder claims were **rejected by the controller**: a `NaN` hazard in the trade handler (`Stockpiles` is `Record<GoodType, number>`, a mapped type over a literal union — `noUncheckedIndexedAccess` never widens it, and `have - qty` typechecking at all proves it) and an "unbounded" `settledAuctions` Set (~20 short strings per 100 days, against the 50–200/day arrays the change removes).

## [2026-07-09] done | Repo gate infrastructure rot — typecheck, test and determinism gates all repaired

Closed [the gate-rot todo](todos/closed/2026-07-09-repo-gate-infrastructure-rot.md) in `42bb4b1`. **`npm run typecheck` and `npm run test` now both exit 0**, so a red gate finally means a real defect. Done inline (well below the dispatch threshold).

The filing under-counted the damage, and running the gates rather than trusting the doc is what exposed it. It named **one** red workspace; there were **five** (`@farm/server`, `@farm/sim-core`, `@tool/run-sim`, `@tool/world-preview`, `@tool/citadel-sim`) — `npm run typecheck` runs `--workspaces` and **stops at the first failure**, so it never reached the one that had been reported. Cause: [tsconfig.base.json](../tsconfig.base.json) sets `"types": []`, so each package opts in, and these five are headless yet import the `@engine/core` root barrel, which transitively re-exports the WebGPU passes. They needed `@webgpu/types` + a `*.wgsl?raw` ambient declaration. **The fix already existed in-repo** — `@citadel/sim-core` and `@citadel/server` are the same shape and were green precisely because they carry both; copied to all five, with the dep pinned instead of resolved by hoisting. `@farm/sim-core` separately declared no node types at all, so `node:fs`/`node:path`/`node:url` in two of its tests didn't resolve. **No real type errors were hiding behind the WebGPU noise.**

Two further defects the todo never found, both surfaced only once the first three were fixed — the point being that **a gate that is already red teaches you to ignore a new red**:

- `interior-decor.test.ts` called `expect()` inside an O(n²) pair loop; matcher overhead alone (not the check) blew the 5s default timeout. Collects violations and asserts once now — same invariant, 8.4s → 2.4s.
- `coral-fishing.integration.test.ts` runs a 24k-tick live sim in `beforeAll` that needs ~40s idle against a declared 60s hook timeout — fine standalone, failing under full-repo load when it shares the box with sibling vitest workers. Raised to 180s; its 30-day window is load-bearing per its own comment, so shortening the run would have weakened the assertion.

Also: `farmer-frames.test.ts` read its atlas manifest from a pre-reorg `farm-valley/` path, dying at **import** so vitest reported `Tests: no tests` — it had contributed neither a pass nor a fail since the reorg. Re-pointed; both revived assertions pass, so the atlas is genuinely consistent.

And `check-determinism` was broken on Windows for **two** reasons, not the one filed. The POSIX env prefix needed no `cross-env` — [env.ts](../tools/run-sim/src/env.ts) already accepted a `--check-determinism` flag. But that alone still died with `ERR_MODULE_NOT_FOUND: ./run-core`: **tsx's ESM hooks do not install in a worker thread via `execArgv`** (measured — `--import tsx`, `--import tsx/esm` and `--loader tsx/esm` all fail), so the worker could transform its own TS but not *resolve* an extensionless import. It now boots from an eval'd stub that calls tsx's `register()` inside the thread first. Verified 3 seeds × 6 workers, all MATCH.

Residual: the seeded double-run `EXPORT=json` hash diff still **subsumes** `check-determinism` (it diffs actual outputs rather than only asserting reproducibility) and is worth promoting to the documented gate. Not done here.

## [2026-07-09] done | Brief 97 wave 1 — six P0/P1 review-fix chunks landed (brief stays open: ch.3/5/8 remain)

Wave 1 of [brief 97](briefs/game/done/97-review-fix-wave.md) shipped on `brief-97-review-fix-wave` via `plan-split-dispatch`: opus controller, **1 senior/opus + 5 junior/Sonnet** executor chunks run in parallel on **disjoint file lanes in one shared working tree** (no worktree, no `git stash` — the lanes were the isolation), then **3 scoped review finders + 1 fix agent**. Chunks 1, 2, 4, 6, 7, 9 landed; **3 (inbox clearing), 5 (Citadel MP pause/speed authority), 8 (toast dedup + trade race) are still open** — the brief is NOT complete and stays in `todo/`. Chunk 10 (corpus sweep) was done inline here and is now largely obsolete: `d071281` had already fixed the ~190 stale wiki links.

Headline fixes: Citadel's **ghost-worker leak** (fire wrote `rs.workerCount = 0` every burning tick without releasing the villager, so the worker looped forever while ImmigrationSystem backfilled the phantom vacancy — now an ephemeral `BuildingRuntimeState.suppressed` consumed by ProductionSystem, plus a shared `releaseWorkersAt` at all four real removal sites); Farm's **juice death** (diffed events by `events.length` against a capped 30-entry tail window, so every shake/hitstop/popup died permanently after ~30 events — now an event-tick high-water mark); the **self-cancelling crop-quality formula** (`currentDay - (readyAtDay - ⌊daysGrowing⌋)` collapsed to `⌊daysGrowing⌋`, pinning `growthScore ≈ 1.0`, so `OUT_OF_SEASON_GROWTH_RATE` and the farming-skill multiplier reached neither timing nor quality); and **one-message server DoS** (`{"type":"speed","multiplier":1e9}` ran 1e9 synchronous ticks per interval, stalling every run and socket).

**The review is the story.** Three *scoped* finders (integration / sim-agent logic / render-server) beat one generalist, and disagreed with each other productively: finder B checked chunk 2's new village gate against its sibling *handlers* and cleared it; finder A traced the gate's *producers* and found `opportunist.ts`'s liquidity branch queues `sell-shopkeeper` with **no travel intent** — so post-gate the sell silently no-ops while `ApSystem` has already deducted 3 AP/crop. Controller adjudicated in favour of A (verified in source). Four more: the boat hull, told by the brief itself to take `id: entity.id`, **collided with the farmer's id** — three first-match id-keyed consumers broke at once (held tool rendered on the hull facing "down"; camera-follow and particles read the hull's `+0.15*TILE` offset; `prevById` overwrote the hull so it lerped from the farmer's prior position). Fixed with a disjoint negative-id namespace (`-entity.id`; ECS ids start at 1), which needed **zero client changes**. And a fire-**suppressed** Trading Post kept trading, because `trader.ts` gated on `workerCount` — the one reader chunk 4 missed when it stopped zeroing it. Durable lesson: **a lane-scoped executor cannot see the bug its own correct change causes in a lane it doesn't own**; the brief's own prescribed fix was wrong, and only a cross-package lens caught it.

**Gates:** engine 177/177 · farm-server 31/31 · farm-client 196/196 · farm-sim-core 811/812 · citadel-sim-core 231/231 · citadel-client 423/423. Farm determinism **MATCH ×3** (0xc0ffee/1/42) and Citadel **MATCH ×3**, both by double-run byte-identical export diff. **Farm baseline moved by design** — 100 days, seed 0xc0ffee, against a true `main` worktree: diverges at **day 2**, all four AI personalities; total gold 81,962 → 55,412 (−32%), unsold crops 36,134 → 28,008 (−22%). Crops now actually sell (the gate forces the travel agents were skipping) and gold falls because quality finally responds to season/skill. Chunk 6's connection-lost banner **verified live in a real browser** (killed the sim server mid-run; crimson `EDG` banner appears where the client used to freeze silently). Juice-past-30-events and the new boat drop-shadow were **not** eyeballed live — unit-tested only; they belong to [brief 107](briefs/game/todo/107-farm-visual-verification-session.md).

**Method note (baseline diffing):** a git worktree at `main` has no `node_modules`, so Node resolution walks *up* and `@farm/sim-core` resolves to the **branch's** workspace symlink — the first "main vs branch" comparison was branch-vs-branch and came back spuriously byte-identical. `npm install` inside the worktree before trusting any cross-revision sim diff.

Three pre-existing defects surfaced while running the gates, none caused by this wave → filed as [todos/2026-07-09-repo-gate-infrastructure-rot.md](todos/2026-07-09-repo-gate-infrastructure-rot.md).

## [2026-07-09] corpus | Retrieval-budget restructure + CodeGraph adopted as the code-understanding layer

Two changes, one theme: make the corpus cheap to retrieve from, and stop asking it structural questions it was never meant to answer.

**Corpus restructure (token efficiency).** Adapted the atomic-note / A-Mem idea (an LLM-written one-line description per note, so an agent triages *without reading the note*) onto the existing wiki. Every wiki page now opens with `summary:` + `updated:` frontmatter; [index.md](index.md) is regenerated from those summaries and no longer duplicates the brief catalog ([status.md](wiki/status.md) already owned it). Added a **retrieval budget** to [CLAUDE.md](CLAUDE.md) — read `index.md` then at most 2–3 pages; needing more is a signal a page must split, not a licence to read more. Four straddling pages were split: `citadel-overview` (463 lines) → + `citadel-hud-and-overlays` + `citadel-rendering`; `player-and-interaction` → + `farm-world-dressing`; `performance` → + `performance-measurements`; `citadel-asset-critique` → + `citadel-asset-verdicts`. 17 pages → 22, longest now ~206 body lines. New [lint.sh](lint.sh) gates frontmatter, link resolution, page size, and stale path roots.

**Drift found and fixed while doing it.** The wiki still pointed at a `packages/` tree that hasn't existed since the `engine/`+`games/`+`tools/` reorg — **173 stale path references across 11 pages**, plus 29 links to files that had moved (`systems/*.ts` → `systems/<module>/*.ts`, `ui/*.ts` → `ui/canvas/*.ts`, atlas recipes → `games/farm/atlas-recipes/`, 12 closed todos). All 226 wiki link targets now resolve. One semantic drift: [performance.md](wiki/performance.md)'s **top-ranked finding** (relationship matrix rebuilding 441 DOM cells per frame) was obsoleted by the 2026-07-01 in-canvas UI migration — `createEl(` no longer appears anywhere under `games/farm/client/src/ui/`. Marked obsolete rather than deleted.

**CodeGraph adopted, with a measured envelope.** `@colbymchenry/codegraph@1.3.1` (tree-sitter + heuristic resolver → local SQLite, MCP-served) indexes the repo in ~30 s: 895 files, 9,384 nodes, 35,992 edges. Registered in [.mcp.json](../.mcp.json); `.codegraph/` gitignored; telemetry off. Operating rules live in the **project** skill `.claude/skills/codegraph/SKILL.md`; the two-layer model and full numbers in [wiki/code-graph.md](wiki/code-graph.md); the question→layer table in [routing.md](routing.md).

Benchmarked before trusting it. ✅ It resolves cross-package barrel imports (`effectiveOutputPerCycle`: `@citadel/sim-core` → barrel → `@citadel/client`), which pure tree-sitter tools miss. ❌ It is incomplete on "every usage" — `callers createRng` returned 16 of 42 real call-site files (38%), missing a production call in `sim-bootstrap.ts:183`. ❌ **It conflates same-named symbols across the two games**: `callers bootstrapSim` returns Farm's callers and silently omits Citadel's four. 18 exported names collide (`bootstrapSim`, `RenderSnapshot`, `WorkerInbound`/`Outbound`, `WORLD_WIDTH`, `isWalkable`, …) — precisely the load-bearing ones. Rule: lead with the graph to *locate*; verify with `grep`/a guard test before acting on completeness; never use it for the dependency rule.

Prior art (a tool benchmark on another TypeScript monorepo) supplied two corrections to the vendor claims — codegraph is *not* compiler-grade, and pure tree-sitter silently drops cross-package edges. Both reproduced here. The two-game collision is new and specific to this repo, which is why the envelope has to be re-measured per repo rather than inherited.

## [2026-07-08] todo | Engine brief 19 — audio subsystem (captured + dispatch-ready, execution deferred)

Routed a new "add engine audio" request through `orchestrate`. Captured
[todos/2026-07-08-engine-audio-subsystem.md](todos/2026-07-08-engine-audio-subsystem.md) (problem
+ design constraints + acceptance) and promoted it to a dispatch-ready
[engine brief 19](briefs/engine/done/19-audio-subsystem.md). **Design (approved):** audio is a new
generic engine subsystem `@engine/core/audio` (Web Audio `AudioEngine`: register/`play` one-shots →
per-voice gain → master gain, `volume`/`muted`, voice cap, `unlock()` gesture-resume, injected
`AudioContextLike` factory for headless tests), consumed only by the **client** packages — **strictly
off the deterministic sim path** (same layer as particles/toasts; no `sim-core` touched, determinism
must stay byte-identical). Engine stays game-agnostic; each game owns its event→sound map. **v1 test
sounds are PROCEDURAL** (runtime oscillator blips/chimes/alarms) so **zero binary audio assets** are
committed (the buffer/file API is built for future real assets but not wired to a `.wav`). **Plan:**
3 chunks under plan-split-dispatch — A (senior/opus): the engine subsystem + subpath export
(`package.json` `exports`) + `FakeAudioContext` unit tests; then in parallel B (junior/Sonnet): Farm
wiring off the existing `JuiceLayer` new-events cursor in
[juice.ts](../games/farm/client/src/main/juice.ts), and C (junior/Sonnet): Citadel wiring off the
existing `newEventsSince`→`toasts.push` loop keyed by `toneOf`, each with 2-3 sounds + gesture-unlock
+ mute. Gates: all-workspace typecheck/test, Farm `CHECK_DETERMINISM` + Citadel determinism
byte-identical, `/code-review`, a real-browser audio sign-off owed at closeout. **User deferred
execution to a later session** — no code written; corpus-only. index.md engine catalog updated.

## [2026-07-08] fix | Citadel toast stack overlapped the HUD speed/pause buttons

The top-centre event-toast stack in [main.ts](../games/citadel/client/src/main.ts) was anchored at a hardcoded `y=48` with a comment claiming the in-canvas HUD bar is "~36px tall". It isn't: the HUD [resource-hud.ts](../games/citadel/client/src/ui/resource-hud.ts) is a single left-anchored row whose `controls` box (pause + 1×/2×/4× buttons) is the tallest child — button 21px (9px glyph line + 6+6 pad) inside a 6px-padded box inside the 6px-padded root panel ⇒ **~45px** tall (spans y=8→53). So `y=48` put toasts *inside* the HUD's vertical band, and because the HUD row's right-end controls reach toward screen-centre on wide windows — the same band a horizontally-centred toast sits in — the speed/pause buttons visibly overlapped incoming toasts. Fix: anchor the stack below the HUD's **measured** bottom (`hud.root.rect.y + hud.root.rect.height + 8`, the HUD is laid out earlier in the same frame; falls back to a constant pre-boot) instead of a magic number — mirrors how the build-bar already reads `buildBar.root.rect.height`. Render-only; @citadel/client typecheck clean + toast tests green.

## [2026-07-08] feat | Brief 104 (partial) — Citadel villager/raider corner-cutting (render-only)

Fixed the "npcs move unnatural on the road" report by landing brief 104's item 3 (diagonal corner-cutting). Root cause: Citadel sim paths are 4-connected ([pathfinder.ts](../games/citadel/sim-core/src/world/pathfinder.ts) N/E/S/W only), so a diagonal walk arrives as a staircase (E,S,E,S,…); the render-side [EntityInterpolator](../games/citadel/client/src/render/entity-interp.ts) linearly lerped `prev→cur`, turning each corner into a sharp 90° flick — the zig-zag the player saw. Fix is **render-only, zero sim/determinism impact**: the interpolator now keeps one extra history tile (`prevPrev`) and drives the current segment with a cubic **Hermite/Catmull-Rom** spline whose start tangent leans on `prevPrev`, so units round corners instead of snapping. Stays **exactly linear** on a straight run (collinear points ⇒ chord tangents), and corner-curving is gated behind `histValid` (the preceding segment was a real, non-snap walked step) so nothing bends off a stale tile after a teleport/respawn or on the first step out of rest — all existing snap/teleport/fresh-id rules preserved. End tangent is clamped to the segment direction (we render one snapshot behind, so the NEXT tile is unknown). Applies to both villagers and raiders (shared interpolator). Items 1 (walk-gait, `gaitOffset`) and the lean/squash heading were already shipped; **items 2 (explicit L/R facing flip) and 4 (ambient-crowd cadence parity) remain open**, and the brief's live playtest-citadel sign-off is still owed (this session was code-only, no browser). Tests: 3 new interp cases (straight-run-stays-linear, staircase-corner-rounds, post-teleport-stays-linear); @citadel/client **423/423 green**, client typecheck clean. Commit pending.

## [2026-07-03] todo | Backlog promotion — 12 new briefs (game 98–109 + engine 18) from the opportunity scan

Second half of the review pass: an opportunity scan (open todos re-read, status.md pending flags, in-code margin notes, infrastructure gaps) turned the entire remaining backlog into briefs, per the user's direction ("everything as briefs"; CI explicitly declined). **New game briefs:** 98 (market-wall wire-or-remove decision — findings item 7), 99 (P2 debt batch — findings 28–34), 100 (economy-growth pass — promotes the two-way-economy todo's deferred upside scopes #1/#3, folds the immigration overlap), 101 (Farm perishability + distance pricing — promotes its todo, adds an execution skeleton; still flagged needs-a-focused-session), 102 (disease counterplay — playtest P3, the last untouched finding), 103 (Challenge mode — unfreeze the sharp systems as an opt-in ruleset; depends on 97), 104 (movement feel polish — promotes the natural-feel todo's deferred gait/facing/corner-cutting), 105 (ambient-crowd honesty + MP villager owner-filter — promotes the entity-count todo's deferred halves), 106 (DOM→canvas residuals — siege/hazard readouts, the real remainder after the review found settings/minimap already migrated), 107 (Farm visual verification session — clears the status.md "⚠️ Pending" eyeball debt + brief-85 feel-check + Phase-A warm-glow; after 97), 108 (live-MP verification — citadel-38 P1#6/#7/#9 + windowed-bake GPU items 21/22 + findings item 35; after 97), 109 (Citadel VPS deploy — solo static + MP server via pm2/Caddy-WS, additive next to Farm's brief-88 setup). **New engine brief:** 18 (authored typography + icon glyphs for `@engine/ui` — promotes its todo). Promoted todos carry ➡️ banners pointing at their briefs; every 2026-07-02 review finding is now scheduled (97/98/99/108); index.md brief catalog rewritten (game 01–109, engine todo no longer empty). Corpus-only; no code changed.

## [2026-07-02] todo | Brief 97 — review fix wave (plan approved, execution deferred)

Promoted the review findings into an execution brief: [briefs/game/done/97-review-fix-wave.md](briefs/game/done/97-review-fix-wave.md). Carries the in-session-approved `plan-split-dispatch` plan — 10 chunks (3 senior: farm inbox clearing / citadel ghost workers / citadel MP pause-speed authority; 7 junior) in 3 dependency waves with file lanes, per-chunk acceptance + red-before-fix tests, and gates (typecheck/tests per wave; Farm CHECK_DETERMINISM ×3 + Citadel determinism ×3; chunk 3 additionally proven behavior-preserving via multi-seed EXPORT=json diff; chunks 2/9 move the Farm baseline by design; UI chunks need a real-browser pass). Scope = findings items 1–6, 8–27, 36–40; item 7 (market-wall loop) still needs its own wire-or-remove design brief; items 28–35 (P2 debt) remain in the findings doc unscheduled. index.md brief catalog updated (01–97). No code changed.

## [2026-07-02] review | Full-repo code + corpus review — 40 findings filed (no code changed)

Six parallel read-only review passes (engine core, farm sim-core, farm client+server, citadel sim-core, citadel client, corpus lint); all headline findings spot-verified against source by the controller before filing. Full triage doc: [todos/2026-07-02-full-repo-review-findings.md](todos/2026-07-02-full-repo-review-findings.md). Headlines — **@farm/server**: unclamped `speed` multiplier is a one-message process-freeze DoS; repeated `init` on one socket leaks permanently-ticking SimHosts (detach stops at the first matching run); unvalidated `tickRateHz`; unguarded `void start()`. **Farm sim**: the market-wall trade loop is dead end-to-end (`marketOffers` belief written only by tests, BUY_REQUEST never consumed, sell-from-wall has no ActSystem case); `handleSellShopkeeper` missing the village gate its siblings have; the crop-quality `growthDays` formula self-cancels (season/skill growth multipliers are inert); carpenter wood non-refund on failed delivery; non-farmer broadcast inboxes never cleared (unbounded growth). **Citadel**: ghost-worker leak — nothing releases villagers when their workplace burns/suppresses/demolishes (fire writes `workerCount=0` ungated by cozy; immigration then over-spawns); MP pause/speed is optimistic client state with no authoritative snapshot resync (also breaks post-load-save interpolation). **Client/render**: Farm juice (shake/hitstop/popups) goes permanently dead once the 30-entry event window plateaus (length-diff bug); double `getInterpolatedSprites()` per frame halves hitstop; anchor-point viewport cull pops ≥64px sprites; per-frame `createBindGroup` in three WebGPU passes. **Agents**: kind-blind resource-zone gate can lock 3 personalities out of wood/stone; aggressive endgame branch skips the priority sort + bean resale + sleep. **Corpus**: decisions.md still claims Canvas2D-not-WebGPU (formally revisited, never updated); status.md phase-state reading order + "still DOM" claims stale; ~190 stale `packages/*` links across wiki; 2 fully-shipped BUILD-ORDER todos still open. Corpus-only commit; no code touched.

## [2026-07-02] lint | Corpus reconcile — art-08..12 wiki fold-in + stale-entry prune

Health-check pass after the art-08..12 closeout. **Verified** every code claim in the closeout entry against `iso-draw.ts`: `composite`/`Layer`/`cubeBase`/`drawRoundDrum`/`drawGableRoof`/`drawFlatCrenellatedTop`/`wellForm`/`postMill` all present as described; `cubeBase` is honestly flat-topped (dead left-face slope term removed, per the review cleanup); `ISO_ART_SCALE = 2` unchanged; **@citadel/client 420/420 green** (matches the logged count). Status.md + log.md already carried the closeout — no drift there. **Folded in** the durable art-12 finding the event logs recorded but the reference layer lacked: a new *Layered composites (art-12)* section in [citadel-art-style.md](wiki/citadel-art-style.md) documenting the `composite([...Layer])` bake-time path + the structural/detail `Layer` module vocabulary (`wallsLayer`/`gableRoofLayer`/`shutteredWindow`/`stoneCoursing`/…) and the per-piece-density "higher res without a global scale bump" rule, + a checklist line ("reach for `composite` before hand-drawing") + the index one-liner. **Pruned** a fully-RESOLVED entry (AI-fishing / brief 80) from [open-questions.md](wiki/open-questions.md) — it violated that page's "resolved items are deleted from here" rule and carried stale pre-reorg `packages/sim-core/…` paths. No code change; corpus-only.

## [2026-07-02] maintenance | Corpus compaction — log.md collapsed 2556→649 lines + Farm foundation briefs 01–10 merged

The corpus had grown long; compacted per the established era-summary convention. **log.md 2556 → 649 lines:** collapsed every full-prose entry from **2026-06-19 → 2026-06-30** (≈75 entries — the cozy-pivot design rounds 1–7, Phases A–I, the all-GUI-in-canvas `@engine/ui` build, the 06-27 playtest fixes, the 06-26 gameplay-depth/iso-grounding waves, and the 06-19..22 true-iso render foundation) into **one dated `## [2026-06-30] era` summary** with a "Load-bearing facts (do not re-derive)" subsection (sprite CENTRE-anchor rule, flat-terrain-bake, real-GPU-only + Playwright-Chromium-can't-WebGPU, determinism discipline, playtest-driver caveats). Only 2026-07-01 onward stays full prose; git holds the trimmed text. Updated the header compaction note. **Briefs: merged Farm foundation 01–10** (`01-personalities`…`10-trust-and-endgame`, 10 tiny 14–20-line files, era-collapsed + linked by nothing but one inter-brief ref) into a single verbatim rollup [briefs/game/done/01-10-farm-foundation.md](briefs/game/done/01-10-farm-foundation.md) (H1→H2 per brief; brief-08→06 ref rewired to an in-file anchor) — game/done file count 59→50. Left the wiki-linked briefs (49/50-54/59/66-72/75/84/90-93/95) + all engine briefs standalone (each is linked from index.md/status.md — merging would churn those links for no context win). Also fixed 11 stale `todos/…`→`todos/closed/…` links (fallout from the prior audit's todo moves) in log.md + status.md and corrected a stale status.md claim ("only open Citadel todo: true-isometric" → it's done). Every link in the touched files resolves; the ~191 remaining archive-wide broken links (BUILD-ORDER index docs pointing at pre-`closed/` sibling paths) are a pre-existing condition, out of scope here. Corpus-only; no code touched.

## [2026-07-02] lint | Corpus structure audit — misfiled todos + a stragglling obsolete brief reconciled

Directory-hygiene pass against the corpus-flow layout. **Findings + fixes:** (1) eight completed/reference todos were sitting in the OPEN `todos/` dir — moved to `todos/closed/`: four already `status: done` (citadel-true-isometric, catchment-coverage-overlay, minimap-rotate, phaseEF-playtest), the three art-01/02/03 todos (were still `status: todo` but the whole art wave shipped/PASSed — flipped to `done`+`resolved: 2026-07-02` first), and the iso-pixel-art-quality **research survey** (relabelled `todo`→`reference`, a consumed source doc not a task). (2) `farm-worldgen-property-tests-failing` (`open`) **no longer reproduces** — re-ran all three named suites (28/28 pass) with no source commits since it was filed → closed as not-reproducing (flakiness), moved to `closed/`. (3) Brief **94** (upscale-units-terrain) was flagged "likely OBSOLETE" in its own header yet still lived in `briefs/game/todo/` — moved to `briefs/game/superseded/` with a supersede note + fixed its intra-link to brief 95 (`../done/`). (4) [index.md](index.md) claimed "both `todo/` dirs empty as of 2026-06-13" and "briefs 01–89" — corrected: game briefs run 01–96, `game/todo/` holds the one standing reference brief (96), engine `todo/` empty. **Left deliberately open** (correctly labelled): the three `partial` Citadel todos (two-way-economy/entity-count/entity-movement — main win shipped, remainder tracked), `farm-perishability` (`open`, intentionally deferred), `engine-ui-authored-typography` (`todo`, genuinely unstarted feature), and all `reference`/`ready` planning + BUILD-ORDER docs. No code touched; corpus-only.

## [2026-07-02] done | Citadel art-08..12 — fidelity fixes (windmill, roofs, well, market) + layered-composite detail uplift

Shipped the full art-08..12 wave via `plan-split-dispatch` (controller opus; 4 executor chunks on Sonnet 5, 1 senior chunk (art-12) on opus; 2 Sonnet review finders). Dependency order held: Wave 1 (shared FORMs) → Wave 2 → Wave 3 (art-12, needs the corrected FORMs). **art-11** (real bug): `drawGableRoof` + `drawFlatCrenellatedTop` shaded on two fighting axes so front-left was brightest under the upper-left sun — reordered the `(lit,onFar)` facet values so **back-left is brightest** (ranking back-left → {front-left, back-right} → front-right); ridge kiss moved to the sunward crest; `drawLeanToRoof`/`drawHippedRoof` verified already-correct; new `roof.test.ts` "roof light points up-left" invariant (brightest band mean above-and-left of darkest) guards against re-inversion. **art-08**: `postMill` cone → **square plinth (`cubeBase`) + round drum + bold sails + cap**; `drawRoundDrum` generalised with optional `opts` whose defaults reproduce the fort tower exactly (fort call unchanged). **art-09**: `wellForm` was a round offset cylinder → **centred square iso-box kerb** via the shared `cubeBase`; `recipes.test.ts` centroid-centering assertion (the perceived offset was really the intentional SE contact shadow — the recipe mass was already centred). **art-10**: `marketStalls` moved from plot CENTRE to the near-left/near-right **rim, open centre**, back-to-front sort. **art-12** (the headline, opus): a first-class **`composite([...Layer])`** bake-time authoring path (painter-ordered sub-recipes → one atlas frame, `begin()` once so the contact shadow is preserved) — **`boxBuilding` + `warehouse` rebuilt from reusable `Layer` modules** (wallsLayer/gableRoofLayer/hippedRoofLayer/doorLayer/barnDoorsLayer/accentLayer); detail modules **shutteredWindow** (muntins+sill+shutters), **stoneCoursing** (ashlar + quoin cornerstones), chimneyStack, groundApron. Resolution via **per-piece local density, NOT a global `ISO_ART_SCALE` bump** — the atlas is already at the 256×4096 pow2 height ceiling, so a 2→3 bump would force 8192; local density adds detail at **zero atlas cost** (measured: 256×4096 before → **256×4096 after**, 72 frames). **Review:** 2 scoped finders (composite-correctness + art-08..11/reuse) found **0 runtime bugs**; the one CONFIRMED finding (`cubeBase`'s left-face slope term was dead code — `Math.max(topY, topY+edgeSpan-diaH/2)` always resolved to `topY`) + its coupled latent trap (`wellForm` fed `cubeBase` a `kerbM` breaking the `diaH===halfW` invariant, inert only because the slope term was dead) were both fixed by a **no-op cleanup** (removed the dead term + the stale `diaH` read → the plinth/kerb band is honestly flat-topped). Gates: **@citadel/client 420/420, palette guard 6/6, typecheck clean**, EDG32 + determinism preserved (recipes pure, no RNG/clock, no raw color literals). **Browser-verified** via the `?showcase` capture harness (windmill reads base+drum+sails not a cone; roofs consistently lit up-left; well centred + square; market an edged square with open centre; the rebuilt composite buildings render correctly with visible coursing/quoins/shuttered windows and no layer-order regression). Committed on `main` (local, not pushed): art-08..11 code `4091180`, art-12 code `ff05ebe`, + this corpus closeout. Todos moved to `todos/closed/`.

## [2026-07-02] todo | Citadel art-08..12 — targeted fidelity fixes (briefs only, from a showcase review)

Five brief-only todos from reviewing the art-06 showcase captures. **art-08**: the windmill reads as a cone (`postMill` is one tapering cylinder) — refactor to a cubic iso BASE with a round drum rising from it + bold sails, using the cube-then-cylinder iso construction. **art-09**: the well sprite is offset off its 1×1 tile (anchoring bug) and the kerb is round — centre it + make the kerb a small rectangular iso box. **art-10**: market stalls cluster at the plot CENTRE (`stall(cx ± halfW*0.34)`) — move them to the plot EDGES, centre open, like a real market square. **art-11**: a real shading bug — `drawGableRoof` shades on two fighting axes (`x<cx` side AND `onFar` slope), making front-left the brightest facet when the upper-left sun should light back-left, so roofs read reversed/tipped; fix the facet value order to agree with the committed sun + add a "roof light points up-left" regression invariant (also check drawLeanToRoof / drawHippedRoof). **art-12**: detail/realism uplift + the user's layered-composite idea — formalise BAKE-time composition of small sub-recipes (base+roof+trim+props modules, reusable) into one atlas frame, and raise effective resolution (bump ISO_ART_SCALE 2→3/4 or per-piece local density) with concrete detail wins (shingles, muntins, coursing, ground apron), watching the atlas budget; guardrails (EDG32, determinism, pow2 atlas) non-negotiable. Grounded in a web-technique pass (SLYNYRD 41/54, Pixel Parmesan, modular-iso tutorial). Dependency order: art-08 + art-11 fix the shared FORMs first, then art-12 raises density on top. Linked from the research survey; no implementation yet.

## [2026-07-02] done | Citadel art-04..07 — silhouette de-samification, unit roles, showcase harness, fire FX

Shipped the wave-2 art briefs and graded the set **PASS** against the [asset-critique rubric](wiki/citadel-asset-critique.md). **art-06** (landed first): a DEV-only `?showcase` mode rendering every asset spaced on the iso grid via the real renderer, with isometry/all-burning/day-phase toggles + a headless AABB-non-overlap test + a capture script — the visual acceptance harness the others are graded against. **art-04**: pushed building identity into the SILHOUETTE — new/varied iso-draw FORMs (fort family: round-drum tower, gatehouse garrison, corner-turret keep, timber-lookout watchpost; cottage family: oven-bulge bakery, lean-to smith/woodcutter/sawmill, jettied healer; open-pit quarry, headframe mine, canopy tradingpost, civic town-hall) gated by a `silhouette.test.ts` (pairwise mask distance @ GRID=48 + ≥3-value depth + base≥apex isometry). **art-05**: villager role-accessory silhouettes (hat/hoe/axe/hammer/robe/spear/pack) over the preserved grey multiply-tint ramp, gated by `unit-silhouette.test.ts`. **art-07**: real cozy fire — `fx/flame` frames + `CitadelFire` ember/fire-smoke emitter + warm flickering ground-glow (`fireGlowQuads`), composing over the existing soot/orange cues, gated by `fire.test.ts`. Baseline was FAIL (A1/A2 silhouette-collapse + F1 fire-is-just-orange-tint); final PASS with the two blockers cleared and every headline item green. 418/418 tests, palette guard green, browser-verified via the showcase captures. Minor polish ⚠️ logged (keep/garrison still a touch boxy at far zoom; showcase crops the villager row). Committed on branch `citadel-art-wave` (engine + citadel + corpus as separate commits); art-01/02/03 from the prior session committed alongside. Not pushed/PR'd.

## [2026-07-02] todo | Citadel art-04..07 — building/unit personality, asset showcase, fire FX (briefs only)

Research + four new BRIEF-ONLY todos for the next Citadel art wave, from a code-grounded audit of the recipe layer. Root cause of "buildings look similar and flat": **form-family collapse** — `cottage()` is reused for 6 types (house/bakery/woodcutter/sawmill/smith/healer, distinguished only by an `IsoPalette` swap + one non-silhouette accent), `warehouse()` for 3, `fort()` for 4, `boxBuilding()` for 2, all one roof pitch; units are ONE villager body re-tinted per job. Fire is only an orange multiply-tint + soot wash + grey smoke — no actual flame/ember/glow. New briefs: **art-04** (push building identity into the SILHOUETTE — new/varied iso-draw FORMs, roof-pitch/ridge params, silhouette test = pairwise mask distance + ≥3-value depth test + base≥ridge isometry invariant), **art-05** (unit role-accessory silhouettes over the preserved grey multiply-tint ramp + raider/crowd variants), **art-06** (a DEV-only all-assets SHOWCASE page in the real client: every sprite spaced so pixels don't overlap, diamond+ruler isometry overlay, all-burning + day-phase toggles, AABB-non-overlap headless test + screenshot capture — the visual acceptance harness for the others; reasonable to land first), **art-07** (real fire: cozy EDG flame frames + ember particles + fire-tinted smoke + warm flickering ground-glow, ramped by `burningSince`). Also added top-level [`inspirations/`](../inspirations/CREDITS.md) — a credited CC0 reference manifest (SLYNYRD 41/54, Pixel Parmesan, Screaming Brain CC0 town pack, OpenGameArt CC0, Kenney, Book of Shaders) + a `fetch.mjs` + a `.gitignore` that keeps downloaded binaries local (reference-only stays true to the "assets are code / palette-guarded / no import path" decision). No implementation yet — spec + acceptance only, per request.

## [2026-07-02] done | Citadel art-03 P2 — fBm cloud-shadow wired + warm-haze mode + vignette param

Wired the existing engine `CloudShadowPass` into Citadel and extended it (generically) with a warm-haze mode + an optional vignette. Engine change stays generic (Farm unregressed): `CloudOptions` gained optional `mode: "shadow"|"haze"` + `vignette` (packed into the two spare uniform floats — no size change), `cloud.wgsl` gained a `mix()`-selected haze branch (broader thresholds, ≤0.12 alpha) + an NDC-space quantized vignette, and `RendererLike.setCloudOptions?` is now a documented optional seam. Citadel: `cloudOptionsFor(season, day, dayFraction, timeSec)` in `citadel-renderer.ts` (pure; coverage from the season→weather cadence, cool `slate` shadows / warm `cream` dawn haze), called before `endFrame` in `main.ts` behind a new `clouds` render toggle. Typecheck adds no new errors beyond the known pre-existing WebGPU-ambient set; `@citadel/client` 397/397 green, `@engine/core` render tests 79/79 green (the lone failure is the unrelated `wasm/pathfinder.test.ts`). Browser verification still owed (playtest-citadel). shader-ideas.md ticked (wash + cloud + mist).

## [2026-07-01] done | Farm Valley — ALL UI rendered in-canvas via @engine/ui + interaction reinvented

Closed [the farm-ui-all-in-canvas todo](todos/closed/2026-07-01-farm-ui-all-rendered-in-canvas.md)
(`status: done`) — the cross-game payoff of Citadel's `@engine/ui` investment, proving Farm Valley
adopts the same framework. **The port (phases 1–2):** all ~16 DOM surfaces (hotbar, inventory,
tooltip, world-clock, observer/farmer-list, leaderboard, playback+help, slate, event-feed,
right-column, relationship-matrix, wealth-graph) **plus** the home/loading/game-over screens now
render in-canvas as retained `@engine/ui` trees, driven from ONE `UISurface` in `render-loop.ts`
(Citadel's per-frame `begin → per-root refresh/computeLayout/mirror/renderTree → end` pattern). The
panel modules under `games/farm/client/src/ui/canvas/*` already existed on the branch (with tests);
the missing piece was the top-level wiring — `main.ts` (canvas home/loading screens run through the
shared UI host *before* the sim exists; `buildPanels(app, host, canvas, actions)`), `render-loop.ts`
(panel `refresh()`/`drawIcons`/`drawGhost` + wheel routing, replacing the old DOM `.update()` calls),
and `main/playback.ts` (new `PlaybackActions` contract). Only the seed `<input>` (native text entry)
and visually-hidden `.ui-a11y` mirrors remain in the DOM; no visible DOM UI overlays. Deleted the
superseded DOM `main/game-over.ts`; the other old `ui/*` DOM files are a self-contained dead subgraph
(kept for now, tests still green — prunable follow-up). **The reinvention (phase 3):** (1)
**world-anchored inspect card** — while a farmer is followed, a live detail card floats above them and
tracks their world position via a new `worldToCanvasCss` (inverse of `screenToWorld`, Farm's analogue
of Citadel's `tileToCanvasCss`); (2) **drag-from-world hotbar** — the always-visible belt rearranges
by drag, reusing the owner-gated `swap-slots` message (capture-phase, movement-threshold so a plain
click still tool-uses the world); (3) **diegetic HUD** — a notice-board (events) + standings post
(day/time + top-3) anchored over the world structures the sim already spawns
(`structure/notice-board` @ `NOTICE_BOARD_TILE`, auction podium @ `AUCTION_PODIUM_TILE`), summonable
to screen-centre with **J** (todo decision #7's "hybrid diegetic + summon"). World geometry is seeded
from the fixed `WORLD_GEN_SEED` (the run seed drives AI/economy, not layout), so client + server agree
on the anchor tiles. **Client render/input only — no sim/protocol change; determinism byte-identical**
(same-seed `EXPORT=json` diff MATCH), so no headless re-verify was needed beyond that. Commits
`6ee527a` (port), `112304d` (inspect + drag hotbar), `9dcedb6` (diegetic HUD). Gates: `@farm/client`
typecheck clean; 295 client + 133 `@engine/ui` tests green; palette guard green; real-browser
Playwright smoke passes for the port and all three reinventions (panels render in-canvas, bitmap text
legible, keyboard routes to UI, seed input works, no DOM panel overlays, inspect card tracks a farmer,
diegetic panels render world-anchored + J-summon). See
[wiki/player-and-interaction.md](wiki/player-and-interaction.md) → *In-canvas UI*.

## [2026-07-01] research | Citadel — cozy iso pixel-art quality (research + style bible + phased briefs)

Studied isometric pixel-art craft (SLYNYRD 41/54, Pixel Parmesan, Screaming Brain, Pixnote), The Book of
Shaders (color/noise/cellular/fBm), and CC0 asset packs — filtered against Citadel's actual renderer.
Findings: Citadel is **already** true-iso (2:1, 32×16, correct projection + `x+y` painter's depth, per
[brief 21](todos/closed/2026-06-21-citadel-true-isometric.md)) with procedural EDG32 recipes + baked contact
shadows — so this is a **fidelity + art-direction** task, not an iso conversion. Grilled the user to lock
4 decisions: **(1) go 2× outright** (`ISO_ART_SCALE=2`, re-open the 4×-reverted call from
[brief 95](briefs/game/done/95-citadel-building-restyle-reference-look.md) at the middle ground; 4× stays a
future knob), **(2) cozy medieval storybook** art direction (warm bias, golden hour, soft shadows, lived-in),
**(3) both** shader tracks (refine wash/light/weather overlays + light up a reusable fBm overlay), **(4)**
focused-quality tone but full-overhaul coverage (buildings, units, roads, terrain, atmosphere, animation).
**Refinement pass (2026-07-01):** mined the sources for max concrete value — found the fBm overlay
**already exists** (engine `CloudShadowPass` / `cloud.wgsl`, 3-octave, `step()`-quantized, EDG-uniform,
wired via `setCloudOptions`) but Citadel never enables it, so art-03 became wire-up + a warm fog variant
(not a from-scratch pass); ported the canonical `hash21`/`valueNoise`/`fbm3` recipe + concrete boundary-
dither idiom + per-surface hue-swap table into art-02. Key mechanic: `ISO_ART_SCALE` is a single global constant — flipped once (gates the
per-category polish), not per-category. Decision: **don't commit external PNGs** (assets are code +
palette-guarded); packs are reference-only.

**Split into 3 artefacts** (one-concept-per-file): durable [cozy iso art style bible](wiki/citadel-art-style.md)
(wiki), the [research + decisions survey](todos/closed/2026-07-01-citadel-iso-pixel-art-quality-research.md) (todo),
and phased implementation todos — [Phase A/B0 (style + 2× flip gate)](todos/closed/2026-07-01-citadel-art-01-scale-flip-and-palette.md),
[buildings/units/terrain/roads fidelity](todos/closed/2026-07-01-citadel-art-02-recipe-fidelity-pass.md),
and [atmosphere + fBm overlay](todos/closed/2026-07-01-citadel-art-03-atmosphere-and-fbm-overlay.md).

## [2026-07-01] done | Citadel — P2 playtest placement half: seed-aware plan (Phase F verified live)

Closed the remaining open half of [the E/F playtest todo](todos/closed/2026-07-01-citadel-phaseEF-playtest.md)
(now `status: done`). `play.mjs`'s plan is now **seed-aware**: it seeds the occupancy set from
`__citadel.buildings()` **including the seeded road spine** (the load-bearing fix — the first attempt
excluded roads, so a building planned onto a spine tile removed it, severed the seeded core's
connectivity, and starved the town to pop 0), anchors on the seeded house, and places
chapel/market/watchpost via a new coverage-aware ring placer (`addNear`) that guarantees each
service's footprint centre lands within `SERVICE_RADII`=8 (center-to-center Manhattan — the exact
needs-happiness test) of the anchor, clear of the seeded box. Live result (seed `0x1a2b3c4d`,
200s@4×, reloads:0): `services-in-radius {chapel,market,watchpost}` all true, and **`allHomesCovered`
holds true for all 49/49 timeline ticks with happy 91–99** — vs `covered:false`/`happy~35` before the
fix. So Phase F is now placement-verified live (a prospering town is reliably reachable); only the
sub-second `false→true` banner edge isn't harness-observable (coverage is reached during the headless
boot before the first 4s sample — a sampling race, surfaced honestly by a new `coveredFromBoot`
outcome field; the edge + seeded-silent behavior are unit-tested in main.ts's latch). Driver-only
change (`.claude/skills/playtest-citadel/play.mjs`) — no sim/client code touched, determinism N/A.

## [2026-07-01] done | Citadel cozy-pivot — P1 toast copy re-worded + P2 playtest instrumentation

Closed out the two follow-ups filed in [the E/F playtest todo](todos/closed/2026-07-01-citadel-phaseEF-playtest.md).
**P1 (shipped):** cozy-path threat toast COPY now branches on the same `cozy` flag the mechanics
already use — fire reads "a hearth is smouldering — a well nearby would settle it" (not "caught
fire!"), disease "under the weather" / "back on its feet" (not "outbreak"), a hungry departure "a
villager left to find food — the larder is bare" (not "starved (pop 0)"). `ImmigrationSystem` gained
a `cozy` constructor opt (wired from `sim-bootstrap.ts` like Fire/Disease). The **sharp** strings are
kept verbatim under `cozyThreats:false` so the Challenge-mode regression guards (`defer-threats`
`THREAT_RE`, `phase45`) still match; a new copy-contract block in `cozy-threats.test.ts` pins the fire
split both ways. Determinism: reproducible + **no numeric drift** — per-day summaries byte-identical vs
the pre-P1 baseline, only the event copy differs (the intended change). **P2 (split):** the
*instrumentation* half is done — `window.__citadel.snapshot()` exposes the live `RenderSnapshot`, and
`play.mjs` now reads game state from it (`timeline[].src==="snapshot"`, so `happy/pop/covered` are live
not stale-DOM-null) and tracks the `allHomesCovered` false→true edge (`outcome.allHomesCoveredEver` /
`allHomesCoveredEdgeAtSecs`). The *placement* half stays open: a live 200s@4× run confirmed the banner
never fires (`allHomesCoveredEver:false`) because the plan can't land services on the seeded map —
root-caused to the plan anchoring on the pre-seeded 12×6 core box with an empty occupancy set (fix:
make the plan seed-aware, in the todo's acceptance). Gates green: sim-core 226/226, client 397/397,
Citadel typecheck clean; playtest reloads:0, only a benign 404; town stable & fed to Day 239.
Note: repo-wide `npm run typecheck` has a **pre-existing** unrelated failure in `@tool/world-preview`
(WebGPU `GPUBufferUsage`/`.wgsl?raw` type resolution) — not touched by this work.

## [2026-07-01] todo | Farm Valley — render ALL UI in-canvas via @engine/ui + reinvent interaction

Filed [todo](todos/closed/2026-07-01-farm-ui-all-rendered-in-canvas.md) after a grilling round.
The intended cross-game payoff of Citadel's `@engine/ui` (whose acceptance criterion was
literally "Farm Valley *can* adopt it"). Grounding: Farm's client already renders through
the same dual-backend `RendererLike` (WebGPU + Canvas2D) and that interface already exposes
`beginUI/pushUI/endUI` — Farm just never calls them (all ~16 surfaces are raw DOM). So the
work is **adopt + port + reinvent**, not build-from-scratch. Locked decisions: full one-pass
port; pragmatic hybrid (hidden DOM only for seed text-input + a11y mirror); 5×7 bitmap font
everywhere (icon dependency on the [authored-typography todo](todos/closed/2026-06-30-engine-ui-authored-typography-and-icons.md),
mitigated by drawing Farm's existing atlas sprites via `UISurface.sprite`); radial dropped;
reinvent both player + observer surfaces; observer data = diegetic + summon; **client-render-only**
(reuse `swap-slots` + Pip input, no new sim/protocol → determinism untouched); port the a11y
mirror. New interactions: world-anchored panels, diegetic HUD (+summon), drag-from-world
hotbar. Done bar adds a real-browser smoke pass. → handed to plan-split-dispatch.

## [2026-07-01] todo | Citadel playtest — Phase E (live-verified) + Phase F (mechanism verified) + A–I cozy-visual eyeball + toast-copy UX finding

Ran `playtest-citadel` over the uncommitted E/F tree (default `play.mjs` plan SECONDS=200
+ a focused `ef-probe.mjs`, seed 0x1a2b3c4d, `reloads:0`). **Phase E confirmed live in a
real browser:** per-villager `mood` tracked home-house mood tick-for-tick (68→64→63 in
lockstep) — the sim→snapshot→renderer pipeline carries the signal. **Phase F mechanism
verified but banner not flipped in-run:** `allHomesCovered` correctly stayed false because
the scripted chapel was placed-but-not-road-connected (faith never met, mood capped ~63);
the inviting-gap pulse overlay renders. The A–I cozy result is real — a default-plan town
reached **Day 237 winter, Grain 1312, Happy 37, no fire/disease/threat**, self-recovering,
never reachable pre-pivot. Two findings filed
([todo](todos/closed/2026-07-01-citadel-phaseEF-playtest.md)): **P1 UX** — cozy-path threat toast
COPY ("caught fire!", "fire spread to a bakery!", "starved POP 0") reads pressure-game and
undercuts the cozy contract even though the MECHANICS are cozy-correct (`cozyThreats:true`
wired at sim-worker.ts:68; `cozy-threats.test.ts` proves fire never razes); **P2 tooling** —
`play.mjs` still can't read HUD (in-canvas) or drive road-connected services (so F's banner
edge isn't scriptable yet). E/F code + gates are green (sim-core 224, client 397, typecheck
clean, determinism MATCH ×3, digest unmoved); the F banner-edge acceptance is the one open
item, gated on a properly-serviced run, not on a code defect.

## [2026-07-01] shipped | Citadel cozy-pivot Phase I — terrain clustering + solvability guarantee

Implemented the [cozy-pivot build order](todos/closed/2026-06-28-citadel-cozy-pivot-BUILD-ORDER.md)
Phase I (decision #10 — *terrain IS the puzzle's difficulty knob: a guaranteed-solvable floor
with rich texture above it*). **The last structural pivot pass — with I done, the whole
structural pivot (A,B,C,D,G,H,I) has shipped.** Built via `plan-split-dispatch`: 2 senior
(opus) + 1 junior (Sonnet) chunks, 2 review finders (1 opus determinism-lens / 1 Sonnet
logic-lens), 1 opus fix agent.

**What shipped ([terrain.ts](../games/citadel/sim-core/src/world/terrain.ts)):**
- **Resource clustering.** The old per-tile forest/stone fbm-threshold *sprinkle* (findable on
  almost any tile → no spatial decision) is replaced by seeded **blob-centered patches** —
  groves + ore-veins painted from a handful of centers, with noisy edges but solid cores.
  Uses a dedicated `createRng(seed).fork("resource-clusters")` — a SEPARATE fork so the
  existing `terrain-gen` river+lake draw order is byte-for-byte untouched (river/lake verified
  byte-identical to pre-Phase-I across 6 seeds). The now-unused `baseNoise` layer was removed
  cleanly (each `SeededNoise` has its own stream, so removing one doesn't shift the others).
  Result: a handful of connected patches (~0 singletons) → woodcutter/quarry/mine placement is
  now a real "build toward the resource" decision, and resource-poor maps genuinely occur
  (giving the Phase-G trading post a real job).
- **Solvability guarantee.** A new pure `repairSolvability(cells, w, h)` runs at the end of
  `generateTerrain`: it guarantees (1) a **12×6 all-buildable core box near center** for the
  Phase-C cold open — carving one to Grass (Rough-first, then Water, to keep the river
  coherent) if none exists anywhere; and (2) **≥1 reachable Forest and ≥1 reachable Stone**
  from the core (4-connected flood-fill, Water/Rough as walls) — painting a small resource
  blob on the nearest reachable Grass if a type is missing or stranded behind water. No RNG,
  no Date — a pure, deterministic function of the grid. Across 100 seeds: 0 needed the
  core-carve, 3 needed forest repair, 10 needed stone repair; **100/100 solvable +
  same-seed-twice byte-identical** post-repair. Player is never handed an unsolvable map.

**Review + controller adjudication (recorded so the reasoning isn't lost):** both finders
independently flagged a **cross-module contract mismatch** — `repairSolvability` ring-scanned
the core box within `ceil(max(W,H)/4)` rings while the Phase-C cold open (`seedFoundingTown`
in sim-bootstrap.ts) scanned `max(W,H)` rings for the *same* box, so on a rare seed they could
anchor **different** boxes, and the tests mirrored the impl's `/4` constant rather than the
true cold-open contract. **Fix:** extracted ONE shared exported `findCoreBox` (+ `CORE_BOX_W/H`
constants + `coreBoxCenter`) that BOTH `terrain.ts` and `sim-bootstrap.ts` call — full-grid
scan, so the guarantee is a strict superset of what the cold open needs, and the carve targets
the center box (which `findCoreBox` then returns identically) → the two are now **provably
lockstep by construction**, and `seedFoundingTown`'s inline `seedClusterFits`+ring-loop is
gone (aliases the shared constants). A second (degenerate tiny-world only) finding was fixed:
the last-resort resource paint targeted the box *center* → now the box *corner*, keeping the
town center clear for the cold-open's storehouse/road spine. Determinism finder: **0 defects**
(river+lake stream provably undisturbed, all repair logic pure, DFS/BFS visit orders don't
affect the set-membership output).

**Gates:** sim-core **220/220** (terrain.test.ts grew 10→19: clustering >90%-connected
assertions, solvability across 50 seeds, repair determinism across 100 seeds), typecheck-clean
(@citadel/sim-core + @citadel/client), **determinism MATCH ×3** (0x1a2b3c4d / 0xc0ffee / 0x2a).
The grow scenario's scripted fixed-coordinate layout is unchanged (it samples only central
grass), so its economy baseline held at `pop 9/12, bread 10` — the terrain *generation* moved
(proven by the clustering/solvability tests + the byte-level water-identity check), which is
the intended re-baseline.

**Cozy-pivot status: A, B, C, D, G, H, I all done — the entire structural pivot has shipped.**
Only the *optional/later* phases remain: **E** (villager mood polish) and **F** (motivation:
emergent goals + diegetic recognition, no score/quests). Outstanding acceptance step: a
`playtest-citadel` in-browser eyeball of the cumulative cozy result (terrain clustering + the
A–H feel; WebGPU can't render headless here).

## [2026-07-01] shipped | Citadel cozy-pivot Phase H — economy under the downside rule (throttle-not-halt + single-slot)

Implemented the [cozy-pivot build order](todos/closed/2026-06-28-citadel-cozy-pivot-BUILD-ORDER.md)
Phase H (decision #9 — *nothing ever fully stops; every problem is a throttle toward a
~60–70% floor, always recoverable*). Grounding the plan in the *current* code showed most
of the brief's H text had **already shipped in Phases B & G**, so H reduced to a focused
**2-file change** (done inline, not dispatched — below the plan-split-dispatch threshold):

**What shipped:**
- **Throttle-not-halt** ([production.ts](../games/citadel/sim-core/src/systems/production.ts)).
  The stockpile-pressure hard `continue` (a building whose local outputBuffer was full went
  *dark*) became a new pure `bufferThrottleFactor(buffer, cap)`: **full rate below a 60%
  fill knee**, then a **linear ramp down to the 0.6 productivity floor** as the buffer
  fills — **never 0**. So a chronically unserved building *trickles at the floor* (goods
  backing up at its door) instead of shutting down. Two safety rails preserved: a
  *genuinely full* buffer still hard-skips the cycle **before** the timer + input draw (so
  no converter consumes input it can't ship — the "nothing wasted" invariant), and a final
  `Math.min(amount, cap-buffer)` clamp means the buffer can never overflow the cap the old
  guard guaranteed.
- **Single-slot producers** ([building.ts](../games/citadel/sim-core/src/entities/building.ts)).
  `farm / woodcutter / quarry / mine` → `workerSlots: 2 → 1` (mill/bakery/sawmill/smith were
  already 1). Growth is now purely spatial — no dead 2nd mouth; the freed worker staffs
  another building.

**Controller adjudication (recorded so the reasoning isn't lost):** the brief said "bump
farm `outputPerCycle` 3→6 to compensate for the lost slot." **CUT — the premise was wrong.**
Production is a per-building, per-cycle emit gated on `workerCount>0`; it **never scaled with
worker *count*** (production.ts only tests `workerCount<=0`). Dropping the dead 2nd slot
leaves daily throughput unchanged, so bumping to 6 would have **doubled** farm output. Kept
`outputPerCycle: 3`. Verified by grep before deciding.

**Already-done sub-items (verified, not re-touched):** winter grain floor
(`seasons.ts` winter `0.0→0.5`) shipped with Phase B; the decree purge from **both**
production *and* needs-happiness shipped with Phase G. The only residual `activeDecrees`
reads are in the **frozen** ImmigrationSystem (tithe/rationing) + SiegeResolutionSystem
(conscription) — dead paths behind systems not registered in the cozy solo core (their pass
is later).

**Gates:** sim-core **212/212** (was 211; +1 `bufferThrottleFactor` unit test, + the
uncollected-producer test re-pointed from halt→throttle), typecheck-clean
(@citadel/sim-core + @citadel/client). Pre-existing @tool/world-preview / engine WebGPU
typecheck errors are unrelated (reproduce on clean HEAD). **Determinism MATCH ×3** (seeds
0x1a2b3c4d / 0xc0ffee / 0x2a, 40d, grow — byte-identical same-seed-twice). **Baseline moved
by design** (grow scenario `pop 5/12, bread 8` → `pop 9/12, bread 10`, `gameOver=false`):
the town now **survives all 40 days incl. winter** (grain trickles, never floors to 0) and
**self-recovers** from starvation dips (day 26 starve → day 29 immigrant) — the downside
rule is now a property of the math.

**Phases A, B, C, D, G, H done; E, F, I open.** Next in the pivot spine: **I** (terrain
clustering + solvability guarantee) — the last structural pass that moves the determinism
baseline. Not yet eyeballed in a real browser (WebGPU headless limit) — H's economy feel
wants a `playtest-citadel` pass alongside the outstanding A–G eyeball.

## [2026-07-01] shipped | Citadel cozy-pivot Phase G — autonomy pass (civic buildings + player-driven trading post)

Implemented the [cozy-pivot build order](todos/closed/2026-06-28-citadel-cozy-pivot-BUILD-ORDER.md)
Phase G (decision #8 — the autonomy boundary): **the player sets placement +
economic intent; the town autonomously handles all behavior.** Built via
`plan-split-dispatch` (2 senior/opus + 4 junior/Sonnet chunks; 3 Sonnet+opus review
finders). **Determinism MATCH ×3** (seeds 0x1a2b3c4d / 0xc0ffee / 0x2a, 40d) — the
baseline moved by design (removing the `rng.fork("trader")` stream + the decree math),
reproducibility re-proved. Gates: sim-core **211/211**, client **387/387**,
typecheck-clean. New baseline (seed 0x1a2b3c4d, 40d grow): `pop 5/12, bread 8,
gameOver=false`.

**What shipped:**
- **Player-driven trading post (the sole economic-intent lever).** `TraderSystem` was
  an autonomous seeded caravan (`TRADER_INTERVAL_DAYS`, `rng.fork("trader")`, auto-barter
  offers); reframed to player-initiated: it now sets `traderPresent` = "owns a **staffed +
  connected** tradingpost" and rebuilds `traderOffers` (deterministic ≤3-offer menu, ranks
  goods by stock, plentiful→scarce at a fixed 5-for-3 rate, no RNG). The `barter` command
  became `trade` (`{offerIndex}`); the tithe-gated `RELIEF_BARTER_THRESHOLD` sweetener is
  retired. Client: the old DOM trader panel is gone; the tradingpost's **in-canvas
  InspectPanel** grows a tiny "Trade:" box (≤3 offer buttons, shown only when
  `traderPresent`). Removed `traderArrivalDay`/`traderDepartDay` from PlayerState.
- **`public-square` — net-new 2×2 civic building** (SERVICE_RADII 8, `workerSlots:0`,
  `BUILD_COST wood:8`). Sim: authored in BUILDING_DEFS/PRODUCTION_DEFS/SERVICE_RADII.
  Client: a `plaza()` iso sprite (open cobblestone diamond + dais + banner, EDG-only),
  a `Square` build-bar button (untiered, like other civic), a `festival`→`EDG.green`
  coverage ring, a building-info description. It **autonomously** lifts festival happiness
  (+15, spatial, folded into the ease TARGET) for homes in reach — replacing the
  `festival` **decree**.
- **Decree/policy lever fully purged from the cozy sim core.** Deleted the
  `logged("setDecree", …)` handler + `FESTIVAL_BREAD_COST`/`FESTIVAL_DAYS`/
  `CONSCRIPTION_THREAT_GATE`; deleted `_maintainDecrees` + the decree-penalty/stacking
  block + `festivalDaysLeft` (removed from PlayerState). Work-hours +30% decree →
  **automatic town-hall-coverage output lift (×1.2)** for producers in a town-hall's reach
  (production.ts). Conscription production-halt deleted. `activeDecrees` is **kept but
  always-empty** (two frozen/out-of-scope systems — `immigration` tithe/rationing,
  `siege-resolution` conscription — still read it; those get their pass later). Client
  decree checkboxes + `wireDecree` removed.
- **Territory + army frozen from the cozy/solo path (byte-identical, MP preserved).**
  `TerritorySystem` registration gated on the existing `enforceTerritory` (its output is
  read only by `canBuildAt`, itself gated on that flag → solo dropped a dead pass); new
  `enableArmy?` option (default true, round-trips save/load like `cozyThreats`) gates
  `ArmySystem`; the **solo worker passes `enableArmy:false`** (a no-op in solo → byte-
  identical). MP server unchanged; `army.test.ts` stays green unmodified (defaults true).

**Controller adjudications (recorded so the reasoning isn't lost):**
- A `cozy-threats.test.ts` disease test went red after the trader-RNG-fork removal shifted
  the seeded baseline (an 8→7 **morale-emigration** dip crossed a strict `>=`). Verified it
  was a baseline-shift casualty (not a regression, not pre-existing): the disease invariant
  ("never kills, recovers") still holds. **Re-pointed the test to its real invariant** —
  outbreak ends, `sickVillagers` returns to 0, and pop **recovers to ≥ pre-outbreak** — a
  stronger, faithful assertion, not a weakened one.
- Chunk "freeze territory/army" correctly escalated BLOCKED (gating a shared
  `bootstrapSim()` used by both solo AND MP is a public-API call); the controller made the
  design decision (gate on `enforceTerritory` + a new `enableArmy`) and re-dispatched.
- Review: 0 correctness/integration/determinism bugs across 3 scoped finders; 2 cleanup
  nits fixed inline (extracted a duplicated `manhattanDist` into `entities/building.ts`;
  commented the vestigial-but-retained `setDecree` command type) — re-verified byte-identical.

**Phases A, B, C, D, G done; E, F, H, I open.** Next in the pivot spine: **H** (economy
under the downside rule) then **I** (terrain clustering + solvability). Not yet eyeballed
in a real browser (WebGPU headless limitation) — the public-square placement + trade menu
+ autonomous festival/town-hall effects want a `playtest-citadel` pass.

## [2026-07-01] playtest | Citadel Phase C cold-open — VERIFIED live in a real browser

Ran `playtest-citadel` against the shipped Phase C. A focused `phaseC-verify.mjs`
probe (scratch, git-ignored; system Chrome + WebGPU, seed `0x1a2b3c4d`, NO driver
placements so the *seeded* town is what's observed) confirms the cold open works
end-to-end at both the data and visual layers:
- **Opening frame** (`00-opening.png`): camera centered + zoomed on the seeded core
  (not the empty whole-map) at Day 2 — the one-shot solo-only reframe onto the actual
  seed centroid works. Core renders diegetically (fenced farm, animated post-mill, two
  terracotta cottages, cobblestone road spine, a walking villager). HUD `Day 2, Pop
  1/6, Bread 5, Wood 40`.
- **Seed = spec:** 5 non-road buildings (storehouse/farm/mill/bakery/house) + 12 roads,
  ALL `connected:true` on the first snapshot. Villagers spawn + staff within ~2 days with
  ZERO player input; pop holds at the housing cap (6/6) through day 63 — never dies out
  (**founding deadlock structurally impossible, confirmed**). `Threat:0 / Fire:none /
  Disease:none`, `burning=0` every sample (defer gate holds at the 5-building seed).
- **Two non-regressions noted:** (1) pop oscillates at cap 6/6 (day-59 starve → day-60
  immigrant) — the *known pre-Phase-H economy* (one house caps popCap 6, one-bakery chain
  ~breaks even), which Phase H + the player extending the seed addresses; the cold open's
  job (hand the player a live, growable town) is done. (2) The `play.mjs` driver's
  DOM-scrape timeline is still null (the in-canvas-UI P2 staleness) — reconfirmed, the
  `__citadel` snapshot read-back is the working substitute.
- House mood held at neutral base 40 (the seed ships only the bread chain, no chapel/
  market in range → all needs lack → base-40, correct) — so the *thriving* warm-glow
  contrast still wasn't framed, but now for a benign reason. A follow-up placing services
  in range would show mood 40→80; low priority (the mechanism was proven in the Phase A
  data check). Full write-up folded into
  [the cozy-pivot playtest log todo](todos/closed/2026-07-01-citadel-phaseA-playtest-verification.md).

## [2026-07-01] build | Citadel cozy pivot Phase C — forgiving diegetic cold open (seeded alive core + threats deferred until grown)

Phase C of the [cozy-pivot build order](todos/closed/2026-06-28-citadel-cozy-pivot-BUILD-ORDER.md)
shipped. Goal: the solo game **opens on a living town** instead of an empty map, the founding
deadlock is **structurally impossible**, and threats stay off through the forgiving opening —
teaching the diegetic loop by reward, not instruction. Built via `plan-split-dispatch`
(controller opus; 2 senior + 3 junior executor chunks on Sonnet 5 + a Sonnet fix chunk; two
Sonnet review finders). All opt-in behind flags that **default off**, so the headless
determinism baseline is **byte-identical** (verified: `sim:citadel` disease still fires day 14;
`seedTown:false`/`deferThreatsUntilBuildings:0` regression tests pin it).

- **Seeded alive core — `seedTown?: boolean` bootstrapSim option (default false).** When on,
  `bootstrapSim` pre-places a compact, road-connected bread chain + house at (near) map center
  **before the first tick**, via the same internal `placeOne(type,x,y,charge=false)` funnel as
  player commands ([sim-bootstrap.ts](../games/citadel/sim-core/src/sim-bootstrap.ts)
  `seedFoundingTown`). Layout: `storehouse`(3×2, the connectivity flood seed) + `farm`(3×3) +
  `mill`/`bakery`/`house`(2×2) hung off a 12-tile **road spine**, anchor found by a deterministic
  outward ring-search from center (skips a river through center). **= exactly 5 non-road
  buildings.** Placed as a **gift** (a new 4th `charge` param on `placeOne` bypasses only the cost
  debit — occupancy/roadGrid/buildingTiles/popCap still apply) and **NOT** logged to
  `commandLog` (it's not a player command — `loadFromSave` re-seeds by threading `seedTown` into
  the fresh bootstrap, so it can't double-apply on replay). The existing founding logic
  (anchored to day 0) then spawns + staffs the pioneer within ~1–2 days → the town is alive from
  tick 0 and the player **cannot strand themselves**.
- **Threats deferred until grown — `deferThreatsUntilBuildings?: number` (default 0 = off).**
  When N>0, fire ignition / disease onset / raid scheduling are suppressed for a player until
  they own **≥ N non-road buildings** (new shared `countNonRoadBuildings` helper in
  [tiers.ts](../games/citadel/sim-core/src/systems/tiers.ts), reusing the tier ladder's own
  `countsTowardTier` yardstick; `TierSystem` refactored onto it). Gate is strict `<` and
  **short-circuits before any RNG draw** when the threshold is 0 → no draw added/skipped/reordered
  → baseline safe (finder-A-verified across all three systems). Only *fresh* onset/ignition/
  scheduling is gated; an already-burning fire / active outbreak still progresses + recovers.
  Composes with the existing time-based founding grace. Solo passes **6** (seed is 5 → the first
  ~5-buildings' worth of play is threat-free; threats arm at the player's 6th building).
- **Solo wiring** ([sim-worker.ts](../games/citadel/client/src/worker/sim-worker.ts)): the solo
  `init` bootstrap now sets `seedTown:true` + `deferThreatsUntilBuildings:6` (alongside the
  existing `chargeBuildCost`/`cozyThreats`/`startingStock`). MP (server bootstrap) sets neither.
  Both new flags persisted in `CitadelSave` + restored in `loadFromSave` (absent ⇒ off) so
  save→replay stays identical.
- **Opening camera** ([main.ts](../games/citadel/client/src/main.ts)): a **one-shot, solo-only**
  reframe on the first snapshot that carries the seeded buildings centres the camera on the
  **actual seed centroid** (not geometric map center — the ring-search shifts the anchor per
  seed; a review finder caught that a fixed-center + MAX_ZOOM frame missed the town on ~¼ of
  seeds) at `MAX_ZOOM`, guarded by `inputReady` (async-camera race) + an `openingFramed` latch.
  MP keeps the renderer's default zoomed-out framing (unchanged).
- **Stale winter copy fixed** (a Phase-D-winter-floor leftover the review surfaced): the client
  `building-info.ts` tooltip/JSDoc/comment + `building-info.test.ts` said farms yield "0 grain/
  day / nothing" in winter — now `grainMultiplier("winter")=0.5` (half, never zero). Corrected to
  the floored-×0.5 reality.
- **Gates:** sim-core **218/218** (+8 seed-town, +5 defer-threats tests), client **381/381**
  (was 380/381 — the stale winter test now passes), typecheck clean on both. Headless baseline
  unmoved by design. **Review:** finder A (determinism/correctness) found **no bugs**; finder B
  (integration) found 3 real issues (camera-misses-seed, false MP-harmless claim, stale copy) —
  **all fixed** and re-gated.
- **⚠️ Not yet eyeballed in a real browser** (WebGPU can't render headless on this box — the
  standing Citadel limitation). The cozy *look* the cold open showcases (a calm, fed, fire-free
  glowing town) is now finally *reachable via legitimate play* — Phases A+B+C+D together clear the
  blockers the [Phase A playtest note](todos/closed/2026-07-01-citadel-phaseA-playtest-verification.md)
  flagged. **A `playtest-citadel` pass is the outstanding acceptance step.**

## [2026-07-01] build | Citadel cozy pivot Phase D — threats demoted to recoverable happiness dips (freeze the bite)

Phase D of the [cozy-pivot build order](todos/closed/2026-06-28-citadel-cozy-pivot-BUILD-ORDER.md)
shipped (brief [2026-07-01-citadel-cozy-phaseD-threat-demotion](todos/closed/2026-06-28-citadel-cozy-pivot-BUILD-ORDER.md)),
implementing the cozy contract (#4/#5/#6): threats no longer destroy/kill/sack — they
**dent local happiness** (which the Phase-B productivity floor turns into a visible
slowdown that self-recovers). The sharp path is **frozen, not deleted**.

- **Freeze mechanism = a `cozyThreats?: boolean` bootstrapSim option, default `true`**
  (sibling of `enforceTerritory`/`chargeBuildCost`), threaded into `FireSystem`/
  `DiseaseSystem`/`SiegeResolutionSystem` (`opts.cozy`). `false` reproduces today's
  destructive behavior **byte-identically** (verified line-by-line: the legacy code is
  gated, not rewritten, and rng draw-count is symmetric). The solo client already runs
  cozy by default; a future Challenge/MP mode passes `cozyThreats:false`. Persisted +
  restored via `CitadelSave` (defaults true for old saves).
- **Fire** ([fire-system.ts](../games/citadel/sim-core/src/systems/fire-system.ts)):
  smoulders (output suppressed while burning) then **EXTINGUISHES** at burn-out
  (`_extinguishBuilding`) — never `_destroyBuilding`, no popCap loss. A well in range
  speeds extinguish (extra deterministic decay). An active fire dents nearby houses'
  `mood` (`_dentNearbyMood`, radius = the well's coverage rect). **As-built:** the dent is
  a flat per-day subtraction from stored mood (fire runs `hazards`, after `needs` eases) —
  same dip-then-recover shape as a target-side dent, simpler, test-pinned.
- **Disease** ([disease-system.ts](../games/citadel/sim-core/src/systems/disease-system.ts)):
  sick villagers slow + always recover (a guaranteed integer recovery floor so an outbreak
  **always ends** in bounded time) — **never `removeOneVillager`**. Healer speeds recovery;
  a small daily happiness dip engages the floor.
- **Raids** ([siege-resolution.ts](../games/citadel/sim-core/src/systems/siege-resolution.ts)):
  a resolved raid **pilfers stockpile goods** (`applyCozyPilfer`: theft scales with raid
  strength, reduced monotonically by `1/(1+defenseRatio)`, seeded ±20% jitter, clamped to
  stock) + −8 happiness + leaves — **never `applyRaidDamage`/`keepSacked`/`gameOver`**.
  Defense investment still visibly matters (shrinks the theft).
- **Winter** ([seasons.ts](../games/citadel/sim-core/src/world/seasons.ts)):
  `grainMultiplier("winter")` `0.0 → 0.5` (unconditional — harmless in sharp mode; Phase H
  owns the broader retune). Food always trickles; winter alone no longer starves a working
  chain. Stale winter=0 comments in production/building/immigration corrected.
- **Emergent interaction noted:** with cozy default ON, the PvE `RaidSpawnSystem` pilfers
  goods from **any** player with a `keepPosition` — dormant in real solo play (solo
  town-halls don't anchor, no keep → no raids, per the Phase-G decouple), but it broke a
  PvP-army test's exact tool accounting; that test now boots `cozyThreats:false` (PvP is a
  Challenge/MP feature). Flag for whenever threat cadence/Phase G is revisited.
- **Tests:** new [cozy-threats.test.ts](../games/citadel/sim-core/src/systems/cozy-threats.test.ts)
  (fire recoverable + mood dent, disease never-kills + bounded recovery, raid pilfers-not-sacks,
  a `cozyThreats:false` regression guard that still sacks→gameOver, winter floor). Existing
  destructive-behavior tests (`phase45`/`phase4`/`army`) opted onto `cozyThreats:false`; the
  economy winter-starvation test **rewritten** to the new truth (survives winter). **Gates:
  sim-core 205/205, typecheck clean (citadel), determinism MATCH ×3** (0xc0ffee/0x1/0x2a,
  same-seed-twice byte-identical). Baseline moved by design (cozy path).
- **Process note (Sonnet 5 eval):** built via `plan-split-dispatch` with all 5 executor
  chunks on **Sonnet 5** (opus = controller/planner/verifier). Sonnet 5 did all 5 to spec
  first-try, 0 BLOCKED; two Sonnet review finders came back clean. It rewrote (not weakened)
  the falsified winter test and root-caused the PvE-pilfer cross-test bug on its own. One
  wobble: the winter chunk's *first* run missed two winter=0 test assertions that a re-run
  caught — thoroughness available but not first-try guaranteed on search-and-verify tasks,
  which is the argument for keeping the controller + hard gates.

## [2026-07-01] build | Citadel cozy pivot Phase B — happiness → productivity floor (the signal gets teeth)

Phase B of the [cozy-pivot build order](todos/closed/2026-06-28-citadel-cozy-pivot-BUILD-ORDER.md)
shipped — makes the Phase A mood signal **mechanical**, implementing the downside
rule (#9): every problem is a *throttle toward a floor, never a cliff*. **Gated as a
single phase** (threat re-pointing → Phase D, decree purge + winter grain floor →
Phase H are explicitly deferred).

- **Stateful happiness drift** ([needs-happiness.ts](../games/citadel/sim-core/src/systems/needs-happiness.ts)):
  `_updateHappiness` and the per-house `mood` (Phase A) went from **stateless recompute**
  to a **stateful asymmetric ease** toward the (byte-identical) per-day target —
  `h += (target − h) × rate`, **recovery 0.45 / decay 0.30** (heals faster than it
  falls → every dip over-recovers → the floor is a property of the update rule). A
  typical ~20-pt dent recovers in ~2–3 in-game days. A deterministic last-≤1-point snap
  stops integer rounding from freezing one short of target. The mood signal now
  *breathes* instead of flickering, which is what makes the diegetic read legible.
- **Productivity floor** ([production.ts](../games/citadel/sim-core/src/systems/production.ts)):
  output × `productivityFactor(h)` = `lerp(0.6, 1.0, h/100)` — happiness 0 → 60% output,
  100 → 100%, **single tunable `PRODUCTIVITY_FLOOR = 0.6`**. Uses the **local** signal —
  the assigned worker's home-house mood (resolved via a `Map<workplaceTileKey, homeMood>`
  built once per pass), falling back to per-player happiness on a miss. **Controller fix
  during integration:** the naive `Math.floor(amount × factor)` floored a base-1 producer
  (smith → 1 tool, mine → 1 stone) to **0** below ~83 happiness — a cliff that violates
  the cozy contract and stalled the refine chain. Changed to **`Math.max(1, floor(…))`**
  so a building that would produce ≥1 always still produces ≥1 (throttle, never cliff).
  This also auto-fixed the two pre-existing tests the bug had broken (phase4 smith chain,
  phase3 rationing) — root cause was the floor-to-0, not stale assertions.
- **Determinism re-proved: MATCH ×3** (seeds `0xc0ffee` / `0x1` / `0x2a`, byte-identical
  across two runs each). **The numeric baseline moved by design** (happiness now lags;
  output now happiness-scaled) — the contract is *same seed reproduces itself*, not
  equality to old numbers. New baseline (default seed, grow, 40d): pop 5/12 Village,
  happiness steady ~50.
- **Built model-routed** (plan-split-dispatch): 2 senior (happiness drift, productivity
  floor) + 1 junior (determinism re-prove), serial. **Scoped 2-finder review** (happiness
  correctness/determinism + floor correctness/determinism) found **no defects** —
  determinism clean by static analysis, target math bit-for-bit unchanged, snap bounded
  (swept all 10,201 prior×target pairs), asymmetry not swapped, floor-vs-zero ordering
  correct (winter grain still 0, not floored up). Two cosmetic non-defects noted
  (`workHours` double-floor, a stale comment) left for Phase H, which purges that decree code.
- **Gates**: `@citadel/sim-core` 198/198, typecheck-clean.
- **Important — town is no longer spiraling but not yet cozy-calm.** Phase B stops the
  *death spiral* (floor holds, MATCH×3) but the baseline is still volatile (pop oscillates
  4–6, a disease outbreak still active at day 40). That's the correct in-between: the
  threats that destabilize it (fire/disease/raid/winter) aren't demoted until **Phase D**,
  and the economy floors land in **Phase H**. **Phase A's cozy *visual* still wants its
  in-browser eyeball after D** (a calm, fed, fire-free town). Per the user's gate, we
  **stop here for review before the next baseline-moving phase.**

## [2026-07-01] playtest | Citadel Phase A — per-house mood DATA verified live; VISUAL gated behind B/C/D

Playtested Phase A in the real WebGPU client (system Chrome, fixed seed `0x1a2b3c4d`).
**The data pipeline is confirmed correct end-to-end:** reading per-house
`{mood, lacksFaith, lacksSafety, lacksGoods}` straight off the live snapshot
(`window.__citadel.buildings()`), **served** houses (chapel-in-range) read `mood 60`
(`lacksFaith:false`) and up to `mood 80` (chapel+market+food → `lacksFaith/lacksGoods
false`), while **unserved** houses read the neutral `mood 40` / all-`lacks` true —
matching the needs-happiness math exactly. WebGPU renders; no page errors.
**The cozy *visual* (glow/dim/hearth-smoke) could NOT be cleanly eyeballed as a
contrast**, because it's gated behind unbuilt phases: fire still ignites (Phase D not
done) and pop starves to 0 within ~10–20 days (pre-cozy economy; Phase B/H not done),
so a stable content glowing district never persists long enough to frame, and the
constant-warm-v1 glow is subtle in daylight by design. This matches the build order's
own A→B→C spine and the skill's "thriving state isn't reachable pre-pivot" warning —
**re-do the Phase A visual eyeball after B/C/D land.** Also filed a **P2 tooling**
finding: the playtest driver `play.mjs` still scrapes the **DOM** HUD, which is empty
after the 2026-06-30 in-canvas-UI migration (`pop/happy/tier` log as null; road count
inflates `buildingCount`) — it should read state from `__citadel`/`currentSnapshot`
instead. Findings + acceptance in
[todos/closed/2026-07-01-citadel-phaseA-playtest-verification.md](todos/closed/2026-07-01-citadel-phaseA-playtest-verification.md).
Corpus-only entry (no code changed in this playtest).

## [2026-06-30] era | Citadel cozy pivot (design rounds 1–7 + Phases A–I) + all-GUI-in-canvas (@engine/ui) + 06-27 playtest fixes + 06-26 gameplay-depth/art + 06-19..22 iso-render foundation

Collapsed the 2026-06-19 → 2026-06-30 Citadel wave (≈75 full-prose entries). Per-brief detail lives in [briefs/](briefs/) + closed todos in [todos/closed/](todos/closed/) + [wiki/status.md](wiki/status.md); **git holds the trimmed prose** (`git log -p -- corpus/log.md`). Design of record for the cozy identity is [todos/closed/2026-06-28-citadel-cozy-pivot-BUILD-ORDER.md](todos/closed/2026-06-28-citadel-cozy-pivot-BUILD-ORDER.md); synthesis in [wiki/citadel-overview.md](wiki/citadel-overview.md).

### The cozy pivot — design (2026-06-28, 7 grilling rounds, no code)
Resolved **what Citadel is for**: *a cozy placement puzzle you read by watching the town live* — not a pressure/survival sim, not a competitive RTS. Ten locked decisions (see the build order for the full list):
- **#1–4** cozy builder committed; two fused hearts (placement-puzzle + watch-it-live, made one act by diegetic feedback); **read town health by watching villagers/buildings** (mood/smoke/light), not a HUD; **cozy contract** — nothing you built is taken away, threats cost time/regenerating resources only.
- **#5 the one threat mechanic** — threats **dent local happiness** (radius ≈ the cure's reach); **happiness taxes productivity to a ~60–70% floor, never zero** → recovery is a property of the math (no death spiral). The per-house/villager mood signal is *simultaneously* the diegetic scoreboard AND the threat-consequence layer.
- **#7 motivation** = emergent goals + diegetic recognition, **no score, no quest list** (a visible "town quality" number was explicitly rejected as the un-cozy path).
- **#8 autonomy boundary** — the player sets **placement + economic intent**; the town autonomously handles all **behavior**. Decrees are demoted (not deleted) into **civic buildings with spatial reach** (town-hall = rations/work-hours; public-square = festivals, a **net-new building to author**). Trade is the SOLE economic-intent lever (the earlier "production choice" lever was cut — no referent in a fixed single-output chain).
- **#9 the downside rule** (generalizes #5 to the whole game) — *nothing ever fully stops; every problem is a throttle toward a ~60–70% floor, always recoverable, always shown in the world.* Winter grain floors ~×0.5 (never 0); stockpile-pressure = throttle not halt; **single-slot buildings** (a 2nd worker was a wasted mouth — the old death-spiral root), so growth = placing more buildings.
- **#10 terrain is the difficulty knob** — cluster resources into **groves/ore-veins you build toward** (not per-tile noise sprinkle), guaranteed-solvable but varied; trade is the safety valve that permits bolder terrain. Meta-finding: threats/economy/terrain all independently resolved to *"a guaranteed-safe floor + rich texture above it"* — emergent convergence = the spine is coherent.
- **#6** the sharp 2026-06-26 systems (siege variance, MP/PvP, territory/army) are **frozen not deleted** (off-spec for cozy core, re-wireable into a future Challenge mode). `territory`+`army` unregister from the cozy bootstrap.

### The cozy pivot — build (Phases A–I, shipped 2026-06-30 → 2026-07-01)
- **Phase A (keystone, 06-30)** — per-house diegetic mood/coverage signal. The sim already computed per-house `hasFaith/hasSafety/hasGoods` in `_computeNeedsFor` and **threw it away**; Phase A stops discarding it, writing `{lacksFaith,lacksSafety,lacksGoods,mood}` onto each house's `BuildingRuntimeState` + snapshot. Render expresses it diegetically: `EDG.gold` glow pool scaled by mood, mood-driven sprite-dim, mood-gated hearth-smoke wisp (`needs-happiness.ts`, `citadel-renderer.ts`, `citadel-fx.ts`). Determinism preserved (per-house write is a pure side effect; aggregate outputs byte-identical). Phases B/C/D/F/H shipped 2026-07-01 (full prose retained above for those).

### All-GUI-in-canvas — @engine/ui (2026-06-28 design round 7 → 06-30 build)
Grilled "all GUI in-game" into a first-class **cross-game engine subsystem** (not a Citadel task): build the UI layer first; the six Citadel UI panels are *consumers*; a **hidden DOM a11y mirror** is a required deliverable; new game-agnostic + render-backend-agnostic (**WebGPU + Canvas2D fallback**) **`@engine/ui`** package ([brief 17](briefs/engine/done/17-engine-ui-framework.md)).
- **Framework** (`engine/ui/`): render seam (`RendererLike.beginUI/pushUI/endUI`), deterministic **5×7 bitmap font** (measure/layout/wrap/draw, EDG-tinted), retained-mode widgets (panel/box/label/button, later **slider/checkbox/toggle**), two-pass flex `computeLayout`, EDG32 theme, input dispatcher (hit-test/hover/focus/drag + a `consumed` intercept signal), scroll + injected-time tweens, `opacity` subtree channel, hidden-DOM a11y mirror.
- **Six Citadel consumers** all shipped: resource HUD (all-goods strip), building inspect+upgrade panel, villager-job panel (villagers tint by job; **placement ⊥ follow-cam**), resource-HUD goods, town-hall build button (+ **solo keep-anchor decouple**: `actsAsKeepAnchor()` — a town-hall is civic-only in solo so raids never start), **build-cost economy** (`BUILD_COST` per type + debit, opt-in `chargeBuildCost`/`startingStock` bootstrap flag so headless/tests stay free & determinism-baseline-identical; solo grants 40 wood).
- **DOM-overlay removal COMPLETE** (all 5 surfaces): event toasts, build bar (emoji→text labels — see the still-open [authored-typography todo](todos/closed/2026-06-30-engine-ui-authored-typography-and-icons.md)), occupancy badges (world-anchored via `tileToCanvasCss`), minimap (raw-quad draw), settings modal (fully modal). No DOM UI overlays remain over the Citadel world.

### 2026-06-27 playtest fixes (first live real-GPU passes)
- **Cold-start P0** — a solo game could never leave pop 0: the ~6-day founding window measured from sim day 0 had already closed during the ~15-day page/WebGPU boot. Fixed by anchoring the window **per-player to the first observed day they have a connected unstaffed production building** (`immigration.ts`); tick-0 builds anchor to baseline → headless/replay founding timing unchanged.
- **Fire P2** — density-driven ignition could burn a starter cluster before the player had agency. Added a per-player **founding grace** (`floor(daysPerYear/4)+2` days, temporal not population-gated); spread is unaffected (`fire-system.ts`).
- **Entity movement** — render-only `EntityInterpolator` (lerps prev↔cur snapshot tile at a render `alpha`; teleports/pause SNAP) + a springy walk-gait; units glide instead of tile-snapping. Zero sim impact.
- **Road-builder feedback** — disconnected-building marker (pulsing gold pip — the headline gap: `connected` was in every snapshot but never shown), drag-length readout, red/green legality tint. Then **freehand roads** (`extendTrail` follows the actual mouse path, gap-fills fast drags; **supersedes** the endpoint-A* `routeRoadPath`).
- **Villager↔population parity** — root cause: siege-resolution decremented `p.population` after a sacking **without despawning entities** → phantom villagers. Extracted one `removeOneVillager(state,p)` and routed all three loss paths (starvation/disease/raid) through it; per-tick invariant test (`ownedVillagers == population`).
- **Villagers-on-road-only-when-moving** + per-building **occupancy badges** (headcount chips over occupied buildings; `Σ occupancy + travelling == population` invariant). Well coverage became an **8×6 rectangle** (`SERVICE_RECTS`/`coversRect`, single source of truth).

### 2026-06-26 gameplay-depth + iso-art grounding
- **Gameplay depth** (the "sharp" systems later frozen by #6): **siege variance** (`resolveSiege` consumes its seeded fork into probability bands — also fixes the citadel-38 P3#14 dead-fork trap; per-raider `morale`), **raid counterplay** (scout warning, garrison interceptors −25%), **threat consequence** (drives raid cadence, decree gating, defense pressure), **interlocks** (raids can ignite wood; disease weakens conscription; burning suppresses neighbours), **decree counterplay** (one-shot festival + stacking penalty — *silent auto-expiry was tried and dropped*), **trader dynamic pricing** (offers from your surplus→scarcity gap). All deterministic via `state.rng.fork`; reproducible across seeds×scenarios (baseline moved **by design** — the contract is same-seed reproducibility, not equality to old numbers).
- **citadel-38 audit** — P0 MP server-authority (owner-guard demolish/upgrade; drop client-forged `setActivePlayer`; host-only pause/speed), P1#5 villager owner-filter, P2 tier-count excludes wall/gate + direction-aware messages + `SAFETY_PROVIDERS` + `isKeep`-based `keepPresent`, P3 cleanups.
- **Iso-art grounding pass** (SLYNYRD Pixelblog 41/54, PixelParmesan) applied in **shared primitives** so all 20 buildings benefit: **contact shadow** (`isoContactShadow` from `begin()`, footprint diamond pushed SE in `i` ink — the single biggest legibility lift), **AO seams** (wall-top eave band + near-corner mid-shade), **roof value separation** (`roofDark` `#`→`i`, never pure black). Extended to **units** (`footShadow` + 3-value body ramp so multiply-tinted figures read as volume) and **terrain** (`elevationFill` bands the base diamond by elevation → rolling land). The three 2026-06-19 sprite todos closed (2 superseded by the iso library, entity-legibility built: raider strength tiers + villager heading lean).

### 2026-06-19 → 2026-06-22 — the true-isometric render foundation
- **True-iso epic** (`render/iso.ts` = single source of truth): 2:1 dimetric `tileToIso` + the placement-critical inverse `isoToTile` (round-trip tested for all 9216 tiles) + `isoFootprintBox`/`isoSpriteDims`/`isoDepth`. Terrain bakes as **diamonds**; roads/walls/ghost draw via an `fx/diamond` frame; sprites re-authored true-iso (diamond base + two shaded wall faces + hip roof) at 32-based res. Sim/determinism/EDG32 untouched.
- **Per-building FORMS**: replaced the one-box-differing-by-colour set with distinct silhouettes — `cottage`/`postMill`/`openField`/`marketStalls`/`church`/`warehouse`/`fort`/`boxBuilding`, one iconic feature per type; **animated 8-frame mill** (`bld/mill@0..7` + `millFrameAt(clockMs)`, render-only). Authored at 4× briefly, then **reverted to 32-based** (`ISO_ART_SCALE=1`, 32 judged dense enough — this retired brief 94's upscale premise). Reference restyle (terracotta tile roofs + half-timber + ashlar coursing, EDG32 evocation of the user's packs → [brief 96](briefs/game/todo/96-citadel-building-art-style-reference.md)); mill + well rebuilt (were the two weak forms); night light-pool fixed (soft `fx/diamond` ground pool below buildings, not an orange box over them).
- **Bridges**: a road dragged onto Water auto-converts to a non-overlapping `bridge` building (joins `roadGrid`, keeps the tile walkable).
- **playtest-citadel skill** added (`.claude/skills/`, Playwright + system Chrome WebGPU). Growth-deadlock root cause (P0): production is **per-building gated on `workerCount>0`** (2nd worker = wasted mouth) AND pure services were staffed **before the bread chain** → fixed with goods-before-services assignment + per-unstaffed-building founding + buffer-based immigration; `grow` now holds pop 10–11/12 through a full year. Coverage overlay + placement ring shipped (OpenTTD brief 1/3); minimap redrawn in iso world-px (viewport reads as a rectangle).

### Load-bearing facts from the 06-19..30 wave (do not re-derive)
- **Sprites anchor by CENTRE.** The engine sprite-batch draws `pos ± 0.5·size` (both backends); every Citadel iso helper returns a **top-left** rect. The up-left-offset/float bug = add half-extents at the two rect→sprite choke points (`quadToSprite`, `isoFlatSprite`) only — the pure iso math stays top-left. Sprite height must be `roofH + wallH + diaH/2` (the ground diamond centres on `yBotMid`, so only its lower half sits below the walls).
- **Citadel tiles bake FLAT.** A geometric elevation *lift* desynced roads/bridges/pick (all live at elevation 0) from lifted ground; terrain is baked flat and the elevation field only *tints* the dither (light highs / dark valleys). The pick can't cheaply account for per-tile height.
- **Real-GPU only.** WebGPU renders on this native-Windows dev box via **Playwright + system Chrome** (`channel:"chrome"`, `--enable-unsafe-webgpu`); the **Playwright-bundled Chromium cannot create a WebGPU device here** (`dxil.dll` error 87 — missing DXC DLLs). The "true-iso flat-box anomaly" (market/storehouse/bakery flat) was a **host-specific driver artifact — does not reproduce on real GPU**; sprite data proved byte-identical to a working house. WebGPU can't render **headless** at all — visual checks need the live client.
- **Determinism discipline.** Solo ownership-guards / gated-bootstrap-flags are no-ops by construction → byte-identical without a re-proof; where a mechanic genuinely moves numbers, the contract is **same-seed reproducibility re-proven across seeds×scenarios**, not equality to the old baseline. `EXPORT=json` byte-diff is the proof for behaviour-preserving refactors.
- **Playtest driver caveats.** Place buildings → verify against the snapshot → retry → *then* lay roads (a road carpet sent in the same burst claims tiles before buildings resolve). Vite HMR full-reloads the Worker sim to day 1 on any watched-file change mid-run (the driver re-bootstraps). Post-06-30 the driver's **DOM HUD scrape reads null** (UI moved in-canvas) — read state from `window.__citadel`/`currentSnapshot` instead.

## [2026-06-12] era | World-expansion + décor + animation + improvement-backlog wave

Shipped across 2026-06-12; per-brief detail in [briefs/](briefs/) + [wiki/status.md](wiki/status.md). Individual entries trimmed — git holds the prose.

- **Land foundations + consumers (world/render todo group COMPLETE):** grew the world **160→240** (uniform position-only `SCALE=1.5`: island `bounds` via `scaleB` keep size, gaps open ×1.5; on-island content locked to its island via `scaleAroundNearestIsland` so nothing drifts to ocean; coral derives from live isle bounds; one hand-tune: shrine +2x to keep the village↔shrine bridge; `DEFAULT_ZOOM` 2→3). The todo's "only one stray literal" estimate was wrong — the real blast radius was dozens of hardcoded 160-coords. Then: `RegionDef.theme` enum + `interior-decor.ts` `computeInteriorDecor` (per-theme blue-noise scatter inside themed regions, baked layer 2, forbidden-set from world queries dodges functional tiles + bridge mouths, deterministic per `WORLD_GEN_SEED`, **never read by sim**); bigger neutral islands (heritage/mushroom/ice/volcano/casino 8×8→12×12); 21 per-farm `ranch-N` islands hosting relocated livestock pens (tend now gated on being at the ranch → real daily AI traffic); casino open-air (building removed, dressed with 5 new gaming sprites as island-locked baked props) — which surfaced + fixed a grow regression (baked `BIG_STRUCTURES` forge/carpenter/weather/volcano had stale 160-coords baking in ocean post-grow; now island-locked, geometry.test guards it); 4-way `seasonalTreeFrame` (blossom/green/autumn/bare over tree/bush/fruit-tree/big-tree, instant swap) + new `big-tree` landmark island, and a latent fix (mature orchards rendered as saplings — nothing swapped the frame on maturity).
- **Improvement backlog (filed + shipped same day, one worktree branch per brief, Sonnet executors, merged individually, tests green each merge):** engine 10–16 + game 86–88. Detail in [wiki/status.md](wiki/status.md). Load-bearing facts kept below.
- **Animation (briefs 85 + 89, both later closed superseded):** reintroduced `@engine/core/animation` (`AnimationClip`/`Animator`, recovered from the deleted `0919cbc`) **with real consumers** (the ~7 inline wall-clock cyclers + a render-side action swing so working farmers/Pip move) — the brief-04 ghost rotted because nothing consumed it. Tier-A juice (engine easing module, **frame events on `AnimationClip`** — the architectural unlock, footstep dust, asymmetric idle bob, action scale-pop). Tier-B (`enumerateFarmerFrames` existence-guard test closing the silent-missing-frame gap; formalized facing vocabulary; deliberately NOT a stateful transition-FSM — the renderer is stateless per-frame, so a state→clip resolver is the right shape). Brief 89: detailed 24×24 locomotion (pipeline unified through one `generateFarmer()` loop; actions stayed 16px) + a render-side carried-tool overlay (Pip holds the selected hotbar tool, pixel-safe: per-facing sprites + `flipX`, no rotation, hand-anchor translation).

### Load-bearing facts from the 06-12 wave (do not re-derive)

- **Engine 10 — WASM pathfinder allocator fault:** the TS wrapper freed `gridPtr` before `outPtr`, but the AS **stub bump allocator only reclaims the most-recent allocation**, so ~25.6 KB leaked per `findPath` → heap exhausted at ~655 calls → `unreachable`. Fix = two-line free-order swap + an 800-call churn regression test (red pre-fix). The leak never bit short runs (3-day output byte-identical to pre-fix main; **fast diff MATCH ×6**, seeds 0xc0ffee/1/42 × ticks 20/1200, WASM pathfinder).
- **Engine 11 — WGSL validation:** `wgsl_reflect` 1.4.0 parse-validates every `*.wgsl` in tests (throw-fixtures prove it bites); the reserved-keyword regex is **kept** — the parser does NOT catch that class (the original black-screen incident). Quirk: the package `main` is CJS; a vitest `resolve.alias` redirects to its ESM entry. **Lesson: green tsc+vitest does NOT mean a shader compiles** — diagnose render-blackouts via the browser console (`CreateShaderModule` errors).
- **WebGPU 5-bug review (load-bearing render rules):** (1) **one `writeBuffer` per buffer per frame, always before encoding draws that read it** — `SpriteBatch` clobbered a shared GPU buffer per atlas group; the queue-timeline last-write-wins corrupted nearly all dynamic sprites. Fixed with a frame-packing protocol (`begin()→add()×→upload() once→drawRange()` with `firstInstance`). (2) WGSL `struct{vec3,f32}` packs the f32 at byte offset 12 (vec3 tail padding), not 16 → weather read 0 → invisible. (3) Canvas2D `pattern.setTransform(translate(+scroll))` shows texel `p−scroll`; the shader sampled `p+scroll` → water scrolled backwards. (4) shadows drawn on the 2D overlay sit above the GPU canvas → farmers' shadows darkened the farmers; moved to an in-pass instanced SDF ellipse batch (premultiplied source-over of black at alpha a ≡ canvas `multiply`). (5) Canvas2D drops the `tintRgba` alpha byte (`tint >>> 8`); GPU multiplied it in → tints rendered at the wrong alpha; GPU now drops it too.
- **Worktree-swarm lessons:** (a) symlinking the repo `node_modules` into a worktree breaks if the agent runs `npm install` (clobbers the symlink with a real dir); (b) `packages/wasm-modules/dist` is gitignored — symlink/copy it in; (c) in a worktree, farm-valley's `@engine/core` resolves through symlinked node_modules to MAIN's engine source — new cross-package engine APIs need a local structural type-guard; true integration is only proven by the post-merge test run on main; (d) run merges from the main repo cwd, never inside the worktree.
- **Brief 84 — FPS regression was a measurement artifact, NOT the game:** a user real-GPU `?profile` export (ANGLE / AMD Radeon) showed 99 fps / 5 ms JS; the old "15–30 fps" was headless-SwiftShader (CPU raster). **Lesson: never diagnose a raster/GPU regression from a headless SwiftShader profile.** Shipped a `?profile` export button + `window.__exportProfile()` + a WebGL GPU-identity probe (reusable). No GPU-overdraw work needed.

## [2026-06-11] era | Render-polish + pseudo-3D + brief-66→79 wave + wiki audit

Shipped 2026-06-11 (Opus-plan / Sonnet-execute, committed per-brief); per-brief one-liners in [wiki/status.md](wiki/status.md). Individual entries trimmed — git holds the prose. Highlights + durable lessons:

- **Briefs 66–79:** 66 tab-resync, 67 pixel-snap + camera smoothing (`expSmooth`/`pixelSnap`, bake byte-identical), 68 seeded ambient life, 69 named scheduler stages + same-stage bus audit (flattened order byte-identical), 70 startgold +30 (baseline moved), 71 per-asset atlas recipes + hash-cached per-sheet builds, 72 `RunRegistry` shared-run lobby (one `SimHost` per run-key, encode-once fan-out, owner-only control, late-join replay; determinism untouched), 73 travel-reachability guards (root cause: gather tiles pointed at OCEAN in the radial world; baseline moved), 74 weather-station island, 75 principled [economy.md](wiki/economy.md) model (1 AP = one basic-labour action; crop g/AP spread compressed 2.64×→1.59×; baseline moved by design), 76 loading screen, 77 3D buildings + per-farm cottages (premise correction: all 21 farms already had homes; 77 replaced them), 78 Pip-movement **not reproducible** (root cause: duplicate dev processes — a stale second socket attaches as spectator and input is swallowed), 79 click-to-target + action cursor.
- **Pseudo-3D arc (brief 81 + follow-ups):** engine `z` axis (dormant foundation — `screenY = y − z`, y-sort key stays ground `y`, nothing sets z yet); persistent camera-tracked `RainField` (root cause of "rain resets when walking" was a no-persistent-volume bug, not coordinates); rain splashes; x-ray occlusion pass (player-only); buildings moved to layer-50 dynamic occluders; inventory system (E opens, unified item grid, sim-authoritative layout via swap-slots); forageable berry-bushes + tree-chop seed bonus (forked rng, baseline moved).
- **Wiki audit (lint+compress):** fixed world-dimension drift (88×80 → 160×160 everywhere current); found the latent AI-fishing bug (`FISHING_CAST_TILES` pointed off-isle pre-reorg → AI fishing silently dead; fixed in brief 80 by deriving cast tiles from live isle bounds); re-pointed stale `todo/`→`done/` links; compressed open-questions 66→29 lines + rewrote status.md as a current-state snapshot.
- **⚠️ Incident (worktree lesson origin):** a brief-74 subagent ran `git reset --hard`, wiping uncommitted 66/67/68 edits (recovered). Lessons → **forbid destructive git in subagent prompts, commit per-brief, verify exit status directly.**
- **Maintenance:** stripped provenance/changelog/restating comments across ~450 TS files (kept only invariants/ordering/determinism/formula notes); extracted the scheduler-ordering rationale into [wiki/system-ordering.md](wiki/system-ordering.md) (now authoritative). Durable facts surfaced: WasmHeap view-after-grow invalidation; sprite queue trimmed to `queueLen` before sort; bilinear smoothing guard at zoom < 1; `permessage-deflate threshold:1024` ~70–80% wire reduction; pool slots must assign all optional fields on reuse; festival anchors (spring d13/summer d38/autumn d63/winter d88 at SEASON_LENGTH=25).

## Archive — 2026-05-26 → 2026-06-10 (older entries trimmed 2026-06-11)

Trimmed to keep this log minimal. **Full entry text is in git history** (`git log -p -- corpus/log.md`); every brief's detail lives in [briefs/](briefs/) (done/superseded) and durable synthesis in [wiki/](wiki/). Era summary:

- **05-26 → 05-29 — Foundations.** Wiki adoption; engine briefs 02–08 (input, tests, spatial+anim, pathfinder-into-movement, determinism harness, baked tile layer, WASM expansion); game briefs through ~23 (personalities, weather/crops, market/shop/auctions, observer + spectator UI, regions+travel, seasons, mid-game shock).
- **06-03 → 06-04 — Long-day redesign + archipelago birth.** Briefs 24–35: complete auctions, day/night + seasonal grading, long days (ticksPerDay 1200) + AP rework + irrigation, rendering overhaul + world expansion, player activity. World rebuilt as an 88×80 island-per-zone archipelago; EDG32 enforced project-wide; Pip + interaction systems; fishing isles + bubbles.
- **06-05 → 06-06 — Spectator/story + gameplay-depth waves.** Briefs 36–48: end-of-run recap, rivalries/relationship matrix, drama scoring, wealth graph, thought bubbles; crop roster + quality (the spine), livestock + orchards, greenhouse + skills, working NPCs + tavern, festivals, harbor + contracts, atlas split (47), boats + coral fishing (48). Engine brief 09 perf pass; monolith→module-dir refactor; mining `Math.random` determinism fix.
- **06-08 → 06-09 — 21 farmers + organic procgen + more islands + radial reorg.** Service NPCs lightly deliberate; scaled to 21 farmers; brief 49 organic procgen (fBm + domain-warp, clustered features, open-water props; Simplex deferred); briefs 50–54 islands (shrine, heritage, waterfall, camping; 53 superseded); spectator-UX audit P1a–d; **the 160×160 radial map reorg.**
- **06-10 — Client/server split + polish + perf re-measure.** Briefs 55–58 (extract `@farm/sim-core` → Node WS server → renderer-as-WS-client → deploy); brief 59 peer-interaction fix (price-bug + `OFFER_CROP`); briefs 60–65 render-polish wave; brief 70 +30 startgold; brief 71 per-asset atlas recipes + cached builds; edge depth-sorting; perf re-measure; brief 09 closed; the FPS-regression triage that became performance.md Tier 0.
- **06-22 — Citadel HUD declutter.** Bottom bars were eating laptop vertical space and the HUD reflowed (canvas-shift) whenever an event appeared. Fixes: events → transient top-center toasts (`ui/toast.ts`, out-of-flow overlay); new top-right minimap drawn in tile-space with click-to-recenter (`ui/minimap.ts`); condensed icon-only build bar + `nowrap` HUD row; trader panel floated out of the HUD flex row. See [citadel-overview.md](wiki/citadel-overview.md) "HUD & overlays".
