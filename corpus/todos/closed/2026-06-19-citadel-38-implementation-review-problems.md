---
title: "Citadel 38 — implementation review: problems found (audit, pre-fix)"
created: 2026-06-19
status: partly-done
tags: [citadel, audit, multiplayer, render, sim, bug]
---

# Citadel 38 — implementation-review problems

> **WORKED (2026-06-26).** Fixed **P0 #1–4** (MP authority: demolish/upgrade owner
> checks, setActivePlayer inbound reject, owner-gated pause/resume/speed), **P1 #5**
> (villager owner filter), **P2 #10–13** (tier wall-spam exclusion, direction-aware
> tier message, defensive-building safety coverage, keepPresent isKeep), and **P3
> #15–19** (server-client error handling + queue cap, dead inputBuffer removed,
> localPlayer find-only, bot anchor spread, dead constant). All Citadel workspaces
> typecheck clean; tests green; headless scenarios byte-identical before/after.
> **DEFERRED:** P3 #14 → folded into the siege-variance gameplay todo (makes siege
> consume the dead fork). P1 #6/#7/#8/#9 (social-layer consume, RunRegistry parity,
> windowed-bake per-frame wire, MP render entities) need live-MP / real-GPU
> verification — carry forward. See log.md 2026-06-26.

**Method.** Read-only review (2026-06-19) of `@citadel/sim-core`, `@citadel/client`,
`@citadel/server` against the [APR](../briefs/citadel-apr.md) and the
[BUILD-ORDER](2026-06-18-citadel-00-BUILD-ORDER.md). Three subagent passes
(sim / client+render / server+MP), then the load-bearing findings re-read and
verified by hand. NO tests / sims / determinism checks were run (constrained
hardware — ask before running). Each item below is tagged **[verified]** (I
re-read the cited code) or **[agent-cited]** (reported with a file:line by a
subagent, not independently re-read — confirm before fixing).

**Headline.** Solo Citadel (one player, 96×96) looks healthy — every MP gap
below is a no-op at `players.length === 1`. The problems cluster in the
**multiplayer-RTS epic (briefs 28–37)**, which is unit-tested + determinism-proven
headless but was **never run live across real peers** — and the live wiring has
real holes: no server-side ownership enforcement on destructive commands, the
whole social layer is dead end-to-end, and the windowed-bake renderer is built
but never ticked. Two corpus claims turned out **stale** (see *Corpus corrections*).

---

## P0 — MP authority / griefing (breaks a live multiplayer game)

These are all **server-authoritative command handlers that trust the sender**.
The MP host ([sim-host.ts](../../games/citadel/server/src/sim-host.ts)) enqueues
any peer's command into the one authoritative stream after a
`setActivePlayer{peerId}` marker; the handlers in
[sim-bootstrap.ts](../../games/citadel/sim-core/src/sim-bootstrap.ts) then act on
`localPlayer(state)`. Several never check that the *target* belongs to the sender.

1. **`demolish` has no ownership check — any peer can raze any player's city, including their town-hall (= instant elimination).** **[verified]**
   [sim-bootstrap.ts:397–434](../../games/citadel/sim-core/src/sim-bootstrap.ts#L397-L434).
   The handler finds the first building covering `(x,y)` and despawns it; `b.ownerId`
   is read only for bookkeeping, never compared to the sender. `enforceTerritory`
   gates `placeBuilding` only, not `demolish`. A peer sends
   `{type:"command", command:{type:"demolish", payload:{x,y}}}` at a rival's keep →
   `keepSacked` → rival game-over. **Fix:** reject demolish unless
   `b.ownerId === localPlayer(state).id` (or within own territory).

2. **`upgradeBuilding` has no ownership check — a peer can force-upgrade a rival's building, draining the *rival's* stockpiles.** **[verified]**
   [sim-bootstrap.ts:436–489](../../games/citadel/sim-core/src/sim-bootstrap.ts#L436-L489).
   Costs are deducted from `owner = playerById(state, b.ownerId)`, not the sender —
   so the griefer spends the victim's materials and mutates the victim's building.
   **Fix:** gate on sender == owner.

3. **`setActivePlayer` is in the client-sendable `CitadelCommand` union.** **[verified]**
   [snapshot/index.ts:149–152](../../games/citadel/sim-core/src/snapshot/index.ts#L149-L152),
   handler [sim-bootstrap.ts:563–565](../../games/citadel/sim-core/src/sim-bootstrap.ts#L563-L565),
   server injection [sim-host.ts:99–100](../../games/citadel/server/src/sim-host.ts#L99-L100).
   *Live impersonation is largely neutralised* because the server re-injects
   `setActivePlayer{peerId}` before **every** command, so a forged marker is
   overwritten before the next real action runs. But it remains a defense-in-depth
   hole: a routing-control command should not be constructable by a client at all.
   **Fix:** move `setActivePlayer` out of the client command union (server-internal
   only), or have the host strip/reject it from inbound `command` messages.

4. **`pause` / `resume` / `speed` are not owner-gated — any peer can freeze or fast-forward the shared room.** **[verified]**
   [sim-host.ts:103–111](../../games/citadel/server/src/sim-host.ts#L103-L111).
   They mutate the single shared `paused`/`speed`. Farm's `RunRegistry` gates these
   to the run owner; Citadel has no owner concept. **Fix:** adopt an owner/host
   role (see P1#7) and gate control messages to it.

---

## P1 — MP features that are inert / unwired end-to-end

5. **VillagerSystem ignores `ownerId` → in MP, a player's villagers staff and haul to *rivals'* buildings.** **[verified]**
   `assign()` and `firstStore()` query **all** buildings with no owner filter
   ([villager-system.ts:218–296](../../games/citadel/sim-core/src/systems/villager-system.ts#L218-L296)).
   Villagers *are* per-player — immigration spawns them with `ownerId: p.id`
   ([immigration.ts:183](../../games/citadel/sim-core/src/systems/immigration.ts#L183))
   and the deposit step credits `v.ownerId`. So a player-1 villager gets assigned to
   the nearest player-0 workplace and walks to player-0's storehouse, deposit
   silently lands in player-1's pool, and the FSM paths through enemy territory.
   Solo is unaffected (single owner). **Fix:** filter both queries by
   `entity.building.ownerId === v.ownerId`.

6. **The entire Citadel-36 social layer (presence / emotes / roster) is dead on the client.** **[verified]**
   The server relays them ([sim-host.ts:120–148](../../games/citadel/server/src/sim-host.ts#L120-L148)),
   but [server-client.ts:43–55](../../games/citadel/client/src/worker/server-client.ts#L43-L55)
   handles only `ready`/`snapshot`/`save-data` — `roster`/`presence`/`emote` fall
   through and are dropped, and there is **no client method to *send*** presence or
   emotes. Nothing renders cursors, team colours, or emotes either. The brief's
   headline feature is wired server-side and unconsumed client-side. **Fix:** handle
   the three inbound types + add send methods + a render layer for cursors/emotes.

7. **Single hard-wired global `CitadelSimHost`, no run registry; a reconnect after everyone leaves yields a frozen sim.** **[verified]**
   [index.ts](../../games/citadel/server/src/index.ts) creates one host forever.
   `detach()` → `stop()` clears the interval but never nulls `this.sim`
   ([sim-host.ts:84–87](../../games/citadel/server/src/sim-host.ts#L84-L87),
   [197–202](../../games/citadel/server/src/sim-host.ts#L197-L202)). A later peer's
   `init` hits the `this.sim !== null` branch
   ([sim-host.ts:91–93](../../games/citadel/server/src/sim-host.ts#L91-L93)) and gets
   a snapshot of a sim whose interval is dead → state with no ticking. Diverges
   from the proven Farm `RunRegistry` (keyed rooms, reap timer, owner). **Fix:** port
   the RunRegistry pattern, or at minimum null `sim` on empty + re-arm on next init.

8. **The render-window / incremental-build-budget renderer (briefs 21/22) is built and tested but never ticked — panning the 256×256 MP world never re-bakes.** **[verified]**
   `RenderWindowController` *is* instantiated and `bakeInitial(camera)` is called at
   construction ([citadel-renderer.ts:170–171](../../games/citadel/client/src/render/citadel-renderer.ts#L170-L171)),
   but its per-frame `update(camera)` — the coalesced windowed re-bake on pan
   ([window-controller.ts:163–179](../../games/citadel/client/src/render/window-controller.ts#L163-L179)) —
   is **not called anywhere in [main.ts](../../games/citadel/client/src/main.ts)'s
   frame loop**. So above the `WINDOW_TEXEL_THRESHOLD` (only the MP world), the
   initial window bakes and the rest of the map never paints as you pan. Solo
   (96×96) is below threshold → whole-world bake → fine. **Fix:** call
   `windowController.update(camera)` each frame after camera update. *(One line; the
   hard part — engine `bakeStaticLayer(region)` — is already done; see corrections.)*

9. **No MP-specific render entities.** **[agent-cited]** Buildings carry `ownerId`
   and armies are in the snapshot, but team-colour tinting, other players' presence
   cursors, and emotes are not drawn ([server-client.ts](../../games/citadel/client/src/worker/server-client.ts),
   [main.ts](../../games/citadel/client/src/main.ts)). An MP session shows one merged
   world with no who-owns-what cue. (Confirm whether `armies` are even drawn.)

---

## P2 — sim balance / wrong feedback (single-player visible)

10. **Tier advancement counts every wall tile as a building → wall-spam reaches Citadel/Fortress tier with no real infrastructure.** **[agent-cited]**
    [tiers.ts:160](../../games/citadel/sim-core/src/systems/tiers.ts#L160) — `if (prod?.isRoad !== true) nonRoadBuildingCount++`; `wall` is `isRoad:false`, so each
    wall tile counts. `minBuildings` 25/40 can be met by laying walls. **Fix:** also
    exclude `isWall`/`isGate` from the tier building count.

11. **Tier-change event says "risen from X to Y" even on demotion, and a demotion retroactively re-locks buildings.** **[agent-cited]**
    [tiers.ts:164–170](../../games/citadel/sim-core/src/systems/tiers.ts#L164-L170).
    Losing pop (disease/starvation) drops the tier; the message still says "risen",
    and `TIER_LOCK` then blocks placing keep/garrison until the tier is regained
    mid-game. **Fix:** direction-aware message; decide whether demotion should re-lock
    placement at all.

12. **Tower / garrison / keep / town-hall have `SERVICE_RADII` entries that feed nothing — only `watchpost` provides safety coverage.** **[agent-cited]**
    [needs-happiness.ts:40–60](../../games/citadel/sim-core/src/systems/needs-happiness.ts#L40-L60).
    Building towers/garrisons yields zero `safetyCoverage`/happiness; the radii are
    dead data. (Confirm against the safety-provider classification.) **Fix:** either
    feed these into safety coverage or drop the unused radii.

13. **Snapshot `keepPresent` only matches `type === "keep"`; the MP anchor is `town-hall` → MP players always see "no keep".** **[verified]**
    [sim-bootstrap.ts:677–680](../../games/citadel/sim-core/src/sim-bootstrap.ts#L677-L680);
    `town-hall` is `isKeep:true` ([building.ts:298–305](../../games/citadel/sim-core/src/entities/building.ts#L298-L305)).
    Siege/elimination correctly use `isKeep`; only the snapshot export is wrong.
    **Fix:** test the production def's `isKeep`, not the literal type string.

---

## P3 — determinism trap + cleanup / robustness

14. **Latent determinism trap: `SiegeResolutionSystem` forks `state.rng` per resolved raid but `resolveSiege` never consumes it.** **[agent-cited]**
    [siege-resolution.ts:78, 211–214](../../games/citadel/sim-core/src/systems/siege-resolution.ts#L78).
    `resolveSiege(raid, defense, _rng)` is pure math; the `state.rng.fork(\`siege-${id}\`)`
    still advances the root RNG one step per raid, so the **dead fork is load-bearing
    for replay** — removing it silently shifts all later RNG (army resolution, etc.)
    and moves the baseline. **Fix:** make siege actually use the rng, or remove the
    fork knowingly (baseline move + determinism re-proof, ask first).

15. **`CitadelServerClient`: no `onerror`/`onclose`, unbounded `queued`.** **[agent-cited]**
    [server-client.ts:29–56](../../games/citadel/client/src/worker/server-client.ts#L29-L56).
    Server unreachable → silent blank screen; pre-connect commands accumulate
    without a cap. **Fix:** error/close handlers + a queue cap + a user-visible
    disconnect state.

16. **`BuildingRuntimeState.inputBuffer` is written-once, never read.** **[agent-cited]**
    [building.ts:22](../../games/citadel/sim-core/src/entities/building.ts#L22),
    init [sim-bootstrap.ts:226](../../games/citadel/sim-core/src/sim-bootstrap.ts#L226).
    Production draws inputs from the shared stockpile, not a per-building buffer.
    Dead field — remove or implement.

17. **`localPlayer()` indexes `players[localId]` with a `find()` fallback — correct only while ids stay contiguous from 0.** **[verified]**
    [sim-state.ts:261](../../games/citadel/sim-core/src/sim-state.ts#L261). Fine today
    (ids == array index); fragile if a player ever leaves and ids reuse/reorder.
    **Fix:** use `find()` only.

18. **Bot anchor quadrant collides for >4 bots.** **[agent-cited]**
    [bot.ts:44–45](../../games/citadel/server/src/bot.ts#L44-L45). Bots 4/5… reuse
    quadrants of 0/1 → overlapping placements that silently fail. Low (lobbies are
    small). **Fix:** spread anchors by `playerId` over more cells.

19. **`DEFAULT_TICKS_PER_DAY` dead constant kept alive by `void`.** **[agent-cited]**
    [sim-worker.ts:18,109](../../games/citadel/client/src/worker/sim-worker.ts#L18). Remove it.

---

## Verification debt (not bugs — carry forward, needs a real GPU / live peers)

- **No WebGPU render has been eyeballed on this host** (headless, no GPU): day/night
  wash, weather, wear, ambient crowd, autotiling, *and* the windowed bake (after
  P1#8 is wired). Every render brief (11–25, 27) is GPU-unverified.
- **Live multiplayer has never run across real browser peers**: WS transport,
  multi-writer command ordering under real latency, late-join, reconnect, disconnect
  cleanup. The P0/P1 server findings are exactly what a live session would expose.
- **Any sim-touching fix above (P0 #1–5, P2, P3#14) needs a fast multi-seed
  `EXPORT=json` determinism re-proof** per the project rule — **ask before running**
  (constrained hardware). Solo must stay byte-identical to the pre-fix baseline;
  P0/P1 fixes should be MP-only branches that don't touch the `players.length===1` path.

## Corpus corrections (stale claims found during this review)

- **`bakeStaticLayer` sub-region support is DONE, not "left open."** The
  [BUILD-ORDER](2026-06-18-citadel-00-BUILD-ORDER.md) and the
  [21](2026-06-19-citadel-21-render-windowed-grid.md)/[22](2026-06-19-citadel-22-incremental-build-queue.md)
  todos say the engine has "no sub-region/offset parameter." It does now:
  `RendererLike.bakeStaticLayer(..., region?: StaticRegion)`
  ([renderer.ts:34–39](../../engine/core/src/render/renderer.ts#L34-L39)) + a
  [`static-region.ts`](../../engine/core/src/render/static-region.ts) module, wired
  through both Canvas2D and WebGPU passes and used by `window-controller.ts`. The
  *only* remaining gap is the missing per-frame `update()` call (P1#8) — and GPU
  verification.
- **The 21/22 cores are NOT "dead/un-consumed."** They are consumed by
  `RenderWindowController`, which solo-bakes once at boot. The accurate statement is
  "instantiated but its pan-update is never ticked."

## Suggested fix order

1. **P0 #1–4** (one focused MP-authority brief): add server-side ownership/owner-role
   gating. Small, high-value, MP-only.
2. **P1 #5** (villager owner filter) + **#13** (`keepPresent` isKeep) — quick MP
   correctness; #5 is sim-touching → determinism re-proof.
3. **P1 #8** (one-line `windowController.update` wire) + **#6** (social layer
   consume/send) — needs GPU/live verification after.
4. **P1 #7** (RunRegistry parity) — larger; do once live MP is being tested.
5. **P2/P3** — fold into the next sim-balance pass; #14 needs a deliberate baseline move.
