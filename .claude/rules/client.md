---
paths:
  - "games/*/client/src/**"
  - "games/*/server/src/**"
  - "engine/ui/src/**"
  - "portal/src/**"
---

# Clients, servers and the UI toolkit

The commands and the locked conventions are in CLAUDE.md; the design is in the wiki's
[architecture](../../corpus/wiki/architecture.md).

- Colours come from the game's palette-role constants, never a hex literal
  (`engine/core/src/render/palette.test.ts` scans for them).
- WebGL2 is the only render backend, and shaders are GLSL ES 3.00.
- `@engine/ui` is an in-canvas toolkit: widgets are drawn through the renderer, and the only DOM is the
  hidden accessibility mirror. No React and no Base UI here.
- Imports are extensionless, no `.js` suffix. Versions are pinned, no `^` or `~`.
- A client or server reports through `console.warn` and `console.error`. `console.info` and `console.log`
  need an `eslint-disable-next-line` with its reason.
- The two WebSocket hosts read the environment in their `index.ts` for now (a dated lint warning); a new
  reader of `process.env` elsewhere is an error.
- A new workspace declares a `test` script, or turbo skips it without a warning.
- Sim code lives in `sim-core`, not here: a client or server only hosts and renders the snapshot stream.
