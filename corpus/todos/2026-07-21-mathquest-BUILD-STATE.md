# MateQuest — BUILD STATE / RESUME (live tracker)

status: in-progress (M5 sliced 3 ways; slice 1 folklore theming DONE, controller-verified; next M5 i18n + art)
updated: 2026-07-23 (M5 folklore theming — zone-flavored enemy roster + Făt-Frumos — on branch `mathquest`)

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
| M3.2–M3.4 map polish (scenic → top-down 2.5D → Farm/Citadel terrain) | ✅ **done, in-browser verified** (opus inline) | `fbc475e` |
| M4a in-run progression + loot/equipment (stat bonuses) | ✅ **done, controller-verified** (Sonnet executor) | `8c9f722` (+brief `fcae576`) |
| M4b math lifelines (hint / 50-50 / skip) | ✅ **done, controller-verified in-browser** (Sonnet executor) | `f1a435a` (+corpus `21f40b9`) |
| M4c persistent mastery + gating + blueprints | ✅ **done, controller-verified in-browser** (Sonnet executor) | `3566037` (+corpus `3beb2e7`) |
| M5 theme, art, i18n | 🔶 **sliced 3 ways; slice 1 (folklore theming) done** | see M5 slice-1 below |
| ↳ M5 slice 1 — folklore theming (zone enemy roster + Făt-Frumos) | ✅ **done, controller-verified in-browser** (Sonnet executor) | `7990f67` (+corpus `9bc86b6`) |
| ↳ M5 slice 2 — RO/EN i18n toggle | ⬜ not started | — |
| ↳ M5 slice 3 — authored pixel art (needs a UISurface image/blit seam first) | ⬜ not started | — |

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

## M4a — how it went (2026-07-23, Sonnet executor, controller-verified)
M4 was sliced into **M4a** (in-run XP/level-up + loot/equipment stat bonuses), **M4b** (math
lifelines), **M4c** (persistent mastery). Brief: `2026-07-23-mathquest-M4a-progression-loot.md`.
Dispatched to a Sonnet executor; controller (opus) verified independently — re-ran the gate, READ
`progression.ts`/`loot.ts`/`combat.ts`/`sim-bootstrap.ts` to confirm determinism (new `levelup`/`loot`
forks added strictly AFTER the existing `map`/`run:${n}`/`node:${id}` forks ⇒ fork order preserved),
the answer non-leak (`toItemView` mirrors `toProblemView`; combat still narrows via `toProblemView`),
and the `proceed()` sequencing — then **played a full run in-browser** (drove two fights via
canvas-coord clicks + physical-keyboard answers).
- **Mechanics (locked in the brief):** `xpForSolve(grade)=grade`; `xpToNext(L)=5*L`; level-up offers 2
  of 4 upgrades (hp+6/atk+2/block+3/heal+3), one pick; loot after each non-boss win offers 3 distinct
  items (tier-weighted common/better pools) with flat `StatBonuses`, or skip. `CombatOpts.mods`
  (defaults `ZERO_STATS` ⇒ M1–M3 byte-identical); `CombatResult.xpEarned`. Flow: win → `level_up`
  (once per threshold crossed) → boss `run_won` | else `loot` → `map`. All resets on `newRun()`.
- **Snapshot:** `RunView` +`level/xp/xpToNext/stats/inventory`; `GameSnapshot` +`level_up`/`loot`
  variants; worker +`choose-level-up`/`choose-loot`; two new widget-tree screens (a11y-mirrored) +
  HUD readout (Nivel/XP + non-zero stats).
- **Verified in-browser:** XP scales by grade (grade-1 fight +3, grade-2 fight +6 → crossed 5 → Nivel
  2, XP 4/10), level-up + loot screens render (RO/palette-clean), stat bonuses fold in + show in HUD
  (+10 PS/+2 Blocaj), maxHp bonus raises max + heals, win→level_up→loot→map sequencing correct, skip
  works. Gate: typecheck 19/19; sim-core **179**; client **26**; palette **10**.
- **Known-minor (defer):** level-up card desc text wraps to 2 lines (cosmetic); loot "better pool"
  skew test is sampled (300 seeds), not exact.

## M4b — how it went (2026-07-23, Sonnet executor, controller-verified in-browser)
Brief: `2026-07-23-mathquest-M4b-lifelines.md`. Dispatched to a Sonnet executor; controller (opus)
verified independently — re-ran the gate, READ `combat.ts`/`sim-bootstrap.ts`/`loot.ts` to confirm the
two load-bearing invariants, then **played it in-browser** (drove all three lifelines with the
agent-browser MCP).
- **Mechanics (locked in the brief):** three consumables spent during `await_answer` on the CURRENT
  problem. **hint** = reveal the problem's existing `teach` worked step (still solve it, still earn XP;
  works on any problem). **fifty** = disable ONE wrong choice on a comparison (choice) problem (3→2);
  no-op + no charge on a typed problem. **skip** = auto-land the pending action as if correct but for
  **0 XP** (a skip-Attack that kills ends the fight with no enemy turn). Charges start from a kit
  (`STARTING_LIFELINES = {hint:1,fifty:1,skip:1}`) AND are topped up by 3 new pure-lifeline loot items
  (`pergament-indicii`+2 hint, `ochi-ager`+1 fifty in COMMON; `clopotel-fermecat`+1 skip in BETTER).
  All reset on `newRun()`.
- **Seam:** `run/lifelines.ts` (`LifelineKind`/`LifelineCharges`/`STARTING_LIFELINES`); `Combat.useLifeline(kind):boolean`
  (spends a charge only when it returns true); `CombatSnapshot.hint:string|null`; choice `ProblemView`
  gains `disabledChoices:readonly number[]` (empty in the base case); `Item.lifeline?:{kind,charges}`;
  driver `useLifeline(kind)` command + `RunView.lifelines`; worker `use-lifeline`; combat screen
  lifeline bar (3 build-once buttons, per-kind disable logic) + hint line + choice greying via
  `state:"disabled"`.
- **Determinism:** the new fork is `rng.fork("fifty")` on the COMBAT rng (inside `useLifeline`), NOT a
  driver-level fork — the driver fork order (`map`/`run:${n}`/`node:${id}`/`levelup`/`loot`) is
  untouched. Zero-behaviour-change guarantee: a fight that never uses a lifeline has `disabledChoices:[]`
  + `hint:null` throughout and never consumes the `"fifty"` fork ⇒ byte-identical to M4a (all prior
  tests pass unchanged).
- **Non-leak:** `disabledChoices` lists only NON-answer indices; `toProblemView` still never emits
  `answer`/`answerIndex`. Verified in-browser: "Compară: 10 și 7" → 50-50 greyed **`=`** (a wrong
  option), leaving `<`/`>` — the answer `>` preserved.
- **Verified in-browser (agent-browser MCP, mirror-click drives the real `onActivate` command path):**
  lifeline bar shows correct labels+counts; 50-50 disabled on a typed problem, ENABLED on a choice
  problem; **hint** revealed "Indiciu: 5 - 2 = 3" + went (1)→(0)+disabled; **skip** landed the Attack
  (Zmeu pui 24→16 HP) with no solve; **50-50** greyed exactly one wrong choice + went (1)→(0). (The
  MCP viewport is 577px so the lifeline bar sits below the fold — read it via `getImageData` + an
  overlay-canvas crop; screenshots alone miss below-fold canvas rows.)
- **Gate:** typecheck 19/19; `@mathquest/sim-core` **214**; `@mathquest/client` **39**; palette **10**
  — all green; determinism/hex sweep clean; git scope = `games/mathquest/**` only.
- **Accepted executor deviations (all sound, documented in the tests):** widened `loot.test.ts`'s
  "every offer carries a non-empty bonus" to "non-empty bonus OR a lifeline grant" (pure-lifeline items
  have `bonus:{}`); bumped two `combat-screen.test.ts` button-count assertions (the lifeline bar is now
  always in the `await_answer` tree). Loot GRANTING lifelines is covered by unit tests + a driver code
  read (offering a lifeline item in-browser is probabilistic), not eyeballed.

## M4c — how it went (2026-07-23, Sonnet executor, controller-verified in-browser)
Brief: `2026-07-23-mathquest-M4c-persistent-mastery.md`. The game's FIRST cross-run persistence.
Dispatched to a Sonnet executor; controller (opus) verified independently — re-ran the gate, READ
`run/mastery.ts`/`sim-bootstrap.ts`/`combat.ts` for the load-bearing invariants, then **played it
in-browser incl. a localStorage round-trip across a page reload** (the real persistence proof).
- **The load-bearing architecture:** the sim runs in a **Web Worker, which has NO `localStorage`**, so
  the **main thread owns persistence** — `main.ts` reads `localStorage[MASTERY_STORAGE_KEY]` →
  `parseMasteryStore` → posts `init {seed, mastery}`; the sim echoes `RunView.mastery` in every
  snapshot; `main.ts` writes it back on change (try/catch, private-mode-safe). The sim/worker never
  touch storage/DOM. (Matches Citadel/Farm's main-thread-only localStorage pattern.)
- **Mechanics (locked in the brief):** persistent `MasteryStore {version, topics:Record<MathTopic,
  {correct,attempts}>, blueprints:string[]}` (v1, key `mathquest.mastery.v1`). Per-topic tiers at
  correct-solve counts **[5,15,30]** → tier 0..3; `overallMasteryTier` (0..12). Combat reports
  `CombatResult.topicOutcomes` (attempts on any answer, correct on right; **skip** adds nothing); the
  driver `foldTopicOutcomes` on EVERY fight end (win OR loss — mastery survives death) BEFORE the
  loss-return. **Elite gate:** `generateMap(rng,{eliteUnlocked})` — elite (hard fork) only generates
  when `overallMasteryTier >= ELITE_UNLOCK_TIER(2)`; default `true` keeps `map.test.ts` byte-identical;
  the map is always a valid DAG (gate at GENERATION, never soft-locks). **Blueprints:** reaching a
  topic's tier 2 unlocks a persistent gear blueprint (4 distinct RO items, one per topic — incl. a
  lifeline-granting one for comparison) that widens `rollLoot`'s BETTER pool for future runs
  (`rollLoot(rng,tier,extraPool=[])`). `newRun()` does NOT reset mastery.
- **Determinism:** NO new fork — mastery changes fork INPUTS (`generateMap`'s `eliteUnlocked`,
  `rollLoot`'s `extraPool`), never the sequence. Contract is now **(seed, mastery, commands)**.
- **Verified in-browser:** (1) fresh player (cleared save) → HUD "Măiestrie: 0/12" + the seed-1 map's
  ★ elite is ABSENT (gate closed); (2) **write path** — solved 1 subtraction + 2 comparisons, won →
  loot; `localStorage` held EXACTLY `{subtraction:1/1, comparison:2/2, …}`; (3) **load path across a
  page reload** — seeded a high store (overall 8), reloaded → HUD "Măiestrie: 8/12" AND the ★ elite
  node now PRESENT on the same seed-1 map (mastery drives map gen end-to-end). Run-over per-topic
  readout + blueprint-in-loot are covered by the new tests (surfacing already-proven data).
- **Gate:** typecheck 19/19; `@mathquest/sim-core` **267**; `@mathquest/client` **41**; palette **10**
  — all green; determinism/hex sweep clean; git scope `games/mathquest/**` only.
- **Accepted executor deviations:** (1) fixed the ONE pre-existing bootstrap test that assumed an elite
  is always present — now boots with an explicit high-mastery store (empty store closes the gate, the
  intended new behavior), commented honestly; (2) changed 6 combat `toEqual(result())` sites to
  `toMatchObject` (still exact on outcome/warriorHp/xpEarned) since `CombatResult` gained
  `topicOutcomes`; (3) RO-ified the pre-existing EN run-over summary literal via `STRINGS.runSummary`.

**M4 is COMPLETE** (M4a stat bonuses + M4b lifelines + M4c persistent mastery).

## M5 — the last milestone, SLICED 3 ways (user picked theming first, 2026-07-23)
M5 (theme, art, i18n) is large + multi-natured, so it's sliced like M4: **(1) folklore theming**
(content, done), **(2) RO/EN i18n toggle** (i18n plumbing), **(3) authored pixel art** (the big art
lift — needs a new image/blit seam in the Canvas2D `UISurface`, which doesn't exist yet; MateQuest's
map/combat are rect + font-atlas only). Order chosen by the user.

### M5 slice 1 — folklore theming — how it went (2026-07-23, Sonnet executor, controller-verified in-browser)
Brief: `2026-07-23-mathquest-M5-folklore-theming.md`. Made the enemy roster vary by the map's 4 zones
with authentic RO-folklore names + epithets, and named the hero **Făt-Frumos** — **flavor only, balance
byte-identical**. Controller (opus) verified: re-ran the gate, READ `enemies.ts`/`map.ts` to confirm
the balance-preservation + zone-mapping invariants, then played a fight in-browser.
- **Zone is now a sim concept:** `run/map.ts` gained `Zone = 0|1|2|3` + `zoneForRow(row)`
  (`row<2?0:<4?1:<6?2:3` — reproduces the client's rows→thirds+boss split EXACTLY so the enemy matches
  the zone you're standing in) + `MapNode.zone` (set for every node; boss row → zone 3).
- **Roster (`run/enemies.ts`):** `ENEMY_ARCHETYPES` (the STATS) unchanged; new `ROSTER` name/epithet
  table keyed by (kind × zone) + `enemyFor(kind, zone)` that returns `{...ENEMY_ARCHETYPES[kind], name,
  title}` — stats ALWAYS spread from the base archetype, so hp/intent are provably identical (an
  exhaustive stat-equality test asserts this for every (kind, zone)). Roster: combat forest **Zmeu
  pui** / village **Strigoi** / mountains **Căpcăun**; elite forest **Muma Pădurii** / village
  **Vârcolac** / mountains **Balaur**; boss (any zone) **Zmeu bătrân**. Each has a short RO epithet.
  `EnemyArchetype`/`EnemyView` gained `title`; `chooseNode` now calls `enemyFor(node.type, node.zone)`.
- **Client:** the hardcoded `"Warrior"` combat label → `STRINGS.heroName = "Făt-Frumos"`; a muted
  epithet line renders under the enemy name from `snapshot.enemy.title`.
- **Determinism:** NO new fork — name/title/zone are pure functions of (kind, row); balance/winnability
  tests pass UNCHANGED (stats identical).
- **Verified in-browser:** forest fight showed "**Zmeu pui**" + epithet "**puiul balaurului**" + hero
  "**Făt-Frumos**" — the new `title` field + hero name cross the boundary and render. Cross-zone variety
  (village/mountains/boss) + elite theming are exhaustively unit-tested (driver-theming test across
  zones 0/1/2 + boss); elites need the M4c mastery gate open to appear in a real map, so they're
  covered by tests not eyeballed.
- **Gate:** typecheck 19/19; `@mathquest/sim-core` **280**; `@mathquest/client` **43**; palette **10**
  — all green; determinism/hex sweep clean; scope `games/mathquest/**` only.
- **Accepted executor updates (honest):** the one bootstrap test asserting an elite is "Balaur" now
  derives the expected name from the chosen elite node's ZONE via `enemyFor` (not weakened); `MapNode`
  `toEqual`s got `zone` added; enemy `toEqual`s got `title`; a `chooseNodeFresh` test helper observes a
  target fight in-progress.

**Next: M5 slice 2 — RO/EN i18n toggle.** Make `client/src/strings.ts` a locale-aware lookup (RO
default + EN), add an in-game toggle (button/hotkey) persisted to localStorage (reuse the M4c
main-thread storage pattern), and translate the sim-side RO content (generator `prompt`/`teach` text in
`combat/generators.ts`, enemy names/epithets in `run/enemies.ts`) — that sim content will need a
locale seam too (the sim gets a locale, or the client maps ids→strings). Then M5 slice 3 (pixel art).
Also still outstanding post-M5: grades V–VIII generators + "unlock NEW problem types" via mastery.

## Open decisions (resolved / carried)
- **Name / package / branch** — ✅ codename *MateQuest*, package `@mathquest/*`, branch `mathquest`
  (RO title *Cetatea Cifrelor*, provisional, in the boot title).
- **Grade order** — I–IV first (recommended), V–VIII after the loop is proven. (Confirm at M2.)
- **Art** — placeholder shapes through M4, real pixel art at M5 (recommended).
