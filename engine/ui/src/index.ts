/**
 * `@engine/ui` — the cross-game, backend-agnostic in-engine UI framework.
 *
 * Chunk 1 establishes the screen-space render seam: `UISurface` wraps any
 * `RendererLike` and submits UI primitives that draw on top of the world scene in
 * screen pixels (unaffected by the world camera), identically on WebGPU and the
 * Canvas2D fallback. Chunk 2 adds the bitmap-font text stack. Chunk 3 adds the
 * retained-mode widget tree (`./widget`), flex layout (`./layout`), and EDG32 theming
 * (`./theme`): declare a tree of `panel`/`box`/`label`/`button` nodes, `computeLayout` it
 * at a screen position, and `renderTree` it through a `UISurface`. Chunk 4 adds the
 * canvas-space input dispatcher (`./input`): the host forwards screen-px pointer/keyboard
 * events into it and the widgets become interactive (hover/active/click/focus/drag), with
 * each entry point reporting whether the UI consumed the event.
 *
 * Layering: this package consumes `@engine/core` only and MUST NOT import any game.
 */
export * from "./render";
export * from "./text";
export * from "./theme";
export * from "./layout";
export * from "./widget";
export * from "./input";
export * from "./scroll";
export * from "./anim";
export * from "./a11y";
