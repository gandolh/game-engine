# Brief 108 — Citadel live-MP verification pass

status: done (2026-07-10)
source: the never-verified-live items — [wiki/status.md](../../../wiki/status.md) 2026-06-26 entry (citadel-38 "P1#6/#7/#9 social-layer/RunRegistry/MP-render still need live-MP verification"), [todos/2026-06-18-citadel-00-BUILD-ORDER.md](../../../todos/2026-06-18-citadel-00-BUILD-ORDER.md) items 21/22 (windowed-bake GPU-runtime verification LEFT OPEN), and [2026-07-02 review findings item 35](../../../todos/2026-07-02-full-repo-review-findings.md) (MP render window mixes iso and axis-aligned space — worse than its in-code "deferred" comment implies).

## Setup

`npm run citadel`, open two real-browser tabs on `?mp` (same room), real GPU. Drive both
via the `window.__citadel` dev hook where scripted steps help. ⚠️ Run AFTER brief 97
(chunk 5 fixes MP pause/speed authority — verifying before it lands would just re-find
that known bug).

## Checklist

1. **RunRegistry / room lifecycle**: join, late-join replay, owner handoff on owner leave,
   both tabs closing → room reaps; a third tab re-joining a reaped key gets a fresh run.
2. **MP render**: rival buildings/villagers/raiders render correctly on both clients;
   verify against brief 105's owner-filter finding (rival crowd currently indistinguishable).
3. **Social/threat layer under MP** (citadel-38 P1#6): threats + events attribute to the
   right player on both screens.
4. **Windowed bake on the large MP world** (items 21/22): pan far from center on both
   tabs; watch for the iso-vs-axis window drift (findings item 35) — capture concrete
   repro coordinates if it bites. If it does, fix or file the iso-correct windowing as the
   follow-up it's been deferred as.
5. **Incremental build queue under GPU runtime** (item 22's other half): heavy building
   spam doesn't hitch either client.

## Closeout

Each item verified-or-filed; the 2026-06-18 BUILD-ORDER todo gets its residual items
resolved and moves to closed; status.md's "still need live-MP verification" line cleared.

---

## Progress (2026-07-10) — DONE

Ran live: `npm run citadel`, two real browser tabs on `?mp` against the WebSocket server, plus a
raw-WS harness where browser tab churn was too coarse to time the reap grace.

**The pass found one root-cause defect that invalidates most of the render checklist, and one
independent gameplay bug.** The first is filed as [brief 110](../todo/110-citadel-client-world-size.md);
the second is fixed here.

### Item 1 — room lifecycle: **PASS**

- Join + late-join replay: a second peer joins mid-run and receives the first peer's buildings with
  the correct `ownerId` (`localPlayerId 1`, `isHost false`).
- **Owner handoff:** closing the host tab promoted the survivor in **211ms** (`isHost → true`); the
  departed player's buildings persisted.
- **Reap + re-join,** measured over raw WS — browser tab churn exceeded the 10s grace and gave a false
  "fresh run" reading, which is worth knowing for future passes:
  - reconnect after **3.1s** → rejoined the *live* run (tick 58, hall intact, playerId 1)
  - reconnect after **12s** → fresh run (tick 1, no buildings, playerId reset to 0)

  `reapGraceMs` (10s) and `reset()` behave as `sim-host.ts` documents. citadel-38 P1#7 **verified live**.

### Item 3 — social/threat attribution: **FAILED → fixed**

The town-hall's keep/raid-anchor role was gated on `state.players.length > 1` — a **live** count —
while `keepPosition` is assigned once, at placement. A real MP room is founded by **one** peer and
grows, so the founder's hall never anchored. Raid-spawn gates entirely on `keepPosition`, so the
founder was **permanently raid-immune**; meanwhile the snapshot's `keepPresent` re-evaluated the same
predicate every tick and flipped to true the moment a second peer joined, telling the founder
"Keep: standing".

Isolated live — two identical halls, opposite behaviour:

| player | hall placed | `keepPresent` | `nextRaidDay` |
|---|---|---|---|
| 0 | while **alone** | true | **-1** (never raided) |
| 1 | with **2 players** present | true | 213 |

**Fixed** (commit `16b0191`): the mode is now the bootstrap-time `CitadelSimOptions.multiplayer` flag,
default false. The MP server passes true; the solo worker states false explicitly. Solo, the headless
runner, and the determinism baseline are unchanged by construction — both predicates evaluate false at
one player, with no RNG draw between them. Regression test in
[world-config.test.ts](../../../../games/citadel/sim-core/src/systems/world-config.test.ts) ("the peer
who FOUNDS an MP room anchors its hall while still alone"), confirmed to go red under the old predicate
while its four siblings stayed green. Re-verified against the live server: the founder, alone, now
reports `keepPresent true` **and** `nextRaidDay 5`.

### Items 2, 4, 5 — **BLOCKED on the root cause; carried into [brief 110](../todo/110-citadel-client-world-size.md)**

The server runs a **256×256** world; the **client is hardcoded to 96×96** (`generateTerrain(SEED)` with
no size args; `iso.ts`'s `ISO_ORIGIN_X`/`ISO_WORLD_W`/`ISO_WORLD_H` are compile-time consts). Verified
in-browser: an MP tab reports `terrain() → 96×96`.

- **Item 2 (MP render)** — *data half passes*: both clients see both players' buildings with correct
  `ownerId`. *Visual half fails*: a hall at the world's own centre (128,128) projects to screen y≈712
  on a 640px-tall canvas. Neither player can see their own settlement. Players are in fact confined to
  the top-left 96×96 corner by `placement-state.ts`'s bounds check.
- **Item 4 (windowed bake / findings 35)** — **unreachable in production.** `shouldWindow(1536,1536)`
  is false, so `windowed` is *always* false and the windowed path never executes. citadel-38 item 8's
  "one-line fix" (call `windowController.update(camera)` per frame) **was applied** — it sits at
  `main.ts:1221` — and is **inert** for exactly this reason. Findings item 35's iso-vs-axis drift is
  real but *latent behind* this: it can only bite once the client actually windows.
- **Item 5 (build-queue hitch)** — not meaningfully testable: `IncrementalQueue` only drains when
  `windowed` is true.

These three become acceptance criteria of brief 110 rather than a follow-up.

### Corpus effects

- BUILD-ORDER items **21/22**: resolved as *cores shipped + wired, runtime unreachable* — superseded by
  brief 110, which now owns their GPU-runtime verification.
- Review findings item **35**: re-pointed at brief 110 (a sub-task of the windowing work, not a
  standalone cleanup).
- status.md's "P1#6/#7/#9 still need live-MP verification" line: **#7** (RunRegistry) verified; **#6**
  (social/threat) verified and fixed; **#9** (MP render) blocked on brief 110.

### Method note

Neither defect is visible from unit tests or from solo play — solo is 96×96 and self-consistent, and
every sim test bootstraps its own world. Both required driving two real clients against the real
server. That is the whole argument for this brief existing.
