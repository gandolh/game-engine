# MateQuest — BUILD STATE / RESUME (live tracker)

status: in-progress (M3 + M3.1–M3.4 map polish done, verified; starting M4)
updated: 2026-07-23 (M3.4 top-down 2.5D map + Farm/Citadel-style terrain on branch `mathquest`)

## Locked convention: Romanian is the DEFAULT language
Per user directive 2026-07-22: MateQuest UI defaults to **Romanian** until a locale toggle (M5) lets
the user change it. `strings.ts` holds RO values; generator `prompt`/`teach` text is RO inline. The
@engine/ui font now renders all RO diacritics + a symbol set (see M3.1/M3.2 below), so RO is fully
legible in-canvas.

**Read this first to resume the MateQuest build.** Design-of-record is
[corpus/wiki/mathquest-overview.md](../wiki/mathquest-overview.md) — read it before any brief.
This file is the live progress tracker + the milestone plan.

MateQuest = the **fourth game** on the shared engine: a Romanian-curriculum (programa școlară,
grades I–VIII) math roguelike where **solving a problem IS the combat action**. Pokémon-style
Attack/Heal/Shield menu + Slay-the-Spire turn stakes; branching runs; two-layer progression
(in-run XP + persistent per-topic mastery); soft-roguelike death; loot grants math lifelines;
Romanian-folklore theme; Resurrect-64 palette; Web-Worker solo build like Citadel.

## How we'll build it (proposed — mirrors Hollow)
- Skill: **plan-split-dispatch**, backlog/wave mode. Controller (opus) plans/verifies/adjudicates;
  executor briefs dispatched to **Sonnet** subagents (per standing user directive). Never fable.
- **New branch off `main`** (e.g. `mathquest`). Per-milestone checkpoint commits. Commit only your
  own paths (concurrent sessions share the tree).
- **Verify gate after each milestone** (controller runs it, not the subagent):
  `npm run typecheck` (whole workspace) + `npm run test -w @mathquest/sim-core` (narrow) +
  git-tracked check (`git status --porcelain` shows new files). Commit only when green.

## Constraints (carry into every dispatch)
- **Constrained hardware**: small runs; **ALWAYS ask the user before any determinism/EXPORT check**;
  narrowest test scope (single workspace), never the full repo suite mid-wave.
- **Determinism load-bearing**: all randomness (problem generation, loot, map layout, enemy AI) via
  seeded `Rng.fork(label)`; no `Math.random`/`Date.now`. Problem generators MUST be deterministic so
  they're unit-testable and runs are reproducible.
- **Palette enforced**: every color via `MATE_PAL.*` (Resurrect 64), no raw hex; add a per-scope
  palette-guard test so `games/mathquest/` validates against Resurrect 64.
- **No `.js` import suffixes; pinned versions; TS strict** (repo-wide conventions).
- **Agent-prompt hygiene**: forbid `git reset`/`checkout`/`stash` in subagent prompts; subagents
  don't commit; controller integrates. Verify integration, not just green tests.
- Engine names no game; `@mathquest/*` imports `@engine/*` only.

## Milestone plan (B)

| Milestone | Goal | Key deliverables | Verify |
|---|---|---|---|
| **M0 — scaffold** | Game exists in the monorepo | `games/mathquest/{sim-core, client}` workspaces; deps wired (`@engine/core`, `@engine/ui`); `MATE_PAL` (Resurrect 64) + palette-guard test; empty Vite client boots; `npm run mathquest` script | typecheck + client boots |
| **M1 — turn-combat loop** | The pillar, end-to-end, with ONE hardcoded problem | Encounter → Attack/Heal/Shield menu → solve (typed) → action lands/fizzles → enemy telegraphs & hits → HP → win/lose one fight. In-canvas `@engine/ui`. Sim in Web Worker (Citadel pattern). | play one fight in browser; unit test the resolve logic |
| **M2 — problem-generator seam** | Deterministic curriculum content, grades **I–IV** | `ProblemGenerator` abstraction keyed by (grade, topic); deterministic via `Rng`; mixed input (typed vs MC + hand-crafted distractors); teach-card + re-queue; unit tests per generator | generator tests; solve real generated problems in a fight |
| **M3 — map & runs** | The roguelike frame | Branching node map with easy/hard bifurcations; a run = ~12 nodes + boss; soft-roguelike wipe → home | play a full run; map is deterministic per seed |
| **M4 — progression & loot** | Both progression layers + the lifeline economy | In-run XP/level-up-choice; persistent per-topic **mastery** (save/load); loot with combat bonuses **+ math lifelines** (hint/50-50/show-step/skip/+time); gear blueprints unlock | mastery persists across runs; lifelines work per input type |
| **M5 — theme, art, i18n** | Make it a game, not a prototype | Romanian-folklore skin (Zmeu/Balaur/Muma Pădurii bosses, hero trio); pixel art via atlas-recipe pipeline (placeholders until here); RO/EN i18n complete incl. word problems & teach cards | RO/EN toggle; art review; end-to-end playtest |

Sequencing note: M1 uses a hardcoded problem so the *loop* is proven before the *content* seam (M2).
Grades V–VIII generators come after M5 (or as an M2.5) once I–IV content is validated.

## Progress

| Milestone | State | Commit |
|---|---|---|
| Design (grill-me + research) | ✅ settled 2026-07-21 | `3fff5e0` |
| M0 scaffold | ✅ **done, controller-verified** (Sonnet executor) | `db20d58` (+corpus `a93e96c`) |
| M1 turn-combat loop | ✅ **done, controller-verified** (Sonnet executor + opus finished `main.ts`) | `2101098` (+corpus `f67388c`) |
| M2 problem-generator seam (I–IV) | ✅ **done, controller-verified** (Sonnet executor) | `97f5c97` (+corpus `fa696ba`) |
| M3 map & runs | ✅ **done, controller-verified** (Sonnet executor) | `273b3c0` (+corpus `16c66a9`) |
| M3.1 spatial map + RO diacritics font | ✅ **done, controller-verified** (opus font + Sonnet map) | see M3.1 below |
| M3.2–M3.4 map polish (scenic → top-down 2.5D → Farm/Citadel terrain) | ✅ **done, in-browser verified** (opus inline) | `fbc475e` (latest) |
| M4 progression & loot | 🟡 starting | — |
| M5 theme, art, i18n | ⬜ not started | — |

## M0 — how it went (2026-07-21)
Dispatched fresh to a **Sonnet executor** (brief: `2026-07-21-mathquest-M0-scaffold.md`), templated on
`games/hollow/*`. Controller (opus) verified independently (not just trusting the report): re-ran the
gate green, confirmed `git status` touched only allowed paths, grepped clean of `Math.random`/`Date.now`
and stray hex, and read the bootstrap to confirm the determinism seam is **real** (uses `createRng`/
`World`/`Scheduler` from `@engine/core`, a real system mutating a real entity; the test asserts matching
RNG streams, not a weak stub).
- **Shape delivered:** `games/mathquest/{sim-core, client}`; `bootstrapMathquestSim({seed})` →
  `{world, scheduler, rng, step(), getSnapshot()}`; Web-Worker (20 Hz pacing) → `{tick}` snapshot →
  Canvas2D `@engine/ui` render of the title + live tick. `npm run mathquest` on **:5176**.
- **Palette:** `MATE_PAL` (32 EDG role names → hand-tuned Resurrect-64) + colocated integrity test;
  `engine/core/src/render/palette.test.ts` gained a `mathquest`→Resurrect-64 scope (the one engine edit).
- **Executor deviations (accepted):** forced `createRenderer(..., {backend:"canvas2d"})` (no WebGPU adapter
  in this sandbox — matches the known constraint); added `wgsl.d.ts` ambient decls (Hollow has the same —
  `@engine/core` barrel transitively imports `*.wgsl?raw`); bootstrap wrapper named `step()` per brief.
- **Not self-verifiable:** the browser visual (`npm run mathquest` on :5176) — **user eyeballs it**.
- Verify gate: `npm run typecheck` (19/19), `@mathquest/sim-core` (3), `@mathquest/client` (4),
  `@engine/core` palette test (10) — all green.

**Next: M1 — turn-combat loop** (one hardcoded problem, end-to-end). See milestone table above.

## M1 — how it went (2026-07-21)
Dispatched to a **Sonnet executor** (brief: `2026-07-21-mathquest-M1-combat-loop.md`). The user
**paused mid-run**; on resume the controller (opus) found the executor had been stopped right at
"write main.ts" — everything else was complete and typechecking, so the controller **salvaged** the
partial (≈730 lines, sim-core 14 tests green, `combat-screen.ts`/worker/theme/strings done) and
**finished the one missing file, `main.ts`, inline** (renderer + UISurface + single InputDispatcher +
focus-bridged a11y mirror + typed-answer buffer + physical-keyboard entry, mirroring Citadel's
`main/hud-panels.ts` + `main/input.ts` stripped to one UI root).
- **Combat model (sim-core):** deterministic, event-driven — state changes ONLY in
  `chooseAction`/`submitAnswer`, never in `step()`. `rng.fork("problem")` (a+b, operands 2..9) +
  `rng.fork("intent")` (5..8). Warrior 30 HP vs "Zmeu pui" 24 HP; attack 8 / heal 8 / shield 8 block.
  Killing blow skips the enemy turn; block absorbs-then-consumes; `Problem.answer` NEVER crosses the
  snapshot boundary (only `prompt`). Verified by reading the code, not just the green tests.
- **Client:** combat screen via `@engine/ui` (enemy/warrior HP bars painted in a `drawBars` pass,
  intent telegraph, Attack/Heal/Shield menu, math prompt + numeric keypad, result cue, win/lose banner
  + restart). Canvas2D backend (no WebGPU adapter here). Worker command channel:
  `init`/`choose-action`/`submit-answer` → `ready`/`snapshot`.
- **Known-minor (defer to M2 polish):** single `last` result field ⇒ on a non-killing action the
  enemy-hit cue overwrites the "Hit! −8"/"Fizzle!" cue (player's own action text only shows on a kill).
  HP-bar change still conveys success/whiff, so the loop reads fine. Fix later by splitting `last`
  into player-result + enemy-result.
- **Not self-verifiable:** the browser playtest (`npm run mathquest` :5176) — **user plays it**.
- Verify gate: `npm run typecheck` (19/19), `@mathquest/sim-core` (14), `@mathquest/client` (4),
  `@engine/core` palette (10) — all green; grep clean of `Math.random`/`Date.now` in code.

**Next: M2 — problem-generator seam (grades I–IV).** Replace the hardcoded `generateProblem` with a
`ProblemGenerator` keyed by (grade, topic); add mixed input (typed + MC w/ distractors), teach-card +
re-queue. Also fold in the M1 cue-sequencing polish.

## M2 — how it went (2026-07-22)
Dispatched to a **Sonnet executor** (brief: `2026-07-22-mathquest-M2-problem-generators.md`); ran to
completion in the background, all green. Controller (opus) verified independently: re-ran the gate,
**read `generators.ts` and recomputed the math** (subtraction draws `b∈[min,a]` ⇒ never negative;
multiplication grade-branched, grade 1 throws + is excluded by `TOPICS_FOR_GRADE`; comparison computes
the true relation and the shuffled `answerIndex` indexing is correct), and read the bootstrap to confirm
teach/re-queue/no-leak are real (`toProblemView` strips `answer`/`answerIndex`; `nextProblem` pops the
FIFO re-queue before generating; `acknowledgeTeach` runs the deferred enemy turn).
- **Seam:** `GENERATORS: Record<MathTopic, (rng,grade)=>Problem>` + `TOPICS_FOR_GRADE`. 4 topics —
  addition/subtraction/multiplication (typed) + comparison (choice `<`/`>`/`=`), difficulty-scaled per
  grade via `ADD_SUB_RANGE`/`MULT_G*` constants. **Deferred (not built):** word-problems, fractions,
  geometry, grades V–VIII.
- **Mixed input:** internal `Problem` (carries answer) → `ProblemView` (no answer) crosses the boundary;
  client submits `AnswerResponse = {kind:"typed",value} | {kind:"choice",index}`.
- **Teach-card + re-queue:** new `"teach"` phase; wrong ⇒ fizzle + push problem to FIFO `requeue` +
  show worked-step `teach`; `acknowledgeTeach()` then runs the enemy turn; `nextProblem` pops requeue.
- **Cue split (M1 nit fixed):** `lastPlayer` + `lastEnemy` both on the snapshot, rendered as 2 lines.
- **Grade selector** (I/II/III/IV) in the client posts `set-grade`; `MAX_ANSWER_DIGITS` bumped 3→5.
- **Contract:** worker inbound `init`/`choose-action`/`submit-answer{response}`/`acknowledge-teach`/
  `set-grade`; outbound `ready`/`snapshot`. `CombatSnapshot`: phase, warrior, enemy, `problem:
  ProblemView|null`, grade, `teach:string|null`, turn, lastPlayer, lastEnemy.
- **Accepted executor deviations:** comparison prompt is `"Compară: {a} și {b}"` (RO); grade-4 add/sub
  range `100–4999` (keeps `2·max ≤ 9999`, no clamp); `setGrade` has no phase restriction. All in spirit.
- **Not self-verifiable:** browser playtest (:5176) — **user plays it**.
- Verify gate: typecheck 19/19; `@mathquest/sim-core` **71**; `@mathquest/client` **17**; engine palette
  **10** — all green; determinism/hex sweep clean.

**Next: M3 — map & runs.** Branching node map (Slay-the-Spire / Mewgenics) with easy/hard bifurcations;
a run = ~12 nodes + boss; soft-roguelike wipe → home. Combat becomes one node type; hard branches raise
the grade/enemy. (Then M4 progression/loot, M5 folklore art + RO/EN.)

## M3 — how it went (2026-07-22)
Dispatched to a **Sonnet executor** (brief: `2026-07-22-mathquest-M3-map-and-runs.md`); ran to
completion in the background. Controller (opus) verified independently: re-ran the gate, **read
`run/map.ts` and confirmed a genuinely connected DAG** (every non-boss node ≥1 outgoing; a cover pass
gives every row-r+1 node ≥1 incoming; last row → boss ⇒ boss reachable from every start), read the run
driver (`chooseNode`/`resolveCombatIfOver`/`newRun` — HP persists via `combat.result().warriorHp`,
boss-win→`run_won`, wipe→`run_lost`), and confirmed the tests are strong (map: multi-seed BFS
reachability + incoming-edge + escalation invariants; run: a telegraph-aware **winnability search over
300 seeds** + HP-persist + careless-loses).
- **Refactor:** combat extracted to `combat/combat.ts` `createCombat(opts): Combat` (M1/M2 behavior +
  the no-answer-leak invariant preserved; combat tests moved to `combat/combat.test.ts`).
- **Run layer:** `run/map.ts` `generateMap` (6 rows ×2–3 + boss, ≈12–14 nodes, ≥1 elite fork, **2**
  rest rows, grades escalate `[1,2,2,3,3,4]`, elite +1, boss 4), `run/enemies.ts` archetypes, and a run
  state machine in `sim-bootstrap.ts`. Warrior HP persists across fights (`WARRIOR_MAX_HP=30`); rest
  heals `REST_HEAL=20`; wipe→home; boss→win; `newRun()` regenerates + resets.
- **Snapshot:** `getSnapshot()` now returns a `GameSnapshot` discriminated by `mode`
  (`map`/`combat`/`run_won`/`run_lost`); `combat` mode nests the unchanged M2 `CombatSnapshot`.
- **Client:** `main.ts` swaps the rendered root by `mode`; new `ui/map-screen.ts` (node grid, reachable
  enabled, colored type chips via a `drawChips` pass, click→`choose-node`) + `ui/run-over-screen.ts`
  (banner + New-run). Combat screen reused; **manual grade selector removed** (grade now from the node).
- **Accepted executor deviations (all sound):** (1) **retuned enemy balance** — the brief's example
  numbers (elite 34/boss 44) are *mathematically unwinnable* given locked warrior-30/attack-8 (a
  non-lethal attack always eats a full return hit); executor brute-forced (0/300 wins) then retuned to
  combat 24 / elite 26 / boss 32 HP, intents ~5–8, `REST_HEAL=20`, **2** rest rows, and added
  winnability tests (300/300 skilled wins, careless reliably loses). (2) **No drawn map edges** —
  `@engine/ui` is flexbox-only (no absolute positioning), so reachability is shown via enabled/disabled
  + row/col layout (brief allowed this fallback). (3) combat screen's own won/lost banner is now dead
  code (the run driver resolves fights atomically) — left in, `restart()` posts `new-run`.
- **Not self-verifiable:** browser playtest (:5176) — **user plays it**.
- Verify gate: typecheck 19/19; `@mathquest/sim-core` **142**; `@mathquest/client` **27**; engine
  palette **10** — all green; determinism/hex sweep clean.

## M3.1 — spatial map + Romanian diacritics (2026-07-22, from user playtest feedback)
User playtested M3 and asked for (a) Romanian diacritic support (font dropped "Compară"→"Compar",
"și"→"i") and (b) a Mewgenics-style progressive/spatial map (attached a Mewgenics "The Alley" map).
- **Diacritics (opus, engine change):** the vendored UNSCII `.hex` already carries every Romanian
  glyph incl. the CORRECT comma-below ș/ț (U+0218..U+021B, not cedilla). Extended
  `engine/ui/tools/hex-to-glyphs.ts` + `fonts.ts` `EXTRA_CODEPOINTS`, regenerated `unscii8/16.ts`
  (95→**113** glyphs). **Fixed a latent `bakeFontAtlas` bug** it surfaced — frames were named from
  `FIRST_CODEPOINT + i` (contiguous-range assumption), wrong once non-ASCII codepoints append; now
  named from the actual char (test guards it). Commit `8a0999a`.
- **Symbols (opus, engine change):** the font also lacked `×` (so `3 × 4` rendered `3 ? 4`!) and the
  map/combat glyphs. Added a symbol set present in UNSCII — `× † ★ ♥ ♠ ✓ ◆ ←` — and swapped the
  MateQuest strings/map for the 3 glyphs UNSCII does NOT have (⚔→†, ☾→♥, ☠→♠) + 🛡→◆, ⌫→←.
- **Spatial map (Sonnet executor, client-only):** rewrote `ui/map-screen.ts` from flexbox buttons to a
  CUSTOM-DRAWN screen (`UISurface.rect` + `drawText`/`measureText`): nodes at absolute positions on a
  vertical winding trail (row 0 bottom → boss top, `sin(row)` phase offset), dotted connector trails
  (brightened from the current node), type-colored markers with glyph + `G{grade}`, reachable/visited/
  locked styling, and a party token that MOVES as you advance. `main.ts` is mode-aware: map mode uses a
  custom `nodeAt` hit-test (+ `1..9`/Enter keyboard) and sets the widget dispatcher root to `null`;
  combat/run-over keep their widget tree + a11y mirror. **Deviation (sound):** `run.currentId` is null
  on the map (only set inside a fight), so the token position derives as `currentId ?? last(visitedIds)`.
  **Known follow-up:** no a11y DOM mirror for the spatial map yet (combat/run-over still have one).
  Interface: `createMapScreen(): { render(surface,run,hoverId), nodeAt(x,y), reachableOrder(run) }`.
- Verify gate: `@engine/ui` **166**; typecheck 19/19; `@mathquest/client` **26**; `@mathquest/sim-core`
  **142**; palette **10** — all green. Browser playtest is the user's.

## M3.2 — scenic horizontal map + RO default (2026-07-22, designer pass, opus inline)
User asked (with a Mewgenics "The Alley" reference) to make the map more appealing: horizontal path,
decorative scenery, zone design, emphasis on roads. Did a design brainstorm + web research (StS/FTL
maps are deliberately abstract "no physical space"; the appeal upgrade is a sense of PLACE — a road
that leads the eye through themed regions), then grilled one call (theme/vibe → **cozy folklore
journey**) and built it INLINE (not dispatched).
- **`ui/map-screen.ts` rewritten** to a HORIZONTAL journey (left→right; row→column, col→vertical, with
  a `sin` per-column wave). Columns grouped into **4 zones** drawn as tinted sky+ground bands with a
  name banner: **Pădurea Adâncă → Satul → Munții Carpați → Bârlogul Zmeului**. Each zone has themed
  **pixel-art scenery** drawn from Resurrect-64 rects (pines / cottages / snowy peaks / the Zmeu's
  lair with glowing eyes), a **dirt ROAD ribbon** (outline + fill + dashed centerline, brightened
  along reachable routes), **signpost-style node markers** (post + plate + glyph + class numeral), and
  a **hero token** (little figure w/ sword) that walks the road. Public interface unchanged
  (`render`/`nodeAt`/`reachableOrder`) so `main.ts` needed no edit. Layout stays a pure function of
  `RunView` (deterministic scatter via an integer hash, no `Math.random`).
- **Romanian default:** `strings.ts` fully translated to RO (Atacă/Vindecă/Scut, Alege-ți drumul,
  Lovitură!/Ratat!, Clasa: N, etc.). Combat-screen tests made locale-robust (assert via `STRINGS.*`,
  not EN literals).
- Verify: typecheck 19/19; `@mathquest/client` **26**; `@mathquest/sim-core` **142**; `@engine/ui`
  **166**; palette **10** — all green. Browser playtest is the user's.
- **Known follow-ups:** map still has no a11y DOM mirror (1..9/Enter keyboard only); scenery is
  procedurally-placed pixel art (M5 can upgrade to authored atlas art).

## M3.3 — full-screen map + pan/scroll camera + rich Canvas2D textures (2026-07-22, opus inline)
User (with a screenshot) asked to make the map full-screen, add in-game scrolling, and richer
"realistic" textures / continuous decorated roads. Grilled two calls: **texture approach → rich
Canvas2D** (user then explicitly said **no WebGPU — device compatibility**, so no shaders) and
**scrolling → build now**.
- **Full-screen:** the render pipeline draws UI in CSS px = the full canvas; the map had hardcoded
  960×540. Now `map-screen.render(surface, run, hover, viewW, viewH)` takes the live
  `canvas.clientWidth/clientHeight` and lays out against it. World is WIDER than the viewport
  (`COLUMN_SPACING=260`) ⇒ horizontal scroll.
- **Pan/scroll camera** (owned by map-screen): auto-centers on the hero's node on each advance, then
  the player pans freely — **drag** (press→drag past a 5px threshold = pan; a press that doesn't =
  node click on release), **mouse wheel** (→ horizontal), **arrow keys**; clamped to the world.
  New interface: `render(…viewW,viewH)`, `nodeAtScreen(sx,sy)` (camera-aware), `panBy(dx,dy)`,
  `reachableOrder`. `main.ts` wires it; HUD (title/HP/legend/‹›scroll hints) stays fixed screen-space.
- **Rich textures (Canvas2D only, palette-pure via alpha over palette colors):** layered-alpha sky
  gradient (haze toward horizon), a darker ground stratum, grass-tuft + pebble ground texture, soft
  **biome-blend seams** between zones (linear-alpha crossfade), and a **continuous decorated road**
  (finer stamps + edge + dashed centerline + pebbles + **flowers along the verge** in palette accents).
  Perf: everything culled to the visible x-range.
- Determinism: layout + all scatter are a pure function of `RunView` + an integer hash (no rng).
- Verify: typecheck 19/19; `@mathquest/client` **26**; `@mathquest/sim-core` **142**; `@engine/ui`
  **166**; palette **10** — all green; no raw hex. Browser playtest is the user's.
- **Known follow-ups:** still no a11y mirror for the spatial map (drag + 1..9/Enter/arrows only);
  vertical scroll is a no-op (world height = viewport; journey is horizontal); scenery is procedural
  pixel-art (authored atlas art remains a possible M5 upgrade).

## M3.4 — top-down 2.5D map + Farm/Citadel-style terrain (2026-07-23, opus inline, several passes)
User iterated on the map look across a session (all `ui/map-screen.ts`, client-only, opus inline,
each pass verified in-browser via the agent-browser MCP + green gate). Arc:
1. **Solid colours + faked depth** (`8ba5b40`): dropped alpha-washed zones for opaque Resurrect-64
   fills; adapted Farm's per-tile ground-noise + Citadel's hillshade banding to the rect-only painter;
   SE drop-shadow skirts under nodes/scenery; solid stage boxes (state via border+darken, not
   transparency); footpath as overlapping stamps not concatenated squares.
2. **Projection decision → top-down 2.5D** (`36ff94f`): built a **projection-study artifact** (top-down
   vs isometric, same map, in-palette) — user chose **top-down** (iso fights our axis-aligned-rect-only
   `UISurface`; no polygon/diamond fills). Rewrote to one flat top-down ground plane; footpath lies ON
   the terrain and winds; scenery are **upright billboard props** with shadows, depth-sorted by baseY.
3. **Zone-specific paths** (`15da63f`): forest **dirt** / village **cobble** / mountains **wooden
   boardwalk (planks+rails)** / lair **obsidian+embers**, chosen per stamp by the zone the trail
   crosses. Plus floor detail + smoother terrain.
4. **Artifact-noise fix** (`2cbb7fa`): removed dense/high-contrast floor flecks (village horizontal
   "tilled rows", 10%-of-tiles red lair embers, 70%-of-stamps red on the obsidian ROAD) that read as
   random pixels; every path now lays a SOLID fill first so diagonals are clean ribbons.
5. **Terrain-generation research pass** (`1715b08`): applied Red Blob Games / Quilez / Jiménez /
   noiseposti.ng — **domain-warped** height, a second **moisture** noise field, **wavy zone seams**,
   IGN dithering (later dropped).
6. **Compose like Farm/Citadel** (`fbc475e`, current): user said it was "too random-pixelated". Read
   the sibling games' actual terrain (Farm's ~5%-sparse grass-tile flecks; Citadel's `landformFill` =
   one hillshade-banded tone per cell + `ditherClusters` = ~1 chunky 2–3px speck). Rewrote the ground
   to match: **one solid banded tone per 24px cell (base dominates) + 1 (rarely 2) slope-biased chunky
   specks** — calm broad regions, not a dither field. Kept domain-warp + moisture + wavy seams.
- **Terrain technique is now documented** — see the composition notes above; the model is "banded tone
  + sparse chunky specks", NOT per-tile dithering. Tunable dials: `GTILE` (24), `BAND_T` (0.13),
  `SPECK_RANGE`, `MOIST_WEIGHT`, `BOUNDARY_WAVE`, `WARP_STRENGTH`.
- **Perf note (carry to M5/anytime):** the ground is built ONCE and cached (keyed on map+viewport),
  replayed per frame. The engine-idiomatic fix (Farm/Citadel bake to an offscreen static layer via
  `renderer.bakeStaticLayer(sprites, w, h, decorate)`) is NOT wired here — `UISurface` exposes no raw
  ctx / image-blit and the map uses its own screen-space camera, not the world `Camera2D`. Baking is
  the lever if a low-end device ever struggles (would need either the world camera or a new
  `UISurface.image()` seam).
- **Known follow-ups:** still no a11y DOM mirror for the spatial map (drag + wheel + 1..9/Enter/arrows
  only); scenery is procedural pixel-art (authored atlas art remains an M5 option).

**Next: M4 — progression & loot.** In-run XP/level-up choice + persistent per-topic mastery (survives
death, gates hard branches, unlocks blueprints) + equipment with combat bonuses AND math lifelines
(hint / 50-50 on MC / show-step / skip / +time). This is where the loot economy the design promised
lands. (Then M5 folklore art + full RO/EN.)

## Open decisions (resolved / carried)
- **Name / package / branch** — ✅ codename *MateQuest*, package `@mathquest/*`, branch `mathquest`
  (RO title *Cetatea Cifrelor*, provisional, in the boot title).
- **Grade order** — I–IV first (recommended), V–VIII after the loop is proven. (Confirm at M2.)
- **Art** — placeholder shapes through M4, real pixel art at M5 (recommended).
