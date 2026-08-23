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
**Never route a chunk to a fable-model subagent** on this repo (pixel-art chunks included) — use opus.
**Review skill:** /code-review (repo skill) over the diff; `npm run typecheck` + `npm run test` are the gates
**PR skill:** propose git commands (gh CLI available). **Commit completed specs at closeout** (one commit for code + one for the corpus change); never push / open a PR / tag without the user's say-so.
**Issue tracker:** none — the work queue is `corpus/todos/` (ready/in-progress specs); finished specs move to `corpus/todos/closed/`, and the older archives live in `corpus/briefs/{engine,game}/{done,superseded}`
**Code host:** GitHub (gh) — github.com/gandolh/game-engine

> **Skill-contract deviations — read before invoking any personal skill.** This corpus predates the
> orchestrate convention, so three of the paths the skills name do not exist here:
>
> | The skill says | Here it is | Applies to |
> |---|---|---|
> | `corpus/briefs/todo/` (the queue) | **`corpus/todos/`** — dated specs, finished ones move to `corpus/todos/closed/` | `orchestrate`, `improve`, `plan-split-dispatch` (backlog mode) |
> | `corpus/briefs/` (writes new work) | **closed archive, do not add files** — historical specs only, in `briefs/{engine,game}/{done,superseded}` | all |
> | `corpus/wiki/index.md` (the catalog) | **`corpus/index.md`** | `improve` step 1 |
>
> `corpus/wiki/status.md` is the single source for spec state. Read `corpus/CLAUDE.md` for the
> spec/wiki/log workflow, the domain-modeling rules, and the source-of-truth ordering.

## Intent routing
| Signal | Intent | Route to |
|--------|--------|----------|
| New idea/task to capture | capture | corpus-flow §1 — a dated spec in `corpus/todos/` |
| Ready to build, ≥3 chunks | build (dispatched) | the spec → plan-split-dispatch (review gate + verify gate below) |
| Ready to build, 1–2 files | build (inline) | implement inline, show diff |
| Research a topic / compare options | research | **gated** — inline web search, propose options, stop for the user's pick |
| "what should we work on" / find the debt / audit the repo | audit | **gated** — `improve`; it must read `corpus/wiki/decisions.md` + `citadel-decisions.md` first, and file promoted findings as specs in **`corpus/todos/`** |
| Name a concept, settle a term, record a locked call | domain | corpus-flow §9 → [wiki/glossary.md](wiki/glossary.md) + [wiki/decisions.md](wiki/decisions.md); `grill-me` if still contested |
| Game art / UI feel (in-canvas, pixel art) | design | **not the web-design skills** — the game UI is `@engine/ui` drawn into WebGL2 under a locked palette. Route to the game's own art page (`citadel-art-style.md`, `citadel-asset-critique.md`) + a real-browser pass |
| The docs site (`docs/`, Starlight HTML) | design | `impeccable` / the taste presets / `web-design-guidelines` — this is the **only** HTML/CSS surface in the repo |
| Docs or prose need a style pass | docs | `writing-guidelines`; `unslop` first if the text was AI-drafted |
| A diagram would beat prose | docs | `diagram-design` |
| Strict maintainability pass on a diff | review (strict) | `thermo-nuclear-review` — deliberate use only; it is very opinionated |
| Diff/PR needs a normal review | review | `/code-review` over the diff |
| Branch ahead, ship intent | PR open | propose git commands (never push/tag without the user's go) |
| "what does the wiki say about X" | query | corpus-flow §5 — `corpus/index.md`, then ≤3 wiki pages |
| Work finished, needs recording | closeout | corpus-flow §4 — move spec → `todos/closed/`, `log.md` entry, fold into wiki |

**Research, audit and new-feature design are terminal deliverables, not a licence to build.**
They end in options for the user to pick from: *survey → propose → **user picks** → write the spec →
build.* Never go from an `improve` audit straight to `plan-split-dispatch`.

## Dispatch gates (plan-split-dispatch)
- **Review gate** after the executor chunks: scoped review finders over the diff, then a bounded fix
  loop — escalate a chunk's model rather than looping a failing agent.
- **Verify gate** between waves and before delivery, run **by the controller** in the current turn:
  `npm run typecheck`, then the scoped `npm run test`, then a determinism check when sim code moved.
  A subagent's "tests pass" is not evidence.
- **Ruling ledger** — one line per decision a future controller would otherwise re-litigate (why a
  chunk split, why a finding was rejected, why a chunk was re-dispatched). Restate it at delivery and
  fold the durable rulings into `corpus/log.md` at closeout.
- **Sim resource limits are real here.** Keep runs small (low `MAX_DAYS`, `TICKS_PER_DAY=20`) and
  **ask before any full determinism check** — see `corpus/wiki/status.md` and the determinism notes.

## Knowledge routing — which layer answers which question

Two graphs, two jobs. The **corpus is the _why_** (design intent, decisions, history) and is
authored + git-reviewed. The **code graph is the _what_** (symbols, callers, imports) and is a
generated, disposable index — never a source of truth. Neither substitutes for the other.

| Question shape | Route to | Why |
|---|---|---|
| "Why is it built this way?" / "what was decided?" | `corpus/wiki/` (start at `index.md`) | Only the corpus knows intent |
| "Who calls X?" / "what breaks if I change X?" / "where does feature Y live?" | the personal `codegraph` skill, against the wiring + envelope in [wiki/code-graph.md](wiki/code-graph.md) | 20–180× cheaper than grep+read fanout — **when the index exists**; it is a gitignored build artifact (`npm run codegraph:init`) |
| **"Did I get _every_ usage?"** (rename, refactor, delete) | **`grep -rnw`** | codegraph is incomplete here — measured 16/42 call-site files for `createRng` |
| Anything about a symbol **more than one game exports** | **`grep`**, scoped by path | codegraph conflates them — `callers bootstrapSim` silently returns Farm's callers only; 36 names collide across the four games |
| "Does `@citadel/*` import `@farm/*`?" (dependency rule) | **`grep`** | It's a correctness invariant; don't ask a heuristic index |
| Determinism / palette / scheduler-order questions | **run the guard test** | `npm run test`; the tests are the authority |

Benchmarked on this repo 2026-07-09, symbol collisions re-derived 2026-08-23 — see
[wiki/code-graph.md](wiki/code-graph.md) for the numbers and the **36** names two or more of the four
games export in common. Lead with the graph to *locate*; verify with grep or a test
before you *act*.

## READ / SKIP / SKILLS
| Task type | READ | SKIP | SKILLS |
|-----------|------|------|--------|
| Citadel gameplay (cozy pivot) | the todo/BUILD-ORDER, corpus/wiki/citadel-overview.md, corpus/wiki/decisions.md, games/citadel/sim-core/src/{systems,world,entities} | Farm-only code (games/farm/*), engine renderer internals | — (visual/feel checks: user drives the browser + shares screenshots; the playtest-citadel skill was removed 2026-07-13) |
| Citadel UI / @engine/ui | the UI todo, games/citadel/client/src/render, engine/core/src/render, corpus/wiki/decisions.md (palette/EDG32) | Farm sim systems, Citadel sim-core balance | frontend-design |
| Engine/core | the todo, engine/core/src/<subsystem>, corpus/wiki/architecture.md | game-specific code | — |
| Farm gameplay | the todo, games/farm/sim-core/src, corpus/wiki/system-ordering.md | other games' code | — |
| Hollow (social-emergence sim) | the todo, corpus/wiki/hollow-overview.md, corpus/todos/2026-07-17-hollow-BUILD-STATE.md, games/hollow/sim-core/src | Farm/Citadel/MateQuest code, 2D renderer internals | — |
| Hollow 3D / render3d | the todo, engine/core/src/render3d, games/hollow/client/src/render3d | every sim-core, the 2D render path | — |
| MateQuest (math roguelike) | the todo, corpus/wiki/mathquest-overview.md, corpus/todos/2026-07-21-mathquest-BUILD-STATE.md, games/mathquest/{sim-core,client}/src | other games' code | — (RO is the default language; MATE_PAL = Resurrect 64) |
| Renderer / @engine/core/render | the todo, engine/core/src/render/webgl2, corpus/wiki/decisions.md (Renderer) | game sim-cores | — (WebGL2 only; GLSL ES 3.00; a glsl-lint test guards each shader dir) |

## Conventions (locked — see corpus/wiki/decisions.md)
- No `.js` import suffixes; pinned versions (no `^`/`~`); TS strict + noUncheckedIndexedAccess + exactOptionalPropertyTypes.
- Fixed palette enforced per game (palette.test guard, per-scope) — every color from a named role constant, never raw hex: engine + Farm = EDG32 (`EDG.*`); Citadel = Apollo-46 (`CITADEL_PAL as EDG`); Hollow = `HOLLOW_PAL`; MateQuest = Resurrect-64 (`MATE_PAL`). See citadel-decisions #28.
- Engine never imports a game; no game imports another game (four of them: farm, citadel, hollow, mathquest).
- Determinism is load-bearing — no `Math.random`/`Date.now` in sim; all randomness via seeded `Rng.fork(label)`.
- `npm run typecheck` + `npm run test` before any commit. Commit completed briefs at closeout (code + corpus as separate commits); never push without the user's go.
