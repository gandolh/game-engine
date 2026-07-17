# @engine/ui

An **in-canvas** UI toolkit: a retained widget tree that lays out and draws through the
same 2D renderer your game already uses, with no DOM widgets. It renders identically on
WebGPU and the Canvas2D fallback, is fully themeable (swap the whole palette at runtime),
ships a small icon + bitmap-font stack, dispatches pointer/keyboard input in screen
space, and mirrors itself into a hidden DOM tree for screen-reader accessibility.

It consumes `@engine/core` only and **never imports a game**.

> **License:** MIT. **Status:** not yet published — `@engine/*` names are placeholders.

## Why in-canvas

The UI draws on top of the world scene in **screen pixels** (origin top-left), unaffected
by the world `Camera2D`, on whatever backend the renderer picked. You get one consistent
pixel-art look across WebGPU/Canvas2D, and the widgets live in the same frame as the game
instead of floating in a separate DOM layer. Accessibility is not sacrificed: a parallel
hidden-DOM **a11y mirror** exposes the tree to assistive tech.

## Module map (subpath exports)

| Subpath | What it exports |
| --- | --- |
| `@engine/ui/widget` | Node constructors (`panel`, `box`, `label`, `button`, `slider`, `checkbox`, `toggle`, `icon`) + node types, and `renderTree(surface, root, theme?)`. |
| `@engine/ui/layout` | `computeLayout(root, x, y, theme?, opts?)` — two-pass flex layout — plus `LayoutProps` (`Direction`/`Align`/`Padding`, `grow`). |
| `@engine/ui/theme` | `DEFAULT_THEME`, `makeTheme(overrides, base?)`, and the `Theme`/`ButtonColors` token types. |
| `@engine/ui/text` | Bitmap-font stack: `bakeFontAtlas`, `measureText`/`layoutText`, `drawText`, `BODY_FONT`/`DISPLAY_FONT`. |
| `@engine/ui/icon` | Icon recipes as shade masks: `ICONS`, `bakeIconAtlas`, `drawIcon`/`iconQuads`, `IconRamp`. |
| `@engine/ui/render` | `UISurface` — the thin per-frame draw handle over a `RendererLike` (`begin`/`rect`/`sprite`/`push`/`end`). |
| `@engine/ui/input` | `createInputDispatcher(getRoot, opts?)` + `hitTest`/`focusables` — screen-space pointer/keyboard dispatch. |
| `@engine/ui/scroll` | `scroll(...)` viewport node, `computeScrollContent`, `renderScrollViewport`, clamp/scroll helpers. |
| `@engine/ui/anim` | `tween`/`advanceTween` + easing (`linear`, `easeOutCubic`, …) for UI micro-animation. |
| `@engine/ui/a11y` | `createA11yMirror(mount, opts?)` — reconciles a hidden DOM tree from the widget tree. |

The root `@engine/ui` re-exports all of the above.

## The render loop: `refresh()`-gated layout

The tree is **retained**: you build nodes once and keep them, laying out only when
something changes rather than every frame. The cycle is:

1. Build a tree of nodes (`panel`/`box`/`label`/`button`/…).
2. When state changes, **`computeLayout(root, x, y, theme)`** runs the two-pass flex
   solver (measure intrinsic sizes bottom-up, then arrange top-down) and writes each
   node's `rect` in place. Gate this behind a `refresh()`-style dirty check — do not
   recompute a static tree every frame.
3. Each frame, open the `UISurface`, **`renderTree(surface, root, theme)`**, and close it.

```ts
import { panel, label, button, renderTree } from "@engine/ui/widget";
import { computeLayout } from "@engine/ui/layout";
import { UISurface } from "@engine/ui/render";
import { DEFAULT_THEME } from "@engine/ui/theme";

const root = panel({ direction: "column", gap: 4 }, [
  label("Score: 0"),
  button("Pause", { onActivate: () => {/* … */} }),
]);

const surface = new UISurface(renderer);         // renderer: RendererLike from @engine/core

// on change:
computeLayout(root, 8, 8, DEFAULT_THEME);        // writes node.rect
// per frame:
surface.begin();
renderTree(surface, root, DEFAULT_THEME);
surface.end();
```

## Theming — palette-role injection

A `Theme` is a **flat, plain-data bag of tokens** (colors, padding, gap, text scale).
Widgets read colors and spacing *exclusively* through the active theme — never hard-coded —
so one `Theme` value restyles the entire UI without touching widget code. `DEFAULT_THEME`
is the EDG32 default (dark slate panels, blue buttons, cream text). Override with a
one-level-deep partial via `makeTheme`:

```ts
import { makeTheme } from "@engine/ui/theme";

const myTheme = makeTheme({
  panelBg: "#10141f",
  buttonBg: { hover: "#4f8fba" },   // merges one level deep onto the default
});
```

**Worked example — a full re-skin.** The settlement game in this repo re-skins the entire
UI onto a different 46-color palette (Apollo) with zero widget changes: it defines its
palette module to re-export the *same role names* the engine's `EDG` uses (`rust`, `clay`,
`steel`, …) resolved to the new palette's values, imports it as `CITADEL_PAL as EDG`, and
builds its `Theme` from those. Because every token is just a string the widgets read
through the theme, swapping the palette swaps the whole look. (At runtime a token is any
color string; the repo's EDG32/Apollo *guard* is a build-time test, not a runtime
constraint — external consumers are free to use any hex.)

## Icons — shade-index masks + consumer ramps

Icons are authored as small **shade masks**, not baked-in colors. Each icon bakes into up
to three pixel-disjoint mask frames (dark / mid / light shade). At draw time **you** supply
the colors as an `IconRamp` — a `[dark, mid, light]` tuple from *your* palette — and the
three masks are tinted and stacked to reproduce the multi-tone icon. The same icon renders
in any palette by passing a different ramp.

```ts
import { drawIcon, type IconRamp } from "@engine/ui/icon";

const ramp: IconRamp = ["#4d2b32", "#ad7757", "#d7b594"];
drawIcon(surface, "coin", 12, 12, { ramp, scale: 2 });
```

## Input dispatch & capture

`createInputDispatcher(getRoot, opts?)` binds to a lazily-resolved laid-out tree
(`getRoot()` returns the current root, or `null` when the UI is hidden). The host forwards
raw screen-pixel events into it — `pointerMove`/`pointerDown`/`pointerUp`, `wheel`,
`key` — and it drives hover/active/focus/click/drag on the interactive leaves. **Every
entry point returns a `ConsumeResult`** telling the host whether the UI consumed the event,
so the host can decide whether to also route it to the game world (capture model). Tab /
Shift-Tab move focus across focusables; Enter/Space activate the focused control; `onDrag`
+ `dragThreshold` support sliders/scrollbars.

```ts
import { createInputDispatcher } from "@engine/ui/input";

const input = createInputDispatcher(() => root);
canvas.addEventListener("pointerdown", (e) => {
  const { consumed } = input.pointerDown(e.offsetX, e.offsetY);
  if (!consumed) forwardToWorld(e);   // UI didn't take it → the game gets it
});
```

## Accessibility mirror

`createA11yMirror(mount, opts?)` maintains a **hidden DOM tree** that mirrors the widget
tree so screen readers and keyboard AT see real focusable elements. Call `mirror.update(root)`
each frame (idempotent; it diffs by node `id` and touches only what changed);
`mirror.setFocus(id)` reflects programmatic focus, and `opts.onFocusNode(id)` reports
DOM/AT focus changes back so you can forward them to the input dispatcher's `focus`/`blur`.
This keeps canvas focus and AT focus in sync in both directions.

## Note on `reset*` helpers

`resetNodeIds` (widget), `resetScrollNodeIds` (scroll), and `resetTween` (anim) reset
module-global id/state counters. They exist mainly to make test runs deterministic; a
consumer generally does not need them, but they are safe to call to get stable node ids.
