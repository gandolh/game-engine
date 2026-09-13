# audit-30 — The only test of the publish contract is never run by anything

status: todo
created: 2026-09-13
context: repo audit 2026-09-13 (`improve`). Low frequency, high blast radius when it matters.

## The gap

`examples/library-consumer` exists specifically to prove the `@engine/core` / `@engine/ui` /
`@engine/wasm-modules` npm-pack tarballs work with **zero resolution back into monorepo source** — i.e. that
the packages are genuinely publishable. It has its own `test`/`smoke` scripts.

Nothing ever runs it:
- Root `package.json` workspaces are `["engine/*", "games/*/*", "tools/*", "docs"]` — `examples/*` is
  deliberately outside, which is correct (it must resolve from tarballs, not workspace links).
- But no root script, no turbo task, and no CI (there is none — [audit-06](2026-09-13-audit-06-ci-gate.md))
  invokes it. A repo-wide grep for `library-consumer` outside its own directory returns nothing.

So the publish path is exercised only if a human remembers the manual
`npm pack --prefix … && cd examples/library-consumer && npm run smoke` sequence from its own README.

This matters because the engine packages have real publishing machinery: `build`, `prepack`, `postpack` and
`scripts/pack-swap.mjs --to-dist|--restore` in both `engine/core` and `engine/ui`, plus the `build-engine` /
`build-ui` root scripts (which, incidentally, `turbo.json`'s comment claims do not exist — a small
inaccuracy worth correcting while here).

## Failure scenario

A change to `engine/core`'s `exports` map, to `pack-swap.mjs`, or to `publishConfig` breaks the packaged
consumer experience — e.g. a subpath that resolves in-repo but not from the tarball, or a `dist` swap that
leaves a dangling path. `npm run test` and `npm run typecheck` stay fully green, because neither touches this
fixture. The breakage surfaces at publish time, or worse, to a consumer.

This interacts with [audit-19](2026-09-13-audit-19-engine-barrel-node-import-gate.md): the barrel's
render-module reachability is exactly the kind of thing that behaves differently from a tarball than from
source.

## Fix sketch

Add a root `pack-smoke` script running the pack + install + smoke sequence its README documents, and wire it
into CI (not into `npm run test` — it is slow and needs `npm pack`, so it belongs in CI or as an explicit
pre-publish step). Mention it in CLAUDE.md's Commands section alongside `build-engine` / `build-ui`, which
are themselves currently undocumented.

Keep it honest about cost: state the wall time. If it is slow enough to be annoying in CI on every push,
gate it to changes under `engine/**` — but do not silently drop it.

## Files you OWN
- root [package.json](../../package.json) (the `pack-smoke` script)
- `.github/workflows/ci.yml` if [audit-06](2026-09-13-audit-06-ci-gate.md) has landed; otherwise note the
  wiring requirement for whoever does it
- [CLAUDE.md](../../CLAUDE.md) Commands section
- `turbo.json`'s stale comment about which packages have a `build` — **coordinate with
  [audit-01](2026-09-13-audit-01-turbo-cache-false-green.md)**, which owns that file; if it is in flight,
  leave the comment to it and say so

## Files you must NOT touch
- `examples/library-consumer`'s own contents (it is the fixture — changing it to pass defeats the purpose)
- the `exports` maps, `prepack`/`postpack`, or `pack-swap.mjs` — if the smoke test reveals a real break,
  report it as its own finding rather than fixing it inside this spec
- the root `workspaces` array — `examples/*` must stay out

## Acceptance
- `npm run pack-smoke` runs green from a clean tree; report its wall time.
- It **fails** when a subpath export is temporarily removed from `engine/core`'s `exports` map.
  Demonstrate the red, then revert — otherwise the gate is unproven.
- The command is documented in CLAUDE.md.
