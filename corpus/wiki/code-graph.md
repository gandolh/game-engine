---
summary: The CodeGraph symbol index as this repo's code-understanding layer — what it is, the two-layer (why/what) model against the corpus, and the measured accuracy envelope including the two-game symbol-collision failure.
updated: 2026-07-09
---

# Code graph — the *what* layer

Adopted 2026-07-09. [`@colbymchenry/codegraph@1.3.1`](https://colbymchenry.github.io/codegraph/)
parses the repo with tree-sitter into a local SQLite symbol graph and serves it over MCP
([.mcp.json](../../.mcp.json)) plus a CLI. The index lives in `.codegraph/` (gitignored).
Operating rules for an agent live in the [`codegraph` project skill](../../.claude/skills/codegraph/SKILL.md).

## Two layers, two jobs

|  | **Corpus** (this wiki) | **Code graph** |
|---|---|---|
| Answers | *Why* it is built this way | *What* the code is |
| Nodes | Decisions, briefs, design intent | Functions, classes, files, imports |
| Built by | Humans + LLM, in prose | tree-sitter, automatically |
| Source of truth | **Yes** | **No** — generated, disposable, regenerate with `codegraph init` |

The code graph cannot derive "EncounterSystem must run before PerceiveSystem" or "EDG32 is enforced
by a guard test" from an AST. The corpus cannot tell you who calls `effectiveOutputPerCycle`. Keep
the layers separate; do not let the graph's output leak into the wiki as fact.

## What it is (and is not)

**tree-sitter + a heuristic resolver.** It does *not* type-check and does *not* do real TypeScript
module resolution. It is not the TS Compiler API. Treat it as a *smarter grep*, not a compiler.

The engine taxonomy, for the record: pure tree-sitter (Graphify, code-review-graph) → tree-sitter +
heuristics (**codegraph**) → LSP (Serena) → TS Compiler API (`ts-morph`) / SCIP. Accuracy rises
left-to-right; setup cost and dependencies rise with it. codegraph was chosen because it is the only
option that is node-native, turnkey (`npx` + auto-registered MCP), zero-Python, auto-syncing, and
local-only — and because the accuracy gap, on the queries we actually run, is bounded and known.

Pin the version. It is MIT but ~single-maintainer; that is a supply-chain surface even offline.
Run `codegraph telemetry off` (it defaults on; anonymous, no code or paths, but off is off).
Confirm `codegraph status` reports a native backend — the WASM fallback is 5–10× slower.

## Measured accuracy envelope (2026-07-09, this repo)

Index: 895 files → 9,384 nodes / 35,992 edges, ~30 s cold, 28.7 MB.

**✅ Cross-package barrel imports resolve.** `effectiveOutputPerCycle` is defined in
`@citadel/sim-core/entities/building.ts`, re-exported through that package's `index.ts`, and consumed
in `@citadel/client/ui/building-info.ts`. codegraph finds the consumer. Pure tree-sitter tools return
zero for this shape — this is the specific reason to prefer it over Graphify/CRG.

**❌ It conflates same-named symbols across the two games.** This is the important one, because
"Farm and Citadel mirror each other" is the repo's defining structure. `codegraph callers bootstrapSim`
returns **only Farm's callers**; Citadel's four call sites (`games/citadel/server/src/sim-host.ts` and
three `games/citadel/client/src/worker/*.ts`) silently vanish. An agent reading that output would
conclude Citadel never calls `bootstrapSim`.

The 18 names exported by **both** games, and therefore unsafe to query by bare name:

```
DayClockSystem  InspectPanel  LIGHT_EMITTERS  PixelRecipe  RenderSnapshot  SWATCH  Season
SendFn  WORLD_HEIGHT  WORLD_WIDTH  WorkerInbound  WorkerOutbound  bootstrapSim  colorOf
createInspectPanel  isWalkable  screenToTile  screenToWorld
```

Re-derive after adding exports:

```bash
grep -rhoE "^export (function|class|const|interface|type) [A-Za-z0-9_]+" games/farm --include=*.ts | awk '{print $3}' | sort -u > /tmp/f
grep -rhoE "^export (function|class|const|interface|type) [A-Za-z0-9_]+" games/citadel --include=*.ts | awk '{print $3}' | sort -u > /tmp/c
comm -12 /tmp/f /tmp/c
```

**❌ Incomplete on "every usage".** `codegraph callers createRng` returned **16 of the 42 files that
actually call it** (38%), missing `games/farm/sim-core/src/sim-bootstrap.ts:183` — a production call
site, not a test. For rename/refactor completeness use `grep -rnw`. A cheap wrong answer is worse
than no answer.

## Working rule

Lead with the graph to **locate** and **scope**. Verify with `grep` or a guard test before you **act**
on completeness. Cite `file:line` from the graph, then read the line — the index can lag the working
tree between `codegraph sync` runs.

Never use it to check the dependency rule (`@citadel/*` must not import `@farm/*`) — that is a
correctness invariant and deserves `grep`, not a heuristic.

## Provenance

Prior art: a benchmark of Graphify, code-review-graph, codegraph, Serena, and the TS Compiler API
against ground truth on another TypeScript monorepo established two corrections to the vendor
claims — *codegraph is not compiler-grade* and *pure tree-sitter silently drops cross-package
edges*. Both reproduced here. **The two-game symbol collision is specific to this repo** and did
not appear in that prior work — which is exactly why the envelope above must be re-measured per
repo rather than inherited.
