# audit-36 — The packed `@engine/core` tarball ships no shaders, and the fixture cannot see it

status: todo
created: 2026-09-15
context: found by the review gate on the audit-34/35 build (2026-09-15), as an adjacent pre-existing
finding. [audit-35](closed/2026-09-15-audit-35-library-consumer-fixture-workflow.md) was explicitly told to
report a real export break separately rather than fix it, so this is that report.

## The gap

[`engine/core/scripts/postbuild.mjs:76-82`](../../engine/core/scripts/postbuild.mjs#L76-L82) copies
the non-TS runtime assets `tsc` does not emit. It selects them with:

```js
for (const shader of walk(srcDir, (n) => n.endsWith(".wgsl"))) {
```

**No `.wgsl` file has existed since 2026-08-18**, when both WebGPU backends were deleted
([decisions.md](../wiki/decisions.md) → *Renderer*). Measured 2026-09-15:

| | count |
|---|---|
| `.wgsl` files under `engine/core/src` | **0** |
| `.glsl` files under `engine/core/src` | **22** |
| `?raw` shader imports under `engine/core/src` | **25** |

So the copy loop matches nothing, `[postbuild] copied 0 shader asset(s)`, and the packed tarball's
`dist/render/webgl2/*.js` carry **unresolvable `./shaders/*.glsl?raw` specifiers**. An external
consumer that imports `@engine/core/render` through a bundler gets a resolution failure for a file
that is not in the package.

## Why nothing caught it

`examples/library-consumer/smoke-ui.mjs:5-7` deliberately skips the `/render` subpath, and its
comment still says the reason is *"`?raw` .wgsl shader imports"* — stale in the same way, and naming
a file type that no longer exists. `pack-smoke` therefore proves the publish contract for everything
**except** the one subpath this breaks.

That is the interesting part: [audit-30](closed/2026-09-13-audit-30-library-consumer-smoke.md) built the
fixture precisely to make the publish contract testable, and
[audit-35](closed/2026-09-15-audit-35-library-consumer-fixture-workflow.md) made its workflow honest — but the
gate has a hole exactly where the bug is. **Fixing the copy loop without closing the hole leaves the
next such break equally invisible.**

## What to do

1. **Fix the asset copy** — select `.glsl` (and decide whether to keep matching `.wgsl` for
   future-proofing, or drop it as dead). Confirm `[postbuild] copied N shader asset(s)` reports 22.
2. **Close the fixture's blind spot.** Decide how `pack-smoke` can exercise a `?raw`-importing
   subpath from a tarball. This needs a real decision, not a reflex: `?raw` is a **bundler**
   specifier, so a plain Node `import()` cannot resolve it either way, and that is *why* the smoke
   skips it. Options worth weighing:
   - assert the **files are present in the tarball** (cheap, catches exactly this bug, proves nothing
     about resolution)
   - add a minimal bundler step to the fixture (real coverage, real dependency + runtime cost)
   - accept the gap deliberately and record it, having fixed the copy
   Any of the three is defensible. Picking one silently is not.
3. Correct `smoke-ui.mjs`'s stale `.wgsl` comment while you are there — **that file's assertions stay
   untouched**, per the standing rule; the comment is not an assertion.

## Files you OWN
- [`engine/core/scripts/postbuild.mjs`](../../engine/core/scripts/postbuild.mjs)
- `examples/library-consumer/smoke-ui.mjs` — **the comment only**
- the root `pack-smoke` script and the fixture, if option 2 is chosen

## Files you must NOT touch
- `examples/library-consumer/smoke*.mjs` **assertions** — changing them to pass defeats the fixture
- the `exports` maps and `publishConfig`
- the shaders themselves, and `engine/core/src/**`

## Acceptance
- A packed `@engine/core` tarball **contains** the `.glsl` files. Demonstrate by unpacking one and
  listing them — not by reading the script.
- The chosen answer to the fixture blind spot is implemented **and recorded** in
  [decisions.md](../wiki/decisions.md) → *Build & verify gates* if it is a deliberate accepted gap.
- `npm run pack-smoke` green; if you added coverage, show it going red against the unfixed
  `postbuild.mjs` first.
