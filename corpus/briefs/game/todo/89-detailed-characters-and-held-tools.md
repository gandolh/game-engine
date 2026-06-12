# Brief 89 — Detailed 24×24 characters + held hotbar tool

Synthesis/context: [wiki/animation.md](../../../wiki/animation.md). Builds on the brief-85 render-side animation engine. **Render-only — no sim/determinism impact, no baseline move.**

> **Status: design agreed (grilled 2026-06-12), awaiting build sign-off.**

## Goal & what this explicitly is / isn't

The prize is **the selected hotbar tool visible in the character's hand**, on a **more detailed (24×24) character**. "Moving arms/legs" is satisfied by **richer hand-drawn frames at the higher resolution**, *not* an engine-driven skeletal/part rig.

**Decided against — a part-based / skeletal (cut-out) rig.** Pixel art + arbitrary part rotation destroys the pixel grid (shimmer, off-palette AA) and fights the enforced EDG32 look; the cast is small on a top-down screen; the art cost is huge. So: **no transform-rotated body parts.** Limb motion stays hand-authored per frame; the tool is a *translated* (never rotated) overlay sprite. This keeps everything pixel-crisp.

## Locked decisions

1. **Resolution → 24×24 source, same on-screen footprint.** Characters keep their current 1-tile (16 world-unit) draw size; only the source texel count rises (16→24). The renderer already decouples source size from dest size (`drawImage(... srcW,srcH, ... destW,destH)`) and the atlas packer already handles non-16 frames (cottages 32, weather-station 48×48) — so this is **purely an art-authoring change, no engine/packer work**. Detail is realized at zoom ≥ ~2 (default zoom is 2); zoomed-out downsampling is acceptable.
2. **Keep the template+subs+hat generation pipeline, re-authored at 24×24.** Re-draw the *shared* `ACTION_TEMPLATES`(+`_B`)/`FACING_TEMPLATES`/walk/`PIP_DOWN_TEMPLATES` and the 5 `PERSONALITY_HATS` once at 24×24; keep `PERSONALITY_SUBS`. One body set → 5 personalities. `personality-hats.test.ts` distinctness guard stays. Extra room goes to **readable hands** (for the tool anchor) and crisper limbs, not bespoke per-farmer outfits.
3. **Hybrid tool rendering.** Action poses **keep their baked-in tool** (already authored; the swing is hand-drawn; the action implies the correct tool). Add a **carried-tool overlay only for idle/walk**, driven by **Pip's selected hotbar slot**. AI farmers carry nothing between actions (no hotbar) — they show their baked tool only mid-action.
4. **Held items = tool-class only** (hoe / axe / pickaxe / watering-can). A selected seed/crop/fish → empty hands.
5. **Tool overlay mechanism (pixel-safe).** Per-facing tool sprites (down / side / up) chosen by facing + `flipX` for left — **no arbitrary rotation**. Positioned at a **hand-anchor** keyed by (facing, walk-phase); the carried tool **bobs/follows via anchor translation** between frames. Per-facing **front/behind** layering (behind when facing up/away).
6. **No wire-format change.** The held tool is derived **render-side** from `playerFarmerId` + the existing inventory snapshot (`PlayerInventory.selected` → slot `frame`); hand-anchors are render-side metadata. Nothing new on `SnapshotSprite`.

## Order & staging (B before A)

**B (the 24×24 re-author) first, then A (the overlay system)** — because hand-anchor coordinates are resolution-specific (building them on 16px bodies would be thrown away), and B resolves the dominant unknown (does 24×24 read on a 16px world?) earliest.

- **Gate 0 — feel-check the existing work first.** brief-85 + Tier-A/B animation is still visually unverified; look at it in-browser before stacking more.
- **Phase B1 — one slice + style feel-check.** Re-author **one personality + one facing** at 24×24, drop it beside the 16px cast, feel-check the **style-contrast risk** (24×24 actors on a 16px world). *Do not redraw the cast until this passes.* If it looks fractured, reconsider res (or abandon the bump).
- **Phase B2 — full cast at 24×24.** Re-author the shared templates + hats; rebuild the `characters` sheet; update asset counts; `enumerateFarmerFrames` guard still passes (same frame names, new size). Feel-check.
- **Phase A1 — tool overlay.** Hand-anchor table (per facing × {idle, walk-a, walk-b}, shared across personalities since bodies share geometry); tool sprites re-authored at 24-matched detail × facings; render the carried tool for Pip (selected slot → tool frame → anchor → layered, `flipX`, front/behind). Tests (anchor existence, slot→tool mapping, non-tool→empty) + feel-check.

## Acceptance

- `npm run typecheck` + `npm run test` green; atlas rebuilds deterministically; asset-count tests updated; `enumerateFarmerFrames` guard green at 24×24.
- EDG32 palette clean; no `.js` suffixes; no new runtime deps.
- Render-only — `CHECK_DETERMINISM` not required.
- In-browser feel-check at each gate (WebGPU-only won't render headless on the dev box).

## Open implementation details (resolve during build)

- Hand-anchor data shape + where it lives (a small render-systems table keyed by facing+phase).
- Front/behind sub-layer mechanism within one character (y-sort is `(layer, y)`; a tool sub-layer or `sortY` nudge).
- Tool-orientation count per tool (down/side/up vs fewer) — author the minimum that reads.
- Whether the action-pose baked tool should later be unified with the overlay (deferred; hybrid keeps them separate).
