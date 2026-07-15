# Brief 114 — Citadel client `main.ts` decomposition (module-directory convention)

status: todo
source: 2026-07-15 project-structure survey. [main.ts](../../../../games/citadel/client/src/main.ts)
is **1,949 lines — the largest source file in the repo** — and violates the repo's own
module-directory convention ([architecture.md](../../../wiki/architecture.md) "Module-directory
convention": large units become a directory of focused modules behind a barrel). The Farm client
already solved this exact problem: [games/farm/client/src/main/](../../../../games/farm/client/src/main/)
splits its shell into `camera.ts`, `config.ts`, `juice.ts`, `panels.ts`, `playback.ts`,
`render-loop.ts`, … each with a colocated test. The Citadel client grew every feature wave
(HUD migration, settings modal, follow-cam, audio, save/load, sim-client transport, the ~455-line
animation loop, boot) into one file instead.

## Context

`main.ts`'s own banner comments already name the seams (approximate lines as of 2026-07-15 —
re-derive before cutting, the file moves):

| Section (banner) | ~Lines | Extraction target |
|---|---|---|
| DOM refs, toasts, `CitadelAudio` + unlock, occupancy badges | 108–161 | `main/hud-wiring.ts` (or fold per-widget) |
| Camera + renderer boot-gap guard | 162–223 | `main/camera-setup.ts` |
| Inspect panel open/close + new-game modal helpers | 224–307 | `main/inspect.ts` |
| Weather/crowd/interpolators/render toggles/particles/fx/placement state | 308–373 | `main/fx.ts` + `main/placement-wiring.ts` |
| Pointer/wheel/keyboard input handlers | 374–694 | `main/input.ts` |
| Follow-cam, build selection, mode label, upgrade hint | 695–848 | `main/build-controls.ts` |
| Save / Load | 849–901 | `main/save-load.ts` |
| Sim client (solo Worker vs `?mp` WebSocket) | 902–1048 | `main/sim-client.ts` |
| Settings modal (tabbed) | 1049–1253 | `main/settings.ts` |
| Terrain at module scope | 1254–1267 | into boot |
| Animation loop | 1268–1723 | `main/render-loop.ts` |
| Boot | 1724–1949 | `main/boot.ts` |

Module names are suggestions — mirror the Farm `main/` precedent where a counterpart exists
(`render-loop.ts`, `camera*`, `panels`-style grouping); merge/rename freely. What is **not**
negotiable is the convention: a directory of focused modules fronted by a barrel, consumers
importing the directory.

**Known load-bearing hazards** (each is a comment in the file today — preserve the comments):

1. **The boot gap.** Input listeners register at module load; `camera`/`renderer`/`iso` are
   assigned async in `boot()`. The `worldHandlersReady` guard exists because a pointer event in
   that ~1s window would deref undefined. Splitting modules changes evaluation order — the guard
   must survive, and no extracted module may capture `camera` by value at import time.
2. **One event pass, two consumers.** Toasts and `CitadelAudio` are both fed from the **same**
   `newEventsSince(snap.eventsSeq)` loop (brief 19 chunk C; brief 97/20 made it sequence-based).
   Do not give audio its own diff cursor when extracting.
3. **Shared mutable state across sections** — `placementState`, `renderToggles`, `modeLabelText`,
   `appearAt`/`burningSince` maps, the contentment-banner latch. Decide per item: pass it in, or
   move it with its single owner. No `export let` mutable bindings reassigned from other modules.
4. **Vite entry.** `index.html` references `src/main.ts`; keep `main.ts` as a thin entry that
   imports `main/` (Farm keeps the same shape).

## Scope

1. Split `games/citadel/client/src/main.ts` into `games/citadel/client/src/main/` per the table
   above — **behavior-preserving refactor, zero logic changes**. `main.ts` shrinks to a thin
   entry (target: the whole file readable in one screen).
2. Move existing colocated logic-bearing helpers with their section; add colocated tests only
   where extraction makes something newly testable that the suite doesn't already cover (the Farm
   `main/` files each carry one — parity is desirable, not a gate).
3. **Doc-drift fix (small, in the same slice):** `@engine/ui` is missing from **both**
   workspace maps — the repo-root [CLAUDE.md](../../../../CLAUDE.md) "Repository layout" block and
   [architecture.md](../../../wiki/architecture.md) "Workspaces" (which also omits
   `@farm/atlas-recipes` and `@citadel/server`). Add the missing rows so the two maps match
   `ls engine/ games/*/ tools/` reality.

## Out of scope (noted, not owned)

The two sibling monoliths surfaced by the same survey — `games/citadel/sim-core/src/sim-bootstrap.ts`
(1,302 lines; system-ordering-sensitive, riskier) and `tools/citadel-sim/src/index.ts` (1,196 lines;
headless tool, low churn) — are **not** part of this brief. File separately if wanted.

## Constraints

- Client-only refactor: no `sim-core` edits, no determinism surface. Apollo palette guard applies
  (`games/citadel/` scope); no raw hex, `CITADEL_PAL as EDG` imports stay as-is.
- Locked conventions hold: no `.js` import suffixes, strict TS, no new deps.
- Extracted modules keep their explanatory comments (the boot-gap, event-pass, and latch comments
  document invariants, not history).

## Acceptance

- `main.ts` is a thin entry; no extracted module exceeds ~450 lines; `src/main/` has a barrel and
  consumers import the directory.
- `npm run typecheck` 0; `@citadel/client` suite green; palette guard green.
- **Real-browser pass** (playtest-citadel): boot to the seeded town, pan/zoom during the boot
  window without a crash, place + demolish a building, open/close inspect + settings, save then
  load, toasts appear, audio unlocks on first gesture. A refactor of the client shell cannot be
  signed off from unit tests alone.
- Both workspace maps (CLAUDE.md + architecture.md) list `@engine/ui` (and architecture.md the
  other missing packages).

---

**Outcome (2026-07-15, DONE).** Split landed as `src/main/` — 20 modules + barrel, `main.ts` a
5-line entry; doc maps fixed as specced. **The browser gate caught a boot-killing bug the whole
test suite missed:** the thin entry's `import "./main"` resolved to `main.ts` ITSELF (file beats
directory in resolution), a silent self-import no-op — page loaded, nothing booted, zero console
errors, 503 unit tests green. Fixed to an explicit `./main/index` with a warning comment
(`99558bd`). Full Playwright pass after the fix: cozy picker → seeded town, right-drag pan +
wheel zoom, place house (17→18) + demolish (18→17) via build bar with live Mode readouts,
inspect panel, settings modal (incl. brief-19 mute checkbox), save→download → load→restore
(tick rewind + resume), toasts live, only console error the pre-existing favicon 404. Executor:
Sonnet (chunk D of the 2026-07-15 wave); builder run was interrupted by a session limit and its
work committed mid-flight in `e21e5fd` — gates re-run by the controller after resume.
