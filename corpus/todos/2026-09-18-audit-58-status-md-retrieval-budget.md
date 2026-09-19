# audit-58 — `status.md` is 119 KB, and the corpus's own retrieval budget is the thing it breaks

status: todo
created: 2026-09-18
context: measured during the 2026-09-18 sweep. `bash corpus/lint.sh` already reports this — it is the
corpus failing its own stated rule, not an outside opinion.

## The gap

`corpus/lint.sh` passes its link and frontmatter checks and then prints:

```
== page size (soft cap 200 body lines — over means split)
  OVERSIZED (427 body lines): wiki/status.md
  OVERSIZED (281 body lines): wiki/decisions.md
  OVERSIZED (248 body lines): wiki/citadel-decisions.md
  OVERSIZED (245 body lines): wiki/hollow-overview.md
  OVERSIZED (245 body lines): wiki/performance.md
  OVERSIZED (240 body lines): wiki/citadel-rendering.md
  OVERSIZED (217 body lines): wiki/player-and-interaction.md
  OVERSIZED (206 body lines): wiki/world-generation.md
```

Line counts understate it. By bytes:

| page | size | ≈ tokens |
|---|---|---|
| `wiki/status.md` | **119 652** | **~30 000** |
| `wiki/performance.md` | 40 758 | ~10 000 |
| `wiki/player-and-interaction.md` | 30 552 | ~7 600 |
| `wiki/decisions.md` | 28 788 | ~7 200 |

`status.md` is three times the next largest page. And [`corpus/CLAUDE.md`](../CLAUDE.md) states the
budget it breaks:

> *"Read `index.md`. Read **at most 2–3 wiki pages**. … The corpus exists to make an agent *cheaper*,
> not just better-informed."*

[`corpus/index.md`](../index.md) names `status.md` as *"the single source for brief state"* and
`routing.md` sends the verify gate through it. So the one page an agent is most often told to read
costs ~30k tokens on its own — more than the whole rest of the budget.

`CLAUDE.md` also already says what an oversized page means: *"When a wiki page grows past ~200 body
lines or starts straddling two topics, split it."*

## What status.md is actually holding

At least four different things, with different lifetimes: newest-first **banners** (a changelog),
**per-brief one-liner tables** (an index), **current sim/determinism behaviour** (genuine current
state), and **shipped-programme records** like the WebGL2 migration section (history that belongs in
`log.md` or a closed build record).

Only the third is "current-state snapshot", which is what the page's own `summary:` claims it is.

## What to do

Split by **lifetime**, not by size. A reasonable shape — argue with it before adopting it:

- `status.md` keeps only the current-state snapshot: what is true now, what is open, the determinism
  posture. Target well under the 200-line cap.
- Brief-state tables move to their own page (or are dropped where `todos/closed/` + the directory
  already answer the question — `CLAUDE.md` says the directory is what tells you a spec's real state,
  so a parallel hand-maintained table may be duplicated bookkeeping).
- Banners age out into `log.md`, which is already the chronological record.

Then the other seven oversized pages are a judgment call each: `decisions.md` at 281 lines may be
correct as one page (it is a single concept and splitting locked decisions has its own cost), while
`performance.md` is straddling backlog + measurements and already has a sibling
(`performance-measurements.md`).

**Do not mechanically split everything to satisfy the linter.** The cap is a signal, and the deliverable
is a corpus that is cheaper to read — a page count that went up while total tokens stayed flat is a
failure.

## Files you OWN
- [`wiki/status.md`](../wiki/status.md) and any new pages it splits into
- [`corpus/index.md`](../index.md) — the catalog must reflect the split, and its hand-authored lines
  must not contradict any page's `summary:`
- [`corpus/log.md`](../log.md) — the entry for this change, plus anything aged out of the banners
- [`corpus/routing.md`](../routing.md) if a route points at a moved section

## Files you must NOT touch
- `todos/closed/` and `briefs/` — frozen
- the **content** of decisions: this is a reorganisation. Nothing may change meaning, and no locked
  decision may be dropped in the move.
- [audit-53](closed/2026-09-18-audit-53-corpus-drift-sweep.md)'s three stale pages — that brief fixes what
  they *say*; this one changes where things *live*. Land 53 first if both are picked, or the drift
  gets copied into the new pages.

## Acceptance
- `bash corpus/lint.sh` reports `status.md` under the cap, and **0 broken live links** — a split moves
  every page's relative-path depth, which `CLAUDE.md` explicitly warns about.
- `bash corpus/lint.sh --index` diffs cleanly against `index.md`'s hand-authored catalog.
- Total corpus bytes go **down**, not just per-page bytes. State the before/after.
- Spot-check the retrieval claim afterwards: "what is the current state of Hollow?" should be
  answerable from `index.md` plus ≤3 pages without opening a 119 KB file.
