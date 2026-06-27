---
title: "Citadel — extract a separate style.css instead of baking CSS into index.html"
created: 2026-06-22
status: done
resolved: 2026-06-27
tags: [citadel, client, css, refactor, ux]
---

> **Done 2026-06-27.** Moved the ~186-line inline `<style>` block from
> [index.html](../../games/citadel/client/index.html) into
> [src/style.css](../../games/citadel/client/src/style.css), imported from
> [main.ts](../../games/citadel/client/src/main.ts) via `import "./style.css"`
> (Vite). Added a `*.css` ambient module decl to vite-env.d.ts. Colours stay EDG32
> hex — the palette guard only scans .ts/.js, so CSS is outside its scope (same as
> when inline). Live-verified styling identical (HUD bg #262b44, monospace,
> build-bar flex-wrap, settings modal position:fixed). typecheck + palette guard
> green. Commit `b9121e5`. See [log.md](../log.md).

# Citadel — extract client CSS into a separate `style.css`

## Problem

The Citadel client's styling currently lives **inline inside the HTML**
([games/citadel/client/index.html](../../games/citadel/client/index.html)) rather
than in its own stylesheet. Baking CSS into the markup makes it harder to read,
reuse, and maintain — the styles aren't shared across any future pages, can't be
cache-separated from the HTML, and the `index.html` grows unwieldy as the UI
(minimap, toasts, placement HUD) gains surface area.

## Wanted

Move the styles out of `index.html` into a dedicated `style.css` so the markup is
clean and the CSS is a first-class, editable file.

## Approach

- Create `games/citadel/client/style.css` (or `src/style.css`, matching whatever
  Vite import convention the client already uses).
- Cut the `<style>` block(s) from
  [index.html](../../games/citadel/client/index.html) into the new file.
- Wire it up the Vite way — either a `<link rel="stylesheet">` in `index.html`
  **or** an `import './style.css'` from the client entrypoint
  ([main.ts](../../games/citadel/client/src/main.ts)); prefer whichever matches
  how the Farm client does it for consistency.
- **Palette guard:** every color must still come from `EDG.*`
  (palette.test.ts walks `games/` and fails on off-palette literals). If the
  inline CSS used hex literals via a build-time substitution, preserve that
  mechanism in the extracted file so the guard test stays green.

## Acceptance

- `index.html` no longer contains a `<style>` block; styling lives in `style.css`.
- `npm run citadel` renders identically to before (minimap, toasts, HUD unchanged).
- `npm run typecheck` and the palette guard test still pass.
