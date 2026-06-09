# Farm Valley — World Design & UX Audit + Backlog

> Audit date: 2026-06-04. Covers the world-design features added this session
> (auction plaza, mill, wells, seasonal zones, notice board), the world clock,
> the "disappearing entities" bug fix, and the atlas frames — plus a broader
> world-design / visual / UX review.
>
> Method: 8 static code audits + 3 expert design lenses, each finding
> adversarially re-verified against the real code (98 findings → 82 survived,
> 10 refuted), then cross-checked against the **live running game** in a browser
> (Playwright) at Day 48. Two issues below were caught from live console output
> that static analysis missed (flagged 🔬 live-verified).

---

## 1. Feature Implementation Status

| Feature | Status | Verdict |
| --- | --- | --- |
| **Auction Plaza** | 🔴 cosmetic-only | Podium spawned at (19,19) & tagged, but auctions run over the message bus — agents never travel to or gather at the podium. Decorative prop. |
| **Mill / Granary** | ⬜ no-logic | Region + road + NPC + `MillTag` all present, but no `process`/`mill` action, no deliberation, no perception. Wired but 100% dead code. |
| **Notice Board** | ⬜ no-logic | Entity placed/sprited with an inbox + `bountyText` field, but nothing ever sets `bountyText`, no agent reads it, no UI shows it. |
| **Seasonal Zones** | 🔴 cosmetic-only | Mushroom-grove + ice-pond defined, road-connected, tile-themed, marker-sprited — but the "enforced by agent behaviour" seasonal lock does **not exist**. Walkable any season, zero gameplay. |
| **Wells** | 🔴 cosmetic-only | `well-north`/`well-south` + `WellTag` spawned, but no system queries wells, agents never route to them, and `refill-can` succeeds anywhere. Irrigation loop not closed. |
| **World Clock** | ✅ works | Fully functional end-to-end: time math, season/phase derivation, panel wiring, z-index, frame-synced updates all correct. |
| **Disappearing-entities Bug Fix** | 🟡 partial | Hoe path works & is wired into all 4 agents, but has a missing location guard, **inverted priority** (travel never runs first), unhandled axe/pickaxe, and a low-gold dead-end. |
| **Atlas Frames** | ✅ works | All 56 recipes referenced; zero missing frames, zero dead recipes. Renderer cannot throw "frame not found". |

**Bottom line:** all six new world features render correctly and are wired into
spawning/pathfinding, but **five of the six have no gameplay behavior** — they are
visual props. The clock and atlas work fully. The bug fix works but is incomplete.

---

## 2. Critical Gaps (must-fix)

### 🔬 0. WASM pathfinder traps `RuntimeError: unreachable` under heavy travel — *live-verified*
Caught from the browser console: **181 `RuntimeError: unreachable`** traps over a
single Day-48 run, all in `Pathfinder.alloc` → `TravelSystem.stepFarmer`
([travel.ts:57](src/systems/travel.ts#L57) → [pathfinder.ts:64](../../packages/engine/src/wasm/pathfinder.ts#L64)).
The AssemblyScript stub-runtime allocator exhausts/faults intermittently. The
trap propagates uncaught through `runOneTick`, so that tick is lost and the
farmer's travel stalls. **Pre-existing engine limitation** (this session did not
touch pathfinding), but **aggravated** by the new `buy-tool` travel + 5 new
pathable regions. Wrap `runOneTick`'s body (or `TravelSystem.stepFarmer`) in a
try/catch so a single failed path doesn't kill the tick, and investigate the
allocator headroom / `memory.grow` in the engine WASM.

### 1. `refill-can` executes anywhere — no location validation (blocker)
[act.ts:427-433](src/systems/act.ts#L427) only checks the can exists, then sets
`charges = maxCharges`. Farmers refill mid-road, in forests, at quarries. Gate on
being at a well or the home fountain region.

### 2. Mill is dead code (blocker)
No `process` action in `act.ts` (17 cases, none mill), no deliberation, no
perception. `MillTag` is never read. The mill can never be visited or used.

### 3. Seasonal-zone lock does not exist (blocker)
Zero season checks in any agent. `seasonForDay()`
([weather.ts:39](src/protocols/weather.ts#L39)) is used only by the weather
system + snapshot, never in deliberation. The [regions.ts](src/world/regions.ts)
comment promising "enforced by agent behaviour" describes behavior that was never
written.

### 4. `buy-tool` executes from anywhere — no location guard (blocker)
[act.ts:435-445](src/systems/act.ts#L435) validates only gold; unlike
`craft-decoration` it never checks region. Combined with #5, the queued
travel-to-village never runs and the purchase fires at the farm.

### 5. `deliberateBuyTool` has inverted priority (high)
[watering.ts:68-82](src/agents/watering.ts#L68) queues travel at `priority + 1`
and buy-tool at `priority`. The ascending-priority sort puts **buy-tool first**;
`TravelSystem` only acts when `queue[0].kind === "travel"`, so travel is never
processed. Reverse it: travel `priority - 1`.

### 6. Axe / pickaxe break-recovery unhandled (high)
`deliberateBuyTool` is only ever called with `'hoe'`. A broken axe/pickaxe
([act.ts:390](src/systems/act.ts#L390), [act.ts:419](src/systems/act.ts#L419)) is
removed with no replacement, and `deliberateResourceGather` then silently stops —
the **same entity-collapse pattern** the hoe fix addressed. Call
`deliberateBuyTool` for `'axe'` and `'pickaxe'` too.

### 7. Notice board has no setter / reader / UI (high)
`bountyText` ([components.ts:194](src/components.ts#L194)) is never written. No
`NoticeBoardSystem` exists. The board's inbox receives DAY_START but nothing
processes it. Build a `NoticeBoardSystem` mirroring `ShopSlateSystem`.

### 8. Wells never queried; never surfaced to agents (high)
`act.ts`/`plot-sense.ts` never query `well`. Well entities are orphaned.
`deliberateRefillCan` queues a `refill-can` with no travel intent, so agents
can't route to a well even though that was the whole design goal.

### 9. Missing hover labels on new structures (medium)
[snapshot-builder.ts:200-211](src/worker/snapshot-builder.ts#L200) labels only
farmer/blacksmith/carpenter/shopkeeper/marketWall. Podium, mill, notice board,
wells all render `label = null` → no tooltip.

### 10. Auction system never references the podium (high)
[auction.ts](src/systems/auction.ts) has zero location refs; CFP/bids flow over
the bus with no location validation. Either require pathing to (19,19) before
bidding or document the podium as a pure landmark.

### 🔬 11. Stale walkable-tile test — *live-verified*
[walkable-grid.test.ts:45](src/world/walkable-grid.test.ts#L45) asserts
`EXPECTED_WALKABLE = 1261`, but a fresh BFS over the current map (with the new
regions/roads) counts **1311** walkable tiles. The test will fail. Update the
expected count and add a per-region BFS-reachability assertion (all 16 region
centers are currently reachable from the village — verified).

---

## 3. World Design Improvements (ranked)

1. **Integrate mills & wells into the economy flow** (high) — mill is a dead-end
   spur; wells are asymmetrically placed; neither tag has behavior. Make the mill
   a loop, rebalance well placement, add signposts + use-time glow.
2. **Encode farm ownership/personality in the map** (medium) — all four farms
   share identical grass, fences, and white homes. Tint tiles, color
   fences/shutters, add banners so a spectator reads ownership at a glance.
   (Farmers themselves are personality-sprited; the *environment* is not.)
3. **Add seasonal/weather visual progression** (medium) — day/night seasonal
   grading is the *only* seasonal visual. No forest color shift, ice-pond frost,
   or weather overlays (the `WeatherSystem` tracks but never renders).
4. **Strengthen seasonal-zone incentive + feedback** (medium) — add
   out-of-season frost/gray overlays and define zone content (special
   crops/resources) gated by season.
5. **Path traffic / congestion feedback + waymarks** (medium) — uniform
   `tile/path`, no directional variants, no density rendering. Add signposts and
   tint roads when 2+ agents share a tile.
6. **Visual feedback for social/trade interactions** (medium) — only a single
   generic `indicator/meet` bubble. Differentiate (gift box, handshake), stage
   negotiation/auction visually.
7. **Break grid symmetry with biomes/clusters** (medium) — perfect cardinal
   symmetry makes every quadrant identical. Add asymmetric resource clusters and
   a distinctive central crossroads.
8. **Stage the podium & notice board** (medium) — lone sprites in the square; add
   platform/benches/scroll + an "auction active" glow.

---

## 4. Visual / Art Improvements (ranked)

1. **Farmer personality sprites nearly indistinguishable** (high) — idle frames
   differ by ~5px head color; the four **work** frames are pixel-for-pixel
   identical ([recipes.ts:1083-1168](../../tools/atlas-builder/src/recipes.ts)) and
   the work pose is the actively-rendered frame during the core farming loop.
   Differentiate by silhouette/hat and give each a distinct work pose.
2. **No visual state indicators** (high) — nothing renders `daysSinceWater`,
   farmer `ap`/`unrested`, or tool `durability`. Add small overlays: thirsty-crop
   tint, dying-crop gray, exhausted-farmer desaturation, broken-tool "x".
3. **NPC structures static & low-distinctiveness** (medium) — single static
   frame each, differing only in palette; farmers animate but NPCs don't. Add
   idle animation (forge glow, mill roof, shopkeeper sway).
4. **Single-frame tile backdrops, hard region boundaries** (medium) — add 3-4
   deterministic tile variants + corner-blend transition tiles.
5. **Work animation barely visible** (medium) — a single static frame held for
   seconds vs. walking's 2-tick cycle. Add work-a/b/c cycling.
- ✅ Day/night grading and ground-noise texture are both well implemented.

---

## 5. UX / HUD Improvements (ranked)

1. **No onboarding / legend** (high) — nothing explains personality colors, FSM
   state names, or controls. Add a "?" help panel.
2. **Focus-on-farmer is undiscoverable** (high) — click-to-follow + "Why" trace
   exist but have no hint, a 1px highlight, and a cryptic "Reset view". Add
   "click to follow", a "Following: [name]" badge, a bold "Why:" header, a
   stronger highlight, and rename to "Unfollow".
3. 🔬 **Personality badge colors are all the same purple** (high) — *live-verified*.
   [observer.ts:60-65](src/ui/observer.ts#L60) keys `PERSONALITY_COLORS` on
   `cautious/bold/social`, but the actual kinds are
   `conservative/aggressive/hoarder/opportunist` — **every lookup misses and
   falls to the default purple** (confirmed in the running game: all four chips
   render `rgb(155,89,182)`). The color-coding is entirely non-functional. Fix the
   keys and consolidate `observer.ts` + `leaderboard.ts` maps into a shared
   `ui/colors.ts`.
4. **Keyboard shortcuts undocumented** (medium) — Space/Period/1/2/4 have no
   tooltips/hints.
5. **Panels overflow small windows** (medium) — fixed panels sum to ~760px, no
   media queries.
6. **No paused-state indicator on the canvas** (medium) — `paused` only flips a
   button label; render a "PAUSED" watermark.
7. **Event feed lacks personality color / click-to-follow** (medium).
- World clock 20-hour day is correct but unexplained → add a tooltip.
- Debug player (WASD/P) is an undiscovered dev tool → gate behind `?debug=1`.

---

## 6. Refuted / Non-issues (verified fine)

Adversarial verification dropped 10 false positives, including: notice-board
inbox *is* created; ice-pond road connector *is* defined; village center *does*
have a focal point (market-floor + podium + board); leaderboard rank colors *are*
applied; palette/particles are adequate; no config-panel/title overlap. Several
surviving findings had distances corrected (workshop connectors ~13 tiles, not
~30) and the personality-color mismatch narrowed (only the default fallback
differs between the two maps — the visible "all purple" bug is the wrong-keys
issue in #5 above).

---

## TODO backlog (copy-paste)

> **Update (this session):** all P0 items plus several P1 items are now DONE —
> see the checked boxes. Verified by typecheck, 418 passing tests (incl. a new
> `new-mechanics.test.ts` with 15 cases), and a clean live browser run (0
> console errors, down from 195; 0 pathfinder traps, down from 181).

### P0 — Critical (broken wiring / residual bugs)
- [x] 🔬 Wrap `runOneTick`/`TravelSystem.stepFarmer` in try/catch so a WASM pathfinder fault doesn't kill the tick (sim-worker.ts, travel.ts) — *engine allocator headroom still worth a follow-up, but the trap no longer flooding/wedging*
- [x] Add a location guard to `refill-can` (only at a well or home-farm region) (act.ts)
- [x] Add a location guard to `buy-tool` (`currentRegion === 'village'`) (act.ts)
- [x] Reverse `deliberateBuyTool` priority so travel runs before purchase (watering.ts)
- [x] Call `deliberateBuyTool` for `'axe'` and `'pickaxe'` — centralized in `deliberateResourceGather` so all four agents recover (watering.ts)
- [x] Implement mill gameplay: `process-crop` action (region-gated, MILL_PRICE premium) + `deliberateMillVisit` wired into opportunist & aggressive (act.ts, ap.ts, watering.ts)
- [x] Implement seasonal-lock enforcement: `forage` action gated on region+season + `deliberateSeasonalForage` wired into hoarder & opportunist (act.ts, watering.ts, weather.ts)
- [x] 🔬 Fix the stale walkable-tile test (1261 → 1311) and add a per-region BFS-reachability assertion (walkable-grid.test.ts)

### P1 — High-value (missing logic / integration gaps)
- [x] Build `NoticeBoardSystem` (mirrors ShopSlateSystem): posts a daily bounty, broadcasts ONT_BOUNTY, PerceiveSystem folds it into beliefs, shopkeeper applies the premium on crop sales, `bountyText` shown on hover (systems/notice-board.ts, protocols/bounty.ts, perceive.ts, shopkeeper.ts)
- [x] Surface wells: `deliberateRefillCan` now routes to the nearest well/fountain when away and the can is empty (watering.ts)
- [ ] Make agents physically gather at the auction podium (travel + location check on bid) OR document podium as a landmark (auction.ts, shopkeeper.ts:369-391, act.ts:303-322) — *still open: auctions remain bus-only; podium is a landmark for now*
- [x] Add hover labels for podium / mill / notice board / wells (snapshot-builder.ts)
- [x] 🔬 Fix `PERSONALITY_COLORS` keys so chips aren't all default purple; extracted shared `ui/colors.ts` used by observer + leaderboard (ui/colors.ts, observer.ts, leaderboard.ts)
- [ ] Differentiate farmer WORK sprites per personality (currently pixel-identical) + idle silhouettes/hats (recipes.ts:1083-1168, 173-435)
- [ ] Add crop/farmer/tool visual state indicators (thirsty/dying/exhausted/broken) (render-systems.ts:251-266)
- [x] Add an in-game legend / onboarding ("?" panel: personalities, FSM states, controls) — *the "?" modal (playback-controls.ts) already had Controls + Tools; extended it with Personalities (color-swatch legend) + Farmer-states (FSM) sections (2026-06-09)*
- [ ] Add discoverable focus-on-farmer affordances (hint, "Following: X", bold "Why:", stronger highlight, rename Reset→Unfollow) (observer.ts:116,205,223-234,306-325)

### P2 — Polish
- [ ] Integrate mills/wells visually: signposts, use-time glow, rebalanced placement, mill loop (regions.ts, render-systems.ts)
- [ ] Document keyboard shortcuts via tooltips + controls hint (playback-controls.ts, main.ts:257-283)
- [ ] Responsive media queries so corner panels collapse/stack on narrow viewports (right-column.ts, leaderboard.ts, config-panel.ts, slate-billboard.ts)
- [ ] Render a "PAUSED" canvas watermark when paused (main.ts:85,494)
- [ ] Personality-colored name badges + click-to-follow in the event feed (event-feed-panel.ts:64-80; preserve farmerId through snapshot-builder.ts:244-250)
- [ ] Tooltip explaining the 20-hour in-game day; extend dom.ts to support `title` (world-clock.ts:42-47, dom.ts)
- [ ] Responsive game-over modal: `max(320px, 90vw)` (main.ts:549)
- [ ] Gate the debug player behind `?debug=1` or document it (main.ts:71-80,442-466)
- [ ] Encode farm ownership in the environment: tile tints, colored fences/homes, banners (render-systems.ts:60,123,197)
- [ ] Seasonal/weather visual progression: tile tints, seasonal wash, weather overlays, out-of-season zone overlays (render-systems.ts:56-78, render/day-night.ts, weather.ts)
- [ ] Road waymarks / directional tiles / crowd-density tint (render-systems.ts:59,197)
- [ ] Animate NPC structures + add tile variants & corner-blends (recipes.ts:816-1012, render-systems.ts:56-78)
- [ ] Differentiate MEET indicators + stage trade/auction visuals (render-systems.ts:305-339, meet-indicator.ts)
- [ ] Add a `world-clock.test.ts` documenting the 20-hour time math (ui/world-clock.ts:41-48)
- [ ] Low-gold recovery path (scavenge / guaranteed minimum gold) so a broken hoe + <5 gold can't permanently strand a farmer (watering.ts:52-84, sim-bootstrap.ts:42-66)
```
