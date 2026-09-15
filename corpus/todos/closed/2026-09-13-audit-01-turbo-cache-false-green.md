# audit-01 — Turbo reports success for packages it never typechecked

status: todo
created: 2026-09-13
context: repo audit 2026-09-13 (`improve`). **Do this one first** — until the cache is honest, no other fix in this batch can be trusted to have been verified.

## The gap

`typecheck` and `test` in [turbo.json](../../../turbo.json) are declared `dependsOn: []` with no
`inputs` override. Every internal package exports raw TS source (no build step), so `tsc` reads a
dependency's `.ts` **directly** — but the task's cache key contains only the package's *own* files.
So when an upstream workspace's source changes, every downstream package keeps its old hash and
replays a cached green without re-running `tsc` at all.

The file's own comment block (lines 5-19) explains why `^topological` deps were rejected
(parallelism + independent failure reporting). That reasoning is sound and is **not** what this spec
relitigates. What was missed is that `dependsOn: ["^typecheck"]` is also what folds an upstream
package's hash into the downstream cache key — dropping it bought parallelism and silently gave up
cache correctness. The three existing `#test` `inputs` overrides cover cross-package *file* reads
(the repo-walking palette guard, the committed atlas, the wasm binaries) but not the ordinary case:
"my workspace dependency's source changed".

## Evidence — reproduced 2026-09-13

Baseline: `npx turbo run typecheck --dry-run=json` shows `@citadel/client#typecheck` with
`"dependencies": []` and 132 hashed inputs, **none** under `engine/core/` or any `sim-core/`.

Then a required field was added to `Personality` in
[engine/core/src/ecs/components.ts:40](../../../engine/core/src/ecs/components.ts#L40)
(a type defined in the engine and constructed only by games):

```
$ npm run typecheck
 Tasks:    18 successful, 19 total
 Cached:    18 cached, 19 total
 Failed:    @engine/core#typecheck

$ npx turbo run typecheck --continue --force
  @hollow/sim-core:  error TS2741: Property 'auditProbeRequired' is missing … (population.ts:123, reproduction-system.ts:188)
  @hollow/client:    error TS2741 (via ../sim-core/…)
  @farm/sim-core:    error TS2741 (agents/bean.test.ts:105) + TS2375
  @farm/server:      error TS2741 (../sim-core/src/world-setup.ts:81)
  @tool/run-sim:     error TS2741
  @tool/world-preview: error TS2741
  @tool/hollow-sim:  error TS2741
```

**8 packages were genuinely broken; the gate reported 18 successful.** `@engine/core` only went red
because its own test file happens to construct a `Personality`. Change a symbol the engine's tests
don't touch — or edit a game's `sim-core` rather than the engine — and the entire run is green while
the tree is broken. `@hollow/client` and `@hollow/sim-core` both reported *cached success while
broken* in the same run, which is the fully-silent case.

## Why it matters beyond tidiness

[routing.md](../../routing.md) makes `npm run typecheck` + scoped `npm run test` the **verify gate**
between dispatch waves and before delivery, and states "a subagent's 'tests pass' is not evidence."
Today the controller's own re-run is not evidence either. Every other spec in this batch is verified
through this gate.

## Files you OWN
- [turbo.json](../../../turbo.json)
- a short note in [corpus/wiki/decisions.md](../../wiki/decisions.md) recording the resolution

## Files you must NOT touch
- any `package.json` (do not restructure the workspace graph to work around this)
- any source file

## What to do

1. Reproduce the failure above first, so you can prove the fix. Use the `Personality` probe; revert it.
2. Pick one of the two honest options and record *why* in the task comment:
   - **`inputs` globs** — add each package's workspace-dependency `src/**` to its task `inputs`,
     extending the pattern the three `#test` overrides already establish. Keeps full parallelism and
     independent failure reporting. Cost: the globs must be maintained as deps change.
   - **`dependsOn: ["^typecheck"]` / `["^test"]`** — correct by construction and self-maintaining.
     Re-read the lines 5-19 rationale: the "hides red packages" objection is answered by
     `--continue`, which the root scripts already pass. Verify that claim rather than assuming it.
3. **Useful cost datapoint, measured 2026-09-13:** a *fully uncached* `turbo run typecheck --force`
   across all 19 workspaces takes **12.2 s** (`19 successful, 0 cached`). So even the worst case — a fully
   serialized topological DAG on a cold cache — is seconds, not minutes. The parallelism the `dependsOn: []`
   choice was protecting is cheap to buy back either way; weigh the options on correctness and
   maintainability, not on speed fear.
4. Keep the existing cross-package `inputs` overrides — they cover a different gap and are still needed.
5. Preserve `--concurrency=1` on `test` (the atlas write/read race documented in the file is real).

## Acceptance
- With the `Personality` probe applied, `npm run typecheck` reports **every** genuinely-broken package
  as failed — not cached-successful. Paste the before/after task summary.
- With the probe reverted, a warm `npm run typecheck` is still fast (report the wall time; a fully
  serialized DAG that takes minutes is a regression worth flagging rather than shipping).
- `npm run test` still passes and is not made flaky (the atlas race must stay avoided).
- The chosen trade-off is written down in `decisions.md` so it is not silently reverted later.
