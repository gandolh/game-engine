# MateQuest — M0: workspace scaffold (brief)

status: ready
milestone: M0 (see corpus/todos/2026-07-21-mathquest-BUILD-STATE.md)
design-of-record: corpus/wiki/mathquest-overview.md

**Goal:** MateQuest exists as a fourth game in the monorepo — two workspaces that typecheck, a
Resurrect-64 palette enforced by the per-scope guard, and a Vite client that boots to a canvas
driven by a deterministic Web-Worker sim. **No gameplay yet** — this is pure scaffolding that mirrors
Hollow's Web-Worker solo pattern.

**Template to copy from:** `games/hollow/{client,sim-core}` (leanest Web-Worker game). Read those
package.json / tsconfig / vite.config / vitest.config / worker files and mirror them. Palette
integration mirrors `games/hollow/client/src/render/hollow-palette.ts` + its `.test.ts`, and the
per-scope block in `engine/core/src/render/palette.test.ts`.

## Conventions (MUST follow — repo-locked)
- No `.js` import suffixes. Pinned versions (no `^`/`~`) — copy exact versions from Hollow's package.json.
- TS strict + noUncheckedIndexedAccess + exactOptionalPropertyTypes (inherited from tsconfig.base.json).
- **Determinism:** no `Math.random`/`Date.now` in sim; all randomness via `Rng` from `@engine/core/runtime`.
- **Palette:** every color literal in `games/mathquest/` MUST be a Resurrect-64 hex; use `MATE_PAL.*`.
- Layering: `@mathquest/*` imports `@engine/*` only; never Farm/Citadel/Hollow. Engine names no game.

## Files to create

### 1. `games/mathquest/sim-core/` (`@mathquest/sim-core`)
- `package.json`: name `@mathquest/sim-core`, version `0.0.0`, private, type module, `main`/`types`
  → `./src/index.ts`, `exports` `{".":"./src/index.ts","./sim-bootstrap":"./src/sim-bootstrap.ts"}`,
  scripts `{typecheck:"tsc --noEmit", test:"vitest run"}`, deps `{"@engine/core":"0.1.0"}`,
  devDeps copied from Hollow sim-core (`@types/node`, `@types/jsdom`, `@webgpu/types`, `jsdom` — same pins).
- `tsconfig.json`: copy Hollow sim-core's verbatim.
- `src/index.ts`: re-export from `./sim-bootstrap`.
- `src/sim-bootstrap.ts`: a minimal, transport-agnostic `bootstrapMathquestSim({ seed })` that creates
  an ECS `world` (`@engine/core/ecs`) + a `Scheduler` (`@engine/core/sim` — check the exact API the
  other games use) + a seeded `Rng` (`createRng`/`Rng` from `@engine/core/runtime`), registers ONE
  trivial placeholder system that increments a tick counter, and returns `{ world, scheduler, step() }`
  (match the shape Hollow/Citadel bootstrap return so the worker can drive it). Keep it tiny; this is a
  skeleton the M1 combat loop will replace.
- `src/sim-bootstrap.test.ts`: a determinism smoke test — two `bootstrapMathquestSim({seed:1})`
  instances stepped N ticks produce identical tick counters (proves the seed seam is wired).

### 2. `games/mathquest/client/` (`@mathquest/client`)
- `package.json`: name `@mathquest/client`, copy Hollow client's scripts
  `{dev:"vite", build:"vite build", preview:"vite preview", typecheck:"tsc --noEmit", test:"vitest run"}`,
  deps `{"@engine/core":"0.1.0","@engine/ui":<same version @engine/ui uses>,"@mathquest/sim-core":"0.0.0"}`
  (check whether Hollow depends on @engine/ui; add it — MateQuest is UI-heavy), devDeps copied from Hollow client.
- `tsconfig.json`, `vitest.config.ts`: copy Hollow client's verbatim.
- `vite.config.ts`: copy Hollow's; set `port: 5176` (Farm 5173, Citadel 5174, Hollow 5175, MateQuest 5176);
  `base = process.env.MATHQUEST_BASE ?? "/"`.
- `index.html`: minimal, a `<canvas>` + `<script type="module" src="/src/main.ts">`.
- `src/vite-env.d.ts`: copy Hollow's.
- `src/style.css`: minimal reset (copy Hollow's or a tiny reset).
- `src/main.ts`: boot — create the worker, receive tick snapshots, draw a placeholder frame to the
  canvas that renders the title "MateQuest / Cetatea Cifrelor" using `@engine/ui` text with a
  `MATE_PAL.*` color, and shows the live tick count (proves worker↔main↔render wiring). Keep minimal.
- `src/worker/sim-worker.ts`: import `bootstrapMathquestSim` from `@mathquest/sim-core`, run a
  `setInterval` pacing loop (wall-clock pacing ONLY — a tick's output depends solely on tick count),
  `postMessage` a tiny snapshot `{tick}` each tick. Mirror Hollow's `src/worker/sim-worker.ts` shape.
- `src/render/mate-palette.ts`: **the palette module** (see spec below).
- `src/render/mate-palette.test.ts`: colocated integrity test (see spec below).

### 3. Palette wiring
`src/render/mate-palette.ts` — mirror `games/hollow/client/src/render/hollow-palette.ts`:
- Export `RESURRECT64` as a `readonly` array of the 64 lowercase 6-digit hexes (list below), plus
  `RESURRECT64_SET`, `type Resurrect64Color`, and `nearestResurrect64(hex)` (copy the `nearestApollo`
  shape, using `rgbOf` from `@engine/core/render`).
- Export `MATE_PAL` mapping the **same 32 role names as `EDG`** to the Resurrect-64 values in the
  table below (so downstream code does `import { MATE_PAL as EDG } from ".../mate-palette"`).
  `satisfies Record<string, Resurrect64Color>`.

`RESURRECT64` (64 colors, in this order):
```
#2e222f,#3e3546,#625565,#966c6c,#ab947a,#694f62,#7f708a,#9babb2,#c7dcd0,#ffffff,
#6e2727,#b33831,#ea4f36,#f57d4a,#ae2334,#e83b3b,#fb6b1d,#f79617,#f9c22b,#7a3045,
#9e4539,#cd683d,#e6904e,#fbb954,#4c3e24,#676633,#a2a947,#d5e04b,#fbff86,#165a4c,
#239063,#1ebc73,#91db69,#cddf6c,#313638,#374e4a,#547e64,#92a984,#b2ba90,#0b5e65,
#0b8a8f,#0eaf9b,#30e1b9,#8ff8e2,#323353,#484a77,#4d65b4,#4d9be6,#8fd3ff,#45293f,
#6b3e75,#905ea9,#a884f3,#eaaded,#753c54,#a24b6f,#cf657f,#ed8099,#831c5d,#c32454,
#f04f78,#f68181,#fca790,#fdcbb0
```

`MATE_PAL` role → Resurrect-64 value (use verbatim — hand-tuned for hue fidelity; do NOT recompute):
```
rust:#b33831  clay:#cd683d  cream:#fdcbb0  tan:#e6904e  wood:#9e4539  woodDark:#6e2727
bark:#45293f  crimson:#ae2334  red:#e83b3b  orange:#fb6b1d  gold:#f9c22b  yellow:#fbff86
green:#91db69  greenMid:#239063  greenDark:#165a4c  teal:#0b5e65  blue:#4d65b4  skyBlue:#4d9be6
cyan:#30e1b9  white:#ffffff  silver:#c7dcd0  steel:#9babb2  slate:#7f708a  navy:#323353
ink:#3e3546  black:#2e222f  hotPink:#f04f78  plum:#6b3e75  mauve:#a24b6f  salmon:#f68181
skin:#fca790  skinMid:#ab947a
```

`src/render/mate-palette.test.ts` — mirror `hollow-palette.test.ts`:
- `RESURRECT64` has exactly 64 unique colors.
- Every `MATE_PAL` value ∈ `RESURRECT64_SET`.
- `MATE_PAL` keys deep-equal the `EDG` keys imported from `@engine/core/render` (so roles never drift).
- `nearestResurrect64` behaves (identity on a member; nearest on an off-by-one).

`engine/core/src/render/palette.test.ts` — extend the existing per-scope guard (this is the ONE
engine edit): add an inlined `RESURRECT64` scan list (same 64 hexes) + `RESURRECT64_SET` +
`nearestResurrect64`; add a `"mathquest"` scope to `scopeOf` (`rel.startsWith("games/mathquest/")`);
wire `usesResurrect`/`palName`/`allowed`/`nearest` so `games/mathquest/` validates against Resurrect-64.
Add a small describe block asserting the inlined list has 64 unique colors. Follow EXACTLY how the
`"hollow"` scope was added (it's the precedent). Do not touch EDG32 or Apollo behavior.

### 4. Root wiring
- `package.json` (root): add script `"mathquest": "npm run dev -w @mathquest/client"`.
- Do NOT edit `scripts/dev.mjs` (that's for the socket-server games; MateQuest is Worker-only like
  Hollow, which also just runs `npm run dev -w @hollow/client`).
- Check `turbo.json` — new workspaces are auto-picked-up by `turbo run test/typecheck`; only touch it
  if Hollow required a per-package entry (it likely doesn't).

## Acceptance / verify (controller runs these)
1. `npm install` succeeds (new workspaces linked).
2. `npm run typecheck` — whole workspace green.
3. `npm run test -w @mathquest/sim-core` and `-w @mathquest/client` green (determinism smoke +
   palette integrity).
4. `npm run test -w @engine/core -- src/render/palette.test.ts` green (mathquest scope active, no
   regressions to EDG32/Apollo scopes).
5. `npm run mathquest` boots Vite on :5176 and the page renders the title + a live-incrementing tick
   from the worker. (User verifies the browser visual — report the command + what to expect.)

## Out of scope (later milestones)
Combat, problems, map, progression, loot, art, i18n. M0 is skeleton + palette + boot only.
