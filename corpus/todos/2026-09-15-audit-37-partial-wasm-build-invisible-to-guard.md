# audit-37 — A partially-failed wasm build rewrites tracked binaries invisibly to the drift guard

status: todo
created: 2026-09-15
context: found by the review gate on the audit-34/35 build (2026-09-15). It is a direct consequence of
[audit-34](closed/2026-09-14-audit-34-wasm-dist-untracked.md) making `engine/wasm-modules/dist/` **tracked** —
before that, a half-written `dist/` was invisible to git anyway.

## The gap

[`engine/wasm-modules/build/compile.mjs:42-49`](../../engine/wasm-modules/build/compile.mjs#L42-L49)
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
- [`engine/wasm-modules/build/compile.mjs`](../../engine/wasm-modules/build/compile.mjs)
- [`engine/wasm-modules/build/manifest.mjs`](../../engine/wasm-modules/build/manifest.mjs)
- `engine/wasm-modules` tests

## Files you must NOT touch
- the AssemblyScript sources in `engine/wasm-modules/src/`
- [`build/check-drift.mjs`](../../engine/wasm-modules/build/check-drift.mjs)'s existing comparisons —
  extend it if you add a check, but the audit-29 logic is correct and load-bearing
- the two artifact locations' paths — both are contracts (see
  [audit-34](closed/2026-09-14-audit-34-wasm-dist-untracked.md): `dist/` is the package export surface,
  `public/wasm/` is a Vite public-dir URL)

## Acceptance
- **Demonstrate the bug first**: force one kernel to fail (temporarily break a source), run the build,
  show tracked binaries modified with the manifest unchanged **and the drift guard still passing**.
  Restore by hand, not with `git checkout`.
- After the fix, the same forced failure leaves `git status --porcelain` clean for both artifact
  locations.
- A successful build is still byte-identical to today's output (the tracked artifacts must not churn).
- `npm run test -w @engine/wasm-modules` green.
