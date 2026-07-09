# Corpus — How This Directory Works

This directory is a small **LLM-maintained wiki** for the Farm Valley engine + game. Pattern adapted from the "LLM Wiki" idea: the LLM curates the synthesis pages; the human curates the sources and asks questions.

## Layout

```
corpus/
  CLAUDE.md         this file — schema and conventions
  index.md          content catalog (generated from each page's `summary:` frontmatter)
  routing.md        which question goes to which layer (wiki / code graph / grep / tests)
  lint.sh           health check: frontmatter, link resolution, page size, stale paths
  log.md            chronological record of corpus changes
  briefs/           raw historical task specs (immutable)
    engine/{done,superseded,todo}/
    game/{done,todo}/
  wiki/             LLM-curated synthesis pages (the actual knowledge base)
    overview.md, architecture.md, decisions.md, status.md, open-questions.md, …
```

## Three layers

1. **briefs/** — raw, immutable. Each file is a task spec that was used to direct work (typically by a subagent). Once a brief is in `done/` or `superseded/`, do **not** edit it. New work gets a new brief in `todo/`.
2. **wiki/** — the LLM owns this. Synthesis, entity pages, concept pages, current status. Edited freely as understanding evolves.
3. **index.md + log.md** — navigation aids. Updated on every meaningful change.

## Conventions

- **Every wiki page opens with frontmatter.** Exactly two keys, `summary:` (one line, what the page
  answers — this is the retrieval signal an agent triages on *without opening the page*) and
  `updated:` (absolute date). `index.md`'s catalog lines are generated from `summary:`.
- **Markdown links, not Obsidian `[[wikilinks]]`.** Repo is consumed in VSCode + GitHub, where standard markdown links render and are clickable.
- **Relative paths from the page's own location.** Code references use `../../engine/...` or `../../games/...` from `wiki/`, one `../` deeper from `briefs/<area>/<state>/`.
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

`bash corpus/lint.sh` — checks frontmatter presence, resolves every relative link, flags pages over
the ~200-body-line cap, and catches references to the pre-2026-07 `packages/` layout.
`bash corpus/lint.sh --index` regenerates the catalog block for `index.md`.
Run it before committing a corpus change.

## Workflows

### Ingest (new source / new finding)
A "source" here usually means a new design decision, an exploration result, or a brief outcome. Steps:
1. Drop the raw artifact in `briefs/` (if it's a spec) or summarize the finding inline.
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

## Brief lifecycle

`todo/<NN-slug>.md` → work happens → `done/<NN-slug>.md`
`todo/<NN-slug>.md` → plan dropped → `superseded/<NN-slug>.md` (with a one-line top note explaining why)
`done/<NN-slug>.md` → later work undoes it → `superseded/<NN-slug>.md`

Number prefixes are stable for the life of the file — don't renumber when moving between dirs.

## Source of truth ordering

When two corpus pages or two beliefs disagree:
1. The actual code wins over any wiki claim.
2. A brief in `done/` wins over `wiki/` if `wiki/` hasn't caught up yet.
3. `decisions.md` wins over `status.md` for tech choices that haven't been formally revisited.
4. The Python SPADE prototype README (external) is the gameplay spec — wins for game-design disagreements.
