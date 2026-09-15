# audit-33 — Running the Hollow sim dirties the working tree

status: todo
created: 2026-09-14
context: found 2026-09-14 while running startup smoke checks during the audit build; directly affects [audit-06](closed/2026-09-13-audit-06-ci-gate.md)'s smoke step.

## The gap

`tools/hollow-sim/hollow-out/` holds three **generated** export artifacts —
`events.jsonl`, `lineage.json`, `metrics.csv` — and they are **tracked in git and not
gitignored**. So simply running:

```bash
MAX_DAYS=1 TICKS_PER_DAY=20 npm run sim:hollow
```

overwrites them and leaves the working tree dirty with output nobody intended to commit. Observed
directly: a 1-day smoke run modified all three, and they had to be restored with `git restore`.

## Why it matters

1. **It is a trap for contributors.** Running the documented headless command produces a dirty tree,
   so the next `git add -A` silently commits a one-day throwaway run over whatever baseline was
   there. The files are large and diff noisily.
2. **CI will hit it.** [audit-06](closed/2026-09-13-audit-06-ci-gate.md) adds a startup-smoke step that runs
   `sim:hollow` precisely to catch the class of break that a green typecheck misses. In CI the
   checkout is ephemeral so nothing is lost, but any "working tree is clean" assertion added later
   would fail, and the intent is muddied.
3. **It is unclear what the committed copies are FOR.** Decide that first — the answer changes the
   fix:
   - *A checked-in sample/fixture other code or docs reference* → keep them tracked, but write them
     somewhere the tool does not overwrite by default (or make the default output path a temp dir and
     require an explicit flag to refresh the committed sample).
   - *Just the last run someone happened to commit* → gitignore the directory and remove it from the
     index.

**Do not skip that question.** Check whether anything reads these paths (tests, docs, the corpus,
the docs site) before deciding — deleting a referenced fixture is worse than a dirty tree.

## Files you OWN
- `.gitignore` (or `tools/hollow-sim/.gitignore`)
- [tools/hollow-sim/src/run-core.ts](../../tools/hollow-sim/src/run-core.ts) and wherever the default
  output path is chosen
- `tools/hollow-sim/hollow-out/**` only if the decision is to untrack it

## Files you must NOT touch
- the export FORMAT — [audit-12](closed/2026-09-13-audit-12-hollow-chronicle-bounded.md) deliberately kept
  `events.jsonl` byte-compatible with the CLI, and [audit-32](2026-09-14-audit-32-hollow-cli-export-drop-report.md)
  builds on that
- the other tools' output paths unless they have the same problem — if they do, say so rather than
  fixing them silently here

## Acceptance
- State what the committed copies were for and cite the evidence (who reads them, or that nothing does).
- After the fix, `npm run sim:hollow` at any budget leaves `git status --porcelain` clean.
- `npm run sim` / `sim:citadel` / `preview` are checked for the same behaviour, and the finding is
  reported either way.
