# Brief 87 — restyle `home` + `forge-house` to match the Stardew cottage pass

## Why

Brief 83's polish round restyled all farm cottages to the Stardew look (`fffe5ae` propagated it to all 4 farms + the brief-77 personality-keyed bakes), but [wiki/status.md](../../../wiki/status.md) records the explicit leftover: **`home` and `forge-house` (different structures) keep their old look.** They now read as visually older than everything around them.

## Tasks

1. Locate the two structures' atlas recipes under [tools/atlas-builder/src/recipes/](../../../../tools/atlas-builder/src/recipes/) and restyle them with the same vocabulary as the cottage pass (study the shipped cottage recipes from briefs 77/83 first — same roof treatment, trim, EDG ramp choices).
2. `forge-house` keeps its identity (forge fire/smoke anchor points must not move — the render-loop animation cyclers target them); `home` is Pip's house and can hew closest to the plain cottage look.
3. Rebuild the affected sheet(s), bump the expected counts in [assets.test.ts](../../../../tools/atlas-builder/src/recipes/assets/assets.test.ts), commit the regenerated atlas PNG/JSON.

## Acceptance

- Render/art-only — no determinism impact, no baseline move.
- EDG32 palette only (recipes are guard-scanned).
- Per-asset hash cache behaves: a clean rebuild reports only the touched assets as built, rest cached (the brief-71 invariant).
- In-browser visual check next to a restyled cottage — they should read as the same village.
