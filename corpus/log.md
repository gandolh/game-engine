# Corpus Log

Append-only chronological record. Each entry starts with `## [YYYY-MM-DD] <kind> | <title>` so `grep '^## \[' log.md` produces a readable timeline.

**Compaction note (2026-06-13):** entries before 2026-06-13 were collapsed into dated era summaries. Full prose for every trimmed entry is in git history (`git log -p -- corpus/log.md`); each brief's detail lives in [briefs/](briefs/) (done/superseded) and durable synthesis in [wiki/](wiki/). Treat the trimmed git prose as **obsolete** — if an old decision resurfaces and can't be justified from current code + the wiki + the brief, re-derive it rather than trusting the archived narrative.

## [2026-07-01] done | Citadel cozy-pivot — P1 toast copy re-worded + P2 playtest instrumentation

Closed out the two follow-ups filed in [the E/F playtest todo](todos/2026-07-01-citadel-phaseEF-playtest.md).
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

Filed [todo](todos/2026-07-01-farm-ui-all-rendered-in-canvas.md) after a grilling round.
The intended cross-game payoff of Citadel's `@engine/ui` (whose acceptance criterion was
literally "Farm Valley *can* adopt it"). Grounding: Farm's client already renders through
the same dual-backend `RendererLike` (WebGPU + Canvas2D) and that interface already exposes
`beginUI/pushUI/endUI` — Farm just never calls them (all ~16 surfaces are raw DOM). So the
work is **adopt + port + reinvent**, not build-from-scratch. Locked decisions: full one-pass
port; pragmatic hybrid (hidden DOM only for seed text-input + a11y mirror); 5×7 bitmap font
everywhere (icon dependency on the [authored-typography todo](todos/2026-06-30-engine-ui-authored-typography-and-icons.md),
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
([todo](todos/2026-07-01-citadel-phaseEF-playtest.md)): **P1 UX** — cozy-path threat toast
COPY ("caught fire!", "fire spread to a bakery!", "starved POP 0") reads pressure-game and
undercuts the cozy contract even though the MECHANICS are cozy-correct (`cozyThreats:true`
wired at sim-worker.ts:68; `cozy-threats.test.ts` proves fire never razes); **P2 tooling** —
`play.mjs` still can't read HUD (in-canvas) or drive road-connected services (so F's banner
edge isn't scriptable yet). E/F code + gates are green (sim-core 224, client 397, typecheck
clean, determinism MATCH ×3, digest unmoved); the F banner-edge acceptance is the one open
item, gated on a properly-serviced run, not on a code defect.

## [2026-07-01] shipped | Citadel cozy-pivot Phase I — terrain clustering + solvability guarantee

Implemented the [cozy-pivot build order](todos/2026-06-28-citadel-cozy-pivot-BUILD-ORDER.md)
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

Implemented the [cozy-pivot build order](todos/2026-06-28-citadel-cozy-pivot-BUILD-ORDER.md)
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

Implemented the [cozy-pivot build order](todos/2026-06-28-citadel-cozy-pivot-BUILD-ORDER.md)
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
  [the cozy-pivot playtest log todo](todos/2026-07-01-citadel-phaseA-playtest-verification.md).

## [2026-07-01] build | Citadel cozy pivot Phase C — forgiving diegetic cold open (seeded alive core + threats deferred until grown)

Phase C of the [cozy-pivot build order](todos/2026-06-28-citadel-cozy-pivot-BUILD-ORDER.md)
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
  blockers the [Phase A playtest note](todos/2026-07-01-citadel-phaseA-playtest-verification.md)
  flagged. **A `playtest-citadel` pass is the outstanding acceptance step.**

## [2026-07-01] build | Citadel cozy pivot Phase D — threats demoted to recoverable happiness dips (freeze the bite)

Phase D of the [cozy-pivot build order](todos/2026-06-28-citadel-cozy-pivot-BUILD-ORDER.md)
shipped (brief [2026-07-01-citadel-cozy-phaseD-threat-demotion](todos/2026-06-28-citadel-cozy-pivot-BUILD-ORDER.md)),
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

Phase B of the [cozy-pivot build order](todos/2026-06-28-citadel-cozy-pivot-BUILD-ORDER.md)
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
[todos/2026-07-01-citadel-phaseA-playtest-verification.md](todos/2026-07-01-citadel-phaseA-playtest-verification.md).
Corpus-only entry (no code changed in this playtest).

## [2026-06-30] build | Citadel cozy pivot Phase A — per-house diegetic mood/coverage signal (the keystone)

First gameplay phase of the [cozy-pivot build order](todos/2026-06-28-citadel-cozy-pivot-BUILD-ORDER.md)
shipped — the **keystone** that three later phases (B/C/F) read. The sim already computed a
per-house `hasFaith/hasSafety/hasGoodsAccess` in `_computeNeedsFor` and **threw it away**, keeping
only the town-aggregate coverage ratios; Phase A stops discarding it and makes the town's health
**legible by looking at the houses**, no overlay needed.

- **Sim** ([needs-happiness.ts](../games/citadel/sim-core/src/systems/needs-happiness.ts)): the
  per-house loop now writes `{lacksFaith, lacksSafety, lacksGoods, mood}` back onto each house's
  `BuildingRuntimeState` (keyed by entity id in `state.buildingState`). Per-house `mood` derives
  from the **same** base-40 + `PER_NEED_HAPPINESS` (20) per met need as `_updateHappiness`, but
  evaluated for *that house's* met needs (faith/safety/goods only — the town-aggregate
  food/decree/festival terms stay aggregate). Fields are optional on `BuildingRuntimeState`,
  neutral-defaulted in `freshRuntime()` (all `lacks` true, mood 40) so non-houses read neutral.
  **Determinism preserved**: the aggregate `faithCoverage/safetyCoverage/goodsCoverage/happiness`
  outputs are byte-identical (the `20`→`PER_NEED_HAPPINESS` swap is numerically identical; the
  per-house write is a pure side effect after the aggregate counters increment). No
  `Math.random`/`Date.now`.
- **Snapshot** ([snapshot/index.ts](../games/citadel/sim-core/src/snapshot/index.ts) +
  [sim-bootstrap.ts](../games/citadel/sim-core/src/sim-bootstrap.ts) `getBuildings`): `BuildingSnapshot`
  grows the four read-only fields, populated `rs?.X ?? default` (lacks→true, mood→40).
- **Render** ([citadel-renderer.ts](../games/citadel/client/src/render/citadel-renderer.ts) +
  [citadel-fx.ts](../games/citadel/client/src/render/citadel-fx.ts)): diegetic expression —
  a warm **`EDG.gold` glow pool** under each house scaled by mood (`glowAlphaForMood`, 0 at/below
  mood 40, peak at 80), a **mood sprite-dim** (`houseAlphaForMood`, 1.0 at/above 50 → 0.65 at/below
  10, composed multiplicatively with the placement ease-in alpha), and a mood-gated **hearth-smoke
  wisp** (`houseEmitsHearthSmoke`, mood ≥ 65; cozy cadence 1500ms vs 420ms industrial; `EDG.cream`;
  own per-frame cap `maxHearthEmitters=16` so a town of houses can't swamp the 512-particle pool).
  Glow approach is **constant-warm v1** (not night-modulated) — `pushScene` has no day/night signal
  threaded in, and the existing night light-pool composes over the glow so warmth still reads
  strongest at night. EDG32 guard passed.
- **Built model-routed** (plan-split-dispatch via orchestrate): 2 senior (sim refactor, render) +
  1 junior (snapshot threading) chunks, serial chain. **Scoped 2-finder review** (sim-correctness +
  render/integration) found no correctness bugs; folded in the one worthwhile follow-up — renderer
  **wiring** test coverage (the pure helpers were tested, the push-into-renderer wiring wasn't) plus
  a comment clarifying the smoke-loop `break`→`continue` change.
- **Gates**: `@citadel/sim-core` 184/184, `@citadel/client` 381/381 (incl. EDG32 guard + 3 new
  wiring tests), both workspaces typecheck-clean (only the pre-existing `@engine/core`/`@tool/*`
  WebGPU lib-type noise remains, present on a clean tree). Determinism contract intact (render is
  off-sim; sim change is read-only re-surfacing).
- **Not in-browser-verified yet** (WebGPU can't render headless on this box) — the diegetic glow/dim/
  smoke wants an eyeball pass in the real client, same caveat as the prior render waves. Phase B
  (happiness → productivity floor) is the natural next domino; it reads this per-house mood.

## [2026-06-30] build | Citadel DOM-overlay removal COMPLETE — all GUI in-canvas (surfaces 3–5/5)

The last three DOM UI surfaces migrated onto `@engine/ui`, completing the "all GUI in-game"
goal — **no DOM UI overlays remain over the Citadel world canvas** (branch
`citadel-dom-overlay-removal`). (1) **Occupancy badges** → world-anchored in-canvas chips
([occupancy-badges.ts](../games/citadel/client/src/render/occupancy-badges.ts)), pooled
panel+label headcount chips positioned per-building via a new canvas-relative `tileToCanvasCss`
(the in-canvas surface is canvas-relative, not viewport-relative like the old DOM projector).
(2) **`@engine/ui` gained `slider` + `checkbox`/`toggle` widgets** — the framework had only
panel/box/label/button; these are full retained-mode node kinds (ctors + flex sizing + EDG32
theme tokens + render walk + dispatcher drag/click/nudge + a11y-mirror `<input type=range>` /
`<input type=checkbox>` branches with `aria-valuenow`/`aria-checked`). The node owns its value
(clamp+snap); `onChange` fires on every input. (3) **Minimap** → in-canvas **raw-quad** draw
([minimap.ts](../games/citadel/client/src/ui/minimap.ts)): the closed `renderTree` switch has no
custom-draw escape hatch, so the minimap draws terrain (precomputed face-local quads) + entity
specks + the camera-viewport rect directly via `UISurface.rect` in the host loop, with
`trySeek(x,y,ox,oy)` for click-to-seek (terrain tiles render as small axis-aligned rects not
diamonds — UISurface can't fill diamonds; imperceptible at 168px). (4) **Settings modal** → in-canvas
([settings-modal.ts](../games/citadel/client/src/ui/settings-modal.ts)): tabbed (Display
zoom-slider / Atmosphere toggle-checkboxes / Simulation speed-buttons) via a button-row +
panel-visibility pattern, own dispatcher + `#ui-a11y-settings` mirror, made **fully modal** by the
host (all canvas pointer/wheel swallowed while open). The live **search box was dropped** (no
text-input widget in `@engine/ui`); the `matchesSearch`/`nextTabIndex` helpers stayed.
**Built model-routed (plan-split-dispatch): 1 junior + 3 senior chunks in parallel + controller
integration.** A **scoped 3-finder review caught + fixed 5 real issues**: a module-init crash (the
modal ctor read `camera.zoom` before async boot → guarded with a 1× fallback), the modal not being
fully modal (presses/wheel/keys leaked to the world behind it → full-canvas intercept while open),
the slider thumb overflowing the track at min/max, the mirror slider `<input>` bypassing the node's
snap/clamp, and a checkbox a11y text-node that could grow unboundedly on a label change. **Verified
in real WebGPU** (playtest-citadel + a focused modal probe): minimap + viewport rect, occupancy "N"
chips, modal tabs + working zoom-slider thumb, behind-modal click placed nothing with a build tool
armed, Close/Display/Atmosphere/Simulation exposed as real a11y `<button>`s, mirror cleared on Escape.
Gates: `@engine/ui` 133 tests, `@citadel/client` 369 tests, EDG32 guard 6/6, all typecheck-clean;
determinism untouched (render/input only). Follow-up still open:
[authored-typography-and-icons](todos/2026-06-30-engine-ui-authored-typography-and-icons.md)
(restore the build-bar icon grid + a proper pixel font).

## [2026-06-30] build | Citadel build bar → in-canvas @engine/ui (DOM-overlay removal, surface 2/5)

The biggest DOM surface migrated: the placement **build bar** is now in-canvas via `@engine/ui`
([build-bar.ts](../games/citadel/client/src/ui/build-bar.ts)) — a bottom-left grid of six category
columns (Housing/Food/Refine/Service/Defense/Tools) of **text** buttons. **Design call (grilled):**
the in-canvas font is an ASCII bitmap (no emoji), so the old emoji icon grid → short text labels
**now**, plus a new follow-up todo
([authored-typography-and-icons](todos/2026-06-30-engine-ui-authored-typography-and-icons.md)) to
author a proper pixel font + building/tool **icon** glyphs as assets and restore the compact icon
grid. The bar is a retained tree built once; `refresh(state)` re-binds each button per frame —
active = the selected tool, disabled = tier-locked or (cozy economy) unaffordable — returning a
change flag that gates the a11y reconcile. Each button's `onActivate` calls the SAME host
placement-mode setters the DOM clicks drove (`selectBuild` / a new `setTool`), so mouse, keyboard
(Tab+Enter) and the a11y mirror share one path. It's a **fourth UI root** with its own input
dispatcher (always live) + a11y mirror (`#ui-a11y-buildbar`), forwarded alongside the HUD/inspect/
villager dispatchers in every pointer/key handler; a hover-info label above the bar shows the
hovered button's cost/tier (preserving build-cost-on-hover). The DOM `#build-bar` (24 buttons, 6
groups) + its CSS + ~150 lines of `main.ts` wiring (`BUILD_BUTTONS`/`buildButtonsByType`/
`refreshBuildButtonLocks`/`highlightActiveBuildButton`/the 5 tool click handlers) are gone. The
bottom DOM HUD row (Settings/Save/Load/decrees/threat/mode-label) stays. Render/input only — no
sim/determinism touch. `@citadel/client` typecheck clean, **349 tests** (+9 build-bar: tree/wiring,
selected-active, tier-lock + affordability disable, change-reporting, hover-info); palette 6/6.
**Verified in-browser** (system Chrome + WebGPU): the grouped text bar renders bottom-left with
tier-locked buttons greyed; the a11y mirror has all **26** buttons; activating mirror buttons drives
the real mode (`Mode: Place house` / `Road (drag)` / `None`); DOM `#build-bar` gone; 0 page errors.
**3 DOM surfaces remain** (settings modal, minimap, occupancy badges).

## [2026-06-30] build | Citadel event toasts → in-canvas @engine/ui (DOM-overlay removal, surface 1/5)

First surface of the umbrella "all GUI in-game" DOM-overlay removal: **event toasts** now render
in-canvas via `@engine/ui` (were a pointer-transparent DOM overlay). **Framework:** added a reusable
`opacity` channel to [render.ts](../engine/ui/src/widget/render.ts) — a node's `opacity` (default 1)
**multiplies down the subtree** in `renderTree` (so fading a container fades its children; alpha≤0
skips the subtree), threaded into every `surface.rect`/`drawText` (both already took `alpha`). Pairs
with the existing `anim` tweens; +2 tests. **Client:** [toast.ts](../games/citadel/client/src/ui/toast.ts)
`ToastManager` rewritten to keep its `push(msg,nowMs)`/`tick(nowMs)` API but build a top-centre
`@engine/ui` column of tone-coloured toast panels (label colour by `toneOf` → EDG salmon/yellow/green/
cyan), each fading in/holding/fading out via age-driven `opacity` (`toastOpacity`); the host lays it out
(two passes: measure width → re-anchor centred at y=48, clear of the in-canvas HUD) + renders it last in
the shared `uiSurface` block. The DOM `#toast-container` + `.toast*` CSS are gone; a hidden
`#toast-live` `aria-live=polite` region announces each toast for screen readers (a11y parity).
Render-only — no sim/determinism touch. `@engine/ui` typecheck clean, **99 tests** (+2 opacity);
`@citadel/client` typecheck clean, **340 tests** (+9 toast: tone colours, cap/evict, opacity ramp,
aria-live, `newEventsSince`); palette guard 6/6. **Verified in-browser** (system Chrome + WebGPU): a
reject toast ("Day 2: can't afford a house — need 4 wood.") renders in-canvas top-centre below the HUD,
the `#toast-live` region carries the text, the old DOM `#toast-container` is gone, 0 page errors.
**4 DOM surfaces remain** (build bar, settings modal, minimap, occupancy badges).

## [2026-06-30] build | Citadel build-cost economy + hover/affordability UI (6th @engine/ui consumer — all 6 done)

Closed build-cost-hover (orchestrate → inline multi-step build; grilled one balance call first).
Discovered the player starts with **0 of every good** (`emptyStockpiles`), so naive always-on
costs would soft-lock the cold-open. **User chose (grilled): a founding wood grant.** Implemented
costs the same way the codebase already gates MP-only behaviour — an **opt-in bootstrap flag**
(mirroring `enforceTerritory`), so the 17 building-placing test files + the bulk-place headless demo
run **unchanged** (determinism baseline preserved by construction) and the **solo client** opts in.
**Sim:** `BUILD_COST` per type in [building.ts](../games/citadel/sim-core/src/entities/building.ts)
(cold-open buildings cheap + wood-only; stone/tools only on late refiners/defence; roads/gates/walls
free) + `buildCost()`; `bootstrapSim({ chargeBuildCost, startingStock })` (default off); `placeOne`
checks affordability up front (new `"cost"` reject + `describeReject` message) and **debits only on
success** (no refund path); a founding `startingStock` grant credited to every player at bootstrap.
**Save/load:** the save now persists both options so `loadFromSave` replays with the same rules
(round-trip stays deep-equal — tested). **Client:** worker bootstrap turns it on with `{ wood: 40 }`;
the build bar shows the cost on hover (`title`) + greys unaffordable buttons live (new `.unaffordable`),
gated `!useServer` (MP placement stays free). **Determinism:** the gated branch is unreachable with
the flag off → two headless `sim:citadel` runs byte-identical **and identical to the pre-change
baseline** (SEED=7) — the change is a true no-op for headless. `@citadel/sim-core` typecheck clean,
**180 tests** (+7 build-cost incl. free-by-default / debit / unaffordable-reject / stone-cost /
twice-run determinism / save-load-with-costs round-trip); `@citadel/client` typecheck clean, 331
tests. **Verified in-browser** (system Chrome + WebGPU): tooltips read "house — costs 4 wood" etc.;
the 40-wood grant funded exactly **10 houses** then the build bar **greyed the house button**
(disabled + `.unaffordable`, "needs 4 wood") and the sim toasted "can't afford a house — need 4 wood";
0 page errors. **This closes the last of the 6 `@engine/ui` consumer todos.** The umbrella "all GUI
in-game" todo continues (build bar / settings / minimap / toasts / badges still DOM).

## [2026-06-30] build | Citadel town-hall build button + solo keep-anchor decouple (5th @engine/ui consumer)

Closed the town-hall-build-button todo (orchestrate → inline build; grilled one design call
first). Found the sprite/height/footprint were **already** wired (`bld/town-hall` warehouse+banner
recipe, `BUILDING_HEIGHT_TILES`, auto-derived `BUILDING_SPRITE_TYPES`) — the todo's "no recipe /
fort fallback" note was stale; the only missing piece was the **toolbar button**. But the button was
entangled with a design call: `town-hall` is `isKeep` (the MP match anchor), so placing it via
`placeOne` set `keepPosition` and started the raid clock — a "civic" button that triggers a siege.
**User chose (grilled): decouple now, civic-only.** Added `actsAsKeepAnchor()` in
[sim-bootstrap.ts](../games/citadel/sim-core/src/sim-bootstrap.ts): an `isKeep` building adopts the
keep/raid anchor only if it's the **`keep`** or a town-hall in **multiplayer** (`players.length > 1`);
in **solo** the town-hall is civic-only (no `keepPosition` → raids never start, since raid-spawn gates
entirely on `keepPosition`). Used at both solo-facing read sites (anchor adoption + snapshot
`keepPresent`, so a civic hall doesn't falsely read "Keep: standing"). **MP unchanged** (`boot2`
2-player tests stay green; town-hall stays each player's anchor). Client: `🏛️ Town Hall` button in the
build-bar `Services` group + `BUILD_BUTTONS` entry; 3×3 footprint + `SERVICE_RADII` catchment flow
from existing wiring. Flipped the stale solo `world-config` test (town-hall = solo anchor) to the new
intent + added an explicit MP-anchor case. **Determinism untouched** — the gated branch is unreachable
in every pre-existing scenario (no solo town-hall was placeable before); proved byte-identical with two
headless `sim:citadel` runs (SEED=7). `@citadel/sim-core` typecheck clean, **174 tests** (+1);
`@citadel/client` typecheck clean. **Verified in-browser** (system Chrome + WebGPU): the `🏛️ Town Hall`
button renders, places a 3×3 hall at (48,48), and the siege HUD stays `Keep: none` / `Threat: 0`
(civic-only confirmed), 0 page errors. Bespoke civic-hall iso art deferred as optional polish (Phase G
owns the full civic reframe). **1 panel todo remains** (build-cost-hover).

## [2026-06-30] build | Citadel resource HUD — all-goods strip (4th @engine/ui consumer)

Closed the resource-HUD-all-goods todo (orchestrate → inline build; pure client render, no
sim change). The in-canvas HUD ([resource-hud.ts](../games/citadel/client/src/ui/resource-hud.ts))
now shows a **goods strip** — one colour-coded `@engine/ui` label per tradeable good in
production-chain order (grain→flour→bread; wood→planks; stone→tools), each tinted from a
distinct `EDG.*` (gold/cream/tan/wood/clay/steel/silver — colour is the "icon" since the
framework has no arbitrary-colour swatch). **Bread keeps its `(±foodSurplus)` annotation.**
`ResourceHudState` now carries the full `stockpiles: Readonly<Record<string,number>>` (the
old per-field `bread`/`wood` removed); the host ([main.ts](../games/citadel/client/src/main.ts))
passes `snap.stockpiles` straight through (one module var replaced the two scalars). Determinism
untouched (render/data-binding only). `@citadel/client` typecheck clean, **331 tests** (+1),
palette guard 6/6. **Verified in-browser** (playtest-citadel, system Chrome + WebGPU, seed
`0x1a2b3c4d`): the strip renders in-canvas at Town/day-108 reading `Grain 404 · Flour 426 ·
Bread 0 (-4) · Wood 0 · Planks 11 · Stone 5 · Tools 6`, color-coded, 0 JS page errors,
`reloads: 0`. **2 panel todos remain** (build-cost-hover, town-hall build button).

## [2026-06-30] build | Citadel villager job personalization (3rd @engine/ui consumer)

Closed the villager-job todo (orchestrate → plan-split-dispatch, 3 chunks + a review-fix).
(1) **Sim:** read-only `VillagerSnapshot.job` derived from the villager's workplace at
snapshot-build time (`jobForBuildingType`, closed `VillagerJob` union farmer/…/idle,
re-exported from the sim-core barrel); pure read → determinism untouched (no Citadel
harness exists — argued from code + 173 sim tests + clean `sim:citadel`). (2) **Render:**
villagers tint by job (`VILLAGER_JOB_COLORS` typed `Record<VillagerJob,string>` →
totality compile-enforced; 14 distinct EDG tints); the FSM-state tint is **dropped** from
the body channel (ceded to a future per-villager mood layer). (3) **UI:** a read-only
in-canvas `@engine/ui` villager panel (job + id/activity/cargo) shown while following a
villager — **replaces and removes the DOM `#follow-hud`** (3rd UI root sharing the surface,
own a11y mirror + a click-consuming dispatcher). A review found + fixed: placement-mode
entry now releases the follow-cam (**placement ⊥ follow** — kills a camera-drift + a
click-through-builds-under-panel bug), the panel consumes clicks, and dead `destinationLabel`
removed. Added a dev-only `__citadel.villagers()` hook (parallels `buildings()`) for the
playtest harness. `@citadel/client` 330 tests, `@citadel/sim-core` 173, typecheck clean;
0 page errors in-browser (inspect panel + precedence re-confirmed). The **live villager
panel/tints couldn't be driven in-browser** here — the pre-cozy economy yields ~1
home-bound villager so building-precedence intercepts the click; observable once a working
economy / the cozy cold-open exists. Commit `84a9ef9`, branch `citadel-villager-job`.
**3 panel todos remain** (build-cost-hover, resource-HUD-all-goods, town-hall).

## [2026-06-30] build | Citadel building inspect panel + upgrade (2nd @engine/ui consumer)

Second `@engine/ui` consumer after the resource HUD (via orchestrate → plan-split-dispatch,
3 chunks). Clicking a building opens a floating in-canvas inspect panel
([inspect-panel.ts](../games/citadel/client/src/ui/inspect-panel.ts),
[selection.ts](../games/citadel/client/src/ui/selection.ts),
[building-info.ts](../games/citadel/client/src/ui/building-info.ts)): name + description,
production rate (output scales with level × seasonal grain mult; **input does not**, matching
the sim — a review fix), scope (coverage / inputs→outputs / workers / level / connected),
and an **Upgrade button + cost** in the footer (reuses the existing `upgradeBuilding` command;
disabled at max level / unaffordable / tier-locked "Needs Village|Town", precedence
max>tier>afford). This **closes two todos** — inspect-view and upgrade-button (folded into the
one panel). Wiring is a **second UI root** sharing the surface, with its own input dispatcher +
a11y mirror (events forward to both, consumed = either, so panel clicks don't fall through to
the world); building-click precedence over villager-follow; Esc/✕/click-away/vanish close and
clear the mirror; `markOpened()` guarantees layout+mirror reconcile on each open. One benign
sim-core barrel addition (re-export pure defs `upgradeCost`/`BUILDING_MAX_LEVEL`/
`tierNameRequiredForLevel`/`outputBufferCap`; no values changed). A 2-finder review found +
fixed 5 issues (a11y-mirror-not-cleared-on-close, once-per-lifetime firstRefresh, input/day
level-scaling, tier-gate, cleanups). Verified in-browser (Playwright + WebGPU): panel opens
with correct content + tier annotation, a11y mirror populated then cleared on Esc, **0 page
errors**. `@citadel/client` 318 tests, typecheck clean. Determinism untouched (render/input +
a pure-def re-export). Commit `2cab8ae`, branch `citadel-inspect-panel`. 4 panel todos remain.

## [2026-06-30] playtest | @engine/ui HUD verified in-browser (Playwright + WebGPU)

Drove the live Citadel client (`playtest-citadel`, system Chrome + WebGPU, seed
`0x1a2b3c4d`, speed 4) to verify the in-canvas resource HUD (brief 17). **Verdict:
pass.** The top HUD bar renders in-canvas and legible (tier/day/pop/bread/wood/happy),
values update live (pop climbed to 15/24, tier reached Town, upgrades ran), and the
Pause/1×/2×/4× buttons display correctly — proper padding + separation, selected speed
showing the pressed state (the earlier "crammed/merged" bug, fixed in `5b8ec11`, is gone).
Two issues found + fixed during verification: (1) the button padding bug above; (2) an
A/B (driver on the pre-UI parent had 0 of these) caught a **boot-race regression** — the
canvas world input handlers deref `camera.centerX` for pointer/wheel events arriving in
the ~1s async-renderer-boot gap (8 page errors); fixed by an `inputReady` guard
([main.ts](../games/citadel/client/src/main.ts), commit `80d0cdc`) → 0 errors. The driver's
HUD timeline now reads `null` (it scraped the removed DOM `#hud-*` ids) — a known
scraper limitation, not a sim issue; values are confirmed via screenshots. Determinism
untouched (render/input only). Pre-existing 404 page error unrelated (present pre-UI too).

## [2026-06-30] build | @engine/ui framework shipped + Citadel resource-HUD pilot (brief 17)

Built the `@engine/ui` framework resolved in the 2026-06-28 round-7 grilling
([brief 17](briefs/engine/done/17-engine-ui-framework.md)) via plan-split-dispatch
(7 chunks, opus controller). A new game-agnostic, **dual-backend (WebGPU + Canvas2D
fallback)** in-canvas UI package at `engine/ui/`:
- **Render seam** — `RendererLike.beginUI/pushUI/endUI`, flushed in `endFrame` in screen
  px (Canvas2D via the previously-unused `overlay` callback; WebGPU via `Overlay2D`).
- **Bitmap font** (`@engine/ui/text`) — deterministic 5×7 raster, measure/layout/wrap/draw,
  glyphs tinted to any `EDG.*` (implemented the textured-quad tint the seam had left inert).
- **Widgets + layout + theme** (`/widget`,`/layout`,`/theme`) — retained-mode panel/box/
  label/button, two-pass flex `computeLayout`, EDG32 `DEFAULT_THEME`/`makeTheme`.
- **Input** (`/input`) — `createInputDispatcher`: hit-test, hover/active/focus, drag,
  keyboard activation, a `consumed` signal for intercept-before-world ordering.
- **Scroll + animation** (`/scroll`,`/anim`) — scroll viewport + injected-time tweens
  (linear/easeOutCubic re-used from `@engine/core/animation`).
- **Hidden-DOM a11y mirror** (`/a11y`) — `createA11yMirror`: invisible `<button>`/ARIA/
  focus tree, keyboard-operable, driving the **same** `onActivate` commands as the canvas
  (required deliverable #2). sr-only (clip-rect), focus bridge to the dispatcher.

**Pilot consumer:** Citadel's top HUD bar (tier/day/pop/bread/wood/happiness + speed/pause
buttons) now renders **in-canvas** via `@engine/ui`, replacing the DOM `#hud` readout +
`#btn-pause/-1x/-2x/-4x`. Pointer events route to the dispatcher first (press-time gesture
ownership so world pan / road-wall drags aren't eaten); a11y mirror mounted; pause/speed
drive the same `client` commands via mouse, keyboard, and screen reader.

A high-effort code review found + fixed 6 issues: 3 Citadel pointer-interception bugs
(pan-freeze over HUD, road/wall drag lost on release over HUD, click mis-routed to release
point — fixed with press-time gesture ownership), WebGPU UI `imageSmoothingEnabled=false`
(crisp pixels matching Canvas2D), `uiLen` reset in `beginFrame` (no stale UI when a consumer
stops calling `beginUI`), `drawUIQuad` graceful skip on missing atlas/frame (no render-loop
crash), easing dedup vs `@engine/core/animation`, and a per-frame relayout/a11y-update gate.

Gates: `@engine/ui` 96 tests, `@citadel/client` 247 tests, typecheck clean
(`@engine/ui`+`@engine/core`+`@citadel/client`); EDG32 guard clean; layering preserved
(`@engine/ui` imports no game). Determinism untouched (render/input only). **Pending:** an
in-browser WebGPU visual check / `playtest-citadel` pass — WebGPU can't render headless.
The six 2026-06-28 Citadel UI panel todos are now **unblocked** (consumers of the framework).

## [2026-06-28] design | Citadel/engine — round 7: the in-game UI becomes `@engine/ui` (cross-game framework)

Grilled the "all GUI in-game" todo to four locked decisions; it is **no longer a small
Citadel task** but a first-class engine subsystem. Updated
[the framework todo](todos/2026-06-28-citadel-ui-all-rendered-in-game.md) + added a
"BLOCKED ON `@engine/ui`" banner to all six 2026-06-28 Citadel UI consumer todos.

1. **Sequencing:** build the in-game UI layer **first**; the six UI todos are
   **consumers** of it (not DOM). Rationale: "all GUI in-game" is a **hard aesthetic
   requirement**, so DOM-first is throwaway *design*, not just code.
2. **A11y:** a **hidden DOM mirror** (invisible `<button>`/ARIA/focus driving the same
   commands) is a *required deliverable* — keeps 100% in-canvas visuals + real a11y.
3. **Scope:** a **full reusable UI toolkit** (layout/scroll/text/theming/animation),
   justified by a large, ongoing, **cross-game** UI surface (investment, not six-panel
   over-engineering).
4. **Architecture:** new **`@engine/ui` package** — **game-agnostic** + **render-backend
   -agnostic** (WebGPU **and** Canvas2D fallback, so Farm + the headless test renderer can
   use it). Game panels live in each game's client, built from `@engine/ui`. Honors
   "engine never imports a game."

Verified the cost basis: there is **no in-canvas text rendering today** and the renderer's
layers are all **world-space** (no screen-space UI quad path) — so this is genuinely a
from-scratch subsystem (~60 DOM-id'd UI elements to replace). Sim-side prerequisites of
the consumers (`BUILD_COST`, a villager `job` field) + sprite art can proceed independently.
Design/todos only — no code changed.

## [2026-06-28] todo | Citadel — render ALL GUI in-game (WebGPU, not DOM)

Filed [render-all-gui-in-game](todos/2026-06-28-citadel-ui-all-rendered-in-game.md). The
client UI is currently **DOM overlays** (build-bar/HUD/toasts/badges/settings) + a
**Canvas2D minimap** over the WebGPU world canvas; this todo moves the whole UI into the
WebGPU render path (textured-quad UI layer + bitmap/SDF font in the EDG32 atlas +
canvas-space input + an a11y plan). Flagged as a **large architectural shift** and noted
the **sequencing conflict** with the six 2026-06-28 UI todos (all DOM-assuming) — decide
before building them whether to do DOM-now-port-later or stand up the in-game UI first
(grill recommended). Determinism untouched (render/input only).

## [2026-06-28] design+todos | Citadel — cozy pivot round 6 (open-Qs) + 6 UI todos filed

**Round-6 grill (open questions)** — resolved three open mechanics the earlier rounds
left, folded into [the build order](todos/2026-06-28-citadel-cozy-pivot-BUILD-ORDER.md)
(new "Happiness mechanic — resolved" block after Phase B):
- **Stateful, asymmetric-drift happiness.** Today `_updateHappiness` recomputes happiness
  statelessly each day → a threat "dent" would flicker, not breathe. Make happiness a
  persistent per-house/per-villager field easing toward a target; **heals faster than it
  falls** (so #9's floor is a property of the update rule). Recover ~2–3 in-game days.
- **Radius-local dent with falloff** ("local" in #5 = small radius around the event,
  not whole-town, not only-the-entity) → the per-house signal becomes a readable map of
  where the town is troubled; spacing/cures become resilience levers.
- **Dent radius ≈ the cure's reach** (fire dents ≈ a well's coverage; disease ≈ a
  Healer's) → the cure is a clean spatial answer; coverage overlays double as
  threat-resilience maps.
- **Production-choice CUT.** Decision #8's "set what a building produces" lever had no
  referent (the economy is a fixed single-output chain); inventing multi-output buildings
  to justify it fought "one building, one obvious job". **Trade is now the SOLE
  economic-intent lever.** Propagated through #8, the round-3b note, and Phase G.
  (Q4 — the determinism-baseline / hard-cutover-vs-flag question — was left open,
  interrupted.)

**Six UI todos filed** (each verified against current code):
- [townhall-build-button](todos/2026-06-28-citadel-ui-townhall-build-button.md) — toolbar
  button + iso sprite (`town-hall` type exists; not on the bar; needs a civic-hall recipe).
- [build-cost-hover-affordability](todos/2026-06-28-citadel-ui-build-cost-hover-affordability.md)
  — ⚠️ there is **no build cost today** (placement is free); needs a sim `BUILD_COST` +
  debit, then client hover-price + disabled-when-unaffordable.
- [building-upgrade-button](todos/2026-06-28-citadel-ui-building-upgrade-button.md) —
  client surfacing of the **existing** `upgradeBuilding` cmd + `upgradeCost`.
- [resource-hud-bar](todos/2026-06-28-citadel-ui-resource-hud-bar.md) — show all
  `snapshot.stockpiles` goods (HUD shows only bread+wood today); pure client render.
- [villager-job-personalization](todos/2026-06-28-citadel-ui-villager-job-personalization.md)
  — ⚠️ villagers carry only `fsm`, no job; needs a snapshot job field + per-job art +
  click-to-show-job; coordinate with pivot Phase E (mood).
- [building-inspect-view](todos/2026-06-28-citadel-ui-building-inspect-view.md) — click a
  building → panel with description + production rate + scope (most data already in defs).

Design/todos only — no code changed.

## [2026-06-28] lint | Citadel — cozy-pivot stress-test: fixed wrong/under-specified claims + archived 2 stragglers

Stress-tested the cozy-pivot corpus against the code. All cited line refs verified
exact (`building.ts:266`, `production.ts:68/96/112/120`, `needs-happiness.ts:147-159`,
`seasons.ts:32`). Found and fixed **four real problems** in the brief + **two unmarked
contradictions** elsewhere:

In [the build order](todos/2026-06-28-citadel-cozy-pivot-BUILD-ORDER.md):
- **"public square" was written as if it exists — it does NOT.** Festivals are a
  *decree* (`festivalDaysLeft`), not a building; only `town-hall` exists. Marked the
  public square as a **net-new building to author** (defs + sprite + toolbar) in #8,
  the scope table, and Phase G.
- **`RELIEF_BARTER_THRESHOLD` was located in `trader.ts` — it's actually in
  `sim-bootstrap.ts:62`** (used :518, tithe-gated). Corrected.
- **The trader reframe is bigger than "strip a constant".** `TraderSystem` is an
  *autonomous periodic caravan* (`TRADER_INTERVAL_DAYS=7`, seeded RNG, auto-barter);
  the pivot must *convert it to player-driven*. Phase G now says so explicitly.
- Tightened the scope-table trader row to name `TraderSystem` + `tradingpost` distinctly.

Archived two stragglers that still asserted the pre-pivot design without a marker:
- **`briefs/citadel-apr.md`** ("Agreed plan of record", "No win; fail = collapse") —
  added an ⛔ SUPERSEDED-as-design-of-record banner (kept for mechanical-substrate value).
- **`todos/2026-06-22-citadel-two-way-service-economy.md`** (live, ships the
  stockpile-pressure *hard stop*) — ♻️ re-scoped banner: the hard stop softens to a
  throttle under pivot Phase H.

Verified clean: all "already shipped" render files exist; the "villagers tint by
`v.fsm` not happiness" gap claim is accurate (`quads.ts:276`); bootstrap stages match
the freeze list (army/territory/siege-* registered → unregisterable). Design/lint only —
no code changed.

## [2026-06-28] research | Citadel — cozy pivot: hardened the briefs against the code

Read the systems each phase touches (`needs-happiness.ts`, `seasons.ts`, `building.ts`,
re-read `production.ts`) to turn vague phase steps into named files/constants. Updated
the [build order](todos/2026-06-28-citadel-cozy-pivot-BUILD-ORDER.md) Phases A/B/G/H +
decision #8. Three corrections the research forced (grilled where it changed design):

- **Phase A is a refactor, not a field-surface.** `_computeNeedsFor` already computes the
  per-house `hasFaith/hasSafety/hasGoods` booleans but **discards** them, keeping only
  per-player aggregate ratios. Phase A = *stop throwing them away* + write
  `{lacksFaith,lacksSafety,lacksGoods,mood}` onto each house snapshot. Cheap, deterministic.
- **Single-slot is a rebalance (decision #8/Phase H).** Data: farm/woodcutter/quarry/mine
  are 2-slot and the bread chain is balanced on it. **Grilled → keep daily throughput**:
  set those to `workerSlots:1` **and** bump farm `outputPerCycle` 3→6 (preserves 6 grain/
  day summer). Otherwise single-slot silently halves food and re-spawns the death spiral.
- **Trading post keeps its worker (decision #8 refinement).** `tradingpost` already has
  `workerSlots:1`. **Grilled → keep it**: cleaner statement of #8 is *player sets intent,
  NPCs execute* — a staffed trader villager fulfills the player's chosen exchange. The
  round-3b "no NPC interaction" wording was wrong; correct constraint is "no NPC
  *autonomy*". Trading post becomes the clearest *example* of #8, not an exception.

Also caught a brief gap: **decrees live in TWO sites** — purging `production.ts` alone
leaves the decree happiness penalties + `FESTIVAL_HAPPINESS_BONUS` in
`needs-happiness.ts:_updateHappiness`; Phase H now names both. And pinned Phase B's home
(`production.ts:112`, multiply `amount` by `lerp(0.6,1.0,happiness/100)`) and winter's
(`seasons.ts:32`, `0.0`→`~0.5`). Design/brief-hardening only — no code changed.

## [2026-06-28] design | Citadel — cozy pivot round 5: terrain is the puzzle's difficulty knob

Fifth grilling round (terrain, against `world/terrain.ts`). Added decision #10 + Phase I.
Because placement is the whole game (#8) and no building-side tension was added (round 1
Q4), **the puzzle's weight rests on the terrain** — so terrain quality *is* puzzle quality.

Finding: the generator makes a coherent **river + lake** (real "bridge/build-around"
decisions, keep) but scatters **forest/stone/rough as per-tile noise sprinkle** —
*texture, not places* (a woodcutter almost always finds a forest tile nearby → no spatial
decision). **Decision #10:** cluster resources into **groves / ore-veins** you build
*toward* (cheap noise-tuning) — this turns terrain into the puzzle AND gives the trading
post a real job (resource-poor maps now happen; trade is the answer). **Guaranteed
solvable** (workable start; each resource reachable or trade-backfillable) but varied —
**cozy = no frustration, not no thought**; target feeling *"ooh, tricky,"* never *"unfair."*
Trade is the safety valve that *permits* bolder terrain.

Meta-finding across rounds 1–5: the **same shape recurred independently in four branches**
— threats (#5), economy (#9), and terrain (#10) all resolved to **"a guaranteed-safe floor
+ rich texture above it."** That convergence (not designed, emergent) is the strongest
evidence the cozy spine is coherent. Also fixed an out-of-scope contradiction (terrain-as-
puzzle was listed declined; #10 makes it in-scope as *bite via terrain*, not new building
mechanics) and refreshed the A–I prioritization note. Design only — no code changed.

## [2026-06-28] design | Citadel — cozy pivot round 4: economy under the cozy contract

Fourth grilling round (the economy, against `production.ts`). The economy was tuned
**entirely for the pressure game** and contradicted the locked spine in four places;
all resolved into one rule. Added decision #9 + Phase H to the
[build order](todos/2026-06-28-citadel-cozy-pivot-BUILD-ORDER.md).

**Decision #9 — the downside rule (generalizes #5 to the whole game):** *nothing ever
fully stops or is taken away — every problem is a throttle toward a ~60–70% floor,
always recoverable, always shown in the world.* Threat, winter, neglect, unhappiness
are now the **same kind of thing** — one rule the player learns once.

Resolutions:
- **Winter grain floored ~×0.5, never 0** (was 0 → starvation; violated the anti-spiral
  floor). Banking surplus helps but is never required.
- **Stockpile-pressure → throttle, not halt, + diegetic** (was a hard production stop
  when output uncollected — illegible pressure loop). Hauling/roads stay a placement
  dimension; neglect = slowdown, never shutdown.
- **Single-slot buildings** (was multi-slot, 2nd worker a wasted mouth — the old
  death-spiral root). **Growth = placing more buildings** (spatial, fits the heart).
- **Purge decrees from production**: delete conscription-halt; re-home `workHours` as an
  automatic **town-hall coverage bonus** (decree → placement bonus, the round-3 move).

Notable: every economic mechanic resolved the *same way* the threats did — the economy
folds into the spine (throttle-to-floor + influence-via-placement) rather than being a
separate system. Design only — no code changed; Phase H re-proves determinism.

## [2026-06-28] design | Citadel — cozy pivot round 3b: autonomy boundary redrawn

Follow-on to round 3. The round-3 "placement is the player's *only* lever" wording was
**too pure and is superseded.** Redrawn boundary (decision #8 updated in the
[build order](todos/2026-06-28-citadel-cozy-pivot-BUILD-ORDER.md)): **the player sets
*placement* + *economic intent*; the town autonomously handles all *behavior*.** The
player decides *what the town pursues* (where buildings go, what a building produces,
what to trade for); the town decides *how it lives* (labour/governance/festivals/
hazards — all autonomous, no behavior micromanagement).

Trigger: the **trading post** is a **player-operated, clickable building** (tiny
exchange menu, **no spatial reach, no NPC interaction**) — the player's *window to the
outside world*, distinct from the town's autonomous internal life. That's a real
exception to "placement only", so the boundary moved to admit **economic-intent**
levers (trade + production choice) while still barring **behavior** levers. Operating
is **per-building**, under a hard discipline: **operable buildings stay FEW, menus stay
TINY** (2–3 glanceable choices) — else the cozy "watch it live" heart erodes into a
management sim. Design only — no code changed.

## [2026-06-28] design | Citadel — cozy pivot round 3: scope pass + the autonomy principle

Third grilling round (scope: what to cut). Added decision #8 + a scope table +
Phase G to the [build order](todos/2026-06-28-citadel-cozy-pivot-BUILD-ORDER.md).

Resolved a principle strong enough to sort every system: **behavior is autonomous &
read-only to the player; placement is the player's *only* lever.** The old pressure
game's decree/policy layer (rationing/conscription/tithe/work-hours/festivals) is
**demoted, not deleted** — these still happen, but **the player has no policy menu**;
they're run by **civic buildings the player places** (a **town hall** = rations/
work-hours, a **public square** = festivals). Autonomy is total for *behavior* but
each civic building has a **spatial reach**, so *where you place it* is a new coverage
layer — the player's entire decision space stays spatial. Generalizes decision #3.

Scope verdicts (one rule: *spatial stake or autonomous behavior? else cut*):
**Core** — economy/growth/puzzle systems. **Texture** (keep, gentle) — fire/disease/
raids. **Demote** — decrees → town hall + public square (autonomous, with reach).
**Keep, reframed** — trader → an autonomous **trading post** with a reach that trades
surplus for goods you **lack or can't yet access** (economy is *open*, a bad map is
smoothed by trade, not fatal; strip the relief-valve framing). **Freeze** — `territory`
(MP land-claim) + `army` (PvP/PvE combat), off-spec, unregister from cozy bootstrap.
Design only — no code changed.

## [2026-06-28] design | Citadel — cozy pivot round 2: the motivation layer

Second grilling round, resolving the hole round 1 left: **a cozy un-loseable game
still needs a reason to *continue*.** Added decision #7 + Phase F to the
[build order](todos/2026-06-28-citadel-cozy-pivot-BUILD-ORDER.md).

Resolved: motivation is **emergent goals + diegetic recognition**, with **NO score
and NO quest list**. The player invents their own targets against a town whose health
they can read; the game's only role is (a) making the *gap* legible **on demand** —
the player *pulls* the already-shipped coverage/connectivity overlay, which lights up
uncovered/disconnected things as *inviting* goals — and (b) **diegetic recognition**
when a nice state is reached (the town visibly settles into contentment + one gentle
banner). A visible "town quality" *number* was explicitly **rejected** (it's the
un-cozy, spreadsheet path that would undermine the diegetic-feedback keystone). The
whole layer costs almost no new mechanism — it lands on the keystone (per-house signal)
and the shipped overlays. Notable: every round-2 requirement resolved back *onto
existing structure* rather than adding a system — the mark of a coherent spine.

## [2026-06-28] design | Citadel — the cozy pivot (grilled to shared understanding)

A grilling session resolved **what Citadel is for**. Outcome: Citadel is **a cozy
placement puzzle you read by watching the town live**, not a pressure/survival
strategy game and not a competitive RTS. Six locked decisions (full plan +
dependency-ordered build order in
[todos/2026-06-28-citadel-cozy-pivot-BUILD-ORDER.md](todos/2026-06-28-citadel-cozy-pivot-BUILD-ORDER.md)):

1. **Cozy builder, committed** (chosen against pressure-strategy and RTS).
2. **Two fused hearts** — placement-puzzle (primary) + watch-it-live (secondary),
   made one act by diegetic feedback.
3. **Diegetic feedback** — read town health by watching villagers/buildings behave
   (mood/smoke/light), not a HUD.
4. **Cozy contract** — nothing you built is taken from you; threats cost time/
   regenerating resources, never placed things.
5. **One unifying threat mechanic** — threats **dent local happiness**, and
   **happiness taxes productivity to a ~60–70% floor, never zero**, so recovery is a
   *property of the math* (no death spiral). The per-house/villager mood signal is
   simultaneously the diegetic scoreboard AND the threat-consequence layer.
6. **Sharp 2026-06-26 systems frozen, not deleted** (off-spec for cozy core;
   re-wireable into a future Challenge mode); MP/PvP is a future mode, not the core.

**Key finding:** the watch-it-live render substrate already exists (ambient crowd,
FSM tints, true-iso art) but is **pretty, not legible** — the crowd is render-only
seeded off a constant; villagers tint by FSM state, not happiness. The reactive
legibility layer (coverage overlay/rings/road feedback) is also already shipped. So
the keystone work is **connecting existing render to town-health**, not new art:
add a *spatial* per-house mood/coverage signal to the snapshot and express it
diegetically. Build order A (per-house signal) → B (happiness→productivity floor) →
C (forgiving diegetic cold-open that doubles as tutorial) → D (demote threats to
texture, freeze the bite) → E (villager-mood polish, later).

Wiki updated: [citadel-overview.md](wiki/citadel-overview.md) carries a design-of-record
banner; the prior "fire punishes tight clusters / spacing-vs-density is intentional"
note is **superseded** (it was a pressure-game stance). No code changed this session —
design only.

## [2026-06-27] feat | Citadel — villagers on roads only when travelling + per-building occupancy badges

Shipped the fourth item from the 2026-06-27 todo batch (the last one open):
[villagers-on-road-when-moving + occupancy badge](todos/closed/2026-06-27-citadel-villagers-on-road-when-moving-building-occupancy-badge.md),
done. One shared rule keeps both halves consistent: `isTravellingFsm(fsm)`
(sim-core, exported) — walk states are in-transit, `idle`/`work` are stationary.

- **Part A (road-only-when-moving):** `pushScene` skips drawing any non-travelling
  villager, so idle/working villagers no longer loiter as dots on the road; only
  in-transit villagers appear there.
- **Part B (occupancy badges):** new read-only `BuildingSnapshot.occupancy` tallied
  in `getBuildings()` (idle→home tile, work→workplace tile, via a footprint
  tile→building index). New pooled DOM overlay `OccupancyBadgeLayer` floats a
  headcount chip over each of the local player's occupied buildings, positioned
  via a shared `tileToScreenCss` (extracted from the dev hook). Snapshot also
  gained `localPlayerId` so badges scope to the local seat (MP-safe; also closes
  one of the MP gaps noted in the parity todo).
- **Invariant:** Σ occupancy + travelling villagers == population, asserted every
  tick in the new occupancy.test.ts (+ villager-entity == population parity).
  Render/HUD + a read-only snapshot field → determinism untouched (phase-4
  deep-equal still green). EDG-palette chip (guard green).

Live-verified on the real-GPU playtest driver: at pop 9, the badge probe read 3
occupancy chips positioned over buildings while 6 villagers walked the roads; chip
visible in the screenshot. 168 @citadel/sim-core + 236 @citadel/client tests green.
All four 2026-06-27 todos now closed. Commit pending.

## [2026-06-27] feat | Citadel — freehand roads, villager↔population parity fix, well 8×6 rectangle

Shipped three of the newly-filed items (the fourth — road-only-when-moving +
per-building occupancy badge — is still open, deferred to its own render/HUD
session):

- **Freehand roads** ([road-path-follows-mouse](todos/closed/2026-06-27-citadel-road-path-follows-mouse.md),
  done; **overrides + supersedes** [road-routing-around-buildings](todos/closed/2026-06-22-citadel-road-routing-around-buildings.md)).
  Roads now follow the mouse: pure `extendTrail` accumulates the tiles the cursor
  travels through, gap-fills fast drags (stays 4-connected), trims on drag-back.
  Walls keep the deliberate two-endpoint straight L. Retired the endpoint A*
  `routeRoadPath` + its turn-penalty heap. Client/input only — sim untouched. 8
  new `extendTrail` tests. Wiki [citadel-road-builder-ux](wiki/citadel-road-builder-ux.md)
  updated.
- **Villager↔population parity** ([entity-count-matches-population](todos/2026-06-27-citadel-entity-count-matches-population.md),
  partial — the on-map mismatch is FIXED). Root cause: **siege-resolution
  decremented `p.population` after a sacking WITHOUT despawning villager
  entities**, leaving phantom villagers. Extracted one source of truth
  `removeOneVillager(state, p)` (sim-state.ts) and routed all three loss paths
  (immigration starvation/morale, disease deaths, raid casualties) through it;
  also fixed a pre-existing double-event on the morale path. New phase-4 invariant
  test asserts `ownedVillagers == population` every tick across a casualty-
  inflicting raid. Determinism preserved (deterministic despawn; phase-4 deep-equal
  test still green). Deferred: ambient-crowd "reads as population" question +
  owner-filtering `getVillagers()` for MP.
- **Well coverage = 8×6 rectangle** ([well-coverage-rectangle](todos/closed/2026-06-27-citadel-well-coverage-rectangle.md),
  done). Was a Manhattan radius-5 diamond; now a rectangle. Added `SERVICE_RECTS`
  + `coversRect` (sim-core, single source of truth), removed `well` from
  `SERVICE_RADII`, fire system uses `coversRect`, client `serviceCatchment`
  dispatches shape so the placement ring previews the rectangle. RNG-free →
  determinism preserved. `coversRect` + `rectCatchmentTiles`/`serviceCatchment`
  tests added.

All @citadel/sim-core (165) + @citadel/client (236) tests green; both workspaces
typecheck clean (the pre-existing @tool/world-preview WebGPU-types failure is
unrelated). Commit pending.

## [2026-06-27] todo | Citadel — three new todos (road-follows-mouse override, entity↔population parity, road-only-when-moving + building occupancy badge)

Filed three Citadel todos from user direction:

- **[road-path-follows-mouse](todos/2026-06-27-citadel-road-path-follows-mouse.md)**
  (open) — road drag should **follow the actual mouse path**, not be computed
  between the first and last tile. **Explicitly overrides** the
  endpoint-routing decision in
  [road-routing-around-buildings](todos/2026-06-22-citadel-road-routing-around-buildings.md)
  (done 2026-06-22, the L-then-A* `routeRoadPath`); when this ships, move that todo
  to superseded and update
  [wiki/citadel-road-builder-ux.md](wiki/citadel-road-builder-ux.md).
- **[entity-count-matches-population](todos/2026-06-27-citadel-entity-count-matches-population.md)**
  (open) — villager entity count on the map must equal `population`; audit
  population↔entity lifecycle and the ambient-crowd layer so the visible crowd
  isn't more than the count.
- **[villagers-on-road-when-moving + occupancy badge](todos/2026-06-27-citadel-villagers-on-road-when-moving-building-occupancy-badge.md)**
  (open) — villagers appear on roads **only while travelling**; each building shows
  a **per-building headcount badge** (unassigned over houses, workers over farms,
  etc.). Mostly render/HUD; ties into the entity↔population parity todo.

## [2026-06-27] backlog | Citadel — autonomous backlog pass (CSS extract, two-way economy, walk gait, todo triage)

A "finish the backlog" pass. Shipped three more items and triaged the rest:

- **CSS extraction** ([extract-client-css](todos/2026-06-22-citadel-extract-client-css.md),
  done): moved the inline `<style>` block out of index.html into
  [src/style.css](../games/citadel/client/src/style.css), imported from main.ts;
  `*.css` ambient decl added. Styling live-verified identical. Commit `b9121e5`.
- **Two-way service economy — downside half** ([two-way-service-economy](todos/2026-06-22-citadel-two-way-service-economy.md),
  partial): stockpile pressure caps each producer's outputBuffer at 5 cycles; a
  building with no hauler draining it stops producing instead of overflowing. RNG-
  free → determinism preserved. Commit `2279575`. Graded service-ratio + service-
  growth (#1/#3) deferred to a combined economy-growth pass (don't double-tune the
  immigration numbers).
- **Entity-movement walk gait** ([entity-movement-natural-feel](todos/2026-06-27-citadel-entity-movement-natural-feel.md),
  still partial): walking villagers get a springy step hop, idle ones the gentle
  sway, via `gaitOffset` + `EntityInterpolator.isMoving`. Render-only. Commit
  `393f4b5`. Facing/flip (needs directional art) + diagonal corner-cutting still
  deferred.

Triage of the remainder: **true-isometric** marked done (the "open anomaly" was a
host WebGPU artifact, doesn't reproduce on real GPU; re-confirmed live).
**coverage-overlay** + the playtest **P2 service-coverage feedback** marked
resolved (coverage overlay + the road disconnected-marker close it). **openttd-art**
relabelled `reference` (standing note, not a task). **Farm perishability + distance
pricing DELIBERATELY left open** — it's large + balance-sensitive (needs a harvest-
timestamp threaded through the inventory + g/AP economy re-run + BDI-AI integration)
and isn't a safe unattended ship; documented in that todo. Remaining genuinely-open
work: Farm perishability and the playtest **P3 disease counterplay** — both want a
focused, reviewed session.

## [2026-06-27] feat | Citadel — road-builder feedback tier (connectivity marker + drag length + legality tint)

Implemented the cheap, high-value tier from the road-builder UX research
([road-feedback-connectivity-indicator](todos/2026-06-27-citadel-road-feedback-connectivity-indicator.md),
now **done**). All client render/UI over the existing deterministic
`placeRoad`/`placeWall` — no sim change, no determinism impact.

1. **Disconnected-building marker** (the headline gap): the road network is the
   economy's spine (founders only staff `connected` buildings) but the flag was
   never shown. New pure [road-feedback.ts](../games/citadel/client/src/render/road-feedback.ts)
   (`needsRoadConnection`/`disconnectedBuildings`) + renderer `pushDisconnectedMarkers`
   float a pulsing EDG-gold pip over each production/housing/storage building that
   is `connected:false` (infra excluded), Anno/Settlers style.
2. **Drag length readout**: mode label shows "Mode: Road (drag) — N tiles"
   (· blocked) live, resets on release.
3. **Red/green legality tint**: `pushGhost` takes per-tile validity;
   `roadTilesWithValidity` tags interior drag tiles via `_blockedForRoad`
   (endpoints stay green). Clear auto-route = all green; no-clear-route = red.

7 road-feedback unit tests + 222 @citadel/client suite green; typecheck clean;
live-verified all three (pips over a disconnected farm+house not the connected
storehouse; "— 28 tiles" readout). Commit `9b1d702`. Deferred follow-ups
(snap/auto-extend, in-tool undo) noted in the todo + wiki.

## [2026-06-27] research | Citadel — road-builder UX note + scoped feedback todo

Completed the research phase of the road-builder playtest todo
([road-builder-ux-research](todos/2026-06-27-citadel-road-builder-ux-research.md),
now **done**). Wrote [wiki/citadel-road-builder-ux.md](wiki/citadel-road-builder-ux.md):
how OpenTTD / Cities:Skylines / Factorio / Anno / Settlers / organic builders
handle road drawing, mapped onto Citadel's 4-connected iso tile grid + the
existing two-endpoint drag + obstacle-aware A* auto-route. **Key finding:** the
biggest hole isn't the routing (that's good) — it's **no connectivity feedback**:
every building snapshot carries `connected`, but it's never shown, so a player can
lay a road and not notice a building stayed unhooked (and the economy's founders
only staff `connected` buildings). Ranked recommendation: do the cheap, high-value
tier first — (1) disconnected-building indicator, (2) drag length readout,
(3) red/green legality tint on the preview — all client preview/feedback over the
existing deterministic `placeRoad`/`placeWall`, no sim change. Snap/auto-extend +
in-tool undo deferred; curved/freeform roads explicitly rejected (fight the tile
grid). Carved items 1–3 into
[road-feedback-connectivity-indicator](todos/2026-06-27-citadel-road-feedback-connectivity-indicator.md);
linked the note in index.md.

## [2026-06-27] feat | Citadel — entity movement interpolation (units glide, no longer tile-snap)

Made villagers/raiders feel more natural to watch (playtest todo
[entity-movement-natural-feel](todos/2026-06-27-citadel-entity-movement-natural-feel.md),
now **partial**). The sim steps units one tile per tick and posts integer tile
positions, so drawn straight they snapped tile-to-tile (~6 idle render frames per
snapshot at 1×, then a jump). Added a render-only `EntityInterpolator`
([entity-interp.ts](../games/citadel/client/src/render/entity-interp.ts)): it keeps
each unit's prev+cur snapshot tile and lerps between them at a render `alpha`
measured from the inter-snapshot interval (so the glide adapts to 1×/2×/4× and
jitter). `pushScene` gained `villagerPos`/`raiderPos` hooks; `main.ts` ingests per
snapshot + feeds interpolated tiles. `isoPointBox` already takes fractional tiles,
so projection + iso depth just work, and the existing heading tracker (lean/squash)
now gets continuous deltas. Teleports (load/replay, despawn+respawn reusing an id),
fresh ids, and pause are SNAPPED, never smeared. Pure render-only — zero sim/
determinism impact. 9 interp unit tests + 215 @citadel/client suite green;
live-verified. Commit `3b19275`. Deferred polish: walk-cadence gait, explicit
facing/flip, diagonal corner-cutting.

## [2026-06-27] fix | Citadel — P2: founding grace before fire can ignite a starter cluster

Fixed the playtest P2 ([fire-ignites-before-player-control](todos/2026-06-27-citadel-fire-ignites-before-player-control.md),
now **done**). Density-driven fire ignition rolled every day from sim start, so a
freshly-built wooden district could already be burning the moment the player first
saw the map (the live client runs the sim through the ~15-day boot). Added a
per-player **founding grace**: `FireSystem` records the first observed day a player
owns any building and suppresses fresh ignition for `floor(daysPerYear/4)+2` days
after it. Spread is unaffected (a fire underway still propagates); the grace is
temporal, not population-gated, so an unpopulated dense district still burns after
the window — the density mechanic + its tests are intact. Live-confirmed: a dense
cluster built day 11 stays fire-free through day ~18, ignites day 24. Regression
test (phase45) fails without the fix. sim-core 159/159; determinism identical.
[fire-system.ts](../games/citadel/sim-core/src/systems/fire-system.ts), commit
`573d9c8`. Pairs with the cold-start P0 below.

## [2026-06-27] fix | Citadel — cold-start P0: founding window now anchors to first foundable day

Fixed the playtest P0 below ([founding-window-expires-before-boot](todos/2026-06-27-citadel-founding-window-expires-before-boot.md),
now **done**). A fresh solo game could never leave pop 0: the ~6-day founding
window (`DAYS_PER_YEAR=16`) was measured from `ImmigrationSystem`'s first observed
sim day (day 0), but the live client runs the sim through the ~15-day page/WebGPU
boot before the player can place a connected settlement — so the window had
already closed, and the surplus path can't bootstrap off pop 0.

Anchored the window **per player** to the first observed day they have a
connected, unstaffed production building (set in `run()`, incl. the baseline day).
Tick-0 builds anchor to the baseline day exactly as the old global `startDay` did
→ headless/replay founding timing + determinism unchanged (winter-starvation test
holds); late builds anchor when building actually starts. Removed the dead
`startDay`. Added an economy regression test (settlement built ~day 20 still
bootstraps). **Live-confirmed**: a day-11 settlement now reaches Pop 6/6 by day 36
(was 0 forever). sim-core 158/158; headless determinism identical (Final pop/bread
unchanged). [immigration.ts](../games/citadel/sim-core/src/systems/immigration.ts),
commit `699620d`.

## [2026-06-27] playtest | Citadel live browser test — tooling note + 5 new todos

Ran a live browser test of the Citadel solo client (`npm run citadel`). Intended
to use **vercel-labs/agent-browser** but it **hangs on every command in this
environment** (even `open about:blank`, headless and headed — the Rust daemon
handshake stalls under the background-shell harness). Fell back to **Playwright**,
whose Chromium **supports WebGPU** (Citadel is WebGPU-only, no Canvas2D fallback),
and drove the game through the DEV-only `window.__citadel` hook
([main.ts:558](../games/citadel/client/src/main.ts#L558)).

- **Asset audit clean.** Procedural atlas (256×1024, 34 frames); 19/21 build types
  have bespoke iso sprites (wall/gate render as autotiled network quads by design);
  191/191 @citadel/client tests + the EDG32 palette guard pass.
- **Most features verified working** live: placement (with footprint/overlap +
  tier-lock rejection + the "requires Village tier" event), road connectivity,
  demolish, decrees, settings modal (3 tabs, Esc-close), pause/resume, speed
  1/2/4×, save (valid command-log `CitadelSave`), fire HUD.
- **P0 found:** solo cold-start can never leave **pop 0** — the 6-day founding
  window (`DAYS_PER_YEAR=16`) closes during the ~15-day page/WebGPU boot before the
  player can build a connected settlement, and the surplus-immigration fallback
  can't bootstrap from zero. Distinct from the *resolved* pop-6 plateau.

New todos filed:
[founding-window-expires-before-boot](todos/2026-06-27-citadel-founding-window-expires-before-boot.md)
(the P0 above),
[entity-movement-natural-feel](todos/2026-06-27-citadel-entity-movement-natural-feel.md)
(render-only interpolation/gait/facing — units tile-snap today),
[road-builder-ux-research](todos/2026-06-27-citadel-road-builder-ux-research.md)
(research-first: how reference city-builders make road drawing friendly), and
[fire-ignites-before-player-control](todos/2026-06-27-citadel-fire-ignites-before-player-control.md)
(density-based ignition fires on an unattended starter cluster pre-agency).

## [2026-06-26] art | Citadel units + terrain grounding/value pass (follow-up to the building grounding)

Extended the building grounding pass (same iso-art research) to **units** and
**terrain** — the two surfaces left flat after the building work.

**Units** ([units.ts](../games/citadel/client/src/render/sprites/recipes/units.ts)):
diagnosed by rendering each figure under simulated runtime multiply-tints (orange
villager / red raider / blue pedestrian). Both gaps were the building gaps: figures
floated, and the body was ~one value (flat after tint). Fixes:
- **`footShadow`** — a flattened, feathered ground ellipse in the darkest ramp chars
  (`#`/`S`), drawn first so the body overpaints it; under any multiply-tint it stays
  the darkest pixels → reads as a colored ground shadow (dark-orange under an orange
  villager, etc.). Sized per figure (villager 7, raider 9, pedestrian 4).
- **Deeper 3-value body ramp** (lit-left `v`/`l` → mid `l` → shaded-right `S`/`#`) on
  head/torso/arms/legs of villager + raider, so the tint reads as rounded volume
  instead of a paper cut-out. Dims unchanged (32×32 / 16×16 — recipe guard holds).

**Terrain** ([terrain-dither.ts](../games/citadel/client/src/render/terrain-dither.ts)):
the base diamond was one flat color per type with sparse specks. Added
**`elevationFill`** — the base fill is now banded by the existing coarse
`elevationField`: deep valleys take the type's DARK accent, high ground the LIGHT
accent, the broad middle the base hue (conservative thresholds: <0.30 dark, >0.74
light). The bands share the dither's elevation source, so they form coherent
contiguous hills and the specks agree. Grass/forest/stone/rough now read as gently
rolling land, not flat planes (eyeballed a rasterized iso patch). Water is left to
its own shimmer. Fully EDG32 — every band is a `DITHER_ACCENTS`/`TERRAIN_COLORS`
swatch.

Verified: `@citadel/client` typecheck + **191** tests green (+3 new `elevationFill`
tests: deterministic, on-palette, bands grass, leaves water flat); EDG32 palette
guard green; render-only/determinism untouched. Branch `art/citadel-units-terrain`
→ main. (See the building grounding entry below for the shared rationale + sources.)

## [2026-06-26] art | Citadel iso building grounding pass — contact shadows + AO seams + roof value separation

Researched iso pixel-art art direction (SLYNYRD Pixelblog 41/54, PixelParmesan
"Fundamentals of Isometric Pixel Art", PixNote) and applied the highest-impact,
**uniform** improvements across all 20 building sprites — done in the shared
primitives so every form benefits without per-form edits. Diagnosis was driven by
rendering a 6× per-building contact sheet (`rasterizeRecipe`) and measuring it
against the references; the gaps were: buildings floated (no ground anchor), roof
faces lacked value separation, shadow faces collapsed toward pure black, no AO at
the eave/corner seams.

Changes ([iso-draw.ts](../games/citadel/client/src/render/sprites/recipes/iso-draw.ts),
[buildings.ts](../games/citadel/client/src/render/sprites/recipes/buildings.ts)):
- **Contact shadow** (`isoContactShadow`, called from `begin()` first → under
  every building): footprint diamond flattened + pushed SE (opposite the upper-left
  sun) in `i` ink; the body overpaints all but the SE sliver, dithered/feathered rim
  so it reads soft. Anchors each building to the terrain — the single biggest lift.
- **AO seams** in `drawWalls`: 1px shaded band along the wall-top under the eave;
  near-corner highlight flanked by a gentle mid-shade AO (tall walls only, so short
  cottages don't get a dark stripe). Shaded right-face near-corner band deepened so
  the two wall faces separate in value.
- **Roof value separation**: `STONE`/`WOOD` palettes' `roofDark` moved `#`(black)→`i`
  (ink) per the iso "valley = darkest-shade-not-black" rule; STONE roof ramp regraded
  (slate/silver/ink) so the three faces read distinctly.

Recipe-guard invariants held (top-left corner transparent; opaque fraction < 0.88
for all 20 — checked during render). EDG32 palette guard green (every new pixel
routes through `SWATCH`/`i` ink). `@citadel/client` typecheck + 188 tests green;
determinism untouched (sprites are pure/render-only). Brief 96 art reference updated
with the grounding/AO rules. Branch `art/citadel-iso-grounding` → main.

## [2026-06-26] art | Citadel entity legibility built; the two sprite art-todos closed superseded by the iso library

Re-scoped the three 2026-06-19 Citadel art todos against the **current** renderer
(they were written against the pre-iso top-down flat-quad renderer, which the
2026-06-21 true-isometric work replaced) and resolved all three:

- **[real-sprite-assets](todos/closed/2026-06-19-citadel-real-sprite-assets.md) →
  SUPERSEDED.** Its premise ("100% procedural flat quads, no sprites, 1×1 white
  atlas") is **stale**: Citadel now has a full baked iso pixel-art library —
  `sprites/recipes/{buildings,units,fx,iso-draw}.ts` produce diamond-based iso
  building volumes (two shaded faces + hipped roof, terracotta/green roofs,
  half-timber + stone coursing), an animated 8-frame windmill, a 32px villager, a
  horned axe raider, and a 16px pedestrian, packed through `rasterize.ts` +
  `atlas.ts`. **Eyeballed a 33-sprite contact sheet** (rendered via `rasterizeRecipe`)
  — reads as a coherent iso settlement, type-distinct, well-shaded. Done.
- **[procedural-building-detail](todos/closed/2026-06-19-citadel-procedural-building-detail.md)
  → SUPERSEDED.** It was explicitly the "no-new-assets INTERIM slice toward sprites";
  real iso sprites (with roof shading + wall detail baked in) shipped, so the interim
  is moot — the goal it was a stepping-stone to is met directly.
- **[entity-silhouette-legibility](todos/closed/2026-06-19-citadel-entity-silhouette-legibility.md)
  → DONE (built this pass).** The one genuinely-open render-only task. Implemented:
  - **Raider strength tiers** ([quads.ts](../games/citadel/client/src/render/quads.ts)
    `raiderTier` + `raiderQuad`): weak→narrow, normal→baseline, strong→broad/blocky,
    elite (≥50)→taller + crimson. Shape + tint communicate threat, not just size.
  - **Villager orientation** ([citadel-renderer.ts](../games/citadel/client/src/render/citadel-renderer.ts)
    `VillagerHeadingTracker`): a render-only, per-id frame-to-frame **screen-space**
    heading tracker leans + squashes the billboard along travel direction (smoothed;
    swept for vanished ids). Never read/written by the sim.
  - **Ambient-crowd orientation** ([ambient-crowd.ts](../games/citadel/client/src/render/ambient-crowd.ts)):
    pedestrians lean into their known heading-to-target (new optional `QuadSpec.lean`,
    applied in `pushAmbientCrowd`).

All render-only, EDG32 palette guard green, determinism untouched (downstream of the
snapshot). Tests: client **188** (+ `raiderTier` tier test; updated the old
"always red" raider assertion to the tier-aware expectation), typecheck clean.
Branch `feat/citadel-entity-legibility` → main.

> Side-note found during the re-scope: the audit's **P1#8** (windowController.update
> not ticked) is **already wired** in [main.ts:851](../games/citadel/client/src/main.ts#L851)
> — that deferred audit item is effectively closed.

## [2026-06-26] feat | Citadel gameplay depth — siege variance + threat consequence + interlocks + decree counterplay (full menu)

Closed three coupled gameplay todos (full-menu scope, user mandate) on branch
`feat/citadel-gameplay-depth` → main:
[siege-variance-and-raid-counterplay](todos/closed/2026-06-19-citadel-siege-variance-and-raid-counterplay.md),
[threat-mechanical-consequence](todos/closed/2026-06-19-citadel-threat-mechanical-consequence.md),
[system-interlocks-and-decree-counterplay](todos/closed/2026-06-19-citadel-system-interlocks-and-decree-counterplay.md).

**Siege variance** ([siege-resolution.ts](../games/citadel/sim-core/src/systems/siege-resolution.ts)):
`resolveSiege` now *consumes* its seeded fork into probability bands (ratio ≥1.5 →
~90% repel; 1.0 → 55% repel; 0.5 → mostly damage w/ a tail to sacked; <0.5 → mostly
sacked) — **this also resolves citadel-38 P3#14** (the dead fork is now load-bearing
*and* read). Per-raider `morale` (0..100) decays when the player strengthens defense
mid-march and biases the roll toward the defender. Fork label keyed `siege-${p.id}-${id}`.

**Raid counterplay** ([raider-movement.ts](../games/citadel/sim-core/src/systems/raider-movement.ts),
[raid-spawn.ts](../games/citadel/sim-core/src/systems/raid-spawn.ts)): a **scout**
(watchpost/garrison) reveals the next raid's strength ~2 days early; **garrison
interceptors** shave 25% off a raider whose tile falls in garrison coverage (once
per raider, `intercepted` flag).

**Threat consequence**: threat now drives (a) **raid cadence** — higher threat
shortens the next-raid interval (−3 days at 100); (b) **decree gating** — conscription
is blocked unless a raid is active or threat ≥ 40 (emergency lever); (c) **defense
pressure** — defensive strength gets +0..20% scaled by threat.

**Garrison purpose**: each active garrison stretches the raid interval (+1 day,
patrols deter) and provides a safety radius (via the citadel-38 P2#12 SAFETY_PROVIDERS
set) — so siting it early is a real decision.

**Interlocks** ([fire-system.ts](../games/citadel/sim-core/src/systems/fire-system.ts)):
raid `applyRaidDamage` can **ignite** a surviving wooden building (40%; `igniteBuildingById`
export — wells/firebreaks now tactical vs raids); **disease** scales down the
conscription defense term by the sick fraction (sick conscripts desert); a **burning
building suppresses adjacent** non-burning buildings' output within radius 2.

**Decree counterplay** ([needs-happiness.ts](../games/citadel/sim-core/src/systems/needs-happiness.ts),
setDecree handler): a one-shot **festival** decree (costs 8 bread, +15 happiness for
2 days) makes strain a repayable loop; a **stacking penalty** (−3 per strain decree
beyond the first) punishes panic-stacking. *Silent auto-expiry was tried and dropped*
— it surprised players who set a standing decree on purpose and broke an existing
phase3 test's contract; festival + stacking deliver the todo's "strain is no longer
permanent" without that surprise.

**Trader dynamic pricing** ([trader.ts](../games/citadel/sim-core/src/systems/trader.ts)):
offers are generated from the player's stockpiles — give your plentiful goods,
receive your scarce ones, rate sweetening with the surplus→scarcity gap (seeded ±1
jitter). Replaces the three hardcoded (often strictly-worse) offers.

**Determinism**: all sim-side, every random choice via `state.rng.fork`/`nextFloat`.
Verified **reproducible** across seeds {1,42,0xc0ffee} × scenarios {grow,siege,sack,
fire,disease}. Baseline **moved by design** (siege fork relabel + new mechanics) — the
project contract is same-seed reproducibility, re-proven, not equality to old numbers.
Tests: sim-core **148** (137 + 11 new [gameplay-depth.test.ts](../games/citadel/sim-core/src/systems/gameplay-depth.test.ts)),
client 187, server 5 — all green; all 4 workspaces typecheck clean. New PlayerState
fields: `festivalDaysLeft`, `scoutWarned`; RaiderState: `morale`/`defenseAtSpawn`/
`scouted`/`intercepted` (optional, back-compat with inline test constructors).

## [2026-06-26] fix | Citadel-38 audit — P0 MP-authority + P1#5 + P2 balance + P3 cleanup

Worked the [citadel-38 implementation-review todo](todos/closed/2026-06-19-citadel-38-implementation-review-problems.md)
(P0 + P1#5 + P2 + P3), per user mandate. Branch `fix/citadel-38-audit` → main.

**P0 — MP authority (server-authoritative griefing):**
- #1/#2 `demolish`/`upgradeBuilding` now reject unless `b.ownerId === localPlayer(state).id`
  — closes "any peer razes any city / drains a rival's stockpiles." [sim-bootstrap.ts].
- #3 host rejects an inbound `command` whose type is `setActivePlayer` (server-internal
  routing marker must not be client-forgeable). [sim-host.ts].
- #4 added a room **owner** (first non-bot peer) and gated `pause`/`resume`/`speed` to
  it; owner re-promotes on detach. [sim-host.ts].

**P1#5 (MP correctness, solo no-op):** VillagerSystem `assign()` + `firstStore()` now
filter by `ownerId === v.ownerId` — villagers only staff/haul to their own buildings.

**P2 (single-player-visible balance):**
- #10 tier count excludes wall/gate (not just road) — wall-spam can no longer reach
  Citadel/Fortress tier. [tiers.ts].
- #11 direction-aware tier message ("fallen from" on demotion, not "risen"). [tiers.ts].
- #12 tower/garrison/keep/town-hall now feed `safetyCoverage` (their `SERVICE_RADII`
  were dead data) via a `SAFETY_PROVIDERS` set. [needs-happiness.ts].
- #13 snapshot `keepPresent` tests the production def's `isKeep`, not the literal
  `"keep"` type, so MP's `town-hall` anchor registers. [sim-bootstrap.ts].

**P3 (cleanup/robustness):** #15 `CitadelServerClient` onerror/onclose + `onDisconnect`
+ queue cap (256). #16 removed dead `BuildingRuntimeState.inputBuffer` (write-once,
3 sites). #17 `localPlayer()` is `find()`-only (no index fast-path). #18 bot anchors
spread over a √-grid keyed by playerId (no collision >4 bots). #19 removed dead
`DEFAULT_TICKS_PER_DAY` + its `void` keep-alive.

**Deferred:** P3#14 (siege dead-fork determinism trap) → resolved naturally by the
siege-variance gameplay todo (which makes siege *consume* the fork). P1#6/#7/#8/#9
(social-layer consume, RunRegistry, windowed-bake wire, MP render entities) need
live-MP / real-GPU verification — out of this pass per mandate.

**Verified:** all 4 Citadel workspaces typecheck clean; tests green (sim-core 137,
client 187, server 5). Headless `SCENARIO=grow|siege|sack|starve` (SEED=1, 40d)
**byte-identical** before/after — even the sim-touching P2#12/#10 + P1#5 changes
produce no behavior change in the standard scenarios (solo single-owner + scripted
layouts don't trip the new paths); P2#12 is latent capability, not a baseline move.
Same-seed re-run reproducible.

## [2026-06-26] perf | Engine GC-churn hygiene — prealloc WebGPU draw scratch + double-buffer CommandQueue

Closed two engine perf todos (`engine-prealloc-webgpu-draw-uniforms`,
`engine-reuse-transport-queue-buffers`) → [todos/closed/](todos/closed/).

- **WebGPU draw scratch:** `StaticLayerPass.draw()` and `WaterPass.draw()` each
  allocated a fresh `Float32Array` (8 / 36 floats) per frame just to `writeBuffer`
  it. Now a `readonly quadScratch`/`waterScratch` field mutated in place each frame
  (`writeBuffer` copies synchronously → reuse is safe).
  [static-layer-pass.ts](../engine/core/src/render/webgpu/static-layer-pass.ts).
- **CommandQueue double-buffer:** `drain()` did `pending.slice()` per tick (alloc even
  when empty). Now the same swap-buffer dance as `MessageBus.flush()` — `pending`↔`drained`
  swap, return the live `readonly` view. Sole consumer `CommandSystem.run()` fully
  iterates and retains nothing, so the swap is safe; re-entrant `enqueue()` during
  dispatch correctly defers to next tick (matches old `slice` semantics).
  [command-queue.ts](../engine/core/src/commands/command-queue.ts).
- **MessageBus.send() freelist:** deliberately **deferred** per the todo — a
  `QueuedMessage` freelist is more involved than the array swap and unjustified at
  current message volume (sim tick ~0.7% of budget). Note the decision; revisit only
  if a profile shows message churn matters.

Verified: `@engine/core` typecheck clean; 157/157 non-wasm engine tests green (the
1 `pathfinder.test.ts` failure is a pre-existing missing `dist/pathfinding.wasm`
artifact on this checkout, not a regression — fails identically on clean main).
Headless 3-day `EXPORT=json` (SEED=0xc0ffee) **byte-identical** before/after →
transport change is behavior-preserving. Render parity is by construction (same
float values uploaded). Branch `perf/engine-prealloc-buffers` → main.

## [2026-06-22] citadel | Coverage overlay + placement ring shipped (OpenTTD brief 1/3)

Implemented the first of the three OpenTTD-influence briefs:
[catchment-coverage-overlay](todos/2026-06-22-citadel-catchment-coverage-overlay.md)
— render/UI only, no sim change. New pure `games/citadel/client/src/render/coverage.ts`
mirrors the sim's coverage geometry (`serviceCenter`, `SERVICE_RADII`, Manhattan test)
so the visuals can't drift from `needs-happiness.ts`; `pushCatchment` stamps flat iso
ground diamonds on a new `LAYER_COVERAGE`. Three pieces: **placement ring** (a service
building's reach drawn around the ghost, tinted by need), **"covers 0 homes" toast** on
placing a chapel/market/watchpost that reaches no houses, and a **`C` overlay toggle**
that washes the union of faith/safety/goods catchments so gaps show. Unit-tested
(`coverage.test.ts`); client typecheck + 202 tests + palette guard green. Directly
addresses **P2** in the playtest findings (services placed out of range, zero feedback).
**Playtested live (Chrome+WebGPU)**: ring, `C` overlay (three distinct washes), and the
"covers 0 homes" toast all confirmed; the overlay made a stranded faith catchment's gap
obvious at a glance. Added a DEV-only `__citadel.tileToScreenCss` hook so the harness can
drive real UI gestures (hover/click specific tiles), not just the command channel.
The two sibling briefs (two-way service economy; farm perishability) remain open — both
are sim-side and carry determinism cost, so they're deliberately not bundled here.

## [2026-06-22] research | OpenTTD influence — 4 todo briefs filed

Researched OpenTTD (transport-network sim) vs. our two games and filed four
`corpus/todos/` briefs capturing the borrowable ideas. The throughline: OpenTTD's
depth is a set of **legible cause→effect loops** (service quality drives production;
catchment areas are drawn; cargo pays on distance×freshness; towns visibly grow when
served) — exactly the layer our one-directional, auto-distributing economies skip.

- **[catchment-coverage-overlay](todos/2026-06-22-citadel-catchment-coverage-overlay.md)**
  (Citadel, render/UI only) — draw service radius rings + a coverage overlay toggle +
  "covers 0 homes" toast. Direct fix for **P2** in
  [playtest-findings](todos/2026-06-22-citadel-playtest-findings.md) (services land
  out of range with zero feedback). Legibility, not re-tuning — the spacing tension
  is intended.
- **[two-way-service-economy](todos/2026-06-22-citadel-two-way-service-economy.md)**
  (Citadel, sim) — production reacts to whether output is collected/consumed
  (OpenTTD's >60%/>80% banded growth + stockpile spoilage), plus service-driven
  settlement growth. Makes roads *matter*. (NB: the P0/P1 growth deadlock was already
  fixed in the entry below — coordinate the growth-signal half with that, don't
  re-tune the same numbers.)
- **[farm-perishability-distance-pricing](todos/2026-06-22-farm-perishability-distance-pricing.md)**
  (Farm Valley, sim) — produce decays in value over time; far harbors pay more but
  risk decay. Turns AP-throughput into a where/when decision; leverages existing
  harbor/boat infra. Main cost = teaching the BDI personalities to react; re-balance
  [economy.md](wiki/economy.md).
- **[openttd-art-and-gameplay-influence](todos/2026-06-22-openttd-art-and-gameplay-influence.md)**
  (both, research note) — OpenGFX validates Citadel's existing iso/EDG32/silhouette-
  first direction ([brief 96](briefs/game/todo/96-citadel-building-art-style-reference.md));
  borrow read-at-any-zoom discipline + "world visibly reacts to the player" feel.
  No iso conversion for top-down Farm Valley.

## [2026-06-22] fix | Citadel — resolved growth deadlock + road-routing + minimap-rotate + placement feedback

Worked the three 2026-06-22 todos. All sim changes re-proved deterministic
(`grow`, seeds `0x1a2b3c4d` / `0xdeadbeef` / `0x99`, byte-identical across paired
runs); full citadel suite green (146 sim + 193 client tests).

- **Growth deadlock (playtest P0/P1) — fixed.** Root cause was deeper than the
  todo's "founders stop one-per-type": Citadel production output is **per-building,
  gated only on `workerCount > 0`** (a 2nd worker on a multi-slot building is a
  mouth with zero extra output — see [production.ts](../games/citadel/sim-core/src/systems/production.ts)),
  AND the worker-assignment tiers in [villager-system.ts](../games/citadel/sim-core/src/systems/villager-system.ts)
  treated **pure services** (chapel/market/watchpost — no `inputGood`) as "primary
  producers", so they were staffed in **tier 1, ahead of the bakery** (a converter
  in tier 2). With limited pop the services siphoned labour off the bread chain →
  flour piled up, bread stayed ~0, town starved. Three coupled fixes:
  (1) assignment now staffs **goods buildings before pure services** (new top
  discriminator `wantGoods`); (2) founding spawns one worker **per unstaffed
  connected building** (not per type — so a 2nd bakery gets staffed), gated
  `bootstrapping || bread>0` so a starving colony stops attracting founders;
  (3) post-founding immigration fires on a **healthy bread buffer** (`bread ≥ pop`),
  not only a strictly-positive daily surplus. Result: `grow` rises to Village by
  day 5 and **holds pop 10–11/12 through a full 80-day year** with a banked bread
  surplus, surviving winter + recurring disease. The per-founder `+5` bread ration
  is **load-bearing** for bootstrap (the 3-building bread chain produces nothing
  until all three are staffed) — winter colonies still die because rations are
  finite and grain is 0. Two tests updated to the corrected model: the
  `workHours`-grain test gained a chapel **control** (faith coverage keeps both
  runs above the 30 morale-departure floor, isolating the +30% output effect from
  morale churn).
- **Silent placement reject (P1-live) + tier-lock toast spam (P2) — fixed.**
  [sim-bootstrap.ts](../games/citadel/sim-core/src/sim-bootstrap.ts) `placeOne` now
  returns a **reason code** (`tier`/`territory`/`occupied`/`terrain`/`bounds`)
  instead of a silent `false`; a single building emits one descriptive event, and
  a road/wall **drag coalesces** per-tile rejections into one summary ("12 walls
  need Village tier", "N tiles blocked — the run has a gap") instead of ~20 toasts.
- **Road drag routes around buildings — done (client-only).** New pure
  `routeRoadPath` (bounded A*, turn-penalty tie-break) in
  [placement-state.ts](../games/citadel/client/src/ui/placement-state.ts): keeps
  the straight L when clear, detours around footprints when blocked, treats water
  as passable (decks to a bridge), falls back to the L + a "no clear route" toast
  when fully walled. Unit-covered (clear-L / detour / water / no-route / blocked
  endpoint).
- **Minimap viewport now a rectangle — done (render-only).**
  [minimap.ts](../games/citadel/client/src/ui/minimap.ts) redrawn in iso world-px
  (terrain re-baked as iso diamonds; entities projected through `tileToIso`;
  click-to-seek inverts the same fit transform), so the inverse-projected camera
  viewport reads as an upright rectangle instead of a diamond. EDG32-clean.

Still **open** in the playtest todo: P2 service-coverage placement feedback
(radius ring / "covers 0 houses" cue) and P3 disease counterplay — both untouched.
The two render/client todos should still get a live real-GPU pass (the
playtest-citadel skill) to confirm feel.

## [2026-06-22] tooling | playtest-citadel skill + live-run findings + spacing-design note

Added a tracked project skill **`.claude/skills/playtest-citadel/`** (`SKILL.md` +
`play.mjs`) so Claude can play Citadel end-to-end in the real client (Playwright +
system Chrome, WebGPU) with a pre-defined build plan, climb tiers, attempt
upgrades/barters, record a `report.json` timeline + screenshots, report findings into
the corpus, and end by **grilling the user** to turn ambiguities into decisions.
`.gitignore` now tracks `.claude/skills/` (rest of `.claude/` stays local);
`citadel-playtest-out/` is ignored.

Hardening the driver surfaced two operational facts, now in SKILL.md: (1) the driver
must **place buildings → verify against the snapshot → retry → then lay roads**, because
sending buildings + a big road carpet in one burst lets the carpet claim tiles before
the buildings resolve, silently dropping them; (2) **Vite HMR full-reloads the client
(wiping the Worker sim to day 1) when any watched game file changes mid-run** — the
driver now detects the reset and re-bootstraps. A packed default plan also **burned down
by ~day 25** (fire), confirming the spacing pressure — fixed by a ≥6-tile grid + wells.

Design call recorded (user-confirmed): the **fire-spacing vs service-radius/connectivity
tension is intentional**, not a bug — documented in
[citadel-overview.md](wiki/citadel-overview.md); the playtest-findings P2 item is
re-scoped to coverage *legibility*, not re-tuning. The live run also confirmed the P0
immigration deadlock first-hand (pop pinned at the founding size); a parallel session is
already implementing the founder-slot fix in `immigration.ts`.

## [2026-06-22] todo | Citadel — headless playtest findings + road-routing + minimap-rotate

Playtest pass driving the headless runner (`npm run sim:citadel`, `grow` + `siege`,
40–60 days). Filed three new todos in [todos/](todos/):

- **[playtest-findings](todos/2026-06-22-citadel-playtest-findings.md)** — the
  default `grow` scenario does **not** grow: pop pins at 6/12 then collapses to 2
  (Village→Hamlet) by day 60, against its documented "grow past 8+". Also: services
  give **no feedback** when they cover zero houses ("built a chapel, nothing
  happened"); recurring 1-villager disease has no real counterplay in a sparse
  town; and `siege` day-0 dumps ~20 tier-lock rejection toasts (unreadable
  cold-open). **Extended with a live real-GPU run** (Playwright + system Chrome,
  WebGPU; 565 in-game days at 4× via the `window.__citadel.send` dev hook) which
  pinned the root cause (new **P0**): an **immigration deadlock** — founders stop
  once each building *type* has one worker (not when slots fill), so the food chain
  runs half-staffed at break-even, daily `foodSurplus` sits at 0, and post-founding
  immigration (gated on surplus > 0) never fires. Pop freezes at the founding size
  forever. Consequence: **Town tier (pop ≥ 10) is unreachable via normal play, so
  keep/garrison never unlock and L3 upgrades are impossible** — i.e. "unlock +
  upgrade all buildings" can't currently be completed legitimately. Live also
  confirmed placement fails **silently** (no toast on occupancy/terrain reject).
- **[road-routing-around-buildings](todos/2026-06-22-citadel-road-routing-around-buildings.md)**
  — road drag lays a fixed L (`shortestRoadPath`) with no obstacle awareness; when
  it clips a building the sim silently rejects those tiles, **gapping** the road and
  breaking connectivity. Make the client-side path search route *around* footprints
  (water still decks into a bridge); sim placement rules unchanged.
- **[minimap-rotate-viewport-rectangle](todos/2026-06-22-citadel-minimap-rotate-viewport-rectangle.md)**
  — minimap draws in axis-aligned tile space so the iso camera viewport reads as a
  diamond; rotate the minimap into iso/screen space so the viewport box is an upright
  rectangle. Render-only.

## [2026-06-22] fix | Citadel 38 — P2#10/#11 tier balance + real-GPU verification

First session driving Citadel **live on a real GPU** (the dev box is native Windows, not
WSL — WebGPU renders). Toolchain: Playwright + **system Chrome** (`--enable-unsafe-webgpu`).
Note the **Playwright-bundled Chromium can't create a WebGPU device here** (`dxil.dll`
Windows error 87 — the bundle lacks the DXC shader-compiler DLLs); installed Chrome/Edge
work (`channel: "chrome"`) → backend `webgpu`, iso terrain + buildings render.

Fixes off the [audit](todos/2026-06-19-citadel-38-implementation-review-problems.md)
(suggested-fix-order item 5, the single-player-visible balance bugs):
- **P2#10** — `TierSystem` counted wall/gate tiles as settlement buildings → wall-spam
  alone climbed to Town. Extracted pure `countsTowardTier(type)` (excludes
  `isRoad`/`isWall`/`isGate`); walls still feed `defensiveStrength`, not settlement size.
  [tiers.ts](../games/citadel/sim-core/src/systems/tiers.ts).
- **P2#11** — (a) tier-change event is now direction-aware ("risen"/"fallen"); (b) added a
  per-player `peakTier` high-water mark ([sim-state.ts](../games/citadel/sim-core/src/sim-state.ts))
  — build/upgrade tier-locks gate on `unlockTier(p)` = max(tier, peakTier), so a demotion
  (disease/starvation) never re-locks an already-unlocked building. `peakTier` added to the
  snapshot; client gates buttons/upgrade-hint on it, HUD still shows current `tier`.
- **Determinism:** sim-touching (wall-exclusion changes tier counting; `peakTier` is new
  monotone derived state feeding gating only). Solo `EXPORT=json` re-proof NOT run
  (ask-first / constrained-hardware rule) — carried forward. It's a deliberate balance move
  regardless. Tests: [phase5.test.ts](../games/citadel/sim-core/src/systems/phase5.test.ts)
  +4. `@citadel/sim-core` 146/146, client 187/187, server 9/9; citadel typecheck clean.
  (Pre-existing, unrelated: `@tool/world-preview` typecheck fails on `@webgpu/types` /
  `.wgsl?raw` in engine `weather-pass.ts` — reproduces on a clean tree, not from this change.)

**Verification win:** the **true-iso flat-box anomaly** (market/storehouse/bakery/woodcutter
allegedly flat) **does not reproduce on this real GPU** — all render as iso volumes; only
`market` is flat, by design (`marketStalls`). Confirms the host-specific-driver hypothesis;
note added to [the iso epic](todos/2026-06-21-citadel-true-isometric.md).

## [2026-06-22] fix | Citadel 38 — P1#7 reconnect-frozen-sim (reap-grace + reset)

Third fix wave off the [audit](todos/2026-06-19-citadel-38-implementation-review-problems.md)
(suggested-fix-order item 4). `CitadelSimHost.detach` stopped the tick interval but
never nulled `sim`, so once every peer left, a reconnecting peer's `init` took the
"already running" branch and got a snapshot of a frozen (non-ticking) sim.

- [sim-host.ts](../games/citadel/server/src/sim-host.ts): adopted the Farm
  `RunRegistry` reap pattern, adapted to Citadel's single-room-per-process host. The
  last departure now **arms a grace timer** (`reapGraceMs`, default 10s) instead of
  tearing down immediately — the sim keeps ticking during the window so a refresh/blip
  reconnect rejoins the same live game. If the timer fires while still empty, `reset()`
  nulls `sim` and clears tick/hostPeer/bots/paused/speed/nextPlayerId, so the next
  `init` starts a clean, ticking room. `attach` cancels any pending reap.
- **Scope:** kept single-room-per-process (the keyed multi-room registry that Farm has
  is the deliberate follow-up per index.ts). This is a transport/lifecycle change only —
  the deterministic sim is untouched, so no determinism concern.
- Test: [run-lifecycle.test.ts](../games/citadel/server/src/run-lifecycle.test.ts) —
  fake-timer reap → reconnect gets a *fresh* ticking sim (distinct instance, clean
  building set); within-grace reconnect → *same* live sim, reap canceled. `@citadel/server`
  9/9, typecheck clean.

Still open from the audit: P1 #6 (social layer — GPU/live), #9 (MP render — GPU); P2
#10–#12; P3 #14–#19.

## [2026-06-22] fix | Citadel 38 — P1#5 villager owner filter

Second fix wave off the [audit](todos/2026-06-19-citadel-38-implementation-review-problems.md)
(suggested-fix-order item 2). `VillagerSystem` ignored `ownerId`: in MP a player's
villagers would take the nearest *rival* workplace, haul to a rival store, and — since
the deposit credits `v.ownerId` — siphon the rival's output into their own pool.

- [villager-system.ts](../games/citadel/sim-core/src/systems/villager-system.ts):
  `assign()` (both the `staffedTypes` precompute and the workplace tier loop) and
  `firstStore()` now skip buildings where `building.ownerId !== v.ownerId`. `firstStore`
  took an `ownerId` param (call site passes `v.ownerId`).
- **Determinism:** no-op in solo (single owner → every building matches the villager) →
  byte-identical; no determinism check run (ask-first rule). The full solo economy +
  hauler-reroute suites still pass, confirming the no-op.
- Test: [villager-owner.test.ts](../games/citadel/sim-core/src/systems/villager-owner.test.ts)
  — drives `VillagerSystem` directly (no scheduler → no connectivity recompute) with a
  two-owner set; a player-1 villager skips the *nearer* player-0 farm for its own farther
  one, the rival farm stays unstaffed, and hauling targets the owned store. Plus a
  same-owner nearest-assignment control. `@citadel/sim-core` 138/138, typecheck clean.

Still open from the audit: P1 #6 (social layer — GPU/live), #7 (RunRegistry), #9; P2
#10–#12; P3 #14–#19.

## [2026-06-22] fix | Citadel 38 — P0 MP-authority pass (+ #13, P1#8 correction)

First fix wave off the [implementation-review audit](todos/2026-06-19-citadel-38-implementation-review-problems.md)
(suggested-fix-order item 1 + the trivial wins). Closed the four P0 server-authority
holes that trusted the sender in a live MP room:

- **P0#1 demolish** + **P0#2 upgradeBuilding** ([sim-bootstrap.ts](../games/citadel/sim-core/src/sim-bootstrap.ts)):
  added `b.ownerId !== localPlayer(state).id` guards so a peer can't raze a rival's
  town-hall (= instant elimination) or force-upgrade and drain a rival's stockpiles.
- **P0#3** ([sim-host.ts](../games/citadel/server/src/sim-host.ts)): the host now drops any
  client-injected `setActivePlayer` (server-internal routing marker only) and stamps its
  own trusted one for real commands.
- **P0#4** (sim-host.ts): room control (pause/resume/speed) is host-only — `hostPeer` =
  first attached peer, migrates to the next survivor on host detach; non-host control
  messages are ignored. Added `isPaused`/`speedMultiplier`/`hostPlayerId` test getters.
- **#13** (sim-bootstrap.ts `getSnapshot`): `keepPresent` now tests
  `getProductionDef(type)?.isKeep` so the MP `town-hall` anchor counts (was a literal
  `type === "keep"` → MP always read "no keep").

**Determinism:** the whole set is byte-identical in solo by construction — the
ownership guards are no-ops under a single owner, and `keepPresent` is render-only with
`town-hall` never spawning in solo (only `keep` and `town-hall` carry `isKeep`). No
determinism check run (constrained hardware; ask-first rule). New tests:
`mp-authority.test.ts` in sim-core (3) + server (2). Verified: `@citadel/sim-core`
136/136, `@citadel/server` 7/7, both typecheck clean.

**Corpus correction:** the audit's **P1#8 ("windowController.update never ticked") is
STALE** — `windowController.update(camera)` already runs each frame at `main.ts:792`
(landed in the "improvements" commit alongside the audit). Marked resolved in brief 38.
Still open from the audit: P1 #5/#6/#7/#9, P2 #10–#12, P3 #14–#19.

## [2026-06-21] brief | Citadel building art-style reference filed (todo 96)

Filed [brief 96](briefs/game/todo/96-citadel-building-art-style-reference.md) — a
standing art-direction reference for Citadel building sprites: the user's example
assets (Reiner "Isometric Buildings" CC-BY-SA + zatoart/xilurus itch packs,
inspiration-only), the target look (clean 2:1 iso, warm terracotta tile roofs,
half-timber + ashlar coursing, ground plots + props, animated tower mill), the
EDG32 `SWATCH` colour roles, the per-type FORM builders, and the hard constraints
(EDG32 guard, render-only, recipe tests). Living doc to keep new/restyled buildings
on-theme; not a one-shot task.

## [2026-06-21] render | Citadel night light-pool fix — emitters no longer render as orange BOXES

In-game Playwright testing showed the **market** (and other glow emitters: bakery,
chapel) rendering as a hard **orange box** over the building. Root cause (found via
a live `renderer.push` capture hook): the night light-pool glow
([atmosphere.ts](../games/citadel/client/src/render/atmosphere.ts) `lightPoolQuads`
+ `pushLightPool` in [citadel-renderer.ts](../games/citadel/client/src/render/citadel-renderer.ts))
stamped concentric **solid `px` squares** at `LAYER_LIGHT_POOL = 12` (ABOVE
buildings, layer 10), tinted EDG.gold/orange. Stacked at full night they washed a
boxy orange tint over each emitter's sprite — NOT a sprite-art bug (the `bld/market`
recipe + atlas frame were verified correct end-to-end).

Fix (render-only): `pushLightPool` now stamps the soft **`fx/diamond`** frame (a
real iso 2:1 diamond, transparent corners) projected onto the iso ground via
`tileCenterToIso`, instead of `isoProjectTilePxBox` + the solid `px` square; moved
`LAYER_LIGHT_POOL` to **9** (just above the drop-shadow, BELOW buildings) so the
glow pools on the GROUND around each emitter's base like lamplight rather than over
the sprite; and lowered `GLOW_RINGS` alphas (~0.045–0.06, retuned for solid
diamonds vs the old transparent-cornered squares). Verified in-game: market/bakery/
chapel now render their sprites with a subtle ground glow; depth-sort + footprint
alignment confirmed correct across the full tier-1 set. typecheck + 187
@citadel/client tests (incl. 15 atmosphere tests) green. The pre-existing
`transform.ts`/`placement-state.ts` `centerX` console errors are unrelated in-flight
work, untouched.

## [2026-06-21] render | Citadel mill + well rebuilt (were the two weak forms)

User flagged the mill + well as looking bad vs the reference packs. Both were
oddball custom shapes that didn't follow the clean iso-volume language:
- **Mill** was a flat front-facing weatherboard billboard on a thin trestle with a
  tiny clumped sail. Rebuilt `postMill` as a real **tower mill**: a tall tapered
  ROUND stone cylinder (lit-left/shaded-right body shading + stone coursing), a
  domed terracotta cap, small arched door + stacked windows, on a stone plinth.
  New `MILL` palette (warm cream/tan stone + clay cap) replaces WOOD (whose black
  `roofDark` made the heavy black silhouette). `isoWindmillSails` redrawn as a
  bold front-facing X of latticed canvas blades (no iso-squash) — reads as a
  windmill; the 8-frame rotation still animates.
- **Well** was a full STONE building box with a tiny hood. New `wellForm`: a small
  round stone well-head (low cylinder kerb + rim ellipse + dark shaft + blue
  water) with two posts, a pitched clay roof, a windlass crossbar, and a bucket on
  a rope — a small ground object, not a house. `isoWellHood` retired from use.
Verified by raster zoom (mill/well + 4 mill rotation frames) — both now match the
reference look. typecheck + 187 @citadel/client tests + EDG32 guard green.

## [2026-06-21] render | Citadel buildings — reference restyle FINISHED (brief 95 → done)

Completed the remaining brief-95 items at 32-based: fixed the fort **ashlar
coursing** (`drawAshlarCourses` — sparse staggered blocks ≥5px courses/≥8px
bricks, killing the per-pixel checkerboard the 4×→1× revert had exposed); made
**half-timber** legible at 32px (min stud spacing, diagonal braces gated to tall
walls); added **ground-prop plots** (`isoGroundProps` — dirt apron + barrel + sack
via a `ground` FormOpt on house/bakery/healer); simplified `drawWalls` to clean
lit/shaded faces (dropped palette-fragile AO bands). Verified: typecheck + 187
@citadel/client tests + EDG32 guard green; Playwright in-game pass (terracotta
half-timber cottages render correctly at game zoom). Brief 95 moved to
[done](briefs/game/done/95-citadel-building-restyle-reference-look.md). (Pre-
existing `transform.ts`/`placement-state.ts` `centerX` console errors are from
unrelated in-flight work on those files, not this brief.) Files this session:
[iso-draw.ts](../games/citadel/client/src/render/sprites/recipes/iso-draw.ts),
[buildings.ts](../games/citadel/client/src/render/sprites/recipes/buildings.ts).

## [2026-06-21] render | Citadel buildings — reference restyle (terracotta/half-timber) + revert to 32-based

User supplied reference art (Reiner "Isometric Buildings" CC-BY-SA + zatoart/
xilurus itch packs) and asked the generated buildings to evoke that look:
**terracotta tile roofs** (clay/salmon/rust ramp, tile-course banding, ridge cap,
eave-overhang shadow), **half-timber** framing (oak studs + diagonal cross-braces
over cream infill), 3-step wall shading. Implemented in `drawGableRoof` /
`drawTimberFrame` / `drawWalls` ([iso-draw.ts](../games/citadel/client/src/render/sprites/recipes/iso-draw.ts)),
`PLASTER` palette retargeted ([buildings.ts](../games/citadel/client/src/render/sprites/recipes/buildings.ts)).
EDG32-only (inspiration, not imported art). **Also reverted buildings from 4× back
to 32-based** (`ISO_ART_SCALE = 1`, [iso.ts](../games/citadel/client/src/render/iso.ts))
— user judged 32 dense enough in practice; this retires brief 94's "upscale
units/terrain" premise. Verified at 1× (raster): house/storehouse/chapel read with
roofs + framing; typecheck + recipes.test green. **Not finished** — captured as
todo brief [95](briefs/game/todo/95-citadel-building-restyle-reference-look.md):
remaining = stronger visible bracing at 1×, ground-prop bases, cleaner outlines,
full-set consistency + Playwright/in-game verification. Wiki:
[citadel-overview.md](wiki/citadel-overview.md).

## [2026-06-21] render | Citadel buildings — distinct medieval FORMS at 4×, animated mill

Follow-on to the per-type-accent pass below: rebuilt the buildings as **distinct
forms with their own proportions** (not one box + accents), authored at **4×**
(`ISO_ART_SCALE`), with an **animated mill**. Decoupled authoring resolution from
world size in [iso.ts](../games/citadel/client/src/render/iso.ts) (`isoArtDims =
isoSpriteDims × 4`; renderer keeps world-px, GPU samples the high-res texture into
the same quad). New form builders in
[iso-draw.ts](../games/citadel/client/src/render/sprites/recipes/iso-draw.ts):
`cottage` (half-timbered steep-roof house/bakery/smith/woodcutter/sawmill/healer),
`postMill` (tall trestle-mounted body + sails), `openField` (fenced tilled farm),
`marketStalls` (open striped stalls), `church` (nave + bell tower + spire),
`warehouse` (barn + hayloft — storehouse/tradingpost/town-hall), `fort` (ashlar +
crenellated deck + arrow slits — watchpost/tower/garrison/keep), `boxBuilding`
(mine/quarry/well). Mill animation: `bld/mill@0..7` rotated-sail frames +
`millFrameAt(clockMs)` threaded `buildingQuad(b,clockMs)` → `pushScene(...,clockMs)`
→ `main.ts` `performance.now` — **render-only, sim/determinism untouched**.
`BUILDING_SPRITE_TYPES` filters `@` frames; `BUILDING_HEIGHT_TILES.mill`→3.
Verified by rasterizing recipes to PNG, a Playwright gallery on the real runtime
atlas (mill sails confirmed turning across frames), and placing buildings in the
actual game. Green: typecheck, 187 @citadel/client tests (new mill-frame test +
relaxed opaque-fraction floor for the sparse open farm/market/mill), EDG32 palette
test. **Units + terrain stay 1×** — upscaling them to match is brief
[94](briefs/game/todo/94-upscale-units-terrain-to-match-buildings.md). Wiki:
[citadel-overview.md](wiki/citadel-overview.md) "Per-building FORMS + 4× detail".

## [2026-06-21] render | Citadel buildings — per-type silhouettes so they don't all read as a house

Every iso building was the same hipped-roof box differing only in colour/size, so
a mill, market, mine, and house were indistinguishable. Added a feature library to
[iso-draw.ts](../games/citadel/client/src/render/sprites/recipes/iso-draw.ts) and
assigned one iconic feature per type in
[buildings.ts](../games/citadel/client/src/render/sprites/recipes/buildings.ts).
Two silhouette-level breaks via new `makeIsoBuilding` opts: `flatTop` (a flat
**crenellated rooftop** for tower/keep/garrison/watchpost — reads as a castle) and
`noDoor` (mine/quarry get a timbered **shaft mouth + A-frame pithead** in place of
the door). Smaller per-type cues: windmill sails (mill), water wheel (sawmill),
striped awning (market), hayloft dormer (storehouse/tradingpost/farm), brick
chimney+ember (bakery/smith), log pile (woodcutter), grain sacks (farm/mill),
gabled hood+bucket (well), roof cross (chapel white / healer red), banners. `house`
stays the plain reference box. Render-only, EDG32-clean (all colours via `SWATCH`),
sim/determinism untouched. Verified by rasterizing each recipe to a PNG grid and
eyeballing; `npm run typecheck`, 186 @citadel/client tests, the iso-volume
opaque-fraction guard, and the EDG32 palette guard all green. Wiki:
[citadel-overview.md](wiki/citadel-overview.md) "Per-building visual language".

## [2026-06-21] render | Citadel iso sprites — fixed up-left offset (engine anchors sprites by CENTRE) + building float

Two render bugs from the true-iso conversion, both browser-confirmed via Playwright
and fixed:

1. **Up-left offset (ghost sat left of cursor, buildings floated off their footprint).**
   Root cause: the engine sprite-batch anchors every sprite by its **CENTRE** — both
   backends draw `pos ± 0.5·size` ([sprite.wgsl](../engine/core/src/render/webgpu/shaders/sprite.wgsl)
   vs `drawImage(x − w/2, y − h/2, …)` in [canvas2d/draw.ts](../engine/core/src/render/canvas2d/draw.ts);
   `spritesOverlap` agrees). But **every** Citadel iso helper (`isoFootprintBox`,
   `isoFootprintDiamondBox`, `isoPointBox`, `isoProjectTilePxBox`) returns a **top-left**
   rect, passed straight through `quadToSprite`/`isoFlatSprite`. So each sprite drew
   shifted up-left by half its own size; taller buildings shifted more than their
   (flat) shadow diamond → the float/gap. Pick was never wrong (verified: picked-tile
   centres round-trip to the cursor within a few px). Fix = add half-extents at the two
   rect→sprite choke points only (`quadToSprite`, `isoFlatSprite`); the pure iso math
   stays top-left (its tests untouched). Farm already passes centres (`x: tile*TILE + TILE/2`),
   confirming the engine convention — the fix belongs in Citadel's conversion layer, not the engine.
2. **Blank band under buildings.** `isoSpriteDims.height` budgeted a full `diaH` below
   the walls, but `iso-draw.ts` centres the ground diamond on the wall-bottom mid-line
   (`yBotMid`), so only its lower half sits below the walls → a blank `diaH/2` band that
   `isoFootprintBox` pinned to the diamond bottom and floated the art. Fix = `height =
   roofH + wallH + diaH/2`. Both fixes are needed (centring alone still floats via the band).

Also fixed an HTML layout bug: the full-window build menu was clipped because `#canvas`
(`flex:1`) lacked `min-height:0` (its `auto` min-height = intrinsic backing-store height
grew past `100vh` under `overflow:hidden`).

3. **Terrain elevation lift desynced roads/bridges from the grid.** `makeTerrainDecorate`
   baked each diamond at a 0/1-step relief *lift* (`Math.round(elevationField)`), but every
   sprite, the road/bridge network, and the `isoToTile` pick live at elevation 0 — so on
   lifted tiles the ground floated 8px above its own bridge/road and opened dark seams at
   elevation steps (a bridge visibly offset from the water grid). Fix = bake terrain FLAT
   (drop the geometric lift); the elevation field still tints the dither (light highs / dark
   valleys) for a flat-2D sense of relief, just no offset. Citadel tiles are flat
   gameplay-wise and the pick can't cheaply account for per-tile height, so flat-everywhere
   is the consistent choice. Browser-confirmed: seams gone, bridge sits on the water grid.

164 client render tests + typecheck green.

## [2026-06-21] game+render | Citadel bridges — roads over water transform into non-overlapping bridges

A road dragged onto a Water tile now auto-converts to a new `bridge` building
type (sim: `entities/building.ts` def + `isBridge` production flag; `placeOne` in
`sim-bootstrap.ts` does the road→bridge substitution and gates bridges to
unoccupied water → **bridges cannot overlap**). Bridges join `roadGrid` (so
villagers/connectivity cross them) and a new `walkablePred` keeps the decked
water tile walkable in the raider/path grid; demolish clears the road tile before
rebuilding. Render: two textured flat-diamond fx frames `fx/road` (cobblestone)
and `fx/bridge` (railed plank deck) replace the flat navy road lozenge;
`isoNetworkTiles`/`pushNetworks` emit + stamp them (bridges depth-tucked under
roads). Determinism untouched (terrain/placement + render-only art). Tests:
`systems/bridges.test.ts` (4) + an `isoNetworkTiles` bridge-frame case; all
citadel suites green (137 sim-core, 177 client), both workspaces typecheck clean.
Wiki: [wiki/citadel-overview.md](wiki/citadel-overview.md) BRIDGES section.

## [2026-06-21] render | Citadel true-isometric epic — IMPLEMENTED + browser-verified (one open anomaly)

Built the whole iso stack from the brief
([todos/2026-06-21-citadel-true-isometric.md](todos/2026-06-21-citadel-true-isometric.md),
now `mostly-done`). New `render/iso.ts` is the single source of truth: 2:1
dimetric projection (`tileToIso`), the placement-critical inverse (`isoToTile`,
exhaustively round-trip tested for all 9216 tiles), `isoFootprintBox` /
`isoSpriteDims` (shared by renderer + sprite generators so art maps 1:1), and
`isoDepth`. `transform.ts` `screenToTile` now routes through the iso inverse;
the camera frames iso-world space. The renderer CPU-pre-projects every quad and
relies on the engine's existing within-layer `sortY` for painter's order
(buildings/villagers/raiders share one entity layer + iso-depth `sortY`).
Terrain bakes as **diamonds** (`makeTerrainDecorate` rewrite, whole-iso-world
texture; iso windowing for the big MP map deferred). Roads/walls/ghost/shadow/
cluster draw via a new `fx/diamond` atlas frame so they sit flat on the grid
(`isoNetworkTiles`). **Sprites re-authored true-iso** (`sprites/recipes/iso-draw.ts`:
diamond base + two shaded wall faces + hip roof) at 32-based res; units redrawn
32×32. The sim, determinism, and EDG32 guard are untouched.

Browser-verified via Playwright (solo client): diamond terrain, correct
placement/ghost picking on the diamond, depth-correct occlusion, iso roads, and
house/chapel/tower/storehouse rendering as proper iso volumes (screenshots in
repo root: `iso-village.png`, `iso-sprites-fixed.png`). **174 client tests + a
new iso-volume guard + palette guard all green.**

**One open anomaly (documented in the brief, not blocking):** a subset of
building types (market/storehouse/bakery/woodcutter) intermittently render as a
flat 2-tone box on this dev GPU. Proved the sprite DATA is correct end-to-end
(recipe→rasterize→alpha→pack→blit→UV→render-quad all byte-identical to the
working house; the guard test passes for market). Not reproducible from code →
suspected WebGPU driver/texture-sampling artifact on this host; flagged for
repro on another GPU. Pre-existing unrelated `@farm/sim-core` test failures
(bridge-graph, interior-decor, coral-fishing, travel, farmer-frames) were
confirmed independent of this Citadel-only work.

## [2026-06-21] plan | Citadel true-isometric epic — brief filed (render+art, sim untouched)

Decided to convert Citadel from top-down axis-aligned to a **true isometric
(diamond-grid) projection**. Scoped as a staged brief
([todos/2026-06-21-citadel-true-isometric.md](todos/2026-06-21-citadel-true-isometric.md))
*before* any code, per the CLAUDE.md workflow — a partial projection swap breaks
placement (ghost/drag/click) for every player, so it must not land half-done.

Key framing: this is a **render + input + art** epic fully inside `@citadel/client`.
`@citadel/sim-core` is untouched — the world stays an axis-aligned tile grid, iso is a
*display* of it; determinism is unaffected (all downstream of the RenderSnapshot), and
`CHECK_DETERMINISM=1` should stay byte-identical (the proof the sim wasn't touched).
Cost split ≈ **70% art, 30% code**; the two risk centres are the `screenToTile`
*inverse* (powers all placement/selection) and the volume of sprite re-authoring.
Five stages, each independently shippable+tested: (1) iso projection+inverse in
`transform.ts`, (2) renderer CPU pre-projection + painter's-order depth sort, (3) iso
terrain bake + diamond render-window cull, (4) **re-author the sprite library at the
iso angle** (the bulk), (5) autotile/cluster iso geometry. Convention to lock first:
**2:1 dimetric** (integer-friendly, keeps `pixelSnap` crisp) over true 30°. Rejected
"Option C" (3D camera) — this is iso 2.5D, not 3D.

## [2026-06-21] render | Citadel visual polish — terrain relief, building shadows, dusk wash, asset detail

Borrowed specific visual ideas from `tiny-world-builder` (a Three.js voxel toy) into
Citadel's existing 2D WebGPU pipeline — render-only, deterministic, EDG32-clean,
no sim change. Four landed: **(1)** `elevationField` value-noise in
[terrain-dither.ts](../games/citadel/client/src/render/terrain-dither.ts) biases the
sub-tile dither light/dark mix by coarse elevation (sun-lit highs lighter, valleys
darker) — a 2D echo of iso height-strata, baked → zero per-frame cost. **(2)**
`buildingShadowQuad` in [quads.ts](../games/citadel/client/src/render/quads.ts) casts a
soft SE-offset ink shadow (fake NW sun) on a new `LAYER_SHADOW` below buildings; flat
features (road/wall/gate) cast none. **(3)** Deepened night + stronger golden-hour dusk
in [atmosphere.ts](../games/citadel/client/src/render/atmosphere.ts). **(4)** Asset
detail in the shared generators ([sprites/recipes/draw.ts](../games/citadel/client/src/render/sprites/recipes/draw.ts)):
roof shingle striations, wall masonry/timber seams, ground-contact corner shadow,
stone doorstep, fort ashlar courses — flows through all ~20 building recipes at once.
All 160 `@citadel/client` tests + the palette guard green. Not yet eyeballed in
`npm run citadel`. These carry over conceptually into the iso epic above.

## [2026-06-21] fix | Citadel first real-GPU playtest — 3 solo-blocking playability bugs fixed

First time Citadel was driven on a host with a working GPU (prior reviews were
headless — see the verification-debt note in todo 38). Opened the solo client
(`npm run dev -w @citadel/client`, :5174) in Playwright and ran a check→fix→recheck
loop. **WebGPU renders fine** — terrain (river/forest/stone with sub-tile dither),
building + villager sprites, HUD, day/night all look healthy. But three bugs made the
game effectively unplayable for a new player:

1. **Well + Healer were unbuildable.** `main.ts` wires `btn-build-well`/`btn-build-healer`
   but the buttons were **missing from `index.html`** — so the *only* fire and disease
   mitigations couldn't be placed. The wiring silently no-ops on the missing element
   (`if (btn !== null)`). Fix: added both buttons to the toolbar (after Trading Post).
   They are correctly un-tier-locked (available from Hamlet).
2. **Commands were dropped while paused.** The Worker loop did `if (paused) return;`
   *before* `scheduler.tick()`, and commands are only drained **inside** the tick —
   so placement while paused queued forever and never applied. A city-builder must let
   you plan while paused. Fix: added `applyCommands(ctx)` to `CitadelSimResult`
   ([sim-bootstrap.ts](../games/citadel/sim-core/src/sim-bootstrap.ts)) — runs the
   `CommandSystem` + `RoadConnectivitySystem` only (no sim systems, no day clock); the
   worker calls it + re-emits a snapshot when paused. **Purely additive — the normal
   tick path is byte-identical, so determinism is untouched** (all 133 sim-core tests
   still pass; headless runner never calls it).
3. **Speed buttons didn't resume.** `1x/2x/4x` only called `setSpeed`; if you'd paused,
   the sim stayed frozen. Fix: `setSpeedAndResume()` resumes if paused (standard
   city-builder behaviour).

**Bootstrap is founding-window-gated and easy to miss.** The founder villager only
spawns while `daysSinceStart <= daysPerYear/4 + 2`; after that, immigration needs a
food surplus that needs workers that need population — a hard deadlock if you didn't
place a connected economy in time. Combined with the always-running clock (20 ticks/day
≈ 1 s/day at 1×), a new player races the window. Now mitigated by plan-while-paused.
**Fire balance is working-as-designed, not a bug:** ignition needs ≥3 wooden buildings
within Manhattan range 4; the intended layout (cf. the headless `grow` scenario) spaces
buildings ~5–8 tiles apart and connects them with roads (roads = firebreaks). A naive
"place everything touching to share connectivity" layout self-immolates — but a spaced,
road-linked town thrives indefinitely (verified to Day 199: pop stable, bread surplus,
Fire none). New hooks: `import.meta.env.DEV`-guarded `window.__citadel` (send/terrain/
buildings) in `main.ts` for automated harness testing only. Touched: `@citadel/client`
(index.html, main.ts, sim-worker.ts, vite-env.d.ts) + `@citadel/sim-core`
(sim-bootstrap.ts). typecheck + 133 sim-core + 155 client tests green. (Pre-existing,
unrelated: `@tool/world-preview` fails typecheck on clean HEAD — missing `@webgpu/types`.)

## [2026-06-19] audit | Citadel implementation review — problems filed as todo 38

Read-only review of `@citadel/sim-core` + `@citadel/client` + `@citadel/server`
(three subagent passes, load-bearing findings hand-verified; no tests/sims run).
Solo Citadel looks healthy; the problems cluster in the **MP-RTS epic (28–37)**,
which is headless-tested but never run live. Findings → new todo
[2026-06-19-citadel-38-implementation-review-problems.md](todos/2026-06-19-citadel-38-implementation-review-problems.md):
**P0** server-authoritative command handlers trust the sender — `demolish` /
`upgradeBuilding` have no ownership check (raze/drain a rival's city), `setActivePlayer`
is client-sendable, pause/resume/speed are un-gated. **P1** VillagerSystem ignores
`ownerId` (cross-player staffing/hauling in MP); the Citadel-36 social layer
(presence/emote/roster) is dead client-side; one global SimHost with no RunRegistry
(reconnect = frozen sim); the 21/22 windowed-bake `RenderWindowController` is built +
`bakeInitial`-d but `update()` is never ticked in the frame loop (MP map won't repaint
on pan). **P2** wall-spam inflates settlement tier; tier-demotion says "risen"; tower/
garrison safety radii feed nothing; `keepPresent` misses `town-hall`. **P3** siege
forks an unused RNG (load-bearing-for-replay dead fork), no WS error handling, dead
fields. **Corpus corrections:** `bakeStaticLayer(region?)` IS implemented (engine
`static-region.ts`) — the BUILD-ORDER/21/22 "engine integration left open" claim is
**stale**; and the 21/22 cores are consumed (not dead), just not pan-ticked.

## [2026-06-19] feature | Citadel entity sprites — runtime-generated pixel-art atlas

Replaced Citadel's flat EDG-colored boxes (buildings/villagers/raiders sampled a
generated 1×1 white pixel) with real pixel-art sprites. New self-contained module
[games/citadel/client/src/render/sprites/](../../games/citadel/client/src/render/sprites/):
ASCII `PixelRecipe`s (a small procedural generator — `makeBuilding`/`makeFort` + bespoke
farm/mine/quarry/well shapes — keeps the ~20 building sprites correct-by-construction and
visually cohesive: one light direction, dark outline, hue-shifted ramps), an EDG-derived
swatch palette, a pure rasterizer + shelf-packer, and `createCitadelSpriteAtlas` which
bakes them (plus a retained 1×1 `px` frame) into ONE in-process atlas at boot. No
committed PNGs, no new build step — deliberately unlike Farm's committed-PNG
`@farm/atlas-recipes`/`npm run atlas` pipeline (can't import it: games never import each
other), and a better fit for Citadel's in-process-atlas + WebGPU + Worker setup.

`quads.ts` now sets a `frame` per entity (`bld/<type>` white-tinted; `vil/person` /
`raider` grey-ramp tinted by FSM-state / red). The WebGPU `SpriteBatch` already sampled
real frames, so no renderer change was needed. House clustering kept (each house draws as
its own sprite + a unifying neighbourhood border; `clusterQuads`→`clusterBorderQuads`,
union-fill dropped). Determinism untouched (recipes static, rasterize pure, render-only).
Verified: client typecheck + all 155 client tests + engine palette guard green; art
eyeballed via a Node-rendered contact sheet (GPU render not verifiable headless on WSL2).
Synthesis in [wiki/citadel-overview.md](wiki/citadel-overview.md#rendering--assets).
Phase 2 left open: terrain tiles, road/wall autotile sprites, gate sprite, MP owner color.

## [2026-06-19] feature | Citadel 21/22 render-windowed static-layer bake (MP spine K — integration shipped)

Finished the spine-K cores (21 render-window, 22 incremental-build-budget) that
were shipped as pure helpers but left inert (imported only by their own tests).
The missing piece was an engine capability: `bakeStaticLayer` baked the whole
world as one texture with no sub-region parameter.

- **Engine (shared, backward-compatible).** `bakeStaticLayer` gained an optional
  `region?: StaticRegion` ({originX, originY, width, height}) on `RendererLike` +
  both renderers. New pure module `engine/core/src/render/static-region.ts`
  (`resolveStaticRegion` / `staticBlitRect`) drives the Canvas2D blit AND the
  WebGPU `StaticLayerPass` src-UV math in lockstep. Bake sizes the offscreen to
  the region and `translate(-origin)`s so sprites/decorate keep drawing in WORLD
  coords; `draw` clamps the visible rect to the baked region. **Region omitted ⇒
  whole world ⇒ src == dst, translate skipped ⇒ byte-identical** — Farm Valley +
  solo Citadel provably unchanged (asserted directly in `static-region.test.ts`:
  "full-world region is the pre-windowing identity").
- **Citadel wiring.** `render/window-controller.ts` `RenderWindowController` joins
  the two cores: `visibleTileWindow` (21) → `windowRegion` → re-bake gated through
  the `IncrementalQueue` (22) at `REBAKE_BUDGET=1`/frame, coalesced to the latest
  window (clear+enqueue) so a fast pan never triggers a synchronous re-bake.
  `makeTerrainDecorate(grid, window?)` loops only the window's tiles. A texel
  threshold (2048²) keeps small worlds (solo 96²) on the proven whole-world
  bake-once path (`update` is a no-op); only the 256² MP world windows. Wired into
  `createCitadelRenderer` (`bakeInitial`) + the `main.ts` loop (`update` after
  `fitCameraToCanvas`).
- **Verified headless:** engine render 73/73 + new static-region 9/9; new
  window-controller 8/8 (windowed vs whole-world, no-rebake on unchanged window,
  ≤1 bake/frame, fast-pan coalescing); engine + @citadel/sim-core + (my)
  @citadel/client files typecheck clean. **⚠️ Real-GPU acceptance pending** (this
  headless box can't render WebGPU): memory-flat-as-grid-grows + pan smoothness +
  no seam; possible 1-frame trailing black margin if a re-bake lags past
  `WINDOW_PAD=8` tiles on a very fast pan (raise pad/budget if seen). Briefs 21/22
  → [todos/closed/](todos/closed/).
- **Concurrent-session note:** a parallel session was mid-flight on Citadel sprite
  assets in the same tree (`render/sprites/`, `quads.ts`, `citadel-renderer.ts`).
  The harness merged my windowController wiring into their `citadel-renderer.ts`
  edits cleanly. The 5 red `citadel-renderer.test.ts` color tests + the lone
  `sprites/atlas.ts` typecheck error are THEIR in-flight work, not this change
  (my files are isolated; their `quads.ts`/`clustering.ts` are untouched by me).

## [2026-06-19] code | Citadel dev runner (`npm run citadel`) + render polish (slow wash, softer terrain)

Two small post-epic follow-ups (user-driven, not briefs), shipped to main:

- **`npm run citadel` now runs server + client together** (parity with Farm's `npm run dev`). Generalized [scripts/dev.mjs](scripts/dev.mjs) from a single hardcoded pair into a `TARGETS = {farm, citadel}` map keyed by `process.argv[2] ?? "farm"`; the `citadel` target spawns `npm run server:citadel` (`@citadel/server` on :8788) + `npm run dev -w @citadel/client` (vite :5174) with the same prefixed-output + teardown-on-either-exit behavior, and prints a note that solo needs no server (open `?mp` for online MP). Root `package.json`: `"citadel": "node scripts/dev.mjs citadel"` + `"server:citadel": "npm start -w @citadel/server"`. Commit `7da2350`.
- **Render polish — slow the day/night wash + soften terrain** (render-only, zero determinism impact). The wash was strobing (~1 s/cycle) because it tracked the 20-tick *sim* day 1:1; decoupled it onto a slow **visual** cycle — `VISUAL_DAY_TICKS = 1800` in [games/citadel/client/src/main.ts](../../games/citadel/client/src/main.ts) (~90 s dawn→night at 1×), the sim day clock untouched. Terrain read as harsh zoomed-out noise, so [terrain-dither.ts](../../games/citadel/client/src/render/terrain-dither.ts) `ditherClusters` is biased toward **fewer** specks (mostly 1/cell) and **lighter** accents (~75%), and the jarring salmon `wood` "Rough" ground became sandy `EDG.tan` in [quads.ts](../../games/citadel/client/src/render/quads.ts) `TERRAIN_COLORS`. Verified: `@citadel/client` typecheck clean, 132/132 tests, build clean. Commit `2d99e63`. **⚠️ GPU-unverifiable on this headless host — the wash period + dither bias are one-line constants to tune once eyeballed at a GPU (`npm run citadel`).**

## [2026-06-19] code | Citadel 28 PlayerState[] refactor shipped (MP epic spine A) + by-game monorepo reorg

Two things this session:

- **By-game monorepo reorg (merged to main).** Relaid out by the dependency seam: `engine/*` (`@engine/core`, `@engine/wasm-modules`) + `games/farm/*` (`@farm/sim-core`, `@farm/client`, `@farm/server`, `@farm/atlas-recipes`) + `games/citadel/*` (`@citadel/sim-core`, `@citadel/client`) + `tools/*` (all rescoped to `@tool/*`). Updated workspaces glob, all `-w` selectors, tsconfig depths, palette-guard walk roots, every hardcoded runtime path, the wasm/atlas output paths; rewrote root `CLAUDE.md` (server-side Farm sim, 21 farmers, new paths) + `README` + `wiki/architecture.md`; added `wiki/citadel-overview.md`; removed 15 orphan screenshots; split the Farm sprite recipes out of `atlas-builder` into `@farm/atlas-recipes`. Verified: typecheck matrix == baseline, all runtime paths resolve, farm+citadel production builds clean, atlas PNGs byte-identical, palette guard green.
- **Citadel 28 — PlayerState[] refactor (spine A) shipped.** Split all per-player economy/needs/territory/siege/hazard/tier state off the single `SimState` onto a first-class `PlayerState`; `SimState.players` holds one per player (solo = `[player0]`, `localId 0`). `ownerId` on buildings + villagers; all 11 per-player systems loop `state.players` in stable id order, attributing entities by owner; command handlers + snapshot + result getters target the local player. Determinism preserved — one shared per-system RNG fork pulled in player-id order (player-0 pull-order unchanged). Verified: `@citadel/sim-core` typecheck + 120/120 tests, `@citadel/client` clean, and the headless determinism digest BYTE-IDENTICAL before/after across grow/siege/sack/fire/disease (seeds 1,7) at `TICKS_PER_DAY=20`. Closed → [todos/closed/](todos/closed/).
- **Citadel 29 — configurable world + town-hall (spine B) shipped.** `CitadelSimOptions.worldWidth/worldHeight` (default 96×96; MP passes 256×256); bootstrap shadows `WORLD_WIDTH/HEIGHT` so every grid-backed allocation + the pathfinder + snapshot extents track the configured size; `generateTerrain` + river helpers parameterized (default call byte-identical). New non-tier-locked **`town-hall`** anchor (reuses the keep's `keepPosition`/sack-elimination semantics) — placed at match start; un-parks 21/22 (256² is the committed large-map consumer). Verified: 123/123 tests (new `world-config.test` covers 256² allocations + pathfinder + a 3-day tick + anchor placement), client clean, default-96 determinism byte-identical.
- **Citadel 30 — territory + build-gating (spine C) shipped.** `TerritorySystem` derives each `PlayerState.territory` as an influence radius (default 10) around owned buildings, recomputed on building-change (runs before connectivity, which clears the dirty flag). Build-gating is opt-in (`enforceTerritory`, default OFF → solo unchanged): place only within territory ∪ adjacent-unclaimed, never a rival's claim; the anchor goes on any unclaimed tile; overlap → lowest id. Verified: 127/127 tests, default-off determinism byte-identical.
- **Citadel 31 — pathfinder perf (spine D) shipped.** `bfsPath` swapped the per-call `new Uint32Array(width*height)` (~256KB/pathfind at 256²) for a persistent scratch (`prev`+`stamp`) reset in O(1) via a generation counter (realloc only on size change). One authoritative pure-JS pathfinder; BFS algorithm unchanged. Route equivalence proven byte-identical across all 6 scenarios; 127/127 tests.
- **Citadel 32 — PvP armies (spine E) shipped.** `launchAttack` command spends tools to field an army at your town-hall that auto-paths (authoritative pathfinder, around the defender's walls) to a targeted enemy building; ArmySystem resolves it via the shared siege math generalized to PvP — a sacked TOWN-HALL eliminates that player (last standing wins). MP-only (empty army list in solo → no-op). 130/130 tests; solo byte-identical.
- **Citadel 33+34 — per-player PvE RNG independence + gift (spine F,G) shipped.** raid-spawn/fire/disease derive each rival's stream from a separate `createRng` tree (player 0 stays the legacy stream → solo byte-identical, since fork() consumes its parent); a rival joining never perturbs others' schedules. New one-way `gift` command. 133/133 tests; solo byte-identical.
- **Citadel 35 — @citadel/server multi-writer netcode (spine H) shipped.** New `@citadel/server`: `CitadelSimHost` runs one authoritative sim per room; every peer submits commands, each stamped into the one stream + routed to the sender's player via a `setActivePlayer` marker (logged → deterministic replay); per-peer snapshot fan-out; late-join. Client `CitadelServerClient` is a WS drop-in for the Worker client (`?mp` flag; vite proxies /sim → :8788). `BuildingSnapshot` gains ownerId. Host unit test 2/2 (routing + late-join); all citadel packages typecheck clean; client builds; solo byte-identical. Live multi-client play is the remaining (headless-unverifiable) integration.
- **Citadel 36+37 — presence/roster/emotes + seeded lobby bots (spine I,J) shipped.** Ephemeral relay channel (presence/emote/roster) on the worker protocol, RELAYED by the host and kept OFF the command log (proven by a log-purity test). Seeded `CitadelBot`s join as peers via the same command surface as humans (`host.addBot(seed)`); a bot-filled match is reproducible from its seed. @citadel/server 5/5 tests; all citadel packages clean; solo byte-identical. Next: 21/22 (render-windowing — WebGPU client perf).

## [2026-06-19] plan | Citadel multiplayer RTS epic — grilled + decomposed (briefs 28–37; supersedes 26, un-parks 21/22, closes 23)

A grilling pass (the `grill-me` interview, one decision at a time) turned the old narrow **brief 26** (presence/bots/emotes only) into a full **competitive/co-op RTS multiplayer mode** for Citadel, and decomposed it into an ordered, dependency-aware backlog. **No code** — design + briefs only. Locked decisions (encoded verbatim in each brief's `## Decisions (grilled 2026-06-19)`):

- **Netcode:** server-authoritative **single sim per room**; every peer SENDS commands, the server stamps each into the one authoritative **command-log** at the current tick, advances the sim, fans out encoded snapshots (clients = renderers that can submit). Determinism preserved (one sim, one ordered log). Reuse the *pattern* of FV's `@farm/server` `RunRegistry`/`SimHost` but it's FV-coupled + owner-only-writer → build a **new `@citadel/server`** multi-writer variant.
- **State:** full **`PlayerState[]`** refactor — per-player stockpiles/pop/popCap/happiness/tier/territory/decrees/defensiveStrength/fireState; shared terrain/grid/tick; **`ownerId`** on buildings+villagers; single-player = the 1-player case. (Largest item; gates everything.)
- **World:** **256×256** (configurable); new **town-hall** building placed by each player at match start; **influence-radius territory** (grows from owned buildings, recomputed like road-connectivity; build only within own territory ∪ adjacent unclaimed). This **un-parks 21/22** (the committed large-world consumer).
- **Combat:** **launch-an-attack** armies reusing the shipped raider/siege math (auto-path to a targeted enemy building/town-hall; abstract deterministic resolution; NO unit micro). **Town-hall sacked = player eliminated; last standing wins.**
- **Diplomacy:** one-way **gift/transfer** command (no formal alliance state). **PvE stays on** (per-player NPC raiders + fire/disease alongside PvP). **Flavor:** presence cursors + roster + emotes + seeded NPC lobby bots — all included.
- **New requirement surfaced by the design:** a **sim-side pathfinder-perf** brief (31) — at 256² with per-player raiders + armies + haulers, `bfsPath` allocating a `Uint32Array(W*H)` per call churns ~256KB/pathfind ×N players; reuse-buffer / adopt the WASM pathfinder (cite the JS↔WASM-routes-diverge gotcha — pick ONE authoritative pathfinder).

**Spine:** A(28) → B(29) → {C(30), D(31), H(35)} → {E(32), F(33), G(34), I(36), K(21/22)} → J(37). Briefs in [todos/](todos/) (28–37 new; 21/22 un-parked). **Superseded/closed:** 26 → [todos/closed/](todos/closed/) (subsumed by 28–37), 23 → closed/ (WON'T-DO — Canvas2D `globalAlpha` micro-opt, moot under the WebGPU-only renderer). This is a major scope expansion (single-player city-builder → multiplayer RTS) — the briefs are the ready-to-implement backlog; **A(28) is the load-bearing first step.**

## [2026-06-19] build | Citadel depth pass (07–10/14) + WebGPU render wave (11/12/13/15–20/24/25/27) — ALL 17 actionable post-v1 briefs shipped

Shipped to main, per-brief commits (Opus-orchestrated, Opus subagents; user opted to **skip determinism re-proofs** this wave — relied on code review of determinism invariants + targeted vitest). Every sim-touching brief was reviewed for the load-bearing invariants (no `Math.random`/`Date.now`, FIFO ordering, forked/off-sim render RNG). The four parked/cut briefs (21/22 parked on world-size, 23 won't-do, 26 MP-deferred) remain in `todos/`.

**Sim depth pass (renderer-agnostic, sim-touching):**
- **07 tier-lock** — `TIER_LOCK` was dead code (Phase-5 progression was cosmetic). `placeOne` now rejects tier-locked buildings below the required tier + pushes an event; build palette greys/disables locked buttons with a "Requires <Tier>" tooltip; citadel hex literals routed through `EDG.*`. **Also fixed a pre-existing repo-typecheck break:** both citadel packages compile the engine WebGPU source via the `@engine/core` barrel but lacked `@webgpu/types` + the `*.wgsl?raw` ambient decl in their tsconfig (`types:["node"]` excluded them) — added both (prereq for 27). (farm-valley is red on main for the same reason — out of scope, untouched.)
- **08 building upgrades** — `level:1|2|3` on `BuildingRuntimeState`; `upgradeBuilding` command (validates exists/level<max/tier L2=Village,L3=Town/affordable, deducts planks·stone·tools). Effective-stat helpers scale output (×1/1.5/2) + housing (+3/lvl); **defense is additively capped (+2/lvl, never ×)** so siege stays winnable-losable (guard tests). Gives the refining chain a demand sink. Client Upgrade mode.
- **09 interlocking decrees** — the `tithe`/`conscription` stubs were UI lies. Tithe siphons 10%/day of stored goods → a **relief reserve** (cushions starvation before villagers leave; reserve ≥20 sweetens barter +1). Conscription: during an active raid, +floor(pop·0.5) defense but **production pauses**. No coin (APR #28).
- **10 hauler rerouting** — `VillagerSystem.advance()` peeks the next tile; a mid-haul road break (demolish/burn) makes the hauler hold + flags replan instead of walking through air. `drainReplans()` recomputes `bfsPath` **FIFO by ascending villager id** (the determinism rule), capped at 8/tick; no-route → hold (never the old teleport). Healthy networks never trip detection → byte-identical.
- **14 edge-coherent terrain** — `riverColAtRow(seed,ty)` pure functions; the river cosine-eases to a per-seed "mouth" at the top/bottom edges so water reads as continuing off-map. Interior terrain byte-identical to HEAD (only 6-row edge bands change). `edgeWaterColumns(seed)` exported for future spawn geography.

**WebGPU render wave (render-only, zero determinism impact, EDG-safe):**
- **27 (FOUNDATIONAL) WebGPU port** — dropped Citadel's bespoke Canvas2D renderers; the client now renders through the engine `RendererLike` (WebGPU forced at runtime, FV pattern). New `render/citadel-renderer.ts`: terrain baked once via `bakeStaticLayer`+decorate; buildings/villagers/raiders/ghost as tinted **sprite-batch quads off a generated 1×1 white atlas** (placeholder rects → quads, no authored art). Adopted `Camera2D` (pan/zoom + screen→tile re-derived, unit-tested). **Key discovery: the engine WebGPU `endFrame(overlay)` callback is a NO-OP** (only `wash`/`particles`/`weather` composite via their GPU passes) — so the ghost is a translucent quad, not OverlayFn, and HUD strips must stay DOM.
- **11 autotiling** — roads/walls render via a 4-neighbour bitmask → center block + arms toward connected neighbours (straight/L/T/cross/dead-end); walls read continuous through gates.
- **13 sub-tile dither** — deterministic per-(tx,ty,type) coordinate-hash dither baked into the terrain layer (EDG accents, zero per-frame cost, never persisted).
- **15 day/night wash + light pool** — `computeWash(season,dayFraction)` via the **native WebGPU TintPass** (verified it renders); warm light-pool glow quads on bakery/smith/market/chapel at night.
- **16 weather FX** — season→snow/rain via the engine `RainField` through the **native WebGPU WeatherPass**; visual only (APR #25 parks weather gameplay); off-sim RNG, capped pool.
- **18 ambient crowd** — `CitadelAmbientCrowd`: pooled pedestrians (cap 96) on road tiles, density by tier (6→96), hide during siege; NOT ECS entities, render RNG seeded off a constant.
- **17 placement/idle easing** — buildings ease in (scale+fade, appear-diff); villagers bob out of lockstep; chimney smoke via the engine ParticleSystem (native WebGPU particle pass). Tree sway N/A (forests are baked terrain).
- **19 follow-cam** — right-click a villager → `expSmooth` camera glide; DOM `#follow-hud` strip; release on click-empty/Escape/despawn.
- **20 batched sprite rendering** — satisfied by construction: every entity draw already routes through `renderer.push` → engine sprite-batch since 27 (no new code).
- **24 wear/decay overlay** — render-only soot/scorch overlay keyed off the existing `burning`/`onFire` snapshot flags. **DEFERRED (documented):** the full procedural-noise WGSL wear shader + time-based aging need an engine tint-pass/WGSL extension AND a sim `age`/`wear` field — out of render scope.
- **12 BFS clustering** (speculative) — adjacent same-type houses flood-fill into a union-fill composite block; singletons unchanged. Simplified (union fill, not L/T/+ silhouette synthesis) per the brief's low-priority framing.
- **25 settings modal** — accessible tabbed modal (role=tablist/tab/tabpanel, roving tabindex, Arrow/Home/End, keyword search, Escape/backdrop close) toggling the atmosphere features + zoom/speed.

**Verified on main:** `@citadel/sim-core` **120/120**, `citadel` **124/124** (new pure-fn render tests: quad/color mapping, screen↔tile round-trip, autotile masks, dither/wash/crowd/wear/cluster helpers, modal search/tab math), engine palette guard **6/6** (scans `packages/citadel/src`), typecheck clean across sim-core/citadel/engine, **`npm run build -w citadel` succeeds** (emits the WebGPU renderer chunk). **⚠️ Visuals are UNVERIFIED — WebGPU can't render headless on this box; every render brief's own acceptance defers a real-GPU eyeball to the user** (same as FV's pending visual passes). The per-brief "what the USER must eyeball" lists are in each closed brief / the commit messages. Briefs → [todos/closed/](todos/closed/) (`2026-06-19-citadel-{07..20,24,25,27}`).

## [2026-06-19] build | Citadel Phase 5 — settlement tiers + save/load (command-log replay) + polish — CITADEL FEATURE-COMPLETE

Shipped (merged to main; Sonnet-in-worktree, Opus-orchestrated, two passes). The finishing phase — Citadel is now feature-complete (all of Phases 0–5 done). **Settlement tiers (the progression spine)** — `systems/tiers.ts`: `TierSystem` evaluates each day from population + (non-road) building count + defensive strength, promoting **Hamlet → Village → Town → Citadel → Fortress-City** monotonically with a `pushEvent` on each ("Your settlement has risen from Hamlet to Village!"); `TIER_LOCK` gates wall/tower/keep/garrison/refining buildings behind tier thresholds; `tier` added to `SimState` + `RenderSnapshot` + HUD (color-coded). **Save/load via command-log replay** — the canonical save IS the ordered command log (no separate format): a `logged()` wrapper around `commandSystem.register()` appends `{tick, command}` to `state.commandLog`; `serializeSave(tick)` → `CitadelSave` JSON; `loadFromSave(save)` bootstraps a FRESH sim and replays the log at the correct ticks to reconstruct identical state. Worker gained `request-save`/`load-save` messages; client `requestSave()`/`loadSave()`; browser Save (download JSON) / Load (file-picker → replay) buttons. **Art:** placeholder EDG32 rects retained (authored sprites deferred — per the locked build-with-placeholders-first decision; non-blocking for "is it a game"). **Verified on main:** `@citadel/sim-core` **94/94** (all 68 Phase 1–4.5 + Phase-5: tier promotes strictly at threshold, tier-lock rejects until unlocked, **save→reload→replay deep-equal snapshot** — population/buildings/tier/gameOver/stockpiles/building-positions all match); citadel-owned typecheck clean; **`npm run build -w citadel` succeeds**. **First pass tier bug:** settlement jumped straight to Town at pop 0 day 0 — root cause: `TierSystem` counted ROAD tiles as buildings (~31 road tiles → 44 count → past Town's ≥15 gate before any population). Fixup excluded roads from the count + added a `minPopForBuildings` floor; now the `grow` demo genuinely climbs Hamlet (d1–5) → Village (d6, pop 5). 

**Citadel build complete (Phases 0–5, 2026-06-18 → 2026-06-19).** A deterministic medieval city/fortress builder on `@engine/*` only: terrain + command-queue placement → economy (bread chain, villagers, road hauling, seasons, pull-model immigration) → happiness (services/needs/decrees/barter caravan) → siege (refining chains, walls/keep, seeded raiders, deterministic resolution) → hazards (fire/disease + well/healer mitigation) → tiers + save-via-command-log. 94 tests; command log = save/replay/MP substrate. **Orchestration meta-lessons this build** (folded into memory): worktrees must branch from current `main` not a stale base (Phase 3 was silently rebuilt on Phase 1); and green subagent tests repeatedly hid INERT features (Phase 2 dead economy, Phase 4.5 zero-fire/zero-disease, Phase 5 instant-Town) — always run the integration demo + read the numbers + reject weak (`≥0`/`fewer-or-equal`) assertions. Brief → [todos/closed/2026-06-18-citadel-06-phase5-art-polish.md](todos/closed/2026-06-18-citadel-06-phase5-art-polish.md).

## [2026-06-19] build | Citadel Phase 4.5 — hazards: fire spread + disease, with well/healer/spacing mitigation

Shipped (merged to main; Sonnet-in-worktree, Opus-orchestrated, two passes). Two SPATIAL threats that reward deliberate layout (spacing/wells/services) — the OPPOSITE of siege wall-packing. **`systems/fire-system.ts`:** wooden buildings (house/farm/mill/bakery/woodcutter/storehouse/chapel/market/watchpost/tradingpost/garrison) can ignite + burn; stone buildings (quarry/sawmill/smith/mine/wall/gate/tower/keep) + roads + gaps are firebreaks. Seeded ignition (`rng.fork("fire")`) scaled by local wooden-neighbor density; seeded spread center-to-center within range, blocked by a firebreak on the line; burning building stops functioning + despawns after a burn timer (occupancy freed). **Well** (new 1×1, radius) cuts ignition + spread. **`systems/disease-system.ts`:** seeded onset (`rng.fork("disease")`) scaled by CROWDING (pop/houseCount) amplified at happiness<40; spread through crowded pop; sick villagers work less + can die (deaths flow through the existing immigration removal path — NOT by zeroing workerCount, which corrupted slots in the first pass). **Healer** (new 2×2, radius, 1 worker) cuts onset/spread/mortality. New systems registered at a `"hazards"` stage after needs-happiness, before population. `BuildingSnapshot` gained `onFire`/`burning`; `RenderSnapshot` gained `sickVillagers`/`outbreakActive`/`activeFires`. Well + Healer added to toolbar + EDG rects + SERVICE_RADII. **Verified on main:** `@citadel/sim-core` **68/68** (all 49 Phase 1–4 still green + Phase-4.5: dense-cluster ignites + spreads, well reduces, firebreak stops spread, crowding+low-happiness triggers outbreak, healer reduces deaths, sick villagers work less, post-hazard determinism). **First pass shipped INERT hazards** — 0 fires / 0 deaths in the demos, tests falsely green because they asserted "fires within 60 days" (demo capped at 40) and "well has fewer OR EQUAL fires" (0==0 passes). Caught by running the demos and reading the comparison summary. **Fixup pass** re-tuned thresholds + made the demo towns genuinely dense/crowded + TIGHTENED tests to strict (`> 0` and strict mitigation reduction). Now `SCENARIO=fire`: unmitigated **15 fire events → pop 0** vs mitigated **6 events → pop 6 survives**; `SCENARIO=disease`: unmitigated **6 deaths** vs healer **0 deaths**. **Lesson: weak test assertions ("≥0", "fewer-or-equal") pass on a dead feature — assert the hazard STRICTLY fires and mitigation STRICTLY reduces; always run the integration demo and read the numbers, green tests alone hid an inert feature twice this project.** Brief → [todos/closed/2026-06-18-citadel-055-phase45-hazards.md](todos/closed/2026-06-18-citadel-055-phase45-hazards.md).

## [2026-06-19] build | Citadel Phase 4 — threat/siege layer: walls/gates/towers/keep, raiders, refining chains, deterministic siege

Shipped (merged to main; Sonnet-in-worktree, Opus-orchestrated, two passes). The THIRD pressure. **Materials refining chains:** `stone`/`planks`/`tools` GoodTypes; Quarry/Mine (terrain-locked on `TerrainType.Stone`), Sawmill (wood→planks), Smith (stone→tools) added to `PRODUCTION_DEFS` (same converter mechanism as the bread chain). **Defensive structures:** Wall (1×1 IMPASSABLE, drag-painted via a `placeWall` tile-list command, blocks the walkable grid), Gate (1×1, passable — excluded from occupancy so villagers pass, raiders chokepoint), Tower/Garrison/Keep with `defenseStrength`; placing the Keep sets `state.keepPosition` and starts the raid clock; keep sacked → hard game-over. **Three new systems:** `raid-spawn.ts` (seeded escalating raids ~every 8d shrinking toward 3d, `rng.fork("raids")` constructed once; spawn from a random map edge; path via citadel's JS BFS with a wall-aware predicate — gates passable, walls block — NO WASM pathfinder, per the JS↔WASM divergence gotcha), `raider-movement.ts` (1 tile / 3 ticks, recomputes path when exhausted), `siege-resolution.ts` (abstract deterministic calc: defense ≥ 1.5× raid → repelled; ≥ 0.5× → partial damage; else sacked). `RenderSnapshot` extended (raiders[], threat/next-raid, defenseStrength, keepSacked, stone/planks/tools, siege events). Browser UI: Quarry/Sawmill/Smith/Mine/Wall(drag)/Gate/Tower/Garrison/Keep toolbar + threat/defense/keep HUD + raider rects. **Verified on main:** `@citadel/sim-core` **49/49** (all 41 Phase 1–3 still green + 8 Phase-4: wall-blocks-grid/gate-passable, deterministic raid spawn + has-path, defensive-strength calc, strong-defense-repels, **undefended-keep→sacked→gameOver**, refining chains produce, **walls REROUTE raiders** — BFS path through walls strictly longer than open terrain — and full post-siege determinism deep-equal); citadel-owned typecheck clean. **Two headless demo scenarios prove the layer end-to-end** (the first pass's demo starved to pop-0 before the siege was decisive and produced 0 stone/planks/tools — fixup pass added proper scenarios): `SCENARIO=siege` (defended) — economy alive (bread chain flowing, pop 6→7), refining outputs stone=47/planks=134/tools=33, Raid 1 REPELLED, keep survives 40d; `SCENARIO=sack` (under-defended) — economy alive at sack time (bread=59, pop=10), **keep SACKED day 34 → game-over from the sack, not starvation.** The defended-repels / undefended-sacked contrast is the proof. Brief → [todos/closed/2026-06-18-citadel-05-phase4-siege.md](todos/closed/2026-06-18-citadel-05-phase4-siege.md).

## [2026-06-19] build | Citadel Phase 3 — happiness + governance: needs, decrees, barter trader (second pressure layer)

Shipped (merged to main; Sonnet-in-worktree, Opus-orchestrated). The SECOND pressure layer + the player's between-build steering. **Needs (faith/safety/goods)** met by Manhattan-distance service radius (`SERVICE_RADII` per service type). **3 service buildings:** Chapel (faith), Market (goods — draws the Phase-2 global stockpile), Watch Post (safety placeholder; real garrison is Phase 4). **`systems/needs-happiness.ts`** — `NeedsHappinessSystem`: per-house need coverage → aggregate happiness = base + per-need + food ± decree penalties; registered AFTER connectivity+economy, BEFORE immigration so immigration reads current happiness. **Happiness modulates the EXISTING Phase-2 pull-model** (high → faster immigration; below threshold → villagers leave the existing out-migration path; not a parallel mechanic). **4 decrees** (lightweight modifiers, `setDecree` toggle command): rationing (−bread/head, −happiness), conscription (worker reallocation), tithe (−happiness), workHours (+output, −happiness). **`systems/trader.ts`** — `TraderSystem`: seeded caravan (`rng.fork("trader")`, ~7-day cadence, 3-day stay, fixed barter ratios — no coin); trade commands; event-feed arrival/departure. `RenderSnapshot` extended (happiness + per-need %, active decrees, trader-present + offers). Browser UI: HUD happiness + per-need, decrees panel, trade panel, new toolbar buttons + EDG rects. **Verified on main:** `@citadel/sim-core` **41/41** (6 Phase-1 placement + 9 Phase-2 economy — INCLUDING the load-bearing-hauling + winter-starvation tests, still green — + 16 Phase-3: service radius in/out, happiness rises-with/falls-without services, happiness modulates immigration, decree workHours/rationing measurably shift output/consumption, seeded-caravan-arrives-on-deterministic-tick, full determinism with decree toggle + caravan); citadel-owned typecheck clean. 22-day headless: Phase-2 behavior intact (pop 2→6, bread chain flows, winter plateaus grain) AND `happy` moves (50→35 under food deficit, recovers to 50), caravan arrives day 8 & 21 deterministically. Headless demo doesn't place a Chapel/Watch Post so faith/safety read 0% there — the mechanic is test-covered; only goods coverage (50%) is showcased in the demo run (non-blocking).

**⚠️ Orchestration incident (worktree stale-base — second occurrence of the documented lesson):** the first Phase-3 worktree branched from the PHASE-1 base commit (`e1d6d90`), not the merged Phase-2 (`587083f`/`d2cf333`). The agent silently reimplemented its OWN from-scratch Phase 2 and layered Phase 3 on it — net −559 lines vs main, deleting the real `pathfinder.ts`/`villager.ts`/`economy.test.ts`. Caught at merge-review by diffing the worktree branch against main (all-`+` diff vs base = stale base tell; 21 files / 1248+/1807− vs main = a rewrite, not an addition). **Fix:** created a fresh worktree explicitly from current `main`, saved the good Phase-3 logic (needs-happiness/trader/tests) to scratchpad, and had a fixup agent GRAFT it onto the real Phase 2 (reading the real `SimState`/defs/snapshot first, not copying the reference blindly). **Lesson reinforced: always create orchestration worktrees from current main (`git worktree add -b <b> <path> main`) and verify the base shows the prior phase's commits before launching; at merge time, diff the branch against main — an all-additions diff vs the intended base, or a large deletion count vs main, means the agent built on stale ground.**

## [2026-06-19] build | Citadel Phase 2 — economy MVP: roads, job-driven villagers, bread chain, immigration, seasons (v1 PLAYABLE)

Shipped (merged to main; Sonnet-in-worktree, Opus-orchestrated, two passes). The MVP bar. **7 placeables:** House (pop slots), Farm (grain, seasonal), Mill (grain→flour), Bakery (flour→bread), Woodcutter (wood, terrain-locked near Forest), Storehouse (global pool target), Road (drag-paint). **New `@citadel/sim-core` systems** (registered in dependency order in `bootstrapSim`): `road-connectivity` (BFS from each storehouse over road+building tiles, dirty-flagged; disconnected buildings flagged + inert), `production` (tick-gated per-cycle; converters draw input from the pool, farms scale by seasonal `grainMultiplier`), `villager-system` (job FSM idle→walkToWork→work→haulToStore→walkHome; auto-assign idle villagers to nearest open reachable slot; tile-by-tile pathing), `immigration` (daily bread consumption = population; surplus + open slot → seeded immigrant; 3 consecutive deficit days → villager leaves; pop-0 → `gameOver`). **`world/pathfinder.ts`** — citadel's OWN pure-JS deterministic BFS (fixed N/E/S/W neighbor order, Uint32 predecessor table); citadel does NOT import farm-valley's JsPathfinder (layering) and uses ONE pathfinder everywhere to avoid the JS↔WASM route-divergence gotcha. **`world/seasons.ts`** — `getSeason(day)` + `grainMultiplier` (spring .5 / summer 1 / autumn 1.2 / winter 0); `DAYS_PER_YEAR=16`. `RenderSnapshot` extended: villagers[], stockpiles, population/popCap, foodSurplus, season, gameOver, per-building `connected`/`outputBuffer`/`workerCount`, recentEvents ring. `placeRoad` command (tile list). Client: full toolbar + road drag-paint + economy HUD + event feed; per-type EDG placeholder rects + villager dots colored by FSM state. **Two-pass orchestration lesson:** first pass passed its own tests but the headless run revealed a DEAD economy (pop stalled at 2/4, flour=0 forever, winter inert, villagers/hauling decorative — production read the global pool directly via a worker-count fallback). Fixup pass made villagers/hauling load-bearing and re-tuned rates. **Verified on main:** `@citadel/sim-core` 25/25 (economy chain, connectivity gating, hauling-is-mechanism, growth-over-N-days, winter-starvation→pop-0, 3-day twice-run determinism deep-equal at ticksPerDay=20); citadel-owned typecheck clean (only pre-existing engine WebGPU errors); 22-day headless shows pop 1→8, flour produced+consumed, winter surplus −3 / bread dip. Known balance tail: mill under-throughput vs farms (grain accumulates) — non-blocking. **For Phase 3:** happiness modulates the Phase-2 pull-model immigration; Market draws the global pool; decrees are modifiers on these systems. Brief → [todos/closed/2026-06-18-citadel-03-phase2-economy-mvp.md](todos/closed/2026-06-18-citadel-03-phase2-economy-mvp.md).

## [2026-06-18] build | Citadel Phase 1 — command queue + footprint placement (first playable interaction)

Shipped (merged to main; Sonnet-in-worktree, Opus-orchestrated). The first playable interaction. **New generic engine substrate** (promoted to `@engine/core`, no game strings): **`@engine/core/commands`** — `CommandQueue<C>` (FIFO `enqueue`/`drain`/`length`) + `CommandSystem<C>` (drains the queue at a fixed early point each tick, dispatches to handlers registered via `register(type, handler)`); the ordered command log is the canonical save/replay/MP-sync artifact. **`@engine/core/placement`** — `OccupancyGrid(w,h)` (`apply`/`remove`/`isOccupied`), `checkPlacement(footprint, occ, buildablePredicate, adjacency?)` returning `{valid, reason?}` (terrain semantics injected so the engine stays game-agnostic; adjacency hook wired-but-unused, reserved for Phase-2 road-connectivity), `rebuildWalkable(w,h,occ,terrainWalkable)` (1=walkable, 0=blocked; footprints block movement). **Game (`@citadel/sim-core` + `citadel`):** House (2×2) as an ECS `BuildingComponent`/`BuildingEntity` with a `BUILDING_DEFS` registry; concrete `CitadelCommand` union (`placeBuilding`/`demolish`) + handlers that spawn/despawn + update occupancy + rebuild walkable. `bootstrapSim()` return extended with `world: World<BuildingEntity>`, `commands: CommandQueue`, `getBuildings()`, `walkable`. `RenderSnapshot` gained `buildings: BuildingSnapshot[]`; `WorkerInbound` gained a `command` variant. Client: toolbar (House/Demolish), tile-snapped translucent ghost tinted valid/invalid (EDG greens/reds), click → `command` message → worker `commands.enqueue` → applied next tick → next snapshot renders it. **All placement flows through the queue — no main-thread world mutation.** Gate verified on main: `@citadel/sim-core` 16/16 (incl. replay-determinism: same log into a fresh sim → byte-identical walkable + building set; + footprint-blocks-walkable + demolish-restores + invalid/overlap-rejected), `@engine/core` 156/156 incl. palette guard, citadel-source typecheck clean (only pre-existing engine WebGPU errors), vite build OK, headless exits 0. **For Phase 2 (economy):** add Farm/Mill/Bakery/Woodcutter/Storehouse/Road by extending `BUILDING_DEFS` + registering handlers (the placeBuilding handler routes by `buildingType`); `world.query("building")` enumerates workplaces for job-walkers; `rebuildWalkable` already runs on every change so walker pathfinding over `walkable` is ready; pass a `mustTouchRoad` predicate into `checkPlacement`'s adjacency hook for road-connectivity; extend `BuildingSnapshot` colors per-type in `building-renderer.ts`. This worktree merge was **clean** (no out-of-scope/corpus changes — verified the diff before merging). Brief → [todos/closed/2026-06-18-citadel-02-phase1-commands-placement.md](todos/closed/2026-06-18-citadel-02-phase1-commands-placement.md).

## [2026-06-18] build | Citadel Phase 0 — skeleton: packages, seeded terrain, deterministic worker loop

Shipped (commit `5260bc0`; Sonnet-in-worktree, Opus-orchestrated). New game alongside farm-valley. Two packages: **`@citadel/sim-core`** (TerrainType enum Grass/Water/Forest/Stone/Rough, seeded Perlin fBm `generateTerrain(96×96)`, `isWalkable`, `DayClockSystem`, Worker-agnostic `bootstrapSim`, minimal `RenderSnapshot`; 9 tests incl. same-seed-identical / diff-seed-different) and **`citadel`** client (Camera2D pan/zoom, EDG32 placeholder terrain rects via baked OffscreenCanvas layer + overlay pass, pause+speed, `sim-worker`/`sim-client` snapshot+interp wiring). Plus **`tools/citadel-sim`** headless runner (`SEED`/`MAX_DAYS`/`TICKS_PER_DAY`) and root scripts `dev:citadel`/`sim:citadel`. Gate verified on main: palette guard 6/6, sim-core 9/9, headless sim exits 0, citadel-source typecheck clean (only the **pre-existing** engine WebGPU `GPUBufferUsage`/`@webgpu/types` errors remain — identical to farm-valley, not introduced here). **For Phase 1:** `bootstrapSim()` returns `{scheduler, dayClock, terrain}` (designed to extend with `world`/`bus`); `RenderSnapshot` is minimal (add `buildings`/`entities`); terrain is `Uint8Array`+dims; keep the worker/headless split — add systems to `bootstrapSim`, not the worker; `isWalkable` currently treats forest/stone as passable (Phase 1 refines per building/resource rules). **⚠️ Orchestration note:** the build agent's worktree commit also deleted the APR + all 8 phase todos and edited log.md — caught at merge; merged code paths only (path-scoped checkout), corpus left intact on main. Reinforces the forbid-destructive-git + verify-the-diff-yourself lesson. Brief → [todos/closed/2026-06-18-citadel-01-phase0-skeleton.md](todos/closed/2026-06-18-citadel-01-phase0-skeleton.md).

## [2026-06-18] plan | Citadel — feature additions (third grilling): terrain, bread chain, seasons, decrees, trader, fire/disease, tiers

Third grilling pass turned the working-sim plan into a game worth a long sandbox run. Additions (APR #22–29): **varied terrain w/ resource nodes** (Woodcutter near forest, Quarry on stone); **shallow 1–2 step production chains** (grain→flour→bread, wood→planks, ore→tools — Banished-depth not Anno); **full bread chain in the MVP** (Farm→Mill→Bakery — the multi-step puzzle IS the game → Phase-2 set grows 5→7 buildings); **seasons bite** (winter halts farming → autumn-stockpiling rhythm, in the MVP); **fire + disease** hazards (spatial threats rewarding spacing/services — new Phase 4.5); **lightweight decrees** (rationing/conscription/tithe/work-hours — modifiers on existing systems); **no coin economy** — physical goods + a periodic **barter trader/Trading Post**; **settlement tiers** (Hamlet→Village→Town→Citadel→Fortress-City) as the no-win progression spine. Phasing held: v1 MVP = terrain + bread chain + roads + villagers + winter; everything else Phase 3+. APR + all 7 phase todos updated; new Phase 4.5 hazards brief filed. APR: [briefs/citadel-apr.md](briefs/citadel-apr.md); todos: [todos/](todos/) `2026-06-18-citadel-*`.

## [2026-06-18] plan | Citadel APR — new medieval city/fortress builder on the engine, grilled to zero open questions

New game scoped on top of the existing engine: **Citadel**, a medieval player-planner city/fortress builder (medieval Cities:Skylines). Two grilling passes resolved all design + build-time decisions. Player-planner (not observer — inverse of Farm Valley); open-ended real-time sandbox; deterministic command queue into the worker (log = save/replay/MP-sync); 96×96 fixed plot, 16px tiles; multi-tile footprints, roads-required connectivity; job-driven villager walkers (auto-assign), physical haul→storehouse→global-pool; pull-model immigration; four layered pressures (food+materials → happiness → threat/siege), phased; spatial siege with abstract resolution; EDG32 placeholder-rects first, sprites later; new sibling packages (`citadel` + `citadel-sim-core`) on `@engine/*` only; SP v1, MP-ready. Three pieces promote UP into `@engine/*`: command-queue, footprint placement, road-connectivity validation. APR: [briefs/citadel-apr.md](briefs/citadel-apr.md). 6 phase todos + build-order index filed under [todos/](todos/) (`2026-06-18-citadel-*`).

## [2026-06-14] brief | Briefs 92 + 93 done — rect-island world, BSP placement, overlap bridges, runtime-varying seed

Replaced the radial-ring world with a **fully seed-generated archipelago** (closes the Model-B epic). User-directed redesign: islands are **rectangles** (farms = fixed area / varied aspect; others vary), positions generated per seed, ring organization dropped, straight axis-aligned bridges that may form loops, ~60% land. Web-search-researched the algorithm (sources: VAZGRIZ procedural dungeons, RogueBasin/backdrifting BSP, Red Blob jittered-grid/Poisson, Wikipedia Urquhart/Gabriel/Theta-graph, rectangle-visibility-graph papers, Unexplored cyclic generation) → pipeline **BSP placement → side-overlap-filtered complete graph → Kruskal MST + δ extra-edges**, all integer-only.

- **A** (`5d93543`) `world/island-placement.ts`: BSP-split → one leaf/region → size inside (farms fixed-area factoring) → seeded interior placement with ≥2 gap by construction → coverage feedback loop to 55–65%. **B** (`4972db8`) `world/bridge-graph.ts`: overlap-filtered edges → MST (connectivity) → `BRIDGE_LOOP_DELTA`=0.18 loops → drop island/bridge crossings; returns null (seed retry) if unconnectable. Every probed seed connectable — BSP siblings reliably overlap, so no L-bend fallback needed.
- **C** (`9861ae5`+`9bf4153`) wired both into `generateWorld(seed)`, deleted ~780 lines of radial/ring/scatter/ranch-routing. `region-inventory.ts` = canonical region list + authored design-space centers. Light **`carveCorners`** replaces the organic CA mask (rect + notched corners). **Mutable world singleton**: `setActiveWorld(generateWorld(seed))` at bootstrap; `REGIONS`/`ROADS`/anchor-tiles are `let` live bindings; `world-dims.ts` breaks the regions↔placement init cycle; ports/coral derive lazily + rebuild via `onWorldSwap`. **Open-ocean boat grid** — boats pass UNDER bridges so the ocean stays one basin (port-to-port always routes); ports pick the isle's most-open side; pre-carved lanes retired.
- **D** (`4a55db5`+`5f5548d`) rewrote the radial guard tests for the generated model + `generate-world.property.test.ts` (30-seed accept-check). **Biggest gotcha:** `watering/shared.ts` snapshotted anchor tiles into module-load consts, freezing them to the default world → converted to functions (`tavernGatherTile`/`festivalPodiumTile`/`fishingCastTiles`). Also: rigid footprints (a per-tile-ridden footprint ballooned solids across a whole farm, severing it — the old code's own comment predicted this), station snap-to-land, reserved-tile set (plots/stations/docks/bridges) so décor never blocks a functional tile.
- **run-sim** (`20385ab`) honors a `WORLD_SEED` env var (defaults to the fixed map). **Verified** (fast 3-day/ticks=20 JSON export, sanctioned gate): same `WORLD_SEED` → **byte-identical**; different/unset → different world. Full repo green: sim-core 795, farm-valley 186, engine 142, atlas 15. 100-day/1200-tick CHECK_DETERMINISM **not run** (constrained hardware, per standing instruction).
- **Lessons:** (a) module-load `const X = AnchorTile` breaks the live-binding contract under a swappable world — read anchors at call time. (b) Content authored for one island shape (footprints/stations) must ride **rigidly**, not per-tile-snapped, or it scatters. (c) A fully bridge-connected *land* graph can partition the *ocean* into basins — let boats pass under bridges. (d) sim-core's `isolate:false` vitest shares the world singleton across files; pin it in `beforeEach` where geometry is asserted. (e) Balance drift: the spread-out map pushes the deadline-free coral trip later in a run (coral-fishing integration window 15→30 days) — mechanically sound, a distance-balance note.

## [2026-06-14] brief | Brief 91 done — organic island masks (CA + floodfill, pinned seed)

Shipped Model B brief 2 of 3 ([91](briefs/game/done/91-modelb-ca-shapes-and-mask-derived-anchors.md)) as **91a** (`0f6bf26`, pure correctness) + **91b** (`e6bdba9`, the one RNG-stream-sensitive site, isolated). Region masks are now **organic** on the default seed: new `world/organic-mask.ts` runs a per-region two-rule CA (born≥5/survive≥3, P=0.60, 2 passes, snapshot-read/new-buffer per pass) + array-queue floodfill from a pinned core. **Tuning was the crux** — a single threshold≥5 only reached ~50% organic; the two-rule form reaches **100% of regions with area≥36** (~45% avg land, no slivers), **fallbackCount=0**. New `world/region-setup/anchors.ts` (`forcedCoreTiles`) is the single source of truth for must-be-land tiles, pinned by the mask AND consumed by the entity spawner so they can't drift. generateWorld builds masks sequentially (cross-region ≥2-ocean adjacency check) and pins bridge-attachment tiles + an **L-path corridor** from each road entry to the region center to keep every region pass-through (reachability BFS holds — this fix was load-bearing; without it ~45/70 regions were unreachable). Anchors re-derived via `nearestLandTile`/`snapPropToLand`; watering/pen/greenhouse/cliff/bubble/coral/port sites made mask-aware; stations fail loud off-land. Guard tests rewritten over masks + new guards (≥80% organic, bounded fallback, core/tile-consts on land, determinism). The full-suite run (not just targeted files) caught 6 failures the targeted runs missed — pen/greenhouse placement on carved ocean, port/ranch docks, set-pieces snapshot drift — all fixed. Verified: sim-core 784/784, farm-valley 186/186, typecheck clean. 1200-tick headless determinism check **skipped** (user call, constrained hardware). Unblocks [92](briefs/game/todo/92-modelb-runtime-varying-seed.md) (runtime-varying seed + multi-seed property tests).

## [2026-06-14] brief | Brief 90 done — pure generateWorld(seed) + all-land region masks

Shipped Model B brief 1 of 3 ([90](briefs/game/done/90-modelb-generate-world-and-mask-plumbing.md)), two zero-behavior-change pure refactors in [regions.ts](../packages/sim-core/src/world/regions.ts). **Part A:** all eager module-level world gen wrapped in `generateWorld(seed): GeneratedWorld`, default-called once (`DEFAULT_WORLD`) and re-exported so the ~118 callers don't churn; RNG forks off the passed seed via the unchanged `'farm-ring-jitter'` label; `makeRadialFarmRegion`/`placeRanches`/`scaleAroundNearestIsland` param-threaded. **Part B:** `RegionDef.mask?: Uint8Array` (all-1 this brief), `regionMaskAt`/`forEachLandTile`, and a mask-aware `regionAt` — the central lever, so walls/shores/fishing/setup adapt for free. Direct bounds-iterators converted in walkable-grid/resource/carpenter (roads stay rect; `placeFootprint` + bubbles untouched). Masks stay off the per-tick snapshot. Verified by typecheck (zero new errors vs HEAD — remaining errors are pre-existing webgpu/world-preview/node-types) + 45 sim-core unit tests incl. new deep-equal/determinism/mask tests. The multi-seed `EXPORT=json` byte-identity diff was **skipped by user decision** (constrained hardware); unit tests + manual hazard review stood in. Unblocks brief 91 (CA shapes + mask-derived anchors).

## [2026-06-14] chore | Todo reconcile — close out the 2026-06-12 set

Re-verified all 14 `2026-06-12-*` todos against current code (combat/relationship/ring/steal in `packages/sim-core/src/systems/combat/` + `components/trust`, ports/bdi/world/render all present). The four still carrying a stale duplicate `status: open` frontmatter line (combat-subsystem, relationship-axis, ring-box, steal-from-npcs) were already shipped in the 2026-06-13 combat drop — deleted the stale line (kept the later `status: done`). Moved all 14 done todos to [todos/closed/](todos/closed/); only [BUILD-ORDER](todos/2026-06-12-00-BUILD-ORDER.md) (`status: reference`) stays in `todos/`. No code change. NOTE: the only remaining unbuilt work is the **Model B** brief epic ([90](briefs/game/todo/90-modelb-generate-world-and-mask-plumbing.md)/[91](briefs/game/todo/91-modelb-ca-shapes-and-mask-derived-anchors.md)/[92](briefs/game/todo/92-modelb-runtime-varying-seed.md)) — design-only, no code yet.

## [2026-06-13] plan | Model B organic world gen — 3-brief epic filed (90/91/92)

Grill-me design session locked the long-deferred **Model B** (stored organic island shapes, not just rect placement) from [world-generation.md](wiki/world-generation.md). Decisions: **all** regions organic (cluster+farms+landmarks); data model = rect `bounds` + per-region `Uint8Array` mask, generated on a global grid then sliced; shape algo = **CA-fill + center-floodfill** (plain TS, sim-core); constraints constructive (core-pin + bounds-inset) with **rect fallback** on retry-exhaustion (must log/count); **runtime-varying seed** via a pure `generateWorld(seed)` called once at bootstrap; **all** hand-authored anchors (podium/docks/stations/footprints/coral) re-derived from the mask. Sequenced into 3 todo briefs, each independently verifiable: [90](briefs/game/todo/90-modelb-generate-world-and-mask-plumbing.md) (pure `generateWorld(seed)` + mask plumbing, zero behavior change), [91](briefs/game/todo/91-modelb-ca-shapes-and-mask-derived-anchors.md) (CA shapes + mask-derived anchors, pinned seed), [92](briefs/game/todo/92-modelb-runtime-varying-seed.md) (runtime-varying seed + multi-seed property tests). No code yet — design only.

## [2026-06-13] chore | Corpus compaction — log, indexes, done-brief archive

Full compaction pass (user-requested). Corpus **10995 → 7290 lines, 152 → 138 files** (−34%). Everything trimmed is in git history; treat that archived prose as obsolete — re-derive from current code + wiki + the (condensed) brief if an old decision resurfaces.

- **log.md 577 → ~95 lines.** Collapsed the verbose 2026-06-11 and 2026-06-12 entry runs into two dated era summaries + a "Load-bearing facts" block (engine-10 allocator fault, engine-11 WGSL lesson, the WebGPU 5-bug render rules, worktree-swarm lessons, brief-84 SwiftShader lesson). Kept all 2026-06-13 entries verbatim (current context). Merged the 3 same-day ocean-veil entries into one final-state entry; fixed a duplicate animation-Tier-B header.
- **index.md** — dropped the game-brief by-range catalog (duplicated status.md, which owns brief state); now link-only per the page's own convention. Engine `todo/` note corrected.
- **status.md** — "Where things stand" updated: briefs 01–89 all Done/Superseded, both `todo/` dirs empty; briefs 85 + 89 noted closed-superseded; build-order todos complete; 2 calibration todos closed won't-do.
- **Done-brief archive condensed** — the 15 largest game done-briefs (104–229 lines each) cut to ~15–32 line OUTCOME records (title + status + intent + what-shipped/decisions/gotchas), dropping files-in-scope / acceptance / workflow / determinism boilerplate. Removed the 3 `*-plan.md` companions (08/09/10 — a done brief's pre-impl plan is the most obsolete artifact). Trimmed brief 08's leftover workflow scaffolding.
- **superseded/webgpu/** 12 files (~65 KB) → one `TOMBSTONE.md`. The wave-plan's 00-INDEX claimed "WON'T-DO, execution never started" but **WebGPU actually shipped** (game forces `backend: "webgpu"`, full `render/webgpu/` backend live) via a different path — the stale plan contradicted the code, so it's tombstoned with a pointer to reality.
- Broken-link sweep clean (no inbound refs to removed files). Conventions honored: done briefs stay one-concept files; status.md remains the per-brief source of truth.

## [2026-06-13] chore | Corpus compaction part 2 — merge brief clusters + drop irrelevant

Follow-up to the compaction above (user-requested). Grouped tightly-related done briefs (each a single shipped wave/effort fragmented across sequential numbers) into one rollup each, and deleted a one-off doc-bookkeeping brief. Corpus now **~5580 lines, 103 files** (from 10995/152 at session start — **−49% lines, −32% files**). Originals are in git history.

- **7 cluster merges** (N files → 1 rollup, terse outcome record per member):
  - engine 12–16 → [12-16-shader-wave](../briefs/engine/done/12-16-shader-wave.md) (WebGPU shader wave).
  - game 11–20 + 25 → [11-25-spectator-ui](../briefs/game/done/11-25-spectator-ui.md) (observer/spectator/playback UI).
  - game 36–40 → [36-40-spectator-story-layer](../briefs/game/done/36-40-spectator-story-layer.md).
  - game 41–46 → [41-46-gameplay-depth-wave](../briefs/game/done/41-46-gameplay-depth-wave.md).
  - game 50/51/52/54 → [50-54-more-islands](../briefs/game/done/50-54-more-islands.md) (53 stays superseded).
  - game 55–58 → [55-58-client-server-split](../briefs/game/done/55-58-client-server-split.md) (55 was the umbrella; the four still said "todo" — stale, now Done).
  - game 60–65 → [60-65-render-polish-wave](../briefs/game/done/60-65-render-polish-wave.md).
- **Dropped irrelevant:** game brief 31 (corpus-index-sync) — a one-off documentation-bookkeeping task with no game feature and no archival value (its sync actions were long since superseded). No inbound refs.
- **Cross-links repointed** to the rollups: status.md (engine table + the 24–48 game table collapsed 36–40 and 41–46 into single rollup rows; 25 row points at the spectator-UI rollup), index.md (engine done list), world-generation.md (shrine → more-islands), and the "concurrent-work" sibling notes inside surviving briefs 67/68/74. Also fixed two pre-existing stale `todo/` links surfaced by the sweep: open-questions.md AI-fishing item → done/80 (marked resolved), animation.md → superseded/85. Whole-corpus broken-link sweep clean.

## [2026-06-13] chore | Close out remaining backlog (won't-do)

Build-order set (2026-06-12 todos) all complete. User asked to mark the remaining open items done; on review they were **not** implemented, so closed as **won't-do** instead of faking completion (corpus stays honest — code wins). No code changed.

- `todos/closed/` (new) ← `2026-06-13-calibrate-rival-cutoff.md`, `2026-06-13-tune-combat-frequency.md` — `status: wontdo`. Both are unrun calibration tasks gated on multi-seed sim runs (resource limits + always-ask-before-determinism-check).
- `briefs/game/superseded/` ← brief 85 (animation engine) + brief 89 (detailed characters/held tools) — phases shipped, only the optional in-browser feel-check + a 24px action pass were left; closed with a top-of-file note. WebGPU-only render → couldn't feel-check headless anyway.
- `briefs/engine/superseded/webgpu/` ← whole WebGPU migration plan (planning complete, execution never started). 00-INDEX status → CLOSED/WON'T-DO.
- `todos/2026-06-12-00-BUILD-ORDER.md` — added a "Backlog closed" section listing the five. Both `briefs/*/todo/` dirs now empty.

## [2026-06-13] feature | Island ports + boat travel — port-to-port network

Sim+world+render goal [island-ports-boat-travel](todos/2026-06-12-island-ports-boat-travel.md). Generalises the coral dock→reef stubs into a connected port network over open ocean. Decisions (grilled): hub-and-spoke aim, neutral landmark islands, light AI hop. **Geometry forced a reframe** — probing `buildWalkableGrid` showed the grown world's bridge columns (x≈93,116,141) slice every south ocean channel top-to-bottom + a continuous E-W road wall at y=116-117 splits north/south ocean, so a 4-spoke hub is uncarvable without crossing bridges (would reopen [project_pathfinder_js_wasm_diverge]). User chose the honest "2-3 ports in the one open channel" over re-carving geometry.

- **`world/ports.ts` (new)** — `PORTS` (3): `port-fishing-isle` (W edge), `port-fishing-isle-2` (E edge), `port-casino` (N edge). Each dock is a LAND tile on the live island edge (DERIVED from bounds, mirrors coral's `reefOffIsle` → tracks the parametric scale); lanes are narrow fixed ocean corridors to a shared vertical trunk at **x=105** (the verified-clear south-central channel). A **module-load guard** throws if any lane tile isn't ocean (geometry drift). Helpers: `isPortDockTile`, `isPortLaneTile`, `nearestPort`, `portAtDockTile`, `openPortLanes`, `portLaneTiles`.
- **Boat grid union** — `buildBoatGrid` (coral.ts) now opens the coral stubs AND the port docks+lanes, so the one `aboard` boat grid spans both. `board-boat`/`return-to-shore` handlers accept port docks too (was coral-only).
- **AI** — `agents/watering/port.ts` `deliberatePortHop`: light, periodic (every 9d), high AP floor (140), low precedence (6) boat trip to the next port in `PORTS` order and back; beliefs-tracked target so it doesn't flip mid-hop. Wired into **opportunist**. **No new RNG** (deterministic target rule) → no stream perturbation. Phase machine mirrors coral: walk→dock, board, sail→target dock, disembark.
- **Pip** — `player-control/system.ts`: on a dock the action key boards / disembarks (LOWER precedence than a valid held-item action, so the isle-edge tile that's both a port dock AND a fishing-cast tile still casts with the rod); while `aboard`, `canStand` switches to the boat lanes (ocean) + docks so Pip steers across the water manually instead of on land. Port-hop is manual steering (no travel intent).
- **Render** — `PORT_STATICS` (geometry.ts): `tile/dock-floor` on each dock + a moored `structure/boat` on the first lane tile (reused frames, EDG32, no atlas change), baked in the static layer alongside FISHING/CASINO statics. A hull sprite (`structure/boat`, layer 49) rides under any `aboard` farmer, gliding via `renderPos`. Port docks added to the interior-décor forbidden set.
- **Verification:** typecheck clean all workspaces; full suites green — sim-core **773** (+new `ports.test.ts` geometry/connectivity, `port.test.ts` phase machine, Pip board/disembark/aboard-movement, coral boat-grid count updated for the union), engine 142, farm-valley 186. Real-run hop + 3-day/3-seed determinism diff **skipped per user** (constrained hw) — connectivity is proven by the pathfinder test, the mechanic by the driven phase/player tests, and determinism is structural (no new RNG). In-browser feel-check deferred. **Sim-standalone group COMPLETE — all 2026-06-12 build-order todos done.**

## [2026-06-13] feature | Per-agent BDI jitter — same-kind farmers diverge

Sim goal [randomize-agent-bdi](todos/2026-06-12-randomize-agent-bdi.md). Spike + proposal scope: bake a small per-agent jitter on three scalar BDI knobs ONCE at spawn so same-`kind` farmers (the 16 procedural farms shared the kind default; the 5 named shared hand-tuned constants) no longer behave identically. Decisions (grilled): own rng fork per agent (isolation); moderate spread ±15–20%.

- **New `agents/bdi-jitter.ts`** — `bakeBdiJitter(spec, seed)` returns `{minGoldReserve, riskTolerance, beanValueFactor}`. Each agent's rng is `createRng(seed).fork("bdi:"+name)` — derived **solely from `(seed, name)`**, so adding/removing/reordering a farmer never shifts another agent's draws and **no tick-time RNG stream is perturbed** (the fork advances only a throwaway base). Named farmers' values are the CENTRE of their jitter → character preserved.
- **Three SCALAR knobs** (no queue reordering — same decision *structure*, shifted *thresholds*): `minGoldReserve` ±30% around the spec base; `riskTolerance` continuous [0,1] ±0.15 around a per-kind base (conservative 0.0 / hoarder 0.5 / opportunist 0.7 / aggressive 1.0; augments the 3-level `riskProfile`, drives harbor-contract speculation); `beanValueFactor` golden-bean bid scale ±0.1 around a per-kind base (0.45/0.9/0.7/0.95).
- **Seam.** `setupFarmer(world, spec, seed)` now takes the seed and writes all three onto `desires.data` (open `Record<string,unknown>` bag — no component type change). Read-sites prefer the baked value over the kind literal: `bean-valuation.ts deliberateBean` reads `desires.data.beanValueFactor`; each personality's `deliberateHarborContract` call reads `desires.data.riskTolerance`. Conservative keeps its day-10 relaxation as `Math.max(0.5, baked)` (floor over the baked value).
- **Verification:** typecheck clean all workspaces; full sim-core suite green (756, +5 new `bdi-jitter.test.ts`). Real-run divergence + determinism diff **skipped per user** (constrained hardware) — unit tests prove the bake is deterministic + order-independent; per-agent fork guarantees no stream perturbation.

## [2026-06-13] feature | Underwater ecosystem + ocean veil (3-step, final = baked veil)

Render-only additive pass [improve-underwater-ecosystem](todos/2026-06-12-improve-underwater-ecosystem.md) + an ocean-surface look that iterated twice same-day. No sim/economy/determinism coupling. **Final state below is what's in the code** — the two superseded veil approaches (per-tile sprite quad at layer 5; the reverted `tile/ocean-veil` recipe) are git-only.

- **Static seabed life** (`render-systems/seabed-life.ts`, sim-core) — `SEABED_LIFE` seeded scatter (starfish, crab, sand-dollar, anemone) off `WORLD_GEN_SEED` via a **distinct `fork("seabed-life")`** (never shifts the `SET_PIECES` stream); blue-noise (`MIN_SPACING=2`, target 70) over open-water tiles only, forbidden from coral/reef-lanes/docks **and every `SET_PIECES` tile**. Baked at layer 2, `SEABED_LIFE_ALPHA=0.5`.
- **Animated water life** (`farm-valley/render/water-decor.ts`) — positions seed off `WORLD_GEN_SEED`, animation is wall-clock/`Math.random` (render-only): **kelp** (seeded, sin sway), **bubble columns** (seabed vents, upward bursts), **jellyfish** (transient pool ≤4, pulse-bob + fade), **sea-turtles** (lane gliders like whales). Plus a `fish-green` species in the fish-decor shoal list. 12 new EDG32 `decoration/*` frames; props sheet rebuilt.
- **Ocean veil → BAKED** (`render/ocean-veil.ts` `makeOceanVeilDecorator`, final) — runs LAST in the decorate chain (`groundNoise → shoreDescent → waterDepth → oceanVeil`), one `fillRect` per water tile on the world canvas → **no seams** (the earlier per-tile sprite-quad veil banded at fractional zoom). Keys off `regionAt(tx,ty) === null` (ocean **and** bridge spans, not `!isWalkable`) so under-bridge water veils identically. Baking over the static canvas means it now correctly paints over the **baked** seabed life so creatures read as seen THROUGH water. Near-shore speckle (`water-depth.ts`) tightened — nulled d=3/d=4, dropped white, so shallows hug the islands (d=1 dense → d=2 faint → nothing).
- **Verification:** typecheck clean; recipe count settled back to 239 (the color-fill veil needs no atlas frame); tests +`ocean-veil.test.ts`, +`seabed-life.test.ts`, `water-depth.test.ts` updated; full suite green (engine 142, farm-valley 188, atlas 15, sim-core 751, server 21); palette guard clean. In-browser look pending user sign-off.

## [2026-06-13] feature | Escapists block walls + local night lights

Render-only goal [escapists-walls-and-night-lighting](todos/2026-06-12-escapists-walls-and-night-lighting.md). Scope #1 + #3 (#2 global wash already shipped).

- **#1 Escapists block walls** — rewrote the two wall recipes (`tile/wall`, `tile/wall-wood`) as chunky depth blocks: heavy black outer cap, bright TOP FACE, darker SHADED SIDE FACE, block-seams; top half only, lower rows transparent. **Renderer/geometry untouched** — same recipe names + 16px size, so `WALLS` and `computeWalls()` (incl. the bridge-mouth gate) are unchanged. South-facing walls still depth-sort as occluders.
- **#3 Local lights** — new generic `overlay?: OverlayFn` on `RendererLike.endFrame` (engine), drawn LAST in world space after the day/night wash (engine stays game-agnostic; WebGPU backend ignores it). Static `LIGHT_EMITTERS` (`render-systems/lights.ts`, sim-core): forge, campfire, casino neon, ring, one lit window per cottage — positions resolved once from scaled geometry. `render/lights.ts` `makeLightOverlay` draws additive warm radial glows, brightness scaled by `nightnessFor()` (in-game clock, **never wall-clock** → deterministic), dusk-gated + view-culled. EDG32 anchor colors; gradient falloff not per-pixel palette-locked (same rule as the wash).
- **Verification:** typecheck clean; full suite green — engine 142, farm-valley 186 (+4 `lights.test.ts`), atlas 15, sim-core 747, server 21. Render-only; in-browser feel-check pending.

## [2026-06-13] feature | Combat subsystem — HP fights, ring + street (foundation + both fight todos)

Full combat scope landed in one drop: the [combat foundation](todos/2026-06-12-00-foundation-combat-subsystem.md), [ring-box](todos/2026-06-12-ring-box-rivalry-fights.md), and [steal-from-NPCs](todos/2026-06-12-steal-from-npcs-friendship-penalty.md) — the whole sim-fights group.

- **Core** (`systems/combat/`): new `Health` component (HP 40); `FIGHTING` FSM state (Perceive skips fighting farmers; Deliberate/Act gate them out). `CombatSystem` (ACT stage, after ActSystem) owns active bouts: a swing-exchange every `swingIntervalTicks(ticksPerDay)` ticks (≈24 @1200/day, 1 @20/day), seeded damage `rng.fork('fight:'+pairKey+':'+tick)`, swings cost AP (bat > fists, `hasBat` flag), first to 0 HP is KO'd (never killed). Tuning is reasoned guesses (deferred).
- **Ring**: `CHALLENGE/ACCEPT/DECLINE/RESULT` protocol (protocols/combat.ts). New **ring island** (region `ring`, `boxing` theme — ropes/posts/crowd-stand atlas, bridged to village). Ring bout: teleport both to the ring + restore after; ±10g stake (loser→winner); **mutual trust bond** (de-escalation via `applyTrustDelta`); HP reset to full at bout end; AP-out = immediate loss.
- **Street**: in place (no teleport/stake). KO → victor loots ≤3 individual goods units (`combat/loot.ts`; tools + gold never lootable). Per-tick seeded flee chance. **Witness trust**: every same-region farmer (+ the victim) drops trust toward the initiator; crossing below `RIVAL_CUTOFF` labels a one-sided rival → automatic **retaliation** next tick.
- **AI initiation** (`AggressionSystem`, DELIBERATE band): scans co-located farmers, targets the lowest-id rival, governors permitting → sets `farmer.chaseTarget`. RIVALRY-DRIVEN ONLY (no mugging strangers/friends). Pip excluded.
- **Chase + flee** (`ChaseSystem`, MOVE band before TravelSystem): re-points a pursuit travel intent each tick, marks the target `fleeingFrom`, fires CHALLENGE(street) on Chebyshev-reach. Fixed-tick pursuit window (`pursuitWindowTicks`) → give up if it can't close. **Pip** attacks anyone via player-control.
- **Governors**: per-pair 2-day cooldown + per-initiator daily cap (`CombatSystem.canFight`), AP-reserve gate.
- **Render**: `SnapshotSprite.healthFrac` (set only while FIGHTING) → HP bar; `challenge` intention → `indicator/intention-hostile` glyph. New atlas recipes, atlas rebuilt.
- **Deferred**: combat frequency + damage/cooldown tuning against a real run → [tune-combat-frequency](todos/2026-06-13-tune-combat-frequency.md) (intended: RARE DRAMA, not a daily brawl loop).
- **Verification**: typecheck clean; sim-core 747, farm-valley 182, atlas 15, engine 142. scheduler-stages + set-pieces snapshots updated deliberately. No determinism run (constrained hardware).

## [2026-06-13] feature | Unified relationship axis (trust ⊕ rivalry)

Foundation #0 for the fight todos. Collapsed trust + rivalry into one axis — `trust` IS the axis; the monotonic `rivalryScore` accumulator is gone.

- **`RivalrySystem` is now a trust-axis LABELER** (`systems/rivalry/system.ts`), no inbox/CNP snooping. Each tick it derives labels from the directional `trust` map. Dropped the `cnpCoordinators` ctor arg.
- **Rivalry is ONE-SIDED / directional** — `from→to` trust `< RIVAL_CUTOFF=0.25` means *from* treats *to* as a rival (the one-sided grudge steal-retaliation needs). `buildRivalriesData` (panels.ts) collapses to one display line per undirected pair (lower-trust direction).
- **Hysteresis** (`types.ts`): fires once on crossing below 0.25, latches, re-arms only after trust recovers above `RIVAL_REARM=0.40` — kills feed spam. Text "X resents Y" (directional). Alliance detection unchanged (mutual ≥0.8).
- **Friend sell-discount** (`peer-trade-policy.ts`): a SELLER's unit price scales down by initiator→peer trust — `MAX_FRIEND_DISCOUNT=0.10`, baseline 0.5→0×, 1.0→10% off, no surcharge below baseline. Pure read → deterministic.
- **Calibration deferred:** `RIVAL_CUTOFF=0.25` is a guess. Todo [calibrate-rival-cutoff](todos/2026-06-13-calibrate-rival-cutoff.md) (later closed won't-do). No multi-seed run.
- **Verification:** typecheck clean; full sim-core suite 726/726 green. Determinism check skipped (user direction).

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
