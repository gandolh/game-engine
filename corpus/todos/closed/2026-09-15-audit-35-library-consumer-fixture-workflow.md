# audit-35 — Fix the publish fixture's workflow: README, lockfile, and pack cleanup

status: closed 2026-09-15
created: 2026-09-15
ruled: 2026-09-15 (grill-me session) — the lockfile question is settled: **delete it**.
context: found by [audit-30](2026-09-13-audit-30-library-consumer-smoke.md) while wiring `pack-smoke`.
audit-30 deliberately fixed none of it — the fixture must not be edited to make itself pass, and the
publish machinery was out of its scope.

## Three defects, all in the publish path

`pack-smoke` now runs the fixture in CI and proves the tarballs are consumable. But the surrounding
workflow a human would follow has three real breaks.

**1. The README's pack command packs the wrong thing.**
[`examples/library-consumer/README.md`](../../../examples/library-consumer/README.md) documents
`npm pack --prefix engine/core …`. In this npm-workspaces setup, `--prefix` from the repo root packs
the **entire monorepo** (`game-engine-monorepo`), not the target workspace — confirmed by dry-run.
The working form is `npm pack -w @engine/core …`, which is what `pack-smoke` already uses. The manual
sequence the README documents has never worked as written.

**2. The committed lockfile is stale by construction.**
`examples/library-consumer/package-lock.json` pins tarball **integrity hashes**. Nothing regenerates
them, and they are invalidated the moment any engine source changes, because the freshly-packed
tarball no longer matches. A plain `npm install` — exactly what the README's step 2 says to run —
fails with `EINTEGRITY`. `pack-smoke` sidesteps this with `--package-lock=false`, honest for a smoke
gate but leaving a committed file that is permanently wrong.

**3. `pack-smoke` leaves `engine/core/dist/` and `engine/ui/dist/` behind.**
`prepack` runs `build` + `pack-swap.mjs --to-dist`; `postpack` runs `--restore`, which correctly
restores the `exports` map but does **not** remove the generated `dist/`. Both are gitignored, so
this does not dirty the tree, and a *fresh* `dist/` breaks nothing. The hazard is a **stale** one:
during the audit a leftover `dist/` from an earlier build broke `@hollow/client`'s webgl2-adjacent
tests, because `.glsl?raw` could not resolve through it. That cost real debugging time and the fix
was "delete the gitignored directory". It fails somewhere else entirely, with an error pointing at
shaders rather than at packing.

## The ruling

**Delete `examples/library-consumer/package-lock.json`. Do not regenerate it in `pack-smoke`.**
The fixture installs from tarballs packed out of the working tree, so its integrity hashes are wrong
by construction. A lock whose hashes are disposable documents nothing, and regenerating it inside
`pack-smoke` would commit churn on every engine edit. The README must say **why** it has no lockfile,
so nobody helpfully commits one back.

Once it is gone, `pack-smoke` should no longer need `--package-lock=false`. Drop the flag if npm
writes no lock without it; keep it (with a comment) if npm still does.

Also state in the README that **the fixture is outside the root `workspaces` on purpose** — that is
*why* defect 1 exists. Correcting the command without explaining the cause just means the next person
re-derives it.

Recorded in [decisions.md](../../wiki/decisions.md) → *Build & verify gates*.

## What to do

1. Correct the README to `npm pack -w <pkg> --pack-destination …`, and explain the
   outside-the-workspaces design and the no-lockfile rule.
2. Delete the lockfile; simplify `pack-smoke` accordingly.
3. Make the pack lifecycle clean up after itself — remove the generated `dist/` in `postpack`, or have
   `pack-smoke` remove it at the end. Either is fine; **prove** a stale `dist/` can no longer survive
   a run.

## Files you OWN
- `examples/library-consumer/README.md` and `package-lock.json` — the fixture's *workflow*. This is
  the one spec permitted to change them.
- `engine/core/scripts/pack-swap.mjs`, `engine/ui/scripts/pack-swap.mjs`, and the `postpack` scripts,
  if cleanup lands there
- the root `package.json`'s `pack-smoke` script

## Files you must NOT touch
- `examples/library-consumer/src/**` and the `smoke-*.mjs` assertions — changing them to pass defeats
  the fixture; same rule [audit-30](2026-09-13-audit-30-library-consumer-smoke.md) worked under
- the `exports` maps and `publishConfig` — if a real export break shows up, report it separately
- `.github/workflows/ci.yml`'s step ordering — `pack-smoke` runs last deliberately.
  (Note: [audit-34](2026-09-14-audit-34-wasm-dist-untracked.md) removes the `build-wasm` step from the
  same file. Different step, no ordering change — but rebase rather than resolving a conflict blind.)

## Acceptance
- The README's sequence works **verbatim, copy-pasted, from a clean tree**. Demonstrate it.
- `npm install` in the fixture succeeds after an engine source change without `--package-lock=false`
  — or the lockfile is gone and the README says why (this is the expected outcome).
- After `npm run pack-smoke`, **no `dist/` remains**.
- `npm run pack-smoke` still goes **red** when a subpath is removed from `@engine/core`'s exports —
  the [audit-30](2026-09-13-audit-30-library-consumer-smoke.md) proof must keep working.
  Demonstrate this too; it is the one assertion that proves the gate still has teeth.
