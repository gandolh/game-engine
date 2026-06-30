# Routing — how work routes in this project
<!-- Read by the orchestrate skill. Tune freely; keep it short. -->

**Implement skill:** plan-split-dispatch
**Review skill:** /code-review (repo skill) over the diff; `npm run typecheck` + `npm run test` are the gates
**PR skill:** propose git commands (gh CLI available) — never commit/push without the user's say-so
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

## READ / SKIP / SKILLS
| Task type | READ | SKIP | SKILLS |
|-----------|------|------|--------|
| Citadel gameplay (cozy pivot) | the todo/BUILD-ORDER, corpus/wiki/citadel-overview.md, corpus/wiki/decisions.md, games/citadel/sim-core/src/{systems,world,entities} | Farm-only code (games/farm/*), engine renderer internals | playtest-citadel (validate feel) |
| Citadel UI / @engine/ui | the UI todo, games/citadel/client/src/render, engine/core/src/render, corpus/wiki/decisions.md (palette/EDG32) | Farm sim systems, Citadel sim-core balance | frontend-design, playtest-citadel |
| Engine/core | the todo, engine/core/src/<subsystem>, corpus/wiki/architecture.md | game-specific code | — |
| Farm gameplay | the todo, games/farm/sim-core/src, corpus/wiki/system-ordering.md | Citadel code | — |

## Conventions (locked — see corpus/wiki/decisions.md)
- No `.js` import suffixes; pinned versions (no `^`/`~`); TS strict + noUncheckedIndexedAccess + exactOptionalPropertyTypes.
- EDG32 palette enforced (palette.test guard) — every color from `EDG.*`.
- Engine never imports a game; the two games never import each other.
- Determinism is load-bearing — no `Math.random`/`Date.now` in sim; all randomness via seeded `Rng.fork(label)`.
- `npm run typecheck` + `npm run test` before any commit. Never commit/push without the user's go.
