---
title: "Build order — Citadel cozy pivot: a placement puzzle you read by watching the town live"
created: 2026-06-28
status: ready
tags: [planning, citadel, design, cozy, gameplay]
---

# Build order — Citadel cozy pivot

Output of a grilling session (2026-06-28) that resolved **what Citadel is for**. The
prior build-order ([2026-06-18-citadel-00-BUILD-ORDER](2026-06-18-citadel-00-BUILD-ORDER.md))
built the *systems*; this one resolves the *identity* and reorients the open work
around it. Grilled to shared understanding — every branch points the same way.

## The design, in one sentence

> **A cozy placement puzzle you read by watching the town live** — arrange a
> settlement well on the terrain, watch it breathe, and ride out gentle seasonal
> texture that never takes anything from you.

## Locked decisions (the design of record)

1. **Cozy builder, committed.** Not a pressure/survival strategy game, not a
   competitive RTS. (Grilled against both alternatives; chosen deliberately.)
2. **Two fused hearts.** Primary: **placement-as-puzzle** (arrange a town well on
   terrain). Secondary: **watch-it-live**. They are made *one act* by the keystone
   below — solving the puzzle and watching it live become the same thing.
3. **Feedback is diegetic** — read by watching villagers and buildings behave (mood,
   smoke, light, posture), **not** by a HUD dashboard.
4. **The cozy contract:** *nothing you built is taken from you against your will.*
   Threats cost **time or regenerating resources**, never things you placed.
5. **One unifying threat mechanic:** threats don't destroy — they **dent local
   happiness**; **happiness taxes productivity to a floor (~60–70%), never zero.**
   Fire/disease/raid/winter are recoverable happiness dips with different cures
   (well / Healer / walls / autumn surplus). The productivity floor makes
   "no death spiral" a *property of the math*, not a balance hope.
6. **Sharp systems are frozen, not deleted.** The 2026-06-26 pressure work (siege
   morale bands, scout/garrison interceptors, threat→cadence gating, hazard
   interlocks, fire-as-cluster-razing) is **off-spec for the cozy core**. Leave the
   code; stop registering it in the cozy bootstrap, so a future optional "Challenge
   mode" is a re-wire, not a rebuild. **MP/PvP is a future *mode*, not the core.**
7. **Motivation = emergent goals + diegetic recognition; NO score, NO quest list.**
   (Grilled 2026-06-28, round 2.) A cozy un-loseable game still needs a reason to
   *continue*; Citadel's is **soft, player-authored aspirations** — the player invents
   their own targets ("cover every home", "a self-sufficient district") against a town
   whose health they can *read*. The game **does not assign quests** and **does not show
   a quality number** (a score is the un-cozy, spreadsheet-y path that would undermine
   decision #3). The player **goes looking** — pulls the on-demand health/coverage
   overlay (the `C` overlay substrate **already exists**) which **lights up the gap**
   (uncovered houses, disconnected buildings); the gap *is* the invited goal. Closing
   it triggers **diegetic recognition** — the town visibly settles into contentment
   (decision #3's per-house glow/smoke) plus one gentle "every home is cared for"
   banner. Citadel **respects the player's quiet**: it answers when asked, never nags.
   *Costs almost no new mechanism — it lands on the keystone + the shipped overlays.*
8. **The autonomy boundary: the player sets *placement* + *economic intent*; the town
   autonomously handles all *behavior*.** (Grilled 2026-06-28, round 3 — scope pass;
   **boundary redrawn in round 3b**, see note below.) The line: the player decides
   *what the town pursues* (where buildings go, **what a building produces**, **what to
   trade for**); the town decides *how it lives* (labour assignment, governance,
   rations/work-hours, festivals, who fights fires/disease) — all autonomous, diegetic,
   **no behavior micromanagement, ever.** Governance still lives in **civic buildings
   the player places**: a **town hall** runs rations/work-hours, a **public square**
   throws festivals — both autonomous, both with a **spatial reach** (so *where* you
   place them is a coverage layer in the puzzle). Generalizes #3: the town's behavioral
   inner life is autonomous and read-only; the player's hand is *placement + economic
   intent*, nothing more.

   > **Round-3b correction (supersedes the round-3 "placement is the player's *only*
   > lever" wording).** That was too pure. The player *does* get a few hands-on levers
   > — but only **economic-intent** ones (production choice, trade), never *behavior*
   > ones. **Operating is per-building** (click a building → set its output; click the
   > trading post → trade) **under a hard discipline: operable buildings stay FEW and
   > their menus stay TINY** (2–3 glanceable choices, never a spreadsheet). The
   > **trading post** is the clearest case — a clickable building with **no spatial
   > reach**, the **player's window to the *outside* world** (reaching out for what the
   > map denied), distinct from the town's autonomous *internal* life. Risk to watch: if
   > *every* building grows a fiddly menu, the cozy "watch it live" heart erodes into a
   > management sim. Keep operable buildings rare.
   >
   > **Round-5 refinement — the cleaner statement of #8 (supersedes "no NPC
   > interaction").** Research found `tradingpost` already has `workerSlots:1`
   > ([building.ts:266](../../games/citadel/sim-core/src/entities/building.ts#L266)).
   > Keep it. The rule is best stated: **the player sets *intent* (placement +
   > economic intent); NPCs *execute* everything (behavior + fulfillment).** The
   > trading post is **staffed** — a trader villager works the desk and you *watch*
   > them fulfill an exchange (haul goods to the cart); the player's click only
   > chooses *what* to trade. So it's not a people-less portal and not an exception —
   > it's the **clearest example** of the intent/execute split. "No NPC interaction"
   > was wrong; the correct constraint is **"no NPC *autonomy*"** (the town never
   > auto-trades).
9. **The downside rule: nothing ever fully stops or is taken away — every problem is a
   *throttle toward a ~60–70% floor, always recoverable, always shown in the world*.**
   (Grilled 2026-06-28, round 4 — economy pass.) This generalizes #5 from "threats" to
   *the entire game's downside*. Threat, winter, neglect/uncollected output, unhappiness
   — all the same kind of thing: a visible slowdown with a floor, never a cliff, never a
   loss. **One rule the player learns once explains every bad thing in Citadel.** It
   makes "no death spiral / nothing taken from you" a property of the math everywhere,
   not just for threats. Growth is **spatial** (more *buildings*, single-slot — see
   Phase H), so the core verb (place a building) *is* the core goal (grow).

10. **Terrain is the puzzle's difficulty knob — guaranteed-safe floor + rich texture
    above it.** (Grilled 2026-06-28, round 5 — terrain pass.) Because placement is the
    whole game (#8) and no building-side tension was added (round 1, Q4), *the puzzle's
    weight rests on the terrain.* Today's generator
    ([world/terrain.ts](../../games/citadel/sim-core/src/world/terrain.ts)) makes a
    coherent **river + lake** (good — real "bridge it / build around it" decisions) but
    scatters **forest/stone/rough as per-tile noise sprinkle** — *texture, not places*
    (a woodcutter can almost always find a forest tile nearby → no spatial decision).
    Fix: **cluster resources into patches** (groves, ore-veins) so *where the resources
    are* is a real constraint you build *toward* — this makes terrain the puzzle AND
    makes the trading post matter (resource-poor maps now genuinely happen; trade is the
    answer). **Cozy = no frustration, not no thought:** every map is **guaranteed
    solvable** (workable start: enough contiguous buildable land + each resource
    reachable or trade-backfillable), but varied enough that each *feels* distinct and
    rewards thoughtful layout. Target feeling: *"ooh, this one's tricky,"* never *"this
    is unfair."* The trading post is the safety valve that lets terrain be **bolder**
    without risking unsolvable. (Same "safe floor + rich texture above" shape as #9.)

## Scope — what's in the cozy core vs. frozen (the scope pass, round 3)

One rule sorts every system: **does it create a *spatial stake* (a building you place,
with consequences), or is it an *autonomous behavior*? If neither — cut it.**

| System | Verdict | Why |
|---|---|---|
| command / clock / daySync | **Core** | Infrastructure. |
| roadConnectivity / production / villager / immigration / needsHappiness / tiers | **Core** | This *is* the placement puzzle + growth. |
| fire / disease | **Texture** (keep, demote — Phase D) | Recoverable happiness dips, never destroy/kill. |
| raidSpawn / raiderMovement / siegeResolution | **Texture** (keep gentle — Phase D) | Pilfer-and-leave; never sack. |
| **decrees / policy layer** (rationing/conscription/tithe/work-hours/festivals) | **Demote** (autonomy principle) | Player lever removed → run by **town hall** (rations/work-hours) + **public square** (festivals), both autonomous, both with a spatial reach. |
| **trader** | **Keep, reframed** (Phase G) | The existing **`tradingpost`** (3×2, **keeps `workerSlots:1`**) becomes **player-operated**: a clickable building whose tiny menu lets the *player* pick **what** to trade for (goods they **lack or can't yet access**); the **staffed trader villager executes** it. **No spatial reach** (not a coverage layer); the player's *window to the outside*. The constraint is **no NPC *autonomy*** (the town never auto-trades), not "no villager works here". Strip the `RELIEF_BARTER_THRESHOLD` framing. Economy is **open, not self-sufficient** — a bad map is smoothed by trade. |
| **territory** (influence-radius build-gating) | **Freeze** | MP land-claim; solo already runs `enforceTerritory:false`. No cozy spatial stake. |
| **army** (ArmyState / ArmySystem) | **Freeze** | Pure PvP/PvE combat; off-spec, no placement role. |

## What's already shipped — do NOT rebuild

- **Reactive legibility layer** (correct, keep): coverage overlay (`C`), per-service
  placement rings ([render/coverage.ts](../../games/citadel/client/src/render/coverage.ts)),
  road connectivity feedback ([render/road-feedback.ts](../../games/citadel/client/src/render/road-feedback.ts)),
  "covers 0 homes" toast, red/green road-drag validity, occupancy badges.
- **Ambient-life render substrate** (exists, keep): ambient crowd
  ([render/ambient-crowd.ts](../../games/citadel/client/src/render/ambient-crowd.ts)),
  FSM-state villager tints, mill animation, true-iso art.

> **The gap, precisely:** the watch-it-live layer is *pretty but not legible* — the
> ambient crowd is render-only, seeded off a **constant**, deliberately decoupled
> from the sim; villagers tint by **FSM state** (work/idle/travel), **not** by
> happiness or coverage. So nothing in the world visibly differs between a thriving
> district and a neglected one. The keystone work below is *connecting* the existing
> render substrate to town-health — not building new art.

## Build order (dependency-ordered)

### Phase A — The keystone: per-house diegetic mood/coverage signal *(first domino)*
The load-bearing piece; **three other decisions depend on it** (it is also the
threat-consequence layer of #5 and the tutorial payload of Phase C).

- **Research note — this is a small *refactor*, not just a field surface.** Today
  [needs-happiness.ts:`_computeNeedsFor`](../../games/citadel/sim-core/src/systems/needs-happiness.ts#L62)
  computes the per-house `hasFaith/hasSafety/hasGoodsAccess` booleans in a loop but
  **discards them**, keeping only the *aggregate* `p.faithCoverage/safetyCoverage/
  goodsCoverage` ratios (and a single global `p.happiness`). Phase A: **keep those
  per-house booleans** — write them onto each house's runtime state / snapshot entry
  (which needs it lacks). The loop already exists; stop throwing the result away. The
  per-house happiness can derive from the same base-40 + per-need-met math as
  `_updateHappiness`, evaluated *for that house's met needs* instead of the town aggregate.
- Snapshot grows a **spatial** signal: each `BuildingSnapshot` (house) gains
  `{lacksFaith, lacksSafety, lacksGoods, mood}` — read-only, deterministic.
- Renderer expresses it **diegetically**: a well-covered happy house glows warm at
  night / has chimney smoke / looks tended; a neglected house goes dark / smokeless /
  wilted. Reuse the existing building-render + smoke/light substrate.
- *Acceptance:* a player can tell, **without opening any overlay**, which part of
  their town is under-served, purely by looking at the houses. Determinism untouched
  (read-only snapshot fields; the booleans were already computed).

### Phase B — Give the signal teeth: happiness → productivity floor
Makes the signal *mechanical*, not just decorative; implements threat consequence #5.

- **Concrete home.** Output is computed in
  [production.ts:112](../../games/citadel/sim-core/src/systems/production.ts#L112)
  `effectiveOutputPerCycle(def, rs.level)`. Multiply that `amount` by a **happiness
  factor** `lerp(0.6, 1.0, happiness/100)` — i.e. happiness 0 → 60% output, 100 → 100%,
  **never 0**. Happiness is `p.happiness` today (per-player); once Phase A lands the
  per-house/per-worker mood, prefer the **local** worker's happiness so a glum district
  slows but a happy one doesn't. Keep it a single helper (`productivityFactor(h)`) so the
  floor is one tunable constant.
- Re-point fire/disease/raid/winter through this **one channel** (local happiness
  dip), retiring their bespoke destroy/kill/sack consequences (see Phase D). The floor
  guarantees recovery: output never hits 0 → food/coverage always recover → happiness
  drifts back up. *This is what makes #9 a property of the math.*
- *Acceptance:* a town hit by any threat visibly *slows* (glum villagers, smoking
  house, dipped output) and then **recovers on its own** once the cause is handled;
  it can never spiral. Determinism re-proved across 3 seeds (baseline moves by
  design — log it).

### Phase C — Forgiving diegetic cold open (doubles as the tutorial)
Showcases Phases A+B; fixes the corpus-flagged hostile opening (founding-window
deadlock + day-0 rejection-toast wall).

- Start with a tiny **already-alive** core (house + bakery + road, smoke rising, one
  villager walking). First action = **extend** it and watch new life appear.
- Deadlock made **structurally impossible**; defer all threats until ~5 buildings.
- The opening teaches the diegetic loop **by reward, not instruction** — no tutorial
  text needed.
- *Acceptance:* a first-time player never hits a deadlock or a toast wall; their
  first ~60s is placing a building and watching the town get more alive.

### Phase D — Cleanup: demote threats to cozy texture, freeze the bite
Brings the threat systems in line with the contract (#4/#5/#6). Can interleave with B.

- **Fire:** smoulders → dents happiness; well-in-range puts it out; **never razes.**
- **Disease:** villager "under the weather" (slower) for a few days, recovers on its
  own (faster with a Healer in range); **never kills.** Healer's value = *visible
  faster recovery*.
- **Raids:** pass through, pilfer some **stockpiled goods**, leave; walls/gates/
  watchpost reduce theft; **no building/villager ever lost.**
- **Winter:** slows food/growth (grain floored ~×0.5, **never 0** — see Phase H), a
  seasonal rhythm you bank an autumn surplus against; growth *slows* worst-case,
  **never halts and never reverses into a spiral.**
- **Freeze** (don't delete) the morale/interceptor/hazard-interlock machinery —
  unregister from the cozy bootstrap; keep for a future Challenge mode.
- Update [citadel-overview.md](../wiki/citadel-overview.md): the "fire punishes tight
  clusters / spacing-vs-density tension is intentional" design note is **superseded**
  by the cozy contract — it was a pressure-game stance.

### Phase E (optional, later) — villager mood polish
The *second half* of the diegetic signal (the richer, churnier half). Per-villager
mood expressed as posture / dawdling / thought-bubble / tint. Layers on top of the
per-house signal; ships after A–D earn their keep.

### Phase F — Motivation: emergent goals + diegetic recognition (decision #7)
The "why keep playing" layer. **Costs almost no new mechanism** — it lands on the
keystone (A) and the already-shipped overlays. **No score, no quest list.**

- **Make the gap *inviting*, not just informational.** The shipped on-demand overlays
  (coverage `C`, road-connectivity marker) already *show* the gap; the work is *framing* —
  uncovered houses / disconnected buildings should **call out as invitations** (a soft
  pulse / glow when the overlay is up), so a player reads them as "a thing I could fix",
  not raw data. No always-on HUD; the player **pulls** the view.
- **Diegetic recognition on reaching a nice state.** Read-only predicates over the
  snapshot (e.g. *every house covered by all three needs*, *a district = chapel +
  market + N happy homes*, *all reached Town tier*). On completion: the town **visibly
  settles into contentment** (Phase A's per-house glow/smoke, fuller crowd) **+ one
  gentle banner** naming what happened. **No reward, no number, no modal achievement
  wall.** Predicates are pure reads → zero determinism risk.
- *Acceptance:* a player with a stable town can pull a view, *see* an inviting gap,
  invent a target, close it, and get a quiet diegetic "well done" — without the game
  ever assigning a quest or showing a score. Ships after A (the signal it reads) lands;
  can precede or follow C/D/E.

### Phase G — Autonomy pass: civic buildings + reframed trading post (decision #8)
Implements the autonomy principle. Pairs naturally with Phase D's cleanup.

- **Remove the player's decree/policy lever entirely** (no policy menu / commands).
  Rations & work-hours become **autonomous, run by a placed `town hall`** with a
  **spatial reach** (homes in range governed/steadier; out of range not). Festivals
  become **autonomous, thrown at a placed `public square`** with a reach (homes in
  range get the festival happiness lift). Both are new **coverage layers** in the
  puzzle — place them well or some homes miss out.
- **Reframe the trader → `trading post`** — the existing **`tradingpost` building**
  (already in `BUILDING_DEFS`/`PRODUCTION_DEFS`, 3×2, `workerSlots:1` — **keep the
  worker**). A **player-operated, clickable building** with a **tiny exchange menu**, no
  spatial reach: the *player* picks **what** to trade for (goods they **lack or can't
  yet access**); the **staffed trader villager executes** it (you watch them fulfill the
  exchange). Strip the `RELIEF_BARTER_THRESHOLD`/threat framing from `trader.ts`. It's
  the player's *window to the outside* + the canonical intent/execute example (decision
  #8 round-5 refinement). **Not** an autonomous trader (the town never auto-trades).
- **Production choice (economic-intent lever).** A handful of building types that can
  make >1 good become **clickable to set output** (a tiny 2–3-choice menu). Discipline:
  operable types stay **few**, menus stay **glanceable** — never per-building
  micromanagement of the whole town. (Most buildings keep a sensible default and are
  never clicked.)
- **Freeze** `territory` + `army` (unregister from the cozy bootstrap; keep the code).
- *Acceptance:* the player never opens a *policy/behavior* menu (rations/work-hours/
  festivals happen autonomously, influenced **only** by where town hall / public square
  are placed); the player *can* click the trading post to trade and click the few
  multi-output buildings to set production; a terrain-poor town can trade for what it
  lacks. Determinism re-proved (autonomous systems + player commands are deterministic
  reads/writes — no `Math.random`/wall-clock).

### Phase H — Economy under the cozy contract (decision #9)
The economy in [production.ts](../../games/citadel/sim-core/src/systems/production.ts)
was tuned **entirely for the pressure game** — four "nothing happens" sources, decree
threads, and a multi-slot growth model that caused the old death-spiral. Bring it under
the downside rule. Re-prove determinism across 3 seeds (baseline moves by design).

- **Winter grain floored ~×0.5, never 0.** One-line change:
  [world/seasons.ts:32](../../games/citadel/sim-core/src/world/seasons.ts#L32)
  `grainMultiplier("winter")` `0.0` → `~0.5` (spring is already `0.5` — precedent in
  the same function). Food always trickles; banking an autumn surplus *helps* but is
  never *required*; starvation is impossible. Winter = a felt slowdown, not a cliff.
- **Stockpile pressure → throttle, not halt + diegetic.** Today
  [production.ts:94-97](../../games/citadel/sim-core/src/systems/production.ts#L94)
  `if (rs.outputBuffer >= cap) continue` **stops** an uncollected building (OpenTTD
  industry-throttle, a pressure loop). Change to **slow toward the ~60–70% floor** (e.g.
  produce a reduced amount, or fire less often) instead of `continue`; show the backup
  in-world (goods piling at the door / "can't ship" puff). Keeps hauling-distance/road-
  quality a real placement dimension, but neglect = *slowdown*, never *shutdown*.
- **Single-slot buildings (precise).** Set `workerSlots: 1` on **farm / woodcutter /
  quarry / mine** in `PRODUCTION_DEFS` ([building.ts:180+](../../games/citadel/sim-core/src/entities/building.ts#L180);
  mill/bakery/sawmill/smith are already 1). **Compensate output to preserve daily
  throughput:** bump farm `outputPerCycle` **3 → 6** (keeps 6 grain/day in summer);
  woodcutter/quarry/mine keep their per-cycle output (just lose the dead 2nd slot).
  Growth = **more buildings**, no wasted-mouth trap. (Garrison's 4 slots are moot —
  frozen with the army layer.) Re-prove the bread chain still feeds at founding pop.
- **Purge decree logic — TWO sites (the brief previously named only one).**
  (1) Production: delete the `conscription`-halts line
  [production.ts:68-70](../../games/citadel/sim-core/src/systems/production.ts#L68) and
  the `workHours` +30% block [production.ts:120-122](../../games/citadel/sim-core/src/systems/production.ts#L120).
  (2) **Happiness: `_updateHappiness`** [needs-happiness.ts:146-159](../../games/citadel/sim-core/src/systems/needs-happiness.ts#L146)
  also carries the decree penalties (rationing −10 / tithe −8 / workHours −12 /
  conscription −5 + stacking penalty) **and** `FESTIVAL_HAPPINESS_BONUS` /
  `festivalDaysLeft` — purge these too, or no decree is truly gone. **Re-home**
  `workHours` as an **automatic town-hall coverage bonus** (buildings in town-hall reach
  get a small steady output lift) — decree → placement bonus.
- *Acceptance:* a fed town never starves (incl. winter); a poorly-roaded town *slows*
  but never silently shuts down, and the cause is visible; growth advances by placing
  buildings with no dead slots; **no `activeDecrees` / `festivalDaysLeft` reads remain
  in production OR needs-happiness**. The whole economy obeys the **downside rule** (#9).
  Determinism re-proved across 3 seeds.

### Phase I — Terrain: cluster resources + solvability guarantee (decision #10)
Make terrain *be* the puzzle. Re-prove determinism (same seed → byte-identical grid).

- **Cluster forest & stone into patches/regions** in
  [world/terrain.ts](../../games/citadel/sim-core/src/world/terrain.ts) — lower-frequency
  / higher-threshold noise, or a few seeded blob centers — so resources form *groves*
  and *ore-veins* you build *toward*, not per-tile sprinkle. Keep the river + lake
  (already coherent). This is the single change that turns terrain from texture into
  puzzle and gives the trading post (Phase G) a real job.
- **Solvability guarantee.** After generation, assert/repair a workable start: enough
  contiguous buildable land near a spawn area + each resource **reachable or
  trade-backfillable**. A map that fails the check is repaired or rerolled (pure,
  deterministic per seed). Player is never stuck.
- **Tune for "tricky, not unfair."** Variation high enough that maps feel distinct and
  reward thoughtful layout; never so harsh a seed feels broken. Trade is the safety
  valve that *permits* bolder/poorer maps.
- *Acceptance:* across many seeds, every map is solvable (guarantee holds) yet visibly
  distinct; resources read as *places* (a player builds *toward* the grove/vein);
  resource-poor maps occur and are handled by the trading post, not by being stuck.
  Determinism: same seed → byte-identical terrain (fast diff).

## Open prioritization note
Nine phases (A–I). Recommended spine: **A → B → C** (build the keystone signal, give it
teeth, showcase it), with **D** (threat demotion) interleavable alongside B. Then the
structural passes: **G** (autonomy / civic buildings + trading post), **H** (economy
under the downside rule), **I** (terrain clustering + solvability) — these three are the
*real pivot* (they move the determinism baseline and rebalance the game) and want their
own deliberate "yes, do the pivot" gate before starting. **F** (motivation) ships after
A; **E** (villager mood) last. Fastest-perceived-change: C leads ("feels different");
fastest-plays-different: B or H leads. A unblocks A/F's diegetic reads regardless.

## Out of scope (explicitly)
- **New placement *tension* of the building-side kind** (adjacency rules, zoning).
  Grilled and declined (round 1, Q4). **Note (round 5):** terrain-as-puzzle is *now in
  scope* (decision #10 / Phase I) — but as making the *existing* spatial puzzle bite via
  resource clustering, **not** as new building-side mechanics. The puzzle's weight rests
  on terrain; that's the sanctioned place to add bite.
- New threats, new player-operated behavior levers, MP/PvP core. Frozen or deferred.
