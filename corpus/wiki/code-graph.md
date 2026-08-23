---
summary: The CodeGraph symbol index as this repo's code-understanding layer — how it is wired (MCP, shared index, no watcher), the two-layer why/what model against the corpus, and the measured accuracy envelope, including the 36 symbol names four games export in common.
updated: 2026-08-23
---

# Code graph — the *what* layer

Adopted 2026-07-09. [`@colbymchenry/codegraph@1.3.1`](https://colbymchenry.github.io/codegraph/)
parses the repo with tree-sitter into a local SQLite symbol graph and serves it over MCP
([.mcp.json](../../.mcp.json)) plus a CLI. The index lives in `.codegraph/` (gitignored).
**This page is the operating contract** — the repo-specific envelope below plus the wiring under
*Setup*. The generic method (graph-first to locate, grep to verify) is the personal `codegraph`
skill's; the per-repo accuracy numbers are here, because they cannot be inherited from another repo.

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

## Setup and wiring

```bash
npm i -g @colbymchenry/codegraph@1.3.1   # pinned; single-maintainer package
npm run codegraph:init                   # init + telemetry off + status
npm run codegraph:sync                   # after any offline change — the watcher is OFF here
```

**The index is a local build artifact and is not in the repo** (`.codegraph/` is gitignored). If a
query reports "no default project", the index does not exist on this machine — run
`npm run codegraph:init`. This is the layer's normal failure mode and it is **silent**: nothing
errors, the structural questions just fall back to grep+read fanout at 20–180× the tokens. It was in
exactly that state on 2026-08-23.

[.mcp.json](../../.mcp.json) registers `codegraph serve --mcp --no-watch --path ${CODEGRAPH_INDEX_PATH:-.}`.
Two deliberate details:

- **`--no-watch`** — this repo is worked on under WSL2, where the file watcher is expensive and
  unreliable on `/mnt` paths. Sync explicitly instead.
- **`${CODEGRAPH_INDEX_PATH:-.}`** — the default resolves to whatever checkout the server starts in.
  **In a worktree, export the main checkout's absolute path** so every tree shares one index rather
  than re-indexing a throwaway tree:
  `export CODEGRAPH_INDEX_PATH=/home/gandolh/projects/game-engine`.

`codegraph status` must report a **native** backend; the WASM fallback is 5–10× slower.

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

## Measured accuracy envelope (this repo)

Measured 2026-07-09 unless noted. The index then: 895 files → 9,384 nodes / 35,992 edges, ~30 s cold,
28.7 MB — for a two-game tree, so expect a bigger one now that Hollow and MateQuest exist.

**✅ Cross-package barrel imports resolve.** `effectiveOutputPerCycle` is defined in
`@citadel/sim-core/entities/building.ts`, re-exported through that package's `index.ts`, and consumed
in `@citadel/client/ui/building-info.ts`. codegraph finds the consumer. Pure tree-sitter tools return
zero for this shape — this is the specific reason to prefer it over Graphify/CRG.

**❌ It conflates same-named symbols across games.** This is the important one, because "the games
mirror each other on one engine" is the repo's defining structure. `codegraph callers bootstrapSim`
returns **only Farm's callers**; Citadel's four call sites (`games/citadel/server/src/sim-host.ts` and
three `games/citadel/client/src/worker/*.ts`) silently vanish, as do Hollow's and MateQuest's. An
agent reading that output would conclude the other three games never call `bootstrapSim`.

**36 names are exported by two or more of the four games** (re-derived 2026-08-23; it was 18 when
only Farm and Citadel existed — the hazard grows with every game). Unsafe to query by bare name:

```
APOLLO  APOLLO_SET  ApolloColor  AudioPlayer  DayClockSystem  DayPhase  GIFT_TRUST_DELTA
InspectPanel  InterpPos  Inventory  LIGHT_EMITTERS  PanelId  PanelPrefs  PixelRecipe
RenderSnapshot  RunDescriptor  SWATCH  Season  SendFn  ShockKind  Skills  WORLD_HEIGHT
WORLD_WIDTH  WorkerInbound  WorkerInitMessage  WorkerOutbound  bootstrapSim  colorOf
createInspectPanel  createPanelPrefs  isWalkable  nearestApollo  personalityRegistry
registerPersonality  screenToTile  screenToWorld
```

For any of these, scope the query by path or use `grep`. Re-derive after adding exports:

```bash
for g in farm citadel hollow mathquest; do
  grep -rhoE "^export (function|class|const|interface|type) [A-Za-z0-9_]+" games/$g --include=*.ts \
    | awk '{print $3}' | sort -u > /tmp/exp-$g
done
cat /tmp/exp-* | sort | uniq -d
```

**❌ Incomplete on "every usage".** Measured 2026-07-09, not re-run since: `codegraph callers createRng`
returned **16 of the 42 files that actually call it** (38%), missing `games/farm/sim-core/src/sim-bootstrap.ts:183` — a production call
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
edges*. Both reproduced here. **The cross-game symbol collision is specific to this repo** and did
not appear in that prior work — which is exactly why the envelope above must be re-measured per
repo rather than inherited, and re-derived here whenever a game is added.

The envelope used to live in a `.claude/skills/codegraph/` project skill as well; that duplicate was
removed on 2026-08-23 once the personal `codegraph` skill carried the method, leaving this page as the
single home for the numbers.
