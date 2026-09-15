# audit-37 — A partially-failed wasm build rewrites tracked binaries invisibly to the drift guard

status: closed 2026-09-15
created: 2026-09-15
context: found by the review gate on the audit-34/35 build (2026-09-15). It is a direct consequence of
[audit-34](2026-09-14-audit-34-wasm-dist-untracked.md) making `engine/wasm-modules/dist/` **tracked** —
before that, a half-written `dist/` was invisible to git anyway.

## The gap

[`engine/wasm-modules/build/compile.mjs:42-49`](../../../engine/wasm-modules/build/compile.mjs#L42-L49)
compiles the four kernels in a loop. On a kernel that fails it sets `failed = true` and `continue`s,
then at the end `if (failed) process.exit(1)` — **skipping `writeManifest()`**.

But kernels **earlier in the loop have already been written**, to both tracked locations:
`engine/wasm-modules/dist/<name>.wasm` (tracked as of audit-34) and
`games/farm/client/public/wasm/<name>.wasm` (tracked all along).

So a partial failure leaves tracked binaries modified with new bytes and `manifest.json` still
holding the **old** source hashes. And audit-29's drift guard **passes**:

- the source-hash comparison passes, because `manifest.json` was never rewritten
- the two-location comparison passes, because both copies were rewritten from the same partial run

The dirty binaries show up only in `git status`, where they look like an intentional rebuild.

## Trigger

Narrow but not hypothetical: an `assemblyscript` version bump, an OOM on constrained hardware, or a
half-edited kernel source — then any `npm run build-wasm`, `npm pack -w @engine/wasm-modules`, or
`npm run pack-smoke` (whose `prepack` runs `build`) can produce it.

## What to do

Make the build **all-or-nothing**. The straightforward shape: compile every kernel to a temp
location, and only move artifacts into `dist/` and `public/wasm/` once all four have succeeded —
so a failed run leaves both tracked locations untouched. Write the manifest in the same commit step.

Consider whether the guard should additionally notice "artifacts newer than the manifest", as a
belt-and-braces check that does not depend on the build behaving.

## Files you OWN
- [`engine/wasm-modules/build/compile.mjs`](../../../engine/wasm-modules/build/compile.mjs)
- [`engine/wasm-modules/build/manifest.mjs`](../../../engine/wasm-modules/build/manifest.mjs)
- `engine/wasm-modules` tests

## Files you must NOT touch
- the AssemblyScript sources in `engine/wasm-modules/src/`
- [`build/check-drift.mjs`](../../../engine/wasm-modules/build/check-drift.mjs)'s existing comparisons —
  extend it if you add a check, but the audit-29 logic is correct and load-bearing
- the two artifact locations' paths — both are contracts (see
  [audit-34](2026-09-14-audit-34-wasm-dist-untracked.md): `dist/` is the package export surface,
  `public/wasm/` is a Vite public-dir URL)

## Acceptance
- **Demonstrate the bug first**: force one kernel to fail (temporarily break a source), run the build,
  show tracked binaries modified with the manifest unchanged **and the drift guard still passing**.
  Restore by hand, not with `git checkout`.
- After the fix, the same forced failure leaves `git status --porcelain` clean for both artifact
  locations.
- A successful build is still byte-identical to today's output (the tracked artifacts must not churn).
- `npm run test -w @engine/wasm-modules` green.

---

## CLOSED 2026-09-15

The build is now all-or-nothing: kernels compile into a throwaway staging directory **outside the
repo**, and nothing is copied into `dist/` or `games/farm/client/public/wasm/` until all four have
succeeded. The manifest is written only after publishing.

### Demonstrating it took three attempts, and that is the interesting part

The acceptance asked to prove the bug first. Two obvious reproductions **did not** reproduce it,
because they tripped a check that already worked:

1. Breaking a kernel's source → the guard catches it on the **source-hash** path. That path was
   never the hole.
2. Breaking a source *and* changing compiler flags → same thing; the source-hash check fires first.

The hole needs a kernel to fail for a reason **external to its source**, which is exactly what the
spec said (toolchain bump, OOM) and exactly what is awkward to stage. Reproduced by temporarily
injecting a failure into the compile loop with every source pristine and `optimizeLevel` changed so
the succeeding kernels' bytes differ: **8 tracked binaries modified, `check-drift` exit 0, reporting
"4 kernel(s) match their recorded source hash"**. After the fix, the identical scenario leaves both
locations untouched.

**Worth carrying:** a reproduction that fails to reproduce is not proof the bug is absent — twice
here it only proved a *different*, working check fired first. If a demo goes red for a reason other
than the one the spec names, it has not demonstrated anything.

### Not done: artifact hashes in the manifest

The spec floated having the guard also notice "artifacts newer than the manifest". Left undone
deliberately — the all-or-nothing build closes the reported defect at its source, and the obvious
timestamp version is fragile (git does not preserve mtimes, so a fresh clone would look stale). If
this is revisited, record the **artifact** sha256 alongside the source sha256 rather than comparing
times; that would additionally catch a hand-edited binary, which nothing checks today.
