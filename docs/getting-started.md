# Getting started

Everything the main README shortens: prerequisites, running each game, the checks, the headless sims and where the code lives. Run every command from the repo root.

## Prerequisites

- Node 24 or later. The root `package.json` pins it in `engines`, and it matches the `node:24-alpine` image the Farm Valley sim server ships in.
- npm (the repo declares `npm@11.4.2`).
- Docker only if you want to build the sim server image in [infrastructure/](../infrastructure/README.md).

## Install

```bash
npm install
```

The compiled WASM kernels are committed in two places, `engine/wasm-modules/dist/` and `games/farm/client/public/wasm/`, so a fresh clone needs no WASM build. Run `npm run build-wasm` only after changing the AssemblyScript sources in `engine/wasm-modules/`, and commit the artifacts in both places. `npm run test -w @engine/wasm-modules` fails if a source changed without a rebuild.

## Run a game

| Command | What starts | Open |
|---|---|---|
| `npm run dev` | Farm Valley: the Node sim server on port 8787 and the Vite client, which proxies `/sim` to it | <http://localhost:5173> |
| `npm run server` | Only the Farm Valley sim server (WebSocket, port 8787) | |
| `npm run citadel` | Citadel: its sim server on port 8788 and the client | <http://localhost:5174> |
| `npm run hollow` | Hollow's client. The sim runs in a Web Worker, so there is no server | <http://localhost:5175> |
| `npm run mathquest` | MateQuest's client, also Worker-only | <http://localhost:5176> |

Notes per game:

- **Farm Valley.** Click Start or press Enter on the home screen; the seed field sets the run. WASD or the arrow keys move Pip, E acts, Space recentres on Pip, and Tab opens the leaderboard. The sim always runs in the server, so the client shows nothing useful without it.
- **Citadel.** Solo play runs in a Web Worker and needs no server. `?cozy` or `?challenge` in the URL skips the ruleset picker. `?mp` drives the sim through the server instead, but multiplayer is deprecated; read [citadel-mp-deprecated.md](../corpus/wiki/citadel-mp-deprecated.md) before touching it.
- **Hollow.** The founding screen sets the seed, the founders and the resource density. Hollow also builds as an ImbatranimOS app: `npm run build:os -w @hollow/client` writes `dist/os/hollow.mjs`, and `npm run build:os-app -w @hollow/client` refreshes the committed copy in [games/hollow/os-app](../games/hollow/os-app/README.md).
- **MateQuest.** The UI starts in Romanian; the RO | EN switch is in the map's bottom-right corner. Switching language restarts the run, by design.

### On other ports

`scripts/dev.mjs` passes no port options, and the Vite configs set the ports above without `strictPort`, so a busy port makes Vite take the next one. To pick ports yourself, start the pieces by workspace. Extra arguments need the second `--` of the workspace form; `npm run mathquest -- --port 5311` does not set the port.

```bash
PORT=5312 npm run server
SIM_SERVER_URL=ws://localhost:5312 npm run dev -w @farm/client -- --port 5313 --strictPort
npm run dev -w @mathquest/client -- --port 5311 --strictPort
```

### Environment variables

| Variable | Default | Used by |
|---|---|---|
| `PORT` | `8787` (Farm), `8788` (Citadel) | The two sim servers |
| `SIM_SERVER_URL` | `ws://localhost:8787` | Farm client's dev proxy target for `/sim` |
| `FARM_VALLEY_BASE`, `CITADEL_BASE`, `HOLLOW_BASE`, `MATHQUEST_BASE` | `/` | Base path for each client's production build |
| `DOCS_BASE` | `/game-engine/docs/` | Base path for the docs site build |

## Check it

```bash
npm run typecheck    # tsc --noEmit across all workspaces
npm run test         # vitest across all workspaces, one at a time
npm run gates        # the full sequence, see below
npm run pack-smoke   # pack the three @engine/* libraries and install them into examples/library-consumer
```

One workspace, one file or one test:

```bash
npm run test -w @engine/core
npm run test -w @farm/sim-core -- src/systems/economy/market.test.ts
npm run test -w @farm/sim-core -- -t "name of test"
```

There is no hosted CI. `npm run gates` ([scripts/gates.mjs](../scripts/gates.mjs)) is the gate sequence: typecheck, test, the Farm client build, four startup smokes (`sim`, `sim:citadel`, `sim:hollow`, `preview`) and `pack-smoke`. It keeps going after a failure and exits non-zero with the list. The smokes matter most: typecheck and the tests both stayed green through a `.glsl` import break that threw on every real entry point. Nothing runs the gates for you.

A workspace with no `test` script is skipped by `npm run test` without a warning. `@tool/world-preview` is the one deliberately left without tests.

## Headless sims and tools

| Command | What it does |
|---|---|
| `npm run sim` | Deterministic Farm Valley run in the terminal, ending with a standings table |
| `npm run sim:citadel` | Headless Citadel run |
| `npm run sim:hollow` | Headless Hollow run, with metrics and chronicle export |
| `npm run preview` | Renders the Farm world to `world-preview.png` at the repo root (gitignored) |
| `npm run atlas` | Rebuilds the Farm sprite atlas from the pixel recipes |
| `npm run build-wasm` | Rebuilds the WASM kernels |

Settings are environment variables on the command:

- `npm run sim`: `SEED`, `WORLD_SEED`, `TICKS_PER_DAY` (default 1200), `MAX_DAYS` (default 100), `EXPORT=csv` or `EXPORT=json` with `EXPORT_FILE`, and `CHECK_DETERMINISM=1`, which runs the seed twice (or every seed in `SEEDS=1,2,3`) and compares the results byte for byte.
- `npm run sim:citadel`: `SEED` (hex), `TICKS_PER_DAY` (default 20), `MAX_DAYS` (default 40), `SCENARIO=grow` or `SCENARIO=sack`.
- `npm run sim:hollow` takes `MAX_YEARS` for run length, not `MAX_DAYS`. Passing `MAX_DAYS` is silently ignored and you get a full-length run. Its other settings are listed in [tools/hollow-sim/src/env.ts](../tools/hollow-sim/src/env.ts).

A quick smoke, the same budget the gates use:

```bash
MAX_DAYS=1 TICKS_PER_DAY=20 npm run sim
```

## Build

```bash
npm run build                         # Farm Valley client → games/farm/client/dist
npm run build -w @citadel/client      # likewise for @hollow/client and @mathquest/client
npm run docs                          # docs site → docs/dist (see docs/README.md)
```

`npm run build-engine` and `npm run build-ui` build `dist/` for `@engine/core` and `@engine/ui`. In-repo work does not need them; the packages are read from TypeScript source.

## Where the code lives

npm workspaces, grouped by dependency direction:

```
engine/
  core            @engine/core          generic ECS engine (subpath exports: /ecs /render /sim /runtime /input …)
  ui              @engine/ui            shared in-canvas UI toolkit (Farm, Citadel, MateQuest)
  wasm-modules    @engine/wasm-modules  AssemblyScript kernels (pathfinder, noise, rng, floodfill)
games/
  farm/           sim-core · client · server · atlas-recipes
  citadel/        sim-core · client · server
  hollow/         sim-core · client · os-app (built ImbatranimOS app)
  mathquest/      sim-core · client
tools/
  run-sim         headless deterministic Farm sim (no browser, no server)
  citadel-sim     headless Citadel sim
  hollow-sim      headless Hollow sim (+ metrics / chronicle export)
  world-preview   renders the Farm world/atlas to a PNG
  atlas-builder   builds the sprite atlas from pixel recipes
```

The dependency rule: `@engine/wasm-modules` → `@engine/core` → the four `sim-core` packages → their clients and servers. Nothing points back up, and no game imports another. [engine/core/src/layering.test.ts](../engine/core/src/layering.test.ts) enforces it.

Places to start reading in Farm Valley:

- [main.ts](../games/farm/client/src/main.ts): boot, home screen to game, the render loop
- [net/sim-client/](../games/farm/client/src/net/sim-client/): the WebSocket client that receives and interpolates snapshots
- [agents/](../games/farm/sim-core/src/agents/): one file per farmer personality
- [systems/](../games/farm/sim-core/src/systems/): the ECS systems that run each tick
- [sim-bootstrap.ts](../games/farm/sim-core/src/sim-bootstrap.ts): the system order, with the reasons inline

The rules every change follows (pinned versions, no `.js` import suffixes, strict TypeScript, palette per game, WebGL2 only) are in [CLAUDE.md](../CLAUDE.md) and [corpus/wiki/decisions.md](../corpus/wiki/decisions.md).
