# audit-35 — The publish fixture works, but its documented workflow does not

status: todo
created: 2026-09-15
context: found by [audit-30](closed/2026-09-13-audit-30-library-consumer-smoke.md) while wiring `pack-smoke`, and confirmed by the controller. audit-30 deliberately did not fix any of it — the fixture must not be edited to make itself pass, and the publish machinery was out of its scope.

## Three defects, all in the publish path

`pack-smoke` now runs the fixture in CI and proves the tarballs are consumable. But the
surrounding workflow a human would follow has three real breaks:

**1. The README's pack command packs the wrong thing.**
`examples/library-consumer/README.md` documents `npm pack --prefix engine/core …`. In this
npm-workspaces setup, `--prefix` from the repo root packs the **entire monorepo**
(`game-engine-monorepo`), not the target workspace — confirmed by dry-run. The working form is
`npm pack -w @engine/core …`, which is what `pack-smoke` uses. So the manual sequence the
README documents has never worked as written; anyone following it gets a tarball of the whole
repo and a confusing failure.

**2. The fixture's committed lockfile goes stale by construction.**
`examples/library-consumer/package-lock.json` pins tarball **integrity hashes**. Nothing
regenerates them, and they are invalidated the moment any engine source changes, because the
freshly-packed tarball's content no longer matches. A plain `npm install` — exactly what the
README's step 2 says to run — fails with `EINTEGRITY`. `pack-smoke` sidesteps this with
`--package-lock=false`, which is honest for a smoke gate but leaves the committed lockfile
permanently wrong.

**3. `pack-smoke` leaves `engine/core/dist/` and `engine/ui/dist/` behind.**
`prepack` runs `build` + `pack-swap.mjs --to-dist`; `postpack` runs `--restore`, which correctly
restores the `exports` map (verified: tracked `package.json` files are clean after a run) but does
**not** remove the generated `dist/`. Both are gitignored, so this is not a tree-dirtying bug, and
a *fresh* `dist/` does not break anything (`@hollow/client` 327/327 passes with both present).
The hazard is a **stale** one: during this audit run a leftover `dist/` from an earlier build broke
`@hollow/client`'s webgl2-adjacent tests, because `.glsl?raw` could not resolve through it. That
cost real debugging time and the fix was "delete the gitignored directory".

## Why this is worth doing

The fixture exists to make the publish contract testable, and audit-30 made it run. But a gate
that only a script can drive, whose README lies, and whose lockfile is guaranteed wrong, is
half a tool. Defect 3 in particular is a trap: it fails somewhere else entirely (Hollow's tests),
with an error that points at shaders rather than at packing.

## Fix sketch

1. Correct the README to `npm pack -w <pkg> --pack-destination …`, and state that the fixture is
   outside the root `workspaces` on purpose.
2. Decide what the lockfile is for. Either regenerate it as part of `pack-smoke` (and say the
   hashes are disposable), or **delete it** and document that this fixture installs from freshly
   built tarballs so a lock is meaningless. Do not leave a committed file that is always wrong.
3. Make the pack lifecycle clean up after itself — remove the generated `dist/` in `postpack`, or
   have `pack-smoke` remove it at the end. Whichever you choose, prove a stale `dist/` can no
   longer survive a run.

## Files you OWN
- `examples/library-consumer/README.md` and `package-lock.json` (the fixture's *workflow* — this
  is the one spec permitted to change them; its `src/` smoke sources stay untouched)
- `engine/core/scripts/pack-swap.mjs`, `engine/ui/scripts/pack-swap.mjs`, and the `postpack`
  scripts, if cleanup lands there
- root `package.json`'s `pack-smoke` script

## Files you must NOT touch
- `examples/library-consumer/src/**` — the smoke assertions themselves. Changing them to pass
  defeats the fixture, same rule [audit-30](closed/2026-09-13-audit-30-library-consumer-smoke.md) worked under.
- the `exports` maps and `publishConfig` — if a real export break shows up, report it separately.
- `.github/workflows/ci.yml`'s step ordering — `pack-smoke` runs last deliberately.

## Acceptance
- The README's sequence works verbatim, copy-pasted, from a clean tree. Demonstrate it.
- `npm install` in the fixture succeeds after an engine source change without `--package-lock=false`,
  or the lockfile is gone and the README says why.
- After `npm run pack-smoke`, no `dist/` remains — or if it deliberately remains, show that
  `npm run test -w @hollow/client` still passes against a deliberately stale one.
- `npm run pack-smoke` still goes red when a subpath is removed from `@engine/core`'s exports
  (the [audit-30](closed/2026-09-13-audit-30-library-consumer-smoke.md) proof must keep working).
