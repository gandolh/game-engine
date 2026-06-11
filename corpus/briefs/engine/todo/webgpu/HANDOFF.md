# Hand-off Protocol (read before executing any wave)

You are a **sonnet executor** assigned exactly one wave brief. Follow this protocol so
parallel agents don't clobber each other and the orchestrator can verify each merge.

## Ground rules

1. **Read first, in this order:** `00-INDEX.md` → `01-architecture.md` → this file →
   your `wave-*.md` brief. Then open the real source files your brief names and confirm
   they still exist and match the described shapes. If reality differs from the brief,
   STOP and report the drift instead of guessing.
2. **Edit ONLY the files your brief lists under "Files you own."** If you believe you must
   touch a file owned by another brief, STOP and report — the orchestrator resolves it.
   The one exception: you may *read* any file.
3. **No `any` without a comment. No off-palette hex literals. No `.js` import suffixes.
   No `^`/`~` versions.** These fail CI/tests.
4. **Git safety:** NEVER run `git reset --hard`, `git checkout -- <path>`, `git clean`,
   `git rebase`, `git stash drop`, or any command that can discard uncommitted work.
   You may run `git add <your owned paths>` and `git commit`. You may run read-only git
   (`status`, `diff`, `log`). If you are in a worktree, stay in it.
5. **Determinism / sim:** out of scope. Do not run `npm run sim`, `check-determinism`, or
   any 100-day run. Do not import sim/worker code.

## What "done" means for a wave brief

- Your owned files exist and compile.
- `npm run typecheck -w @engine/core` is clean (run it — it's cheap).
- If your brief adds/changes tests: `npm run test -w @engine/core -- <your test file>` green.
- You did NOT modify files outside your ownership.
- You committed your owned paths with a message: `webgpu(<wave-id>): <summary>`
  followed by the trailer line:
  `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`

## Report-back template (your final message MUST be exactly this shape)

```
## Wave <id> result: <DONE | BLOCKED>

### Files created/changed (owned only)
- path — one-line description

### Contract changes
- none  (OR: describe any signature you had to change in 01-architecture.md and why)

### Verification
- typecheck -w @engine/core: <pass/fail + relevant output>
- tests run: <command + result, or "none">

### Notes for the orchestrator / downstream waves
- anything a dependent wave needs to know (gotchas, deviations, TODOs left as stubs)

### Commit
- <short sha> webgpu(<wave-id>): <summary>   (or "not committed because …")
```

## Orchestration (done by opus, documented here for transparency)

- **Wave 0** runs alone on the `webgpu-migration` branch (sole writer), then the
  orchestrator verifies typecheck and commits the contract.
- **Wave 1** (1a–1e) runs as **5 parallel worktree-isolated agents**, each branched from
  the post-Wave-0 `webgpu-migration` tip. The orchestrator merges them back one at a time,
  re-running typecheck after each merge (per the worktree-swarm pattern: rebase a stale
  worktree base before merging if the tip moved, and verify each merge incrementally).
- **Wave 2** runs alone (it wires everything; high cross-file read, single writer).
- **Wave 3** runs alone or as 2 agents (activation vs. verification) — activation owns
  `main.ts`/factory; verification is read-only + browser checks.
- **Wave 4** is optional and gated on a green Wave 3.

## Status ledger

The orchestrator owns status (do NOT write to a shared status file — concurrent writes
conflict). Report status only via your final message. Current state:

| Wave | State | Merged sha | Notes |
|------|-------|-----------|-------|
| 0 | not started | — | |
| 1a | not started | — | |
| 1b | not started | — | |
| 1c | not started | — | |
| 1d | not started | — | |
| 1e | not started | — | |
| 2 | not started | — | |
| 3 | not started | — | |
| 4 | not started | — | |
