# audit-06 — There is no CI; every gate is "the author remembered"

status: todo
created: 2026-09-13
context: repo audit 2026-09-13 (`improve`). Pairs with [audit-01](2026-09-13-audit-01-turbo-cache-false-green.md) — land that first, or CI will cache the same false greens.

## The gap

There is no `.github/` directory and no active git hooks (only the stock `.sample` files). Verified
2026-09-13. `npm run typecheck` and `npm run test` exist and are good, but nothing runs them except a
human choosing to.

Combined with [audit-01](2026-09-13-audit-01-turbo-cache-false-green.md) (a warm turbo cache reports
success for packages it never checked) and [audit-20](2026-09-13-audit-20-tool-workspaces-test-scripts.md)
(four workspaces have no `test` script at all), the practical state is: a change can reach `main` having
been verified by nothing.

## Failure scenario

Any change that breaks a workspace the author did not personally re-run — which, per audit-01, includes
*every downstream package* of whatever they edited. `main` is the branch this repo works on directly
(`git status` at audit time: on `main`, clean). There is no PR checkpoint to catch it either.

The corpus records two prior incidents of exactly this class: the dynamic-renderer-import break, where
"typecheck plus 689 passing tests did not catch it" ([decisions.md](../wiki/decisions.md) → Renderer),
and two features that shipped inert with green tests.

## Fix sketch

A single minimal workflow on push + PR:

```
npm ci
npm run typecheck
npm run test
```

Three things that matter more than the YAML:

1. **Do not restore a turbo cache across CI runs** (or pass `--force`) until audit-01 is fixed —
   otherwise CI inherits the false-green problem and is worse than nothing, because it looks authoritative.
2. **Add the "verification must include running things" gate** that `decisions.md` already demands and
   nothing automates: `npm run build`, then `npm run sim`, `sim:citadel`, `sim:hollow` and `preview`
   with tiny budgets (`MAX_DAYS=1 TICKS_PER_DAY=20`) purely to prove the headless entry points still
   *start*. This is what would have caught the `.glsl` import break.
3. Declare the Node version explicitly (see the Watch item on the missing `engines` field) so CI and
   contributors agree.

Keep it cheap — this repo runs on constrained hardware and the suite is heavy; CI is the place to pay
that cost, but size the smoke runs to seconds, not minutes.

## Files you OWN
- new: `.github/workflows/ci.yml`
- root [package.json](../../package.json) — only if a `ci`/`smoke` convenience script helps
- a note in [corpus/wiki/status.md](../wiki/status.md)

## Files you must NOT touch
- `turbo.json` — that is audit-01's file; do not fix the cache here
- any source file

## Acceptance
- The workflow runs `typecheck` + `test` + the start-up smoke set on push and PR, and **fails** when
  given a deliberately broken commit. Demonstrate the red run, not just the green one.
- The smoke phase proves each headless tool and the client build actually start; state the wall time.
- The cache posture is explicit and commented (why no cross-run restore yet, and the condition for
  enabling it once audit-01 lands).
- Do not open a PR or push a branch without the user's go-ahead — propose the commands.
