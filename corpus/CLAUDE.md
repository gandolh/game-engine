# Corpus — How This Directory Works

This directory is a small **LLM-maintained wiki** for this monorepo — the shared TypeScript ECS engine and the **four** games on it (Farm Valley, Citadel, Hollow, MateQuest). Pattern adapted from the "LLM Wiki" idea: the LLM curates the synthesis pages; the human curates the sources and asks questions.

## Layout

```
corpus/
  CLAUDE.md         this file — schema and conventions
  index.md          content catalog (generated from each page's `summary:` frontmatter)
  routing.md        which question goes to which layer (wiki / code graph / grep / tests)
  lint.sh           health check: frontmatter, link resolution, page size, stale paths
  log.md            chronological record of corpus changes
  todos/            THE WORK QUEUE — specs that are ready or in progress
    closed/         finished specs (immutable once here)
  briefs/           older historical task specs (immutable) — predates todos/
    engine/{done,superseded}/
    game/{done,superseded}/
  verify/           evidence attached to a specific verdict (screenshots, data, a rebuildable page)
  wiki/             LLM-curated synthesis pages (the actual knowledge base)
    overview.md, architecture.md, decisions.md, status.md, open-questions.md, …
```

**Two archives, one reason:** `briefs/` is the original scheme and is closed to new files;
everything since is a dated spec in `todos/`. Don't add to `briefs/`.

## Three layers

1. **todos/ + briefs/** — raw, immutable specs. Each file is a task spec that was used to direct work (typically by a subagent). Once a spec is in `todos/closed/`, `done/`, or `superseded/`, do **not** edit it — the two sanctioned exceptions are a supersession note (below) and correcting a link a directory move broke. **A closed spec's own `status:` line is frozen at authoring time and routinely still reads `todo`** — the directory it sits in and [wiki/status.md](wiki/status.md) are what tell you its real state. New work gets a new dated spec in `todos/`.
2. **wiki/** — the LLM owns this. Synthesis, entity pages, concept pages, current status. Edited freely as understanding evolves.
3. **index.md + log.md** — navigation aids. Updated on every meaningful change.

## Conventions

- **Every wiki page opens with frontmatter.** Exactly two keys, `summary:` (one line, what the page
  answers — this is the retrieval signal an agent triages on *without opening the page*) and
  `updated:` (absolute date, the last time the page's **content** meaningfully changed — not a
  frontmatter-only touch). `index.md`'s catalog lines are hand-authored from `summary:`: they may be
  shorter and add grouping, but must not contradict it. `lint.sh --index` prints the derived version
  to diff against.
- **Markdown links, not Obsidian `[[wikilinks]]`.** Repo is consumed in VSCode + GitHub, where standard markdown links render and are clickable.
- **Relative paths from the page's own location.** Code references use `../../engine/...` or `../../games/...` from `wiki/`, one `../` deeper from `todos/closed/` and `briefs/<area>/<state>/`. **Moving a file shifts its depth** — re-resolve its links, or `lint.sh` will flag them.
- **One concept per file.** When a wiki page grows past ~200 body lines or starts straddling two topics, split it. `bash corpus/lint.sh` flags both.
- **Dates are absolute** (`2026-05-26`), never relative (`yesterday`).
- **Commits**: prefer one commit per meaningful corpus change so log.md and git history agree.

## The retrieval budget

The corpus exists to make an agent *cheaper*, not just better-informed. So:

1. Read `index.md`. Read **at most 2–3 wiki pages**.
2. If a question needs more than three pages, that is a signal — a page is straddling topics and
   should be split, or `index.md`'s summaries aren't sharp enough. Fix the cause, don't just read more.
3. Never read `briefs/` or `todos/` wholesale. `status.md` carries every brief's current state in one
   line; open a brief only when you need the spec that directed a specific piece of work.
4. Prefer the `summary:` line over opening the page. That is what it is for.

## Lint

`bash corpus/lint.sh` — checks frontmatter presence; resolves **every relative link in the whole
corpus**; flags pages over the ~200-body-line cap; catches references to the pre-2026-07 `packages/`
layout and links into the deleted `webgpu/`/`canvas2d/` render dirs.
`bash corpus/lint.sh --index` regenerates the catalog block for `index.md`.
Run it before committing a corpus change.

**Link policy it enforces** (widened 2026-08-18, after an audit found 452 links broken by directory
moves that the wiki-only check never saw): **live pages** — `wiki/`, `index.md`, `routing.md`, this
file, the open `todos/` queue — must resolve **100%**. **Archives** (`briefs/`, `todos/closed/`) are
frozen specs, so their *code* references decay by design and are only counted; their references to
other *corpus documents* still have to resolve, because those stay ours to fix.

## Workflows

### Ingest (new source / new finding)
A "source" here usually means a new design decision, an exploration result, or a brief outcome. Steps:
1. Drop the raw artifact in `todos/` (if it's a spec) or summarize the finding inline. Never in `briefs/` — that archive is closed.
2. Update affected wiki pages (`status.md`, the relevant entity page, `open-questions.md`).
3. Append an entry to `log.md` with prefix `## [YYYY-MM-DD] <kind> | <short title>`.
4. Cross-link from `index.md` if a new page was added.

### Query (answering a question against the wiki)
1. Read `index.md` first; triage on the `summary:` lines. Respect the retrieval budget above.
2. Drill into the wiki pages, not into the codebase, unless the wiki points to specific code.
3. **Structural questions do not belong here.** "Who calls X", "what breaks if I change X", "where
   does feature Y live" go to the code graph — see [routing.md](routing.md) for which layer answers
   which question, and [wiki/code-graph.md](wiki/code-graph.md) for its measured failure modes.
4. If the answer is non-trivial and reusable, **file it back as a new wiki page** rather than letting it disappear into chat.

### Lint (periodic health check)
- Contradictions between pages (e.g. `decisions.md` vs `status.md`).
- Stale claims — verify by reading the actual code or running the relevant command before trusting.
- Orphan pages (no inbound links from `index.md` or other wiki pages).
- Concepts mentioned by name but lacking their own page.
- Briefs in `done/` whose work has since been undone or replaced — move to `superseded/`.

### Verifying before quoting the wiki
A wiki page that names a specific file, function, or commit may have drifted. Before acting on a wiki claim:
- Names a path → check it exists.
- Names a function/flag → grep for it.
- Names a commit → `git log --oneline | grep <hash>`.

## Spec lifecycle

Current scheme (`todos/`):

`todos/<YYYY-MM-DD>-<slug>.md` → work happens → `todos/closed/<same-name>.md`
plan dropped, or later work replaces it → still `todos/closed/`, **plus a one-line top note saying why**

Legacy scheme (`briefs/`, closed to new files): `done/<NN-slug>.md` → `superseded/<NN-slug>.md`
when later work undid or replaced it.

Names and number prefixes are stable for the life of the file — don't rename or renumber when moving
between directories. **Do fix the links inside a moved file**, whose relative depth just changed.

A spec that was *delivered as specified* but whose subject has since been replaced still belongs in
`closed/`/`done/` — mark it with a supersession note rather than moving it, and say what survived. See
[todos/closed/2026-07-17-hollow-08-engine-webgpu-3d-renderer.md](todos/closed/2026-07-17-hollow-08-engine-webgpu-3d-renderer.md)
for the shape.

## Source of truth ordering

When two corpus pages or two beliefs disagree:
1. The actual code wins over any wiki claim.
2. A brief in `done/` wins over `wiki/` if `wiki/` hasn't caught up yet.
3. `decisions.md` wins over `status.md` for tech choices that haven't been formally revisited.
4. For **Farm Valley game-design** disagreements only, the Python SPADE prototype README wins — but it lives **outside this repo**, so treat it as an unavailable reference rather than something to go read. Everything Farm inherited from it that still matters is already folded into [wiki/overview.md](wiki/overview.md) and [wiki/economy.md](wiki/economy.md). The other three games have no such ancestor; their design-of-record is their own wiki page.
