# Retake the README's Farm and Citadel images after the upside-down fix

status: todo
created: 2026-11-03
context: the [patched static layer](closed/2026-10-28-engine-patched-static-layer.md) found that every
baked static layer had been drawn upside down. Canvas uploads set `UNPACK_FLIP_Y_WEBGL`
([decisions.md](../wiki/decisions.md) → Renderer).

`docs/images/four-games.webp` and `docs/images/farm-farmers-panel.webp` (taken 2026-10-09) show Farm's
terrain upside down under its sprites, with houses in open water and bridges that reach nothing. Citadel's
tile has the same flip inside its render window. Retake both images the way
[docs/images/shots.md](../../docs/images/shots.md) says, from a build with the fix (the deploy is
the owner's step), and update the "Taken" dates there. Check that no personal data shows.
