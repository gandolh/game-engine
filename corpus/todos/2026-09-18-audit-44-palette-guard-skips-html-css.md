# audit-44 — The palette guard never scans HTML or CSS, and Farm ships two off-palette colours today

status: todo
created: 2026-09-18
context: found by the coverage lens of the 2026-09-18 sweep. A guard everyone believes is repo-wide,
is not — and there is a live violation sitting behind the gap right now.

## The gap

[`palette.test.ts:77`](../../engine/core/src/render/palette.test.ts#L77):

```ts
const SOURCE_EXT = /\.(ts|js|mjs|cjs)$/;
```

and [`:96`](../../engine/core/src/render/palette.test.ts#L96) only pushes a file if it matches. So the
four `index.html` files and three `src/style.css` files in the repo are **never read**.

The live violation — [`games/farm/client/index.html:8`](../../games/farm/client/index.html#L8):

```html
html, body { margin: 0; padding: 0; height: 100%; background: #0c0d12; color: #e7eeff; … }
```

Neither `#0c0d12` nor `#e7eeff` is in EDG32 (nearest: `#181425`, `#ffffff`). These are the page
background and default text colour — the first thing a player sees.

And [`CLAUDE.md`](../../CLAUDE.md) states the rule as covering *"sprites, tiles, particles, day/night
wash, **HTML/canvas UI**"*. The doc and the guard disagree; the doc is right.

Citadel's `style.css` happens to use valid Apollo swatches. That is luck, not enforcement.

## What to do

Add `html|css` to `SOURCE_EXT`, and scope `.html`/`.css` under `games/<game>/` to that game's palette
exactly as `.ts` already is (per-scope: `games/citadel/` and `games/hollow/` → Apollo,
`games/mathquest/` → Resurrect-64, everything else → EDG32).

`HEX_RE` already handles the `#define` false positive, so it should need no change — **verify that**
rather than assuming it, since CSS has its own shapes (`#fff` shorthand, `#id` selectors — note an id
selector like `#app` is 3 chars and could match the 3-digit branch; check the lookahead).

Then resolve the two Farm hexes: either map them to `EDG.*` roles, or add them to `ALLOWLIST_FILES`
**with a written reason**. Prefer mapping them — a boot-screen background is exactly the surface the
rule exists for, and the allowlist is currently empty, which is a property worth keeping.

## Files you OWN
- [`engine/core/src/render/palette.test.ts`](../../engine/core/src/render/palette.test.ts)
- [`games/farm/client/index.html`](../../games/farm/client/index.html)
- the other `index.html` / `src/style.css` files, if the widened scan turns up more violations

## Files you must NOT touch
- the palettes themselves (`palette.ts`, `citadel-palette.ts`, `hollow-palette.ts`, `mate-palette.ts`)
  — the swatch lists are locked
- `dist/` output (already excluded by `SKIP_DIRS`) — do not "fix" a built artifact
- the per-scope path mapping's existing `.ts` behaviour

## Acceptance
- **Demonstrate first**: show the guard green today with `#0c0d12` present, then red after widening
  the scan and before fixing it.
- After the fix the guard is green, and a deliberately-inserted off-palette hex in *each* of an
  `index.html` and a `style.css` makes it fail (one test per file type — a scan that silently matches
  zero files of a type is the failure mode this brief exists to remove).
- A tripwire asserting the scan found at least one `.html` and one `.css` file, in the style of the
  existing `files.length > 20` tripwire.
- `npm run test -w @engine/core` green; the four clients still boot and look unchanged apart from the
  two corrected colours.
