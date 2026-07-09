---
name: codegraph
description: Answer structural questions about this codebase (who calls X, what breaks if I change X, where does feature Y live) from the local CodeGraph symbol index instead of grep+read fanout. Use when you need callers, blast radius, or a first map of an unfamiliar area. Do NOT use it as the authority for "every usage" (rename/refactor completeness) or for any symbol that both games export — see the accuracy envelope below.
---

# CodeGraph — structural queries on this repo

A local tree-sitter + heuristic-resolver index (SQLite, `.codegraph/`, gitignored). It answers
*what the code is*. The [corpus](../../../corpus/index.md) answers *why it is that way*. Neither
substitutes for the other.

**It is not compiler-grade.** It does not type-check and does not do real module resolution.
Everything below was measured on this repo on 2026-07-09 — trust the envelope, not the vendor pitch.

## Setup

```bash
npm i -g @colbymchenry/codegraph@1.3.1   # pinned; single-maintainer package
codegraph init                            # ~895 files → 9.4k nodes / 36k edges
codegraph telemetry off                   # do this; it defaults to on
codegraph status                          # MUST show a native backend, not WASM (5-10x slower)
codegraph sync                            # after any offline change; a file watcher covers live sessions
```

MCP server is registered in [.mcp.json](../../../.mcp.json) (`codegraph serve`), exposing
`codegraph_context` and `codegraph_explore`. The CLI (`callers`, `impact`, `explore`) is the same index.

## Use it for

| Question | Command | Measured |
| --- | --- | --- |
| Who calls this method? | `codegraph callers <sym>` | correct + cheap, **when the name is unique** |
| What breaks if I change this? | `codegraph impact <sym>` | transitive; good for blast radius, overshoots for edit lists |
| Where does feature X live? | `codegraph explore "<query>"` | a starting map, not a full footprint |

It resolves cross-package barrel imports correctly: `effectiveOutputPerCycle` is defined in
`@citadel/sim-core/entities/building.ts`, re-exported via that package's `index.ts`, and consumed in
`@citadel/client/ui/building-info.ts` — codegraph finds that consumer. Pure tree-sitter tools do not.

## Do NOT use it for — verified failure modes

**1. Symbols both games export.** codegraph collapses same-named symbols across `@farm/*` and
`@citadel/*` and returns callers of only one of them. `codegraph callers bootstrapSim` returns Farm's
callers and **silently omits Citadel's four call sites**. The 18 ambiguous names:

```
DayClockSystem  InspectPanel  LIGHT_EMITTERS  PixelRecipe  RenderSnapshot  SWATCH  Season
SendFn  WORLD_HEIGHT  WORLD_WIDTH  WorkerInbound  WorkerOutbound  bootstrapSim  colorOf
createInspectPanel  isWalkable  screenToTile  screenToWorld
```

For any of these, scope the query by path or use `grep`. Re-derive the list after adding exports:

```bash
grep -rhoE "^export (function|class|const|interface|type) [A-Za-z0-9_]+" games/farm --include=*.ts | awk '{print $3}' | sort -u > /tmp/f
grep -rhoE "^export (function|class|const|interface|type) [A-Za-z0-9_]+" games/citadel --include=*.ts | awk '{print $3}' | sort -u > /tmp/c
comm -12 /tmp/f /tmp/c
```

**2. Rename / refactor completeness.** `callers createRng` returned 16 of the 42 files that actually
call it (38%) — including a miss on `games/farm/sim-core/src/sim-bootstrap.ts:183`, a production call
site. When the question is *"did I get every usage?"*, **use `grep -rnw`**. A cheap wrong answer is
worse than no answer.

**3. Enforcing the dependency rule.** "Does `@citadel/*` import `@farm/*`?" is a correctness
invariant. Answer it with `grep`, not a heuristic index.

**4. Anything a test can answer.** Determinism, palette compliance, and scheduler ordering have real
guard tests. Run them.

## Working rule

Lead with the graph to *locate* and to *scope*; verify with `grep` or a test before you *act* on
completeness. Cite `file:line` from the graph, then confirm the line by reading it — the index can lag
the working tree between syncs.
