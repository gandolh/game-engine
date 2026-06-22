---
name: playtest-citadel
description: Play the Citadel game end-to-end in a real browser (Playwright + WebGPU), with pre-defined build steps, to find gameplay/balance/UX improvements and report them back into the corpus. Use when asked to "playtest Citadel", "play the game and see what to improve", drive Citadel live, or validate that a Citadel gameplay change feels right in the real client.
---

# Playtest Citadel

Drive the live Citadel client with a scripted economy, watch it run, diagnose what
holds the game back, and **report findings into the corpus** — then **grill the
user** to turn ambiguous findings into decisions.

This is *evidence-gathering*, not a test: the driver produces a timeline + screenshots;
**you** supply the judgment. Headless `npm run sim:citadel` is the complement for
pure-sim balance; this skill is for the real renderer, input, and the whole loop.

## 0. Orient (don't skip)
- Read [corpus/wiki/citadel-overview.md](../../../corpus/wiki/citadel-overview.md) and the
  open [corpus/todos/*citadel*](../../../corpus/todos/) — especially
  `2026-06-22-citadel-playtest-findings.md`. Don't re-file a known issue; confirm or
  extend it.
- Key code to keep open while diagnosing (verify line refs — they drift):
  - growth/population — `games/citadel/sim-core/src/systems/immigration.ts`
  - happiness/needs — `systems/needs-happiness.ts` (+ `SERVICE_RADII` in `entities/building.ts`)
  - tiers/unlocks — `systems/tiers.ts` (`TIER_THRESHOLDS`, `TIER_LOCK`)
  - upgrades — `upgradeBuilding` handler in `sim-bootstrap.ts`; costs in `entities/building.ts`
  - placement — `placeOne` in `sim-bootstrap.ts`

## 1. Launch the client
Citadel solo runs the sim in a Web Worker — only the Vite client is needed (no server):

```bash
npm run citadel        # starts client on :5174 (also the MP server; solo ignores it)
# or just the client:  npm -w @citadel/client run dev  (vite :5174)
```

Confirm it serves: `curl -s -o /dev/null -w "%{http_code}" http://localhost:5174/` → `200`.

## 2. Run the driver
The driver uses **system Chrome with WebGPU** (the Playwright-bundled Chromium can't
create a WebGPU device on this box — `dxil.dll` error). It drives the dev-only
`window.__citadel.send` hook (guarded by `import.meta.env.DEV`; present on the vite dev
server) — the same command channel the UI uses, so placements are real sim commands.

```bash
node .claude/skills/playtest-citadel/play.mjs
# knobs:  SECONDS=180 SPEED=4 OUT=./citadel-playtest-out URL=http://localhost:5174/ node .claude/skills/playtest-citadel/play.mjs
```

If it reports "Playwright not found", install once: `npm i -D playwright@1.61.0`
(pinned — repo forbids `^`/`~`). The driver also auto-discovers a Playwright in the
npm `_npx` cache. Output lands in `OUT/` (default `./citadel-playtest-out/`):
`report.json` (placement result, per-tick HUD timeline, final state, `outcome`) and
`00-boot / 01-placed / 02-village / 03-town / 99-final` screenshots.

The pre-defined plan: place a connected economy (storehouse, 2 farms, 2 mills, 2
bakeries, 4 houses, chapel/market/watchpost **in service-radius of the houses**,
tradingpost, woodcutter on forest) → set speed → climb tiers → on Village place
sawmill/smith/tower/wall/gate/quarry → on Town place keep/garrison → each tick attempt
upgrades on every building + accept any trader offer for planks/stone/tools. Placement
is occupancy-aware (it won't silently stamp onto occupied tiles — a known UX trap).

## 3. Read the evidence
- `Read` the screenshots (at least `01-placed`, `99-final`) — confirm WebGPU rendered
  (iso terrain/buildings, not a blank canvas) and eyeball legibility issues.
- Open `report.json`. Look hard at the **timeline**: does `pop` climb or flatline? does
  `happy` ever clear the immigration/▲ thresholds? do `byLevel` upgrades ever happen?
  does `outcome.unlockedAll` / `outcome.upgradedAll` hold? `pageErrors` non-empty?
- Cross-check surprises against the code in §0 before calling something a bug — separate
  **balance** (numbers), **logic bug** (does the wrong thing), and **UX** (player can't
  tell what happened). A flatline is usually balance/logic; a "nothing happened on click"
  is usually UX (silent reject).

## 4. Report back into the corpus
Follow [corpus/CLAUDE.md](../../../corpus/CLAUDE.md):
- Add or extend a todo in [corpus/todos/](../../../corpus/todos/)
  (`YYYY-MM-DD-citadel-<slug>.md`, the frontmatter shape of the existing ones).
  Prioritise (P0/P1/P2), cite `file:line`, give crisp **acceptance** criteria, and
  state whether each finding is balance / bug / UX. Note the run config (seed is fixed
  at `0x1a2b3c4d`, speed, duration) so it's reproducible.
- Append a one-paragraph `## [YYYY-MM-DD] todo | …` entry to
  [corpus/log.md](../../../corpus/log.md) and link new todos from
  `citadel-overview.md` if they're durable.
- Keep `report.json` / screenshots out of git (they're scratch evidence) unless asked.

## 5. Grill me 🔥
End by **turning the tables on the user** — use `AskUserQuestion` to convert the
playtest's ambiguities into decisions. Ask 2–4 sharp, *mutually-exclusive-optioned*
questions drawn from THIS run, e.g.:
- **Intent vs bug:** "Population froze at the founding size for 565 days — is the
  surplus-gated immigration the intended difficulty, or a bug to fix?"
- **Direction:** "To unblock growth, do you want founders to fill open slots, a
  stockpile-based immigration trickle, or a cheaper food chain?" (offer the trade-offs)
- **Scope/priority:** "Which lands first — the growth deadlock (P0), placement-failure
  feedback (UX), or service-coverage feedback?"
- **Acceptance bar:** "What's 'good growth' — pop ≥ 10 by day N? reaching Town
  unaided?" so the fix has a target.
Lead each with a recommended option. The goal: the user leaves with the next move
decided, not just a wall of findings. Capture their answers back into the todo's
acceptance criteria.

## Notes / gotchas
- **Don't touch watched game files mid-run.** The Vite dev server **full-reloads the
  page** (wiping the in-Worker sim back to day 1) when any `@citadel/sim-core` or client
  source file changes — even an mtime touch from an editor/formatter. Run against a
  quiescent tree and don't `Read`/edit game files while a run is in flight. The driver
  *detects* a reload (building count collapses to ~0) and re-bootstraps, logging
  `report.reloads`, but a clean run should show `reloads: 0`.
- **The default plan currently stalls — that's the finding, not a harness bug.** Spaced
  to dodge fire, the economy bootstraps popCap + happiness but pop oscillates ~0–1 and
  never reaches Town, because of the immigration deadlock + a fire-spacing-vs-road-
  connectivity tension (see `playtest-findings` P0). Reaching/upgrading "all buildings"
  is **not currently possible via legitimate play** — report that honestly rather than
  forcing it. Re-tune the plan (`P` pitch, well count, layout) as the sim is fixed.
- **Determinism:** the client seed is fixed (`0x1a2b3c4d`); same plan → same run. Any
  sim fix must keep `CHECK_DETERMINISM` byte-identical — say so in the report.
- **Don't commit a sim change from this skill** without re-proving determinism and
  running `npm run typecheck` + `npm test`. This skill *finds* problems; fixing is a
  separate, deliberate step.
- The dev hook only exists in DEV builds — never rely on it in a production build.
