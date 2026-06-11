# Brief 74 — Weather station island (signal antenna)

**Status:** Done (2026-06-11) · **Area:** `packages/farm-valley` (world generation + render) · **Drafted:** 2026-06-11

Add a small offshore island dedicated to a weather station — a squat building with a tall signal antenna mast. The island serves as a visual landmark that reinforces the existing seasons/weather arc and gives the archipelago a functional-flavour setpiece alongside the shrine, heritage landmarks, waterfall, and camping spots. **Render-only for the antenna/building assets; any weather-modifier mechanics are out of scope unless a follow-up brief covers them.**

## Read first

- [wiki/world-generation.md](../../../wiki/world-generation.md) — the rect-based archipelago model; how islands are placed and named.
- [wiki/player-and-interaction.md](../../../wiki/player-and-interaction.md) — the 88×80 archipelago layout; reserved regions; where existing islands sit so placement doesn't collide.
- Briefs [50](../done/50-shrine-island.md), [51](../done/51-heritage-landmark-islands.md), [52](../done/52-animated-waterfall-island.md), [54](../done/54-camping-island.md) — the "more islands" series; follow the same spawn/region/setpiece pattern.
- Root [CLAUDE.md](../../../../CLAUDE.md) — **EDG32 palette enforced**; every new pixel must use an `EDG.*` constant.

## Current state

- Island placement is procedural via the rect-based model in `world-generation.ts`; new islands are added by registering a new island spec (position, size, tile set, setpiece list).
- The weather arc (seasons, rain, wind) is already driven by `WeatherSystem` and visible in the UI; no new sim logic is needed.
- Existing setpiece assets (shrine, standing stones, waterfall) are authored as Atlas recipes under `tools/atlas-builder/src/recipes/assets/`.

## Tasks

- [ ] **1. Island geometry** — define a small island rect (suggested ~6×5 tiles) in the archipelago layout, placed in open water away from the existing island cluster. Sandy/rocky shore ring, a patch of grass at the centre. Confirm no walkability collision with existing regions.
- [ ] **2. Weather-station building recipe** — author a new Atlas recipe (`recipes/assets/props/weather-station.ts`): a compact stone/wood building, ~3×2 tiles, with a small window and a door. EDG32 palette only; top-left light direction; shaded variant for night wash.
- [ ] **3. Signal antenna mast recipe** — a tall thin mast (~1×4 tiles, or a single sprite with internal height), metal-grey (`EDG.q` family), with a blinking indicator light at the tip (`EDG.y` / `EDG.f` alternating frames, ~1 Hz visual cadence). The blink is render-side only — no sim tick involvement.
- [ ] **4. Place setpieces on the island** — register the building and antenna in the static layer so they appear on the island tile rect. Antenna sits beside or atop the building; ensure the combined footprint fits the island bounds.
- [ ] **5. Atlas integration** — add the new recipes to the appropriate sheet barrel; rebuild the atlas (`npm run atlas`) and commit the updated sheet PNG + manifest. Verify per-sheet cache key invalidates only the affected sheet.
- [ ] **6. Verify** — palette guard test passes; `npm run typecheck`; `npm run test`; `npm run sim` output byte-identical to pre-change baseline (world gen is deterministic — confirm the new island does not shift any existing entity positions or RNG draws).

## Acceptance

- The weather station island is visible in the browser (`npm run dev`) in the expected open-water position.
- The antenna blink animates at roughly 1 Hz in the render loop.
- `npm run sim` is byte-identical to the pre-change run (render-only change).
- Every new pixel color is an `EDG.*` constant (palette guard green).

## Risks / notes

- **Island placement** must not overlap existing islands or the farm band; verify against [wiki/player-and-interaction.md](../../../wiki/player-and-interaction.md) before committing coordinates.
- The antenna blink uses client-side wall-clock time (same pattern as day/night wash) — it is intentionally **not** seeded from the sim rng and must never touch the worker.
- If a future brief wants weather-reading mechanics (farmers visit the island for forecast bonuses, etc.), scope that separately; this brief is purely a visual/world-gen change.
