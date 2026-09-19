# sweep-07 — all four clients build with `target: "esnext"`, nothing in the repo records which browsers that supports

status: todo
created: 2026-09-19
context: found by a read-only structure/performance/compatibility sweep on 2026-09-19. **Zero prior
mentions** — `grep -ril "esnext\|build.target\|browserslist" corpus/` returns nothing across the wiki
and all 345 closed specs. This is the compatibility counterpart to the WebGL2 decision: that decision
chose reach over capability for the *renderer*, and the bundle the renderer ships inside quietly
opted out of the same trade.

## The gap

All four clients:

```ts
// games/{farm,citadel,hollow,mathquest}/client/vite.config.ts
build: {
  target: "esnext",
  sourcemap: true,
},
```

[farm](../../../games/farm/client/vite.config.ts) ·
[citadel](../../../games/citadel/client/vite.config.ts) ·
[hollow](../../../games/hollow/client/vite.config.ts) ·
[mathquest](../../../games/mathquest/client/vite.config.ts)

Four files, identical opt-out, **no comment in any of them** saying why. Meanwhile
[`tsconfig.base.json`](../../../tsconfig.base.json):

```json
"target": "ES2022",
"lib": ["ES2022", "DOM", "DOM.Iterable"],
```

So TypeScript type-checks and emits against **ES2022**, and the bundler is told to preserve syntax for
whatever esbuild currently calls newest. The two halves of the build disagree about what the output
targets, and only one of them is written down.

## Why `esnext` is the wrong setting here specifically

**1. Nothing in the source needs it.** I checked for the features that normally justify it:

| feature | found |
|---|---|
| top-level `await` | **none** in any client |
| decorators | none |
| `using` / explicit resource management | none (the 50 grep hits are the English word "using" in comments) |
| `??=` / `&&=` (ES2021) | 2 sites — within ES2022 |
| `.at()` (ES2022) | 3 sites — within ES2022 |

Every construct in the tree is ES2022 or older. `esnext` buys **nothing** that `es2022` does not.

**2. It is a moving target, so the supported browser set changes on a dependency bump.** `esnext` means
"whatever this esbuild thinks is newest", not a fixed baseline. Upgrade Vite, and the set of browsers
that can parse the bundle shrinks — silently, with no config change, no lockfile signal, and nothing in
the corpus to notice it against. For a repo whose conventions page opens with *"Pinned versions. No `^`
or `~`. Reproducibility wins"*, an unpinned, drifting output target is the one unpinned thing left.

**3. The failure mode is a blank page, which is the exact failure this project already ruled against.**
A syntax the browser cannot **parse** is not a degraded feature — the module never evaluates, nothing
renders, and the console error names a character offset in a bundle. [decisions.md](../../wiki/decisions.md)
→ Renderer chose WebGL2 over WebGPU precisely because *"both 2D clients hard-forced `backend: "webgpu"`,
so an unsupported browser got a **blank canvas**"*, and cited WebGL2's *"~98% supported, universal on
desktop since ~2017."* Shipping that renderer inside a bundle compiled for the newest engines only
gives back the reach it was chosen for.

**4. Nothing records the intended support floor.** No `browserslist` in any `package.json`, no
`build.target` note in the wiki, no README line. So "which browsers is this game supposed to run in?"
currently has no answer anywhere in the repository — which also means no one can tell whether a bug
report from an older browser is in scope.

## The secondary half: the published packages declare no `engines`

`"engines": { "node": ">=24" }` exists in the **root** `package.json` only. The three packages that are
actually published — [`@engine/core`](../../../engine/core/package.json),
[`@engine/ui`](../../../engine/ui/package.json), `@engine/wasm-modules` — carry none. A consumer installing
`@engine/core` from a registry gets no Node constraint at all, while
[status.md](../../wiki/status.md) records `>=24` as *"the one pin backed by a real deploy constraint"*
(it matches `infrastructure/Dockerfile`'s `node:24-alpine`). The pin that matters is on the one
manifest that never ships.

This rides along because it is the same question — *what does this artifact claim to run on?* — asked
of the other artifact. Keep it in one brief; do not let it become the whole brief.

## What to do

1. **Set `build.target` to `"es2022"` in all four configs**, matching `tsconfig.base.json`, with a
   one-line comment pointing at the tsconfig so the two stay visibly coupled. Vite's own default is
   `"modules"` (a baseline-widely-available set) — either is defensible; `es2022` is better here because
   it makes the two halves of the build state the *same* number.
2. **Record the floor once, in prose.** One line in [decisions.md](../../wiki/decisions.md) under *Build &
   verify gates*: the output target, that it tracks `tsconfig`, and the reason (parse failure is a blank
   page; `esnext` drifts with esbuild). This is a genuine locked decision by the page's own three
   tests — hard to reverse cheaply, surprising without context, and a real trade against newer syntax.
3. **Add a guard, in the repo's idiom.** The palette scan, the layering scan and the GLSL lint are all
   *path-scoped greps that fail on drift*. This wants the same: a test that reads all four
   `vite.config.ts` and fails if `build.target` is absent or not the agreed value. Cheap, and it is what
   keeps the fifth game from re-introducing `esnext` by copy-paste — which is exactly how all four got
   it.
4. **Add `engines` to the three published manifests**, matching the root. While in there, confirm
   `@engine/ui`'s `"dependencies": { "@engine/core": "0.1.0" }` resolves for a registry consumer and not
   only in-workspace — `pack-smoke` installs both tarballs together, so it would not catch a consumer
   installing `@engine/ui` alone.
5. **Prove the change is a no-op for behaviour.** `es2022` downlevels nothing that is in the tree
   (point 1 above), so the bundle should be materially the same. If it is *not* — if the output size or
   shape moves noticeably — something in the tree was newer than ES2022 and the audit above missed it.
   That is a finding, not a reason to revert; chase it.

## What this brief is NOT
- Not a polyfill or `core-js` proposal. Nothing here adds runtime shims; it changes a syntax target and
  writes down a number.
- Not a call to support old browsers. The WebGL2 floor (~2017 desktop) is the real constraint; this
  brief only asks the JS to stop being *narrower* than the renderer for no stated reason.
- Not `target` in `tsconfig`. That stays ES2022; this aligns the bundler to it, not the reverse.

## Files you OWN
- all four `games/*/client/vite.config.ts`
- `engine/core/package.json`, `engine/ui/package.json`, `engine/wasm-modules/package.json` (the
  `engines` field only)
- the new guard test, wherever the existing config-scanning guards live
- `corpus/wiki/decisions.md` (one entry)

## Files you must NOT touch
- `tsconfig.base.json` — `target: ES2022` and the strictness flags are locked
  ([decisions.md](../../wiki/decisions.md) → Stack).
- `publishConfig` in either engine manifest. The pack-swap dance is load-bearing and audit-35/36
  documented it the hard way; adding `engines` must not perturb it.
- Any dependency version. No `^`/`~`, and no upgrades ride along with this.

## Acceptance
- All four configs build green, and `npm run build` (Farm's production build, already a gate step) still
  passes.
- **The guard bites**: set one config back to `esnext` and confirm the new test fails.
- **A real browser still runs each game.** All four clients loaded and rendering, not just built — this
  is a bundler-output change, and [decisions.md](../../wiki/decisions.md) → Renderer is explicit that a
  green typecheck plus a green suite said nothing about whether the app starts.
- One `decisions.md` entry with the *why*, per that page's rule that an undefended entry is a lint
  finding.
- `npm run gates`, including `pack-smoke` (the `engines` edits touch packed manifests).
