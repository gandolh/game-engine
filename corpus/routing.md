# Routing — how work routes in this project
<!-- Read by the orchestrate skill. Tune freely; keep it short. -->

**Implement skill:** plan-split-dispatch
**Model routing (default):** controller (plan + verify + adjudicate) = **opus**; executor
chunks = **Sonnet 5** by default, including medium-hard sim work; trivial = haiku; review
finders = Sonnet. Reserve opus executor chunks for genuinely novel/risky/security/data.
**Bias borderline chunks → junior (Sonnet 5).** Keep opus in the controller/verify seat —
do not promote Sonnet to it (its value there is a stronger *second opinion* + the
expensive-if-wrong judgment calls). The hard objective gates below are the safety net that
make routing risky chunks down safe. (Confirmed 2026-07-01 after a Phase-D dispatch ran all
executor chunks on Sonnet 5 successfully.)
**Review skill:** /code-review (repo skill) over the diff; `npm run typecheck` + `npm run test` are the gates
**PR skill:** propose git commands (gh CLI available). **Commit completed briefs at closeout** (one commit for code + one for the corpus change); never push / open a PR / tag without the user's say-so.
**Issue tracker:** none — the work queue is `corpus/todos/` (ready/todo specs); archives live in `corpus/briefs/{engine,game}/{done,superseded}`
**Code host:** GitHub (gh) — github.com/gandolh/game-engine

> **Repo note:** this corpus predates the orchestrate convention. The work queue is
> `corpus/todos/*.md` (NOT `corpus/briefs/todo/`, which is empty). `corpus/briefs/` holds
> immutable historical specs. `corpus/wiki/status.md` is the single source for brief state.
> Read `corpus/CLAUDE.md` for the brief/wiki/log workflow and source-of-truth ordering.

## Intent routing
| Signal | Intent | Route to |
|--------|--------|----------|
| New idea/task to capture | capture | corpus-flow: add a todo in `corpus/todos/` |
| Ready to build, ≥3 chunks | build (dispatched) | the todo spec → plan-split-dispatch |
| Ready to build, 1–2 files | build (inline) | implement inline, show diff |
| "what does the wiki say about X" | query | corpus-flow: query `corpus/wiki/` |
| Work finished, needs recording | closeout | corpus-flow: status.md + log.md + fold into wiki, move todo→closed |

## Knowledge routing — which layer answers which question

Two graphs, two jobs. The **corpus is the _why_** (design intent, decisions, history) and is
authored + git-reviewed. The **code graph is the _what_** (symbols, callers, imports) and is a
generated, disposable index — never a source of truth. Neither substitutes for the other.

| Question shape | Route to | Why |
|---|---|---|
| "Why is it built this way?" / "what was decided?" | `corpus/wiki/` (start at `index.md`) | Only the corpus knows intent |
| "Who calls X?" / "what breaks if I change X?" / "where does feature Y live?" | the [`codegraph` project skill](../.claude/skills/codegraph/SKILL.md) | 20–180× cheaper than grep+read fanout |
| **"Did I get _every_ usage?"** (rename, refactor, delete) | **`grep -rnw`** | codegraph is incomplete here — measured 16/42 call-site files for `createRng` |
| Anything about a symbol **both games export** | **`grep`**, scoped by path | codegraph conflates them — `callers bootstrapSim` silently returns Farm's callers only |
| "Does `@citadel/*` import `@farm/*`?" (dependency rule) | **`grep`** | It's a correctness invariant; don't ask a heuristic index |
| Determinism / palette / scheduler-order questions | **run the guard test** | `npm run test`; the tests are the authority |

Benchmarked on this repo 2026-07-09 — see [wiki/code-graph.md](wiki/code-graph.md) for the numbers
and the 18 ambiguous symbol names. Lead with the graph to *locate*; verify with grep or a test
before you *act*.

## READ / SKIP / SKILLS
| Task type | READ | SKIP | SKILLS |
|-----------|------|------|--------|
| Citadel gameplay (cozy pivot) | the todo/BUILD-ORDER, corpus/wiki/citadel-overview.md, corpus/wiki/decisions.md, games/citadel/sim-core/src/{systems,world,entities} | Farm-only code (games/farm/*), engine renderer internals | — (visual/feel checks: user drives the browser + shares screenshots; the playtest-citadel skill was removed 2026-07-13) |
| Citadel UI / @engine/ui | the UI todo, games/citadel/client/src/render, engine/core/src/render, corpus/wiki/decisions.md (palette/EDG32) | Farm sim systems, Citadel sim-core balance | frontend-design |
| Engine/core | the todo, engine/core/src/<subsystem>, corpus/wiki/architecture.md | game-specific code | — |
| Farm gameplay | the todo, games/farm/sim-core/src, corpus/wiki/system-ordering.md | Citadel code | — |

## Conventions (locked — see corpus/wiki/decisions.md)
- No `.js` import suffixes; pinned versions (no `^`/`~`); TS strict + noUncheckedIndexedAccess + exactOptionalPropertyTypes.
- Fixed palette enforced per game (palette.test guard, per-scope) — every color from a named role constant, never raw hex: engine + Farm = EDG32 (`EDG.*`); Citadel = Apollo-46 (`CITADEL_PAL as EDG`). See citadel-decisions #28.
- Engine never imports a game; the two games never import each other.
- Determinism is load-bearing — no `Math.random`/`Date.now` in sim; all randomness via seeded `Rng.fork(label)`.
- `npm run typecheck` + `npm run test` before any commit. Commit completed briefs at closeout (code + corpus as separate commits); never push without the user's go.
