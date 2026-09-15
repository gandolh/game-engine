# audit-33 — Untrack `tools/hollow-sim/hollow-out/`; running the Hollow sim must not dirty the tree

status: closed 2026-09-15
created: 2026-09-14
ruled: 2026-09-15 (grill-me session) — the spec's open question is answered below from git evidence.
context: found 2026-09-14 while running startup smoke checks during the audit build; directly affects
[audit-06](2026-09-13-audit-06-ci-gate.md)'s smoke step.

## The gap

`tools/hollow-sim/hollow-out/` holds three **generated** export artifacts — `events.jsonl`,
`lineage.json`, `metrics.csv` — and they are **tracked in git and not gitignored**. So:

```bash
MAX_DAYS=1 TICKS_PER_DAY=20 npm run sim:hollow
```

overwrites all three and leaves the working tree dirty. The next `git add -A` silently commits a
one-day throwaway run over whatever baseline was there. The files are ~492 KB and diff noisily.

## The ruling — the open question is already answered

The original spec said *"do not skip the question: what are the committed copies FOR?"*
It was not skipped. It was answered, and **the answer is nothing.**

Evidence gathered 2026-09-15:

1. **Nothing reads them.** The only reference to the path anywhere in the repo is the tool's own
   default: [`tools/hollow-sim/src/env.ts:57`](../../../tools/hollow-sim/src/env.ts#L57) →
   `EXPORT_DIR ?? "./hollow-out"`. No test, doc, corpus page or docs-site build reads those files.
2. **They were committed by accident.** `git log --diff-filter=A` on the path returns exactly one
   commit: **`df9919f` — "engine: delete both WebGPU backends and purge @webgpu/types (brief 12)"**,
   which added all 11,304 lines of them alongside an unrelated renderer deletion. They were swept in
   by a `git add -A` — precisely the trap this spec was filed about.
3. **It was already known.** [hollow BUILD-STATE](../2026-07-17-hollow-BUILD-STATE.md) line 312 lists
   *"ensure `hollow-out/` (CLI EXPORT_DIR) is gitignored"* as outstanding housekeeping.

They are not a fixture. **Untrack them and gitignore the directory.**

**Keep the default output path where it is** (`./hollow-out`, beside the tool). Defaulting to an OS
temp dir was considered and rejected: writing next to the tool is discoverable, it matches the
existing precedent of `world-preview.png` (generated at the repo root, gitignored at
[.gitignore:175](../../../.gitignore)), and a temp-dir default just trades a dirty tree for a new
"where did my 100-day export go?" papercut.

**Consequence: this spec needs no code change.** The ruling keeps `env.ts` as-is, so the work is
`git rm --cached` plus a `.gitignore` line.

## The other tools are already clean

Checked 2026-09-15, satisfying the third acceptance bullet — **re-verify rather than trusting this
paragraph, but do not go "fixing" them**:

- `@tool/run-sim` — writes only when `EXPORT_FILE` is set; no default output path.
- `@tool/citadel-sim` — no default output.
- `@tool/world-preview` — writes `world-preview.png` at the repo root; already gitignored.

## What to do

1. `git rm --cached tools/hollow-sim/hollow-out/{events.jsonl,lineage.json,metrics.csv}`
2. Add `tools/hollow-sim/hollow-out/` to the root `.gitignore`, beside the existing
   `world-preview.png` entry and with the same style of one-line comment naming the command that
   generates it.

## Files you OWN
- `.gitignore`
- `tools/hollow-sim/hollow-out/**` (untracking only)

## Files you must NOT touch
- [`tools/hollow-sim/src/env.ts`](../../../tools/hollow-sim/src/env.ts) — the default path stays
- the export FORMAT — [audit-12](2026-09-13-audit-12-hollow-chronicle-bounded.md) deliberately kept
  `events.jsonl` byte-compatible with the CLI, and
  [audit-32](2026-09-14-audit-32-hollow-cli-export-drop-report.md) builds on that
- the other tools' output paths

## Acceptance
- `MAX_DAYS=1 TICKS_PER_DAY=20 npm run sim:hollow` leaves `git status --porcelain` **clean**.
- The three files no longer appear in `git ls-files`.
- `npm run sim` / `sim:citadel` / `preview` re-checked for the same behaviour, and the finding
  reported either way.
