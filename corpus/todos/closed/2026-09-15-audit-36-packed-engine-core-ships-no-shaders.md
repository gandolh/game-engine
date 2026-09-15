# audit-36 — The packed `@engine/core` tarball ships no shaders, and the fixture cannot see it

status: closed 2026-09-15
created: 2026-09-15
context: found by the review gate on the audit-34/35 build (2026-09-15), as an adjacent pre-existing
finding. [audit-35](2026-09-15-audit-35-library-consumer-fixture-workflow.md) was explicitly told to
report a real export break separately rather than fix it, so this is that report.

## The gap

[`engine/core/scripts/postbuild.mjs:76-82`](../../../engine/core/scripts/postbuild.mjs#L76-L82) copies
the non-TS runtime assets `tsc` does not emit. It selects them with:

```js
for (const shader of walk(srcDir, (n) => n.endsWith(".wgsl"))) {
```

**No `.wgsl` file has existed since 2026-08-18**, when both WebGPU backends were deleted
([decisions.md](../../wiki/decisions.md) → *Renderer*). Measured 2026-09-15:

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

That is the interesting part: [audit-30](2026-09-13-audit-30-library-consumer-smoke.md) built the
fixture precisely to make the publish contract testable, and
[audit-35](2026-09-15-audit-35-library-consumer-fixture-workflow.md) made its workflow honest — but the
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
- [`engine/core/scripts/postbuild.mjs`](../../../engine/core/scripts/postbuild.mjs)
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
  [decisions.md](../../wiki/decisions.md) → *Build & verify gates* if it is a deliberate accepted gap.
- `npm run pack-smoke` green; if you added coverage, show it going red against the unfixed
  `postbuild.mjs` first.

---

## CLOSED 2026-09-15 — and it found two more defects on the way in

**The copy loop** now selects `.glsl` (`copied 22 shader asset(s)`; 22 `.glsl` present in a real
tarball, confirmed by unpacking, not by reading the script).

**The blind spot is closed by option 1** — assert the files are present — in a new
`examples/library-consumer/smoke-assets.mjs`. Not option 2 (a bundler in the fixture): `?raw` is a
bundler specifier plain Node cannot resolve, which is *why* `smoke-ui.mjs` skips `/render`; a
file-existence check catches this regression class without dragging a build step into a Node smoke.
It asserts both that `.glsl` files ship AND that every `?raw` specifier in the packed JS resolves
inside the tarball, since a partial copy is as broken as none. Proven by reverting `postbuild.mjs`
to the `*.wgsl` predicate: `pack-smoke` exits 1.

### Two defects found while fixing this — both now fixed here

1. **A regression from audit-35's review fix.** That fix put stale-`dist/` cleanup at the start of
   `pack-swap --to-dist`. But `prepack` is `npm run build && pack-swap --to-dist`, so `--to-dist`
   runs **after** the build and was deleting what the build had just produced. **The real
   `@engine/core` tarball went to 3 files with no code at all.** Cleanup moved to a `--clean-dist`
   mode at the front of `build` — the only point that runs before `tsc` emits — which still covers
   the failure path it was written for (`noEmitOnError` unset → a failing build emits then exits 1,
   so `postpack` never runs).
2. **`pack-smoke` could not see either defect, and that is the serious one.** The fixture's deps are
   `file:` tarballs with fixed filenames; with no lockfile, npm treats an already-installed copy as
   satisfactory and **never re-extracts**. So the gate ran its assertions against a *previous good
   install* while the tarball on disk held three files, and reported "all smokes passed". It now
   removes the fixture's `node_modules` before installing.

**Lesson worth carrying:** a gate that does not reinstall is not a gate. `pack-smoke` was green
across an entire audit while the artifact it exists to validate was empty — and the thing that
exposed it was unpacking a real tarball, which is why this spec required demonstrating from the
artifact rather than from the script.
