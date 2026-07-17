# @engine/core

A small, **deterministic** simulation engine for watch-it-play and settlement-style
2D games. It gives you an in-house ECS, a fixed-order tick scheduler, a seeded RNG,
a FIPA-ACL-flavored message bus, a pixel-art 2D renderer (WebGPU with a Canvas2D
fallback), and a WASM kernel loader. It runs the same way in a browser, in a Node
server, and headless in a test — the sim is always off the render path behind a
snapshot stream.

Two reference games consume it in this repo (a farming-life sim and a settlement/RTS
sim); the engine itself never imports either. It is written as raw, strict TypeScript
(`strict` + `noUncheckedIndexedAccess` + `exactOptionalPropertyTypes`) with no `any`.

> **License:** MIT. **Status:** not yet published to npm — the `@engine/*` names are
> placeholders until a publish rename. Consume it from a tarball or a workspace, not
> a registry.

## What "deterministic" buys you

A tick's output depends **only on the tick count and the seed** — never on wall-clock
time, never on `Math.random()`. The host's `setInterval`/`requestAnimationFrame` is
**pacing only**: it decides *when* the next tick runs, never *what* it produces. Two
runs of the same seed produce byte-identical state. This is what makes replays,
headless regression baselines, and server-authoritative multiplayer possible.

The rule the whole engine is built around: **never call `Math.random()` or `Date.now()`
in sim code.** All randomness flows through the seeded `Rng` (below).

## Install / import

```ts
import { World, Scheduler, createRng, MessageBus } from "@engine/core";
```

Everything is also reachable through focused subpath entry points, so you can pull in
just the ECS or just the renderer without dragging in the rest:

| Subpath | What it exports |
| --- | --- |
| `@engine/core/ecs` | `World`, `Query`, the default `EngineEntity` shape, and the BDI component types (`Transform`, `Sprite`, `FsmState`, `Beliefs`, `Desires`, `Intention(s)`, `Personality`, `AgentInbox`, `AgentMessage`). |
| `@engine/core/sim` | `Scheduler` + `System`/`SimContext`, the `MessageBus`, and the game-agnostic `RunReport` types (`capReportEvents`, `RUN_REPORT_EVENT_CAP`). |
| `@engine/core/runtime` | The seeded RNG: `createRng`, `restoreRng`, and the `Rng`/`RngState` types. |
| `@engine/core/render` | 2D renderer (`createRenderer`, `Canvas2dRenderer`, `RendererLike`), `Camera2D`, `ParticleSystem`, `RainField`, the `UIQuad` screen-space primitive, and the **EDG32 palette** (`EDG`, `EDG32`, `isEdg32`, `nearestEdg32`). |
| `@engine/core/wasm` | WASM loader (`loadWasmModule`, `fetchWasmModule`) + heap, and the two kernel wrappers `Pathfinder` and `NoiseGenerator` (each with `…FromBytes` / `…FromUrl` factories). |
| `@engine/core/input` | `Keyboard` — a pull-model key-state tracker. |
| `@engine/core/audio` | `AudioEngine` — a thin WebAudio wrapper with `SoundSpec`/`PlayOptions`. *(Reachable via the subpath only; not re-exported from the root barrel.)* |
| `@engine/core/animation` | `AnimationClip` (keyframe sampling + frame events) and easing functions. |
| `@engine/core/commands` | `CommandQueue` + `CommandSystem` — a deterministic per-tick command-dispatch seam. |
| `@engine/core/placement` | `OccupancyGrid`, `checkPlacement`, `rebuildWalkable` — footprint placement + walkability for grid worlds. |
| `@engine/core/assets` | Sprite-atlas format + loaders (`loadAtlasImage`, `loadAllAtlasSheets`, `AtlasManifest`). |
| `@engine/core/debug` | `DebugOverlay` + `Profiler` (dev-only HUD and metric aggregation). |

The root `@engine/core` re-exports every subpath **except `/audio`** (import audio from
its subpath).

## Core concepts

### ECS — `World`, `Query`, safe mid-iteration despawn

The ECS ([`ecs/world.ts`](src/ecs/world.ts)) is in-house — entities are plain objects,
components are named properties. `world.query(...keys)` returns a **live, cached** query
keyed by its sorted component set: the same key returns the same `Query`, and it stays
up to date as components are added/removed and entities spawn/despawn.

```ts
import { World } from "@engine/core/ecs";

interface Mob { pos: { x: number; y: number }; hp?: number }

const world = new World<Mob>();
world.spawn({ pos: { x: 0, y: 0 }, hp: 3 });
world.spawn({ pos: { x: 1, y: 0 } });        // no hp — won't match the query below

for (const e of world.query("pos", "hp")) {   // e is typed With<Mob,"pos"|"hp">
  e.hp! -= 1;
  if (e.hp! <= 0) world.despawn(e);            // safe: iteration snapshots at loop start
}
```

Iterating a `Query` takes a pooled private copy of its member list, so **despawning (or
mutating membership) mid-loop is safe** — you always finish iterating the set as it was
when the loop began. Steady-state iteration allocates no array.

### Scheduler & the tick model

The `Scheduler` ([`sim/scheduler.ts`](src/sim/scheduler.ts)) runs an ordered list of
`System`s once per `tick(ctx)`. A `System` is just `{ name, run(ctx) }`; `SimContext` is
`{ tick }`. **Order is load-bearing** — systems encode real data dependencies (e.g. a
perceive step that clears inboxes must run after anything that reads them), so register
them deliberately and read before reordering.

```ts
import { Scheduler, type System, type SimContext } from "@engine/core/sim";

const movement: System = { name: "movement", run: ({ tick }: SimContext) => { /* … */ } };

const sched = new Scheduler().stage("update").add(movement);
for (let tick = 0; tick < 1200; tick++) sched.tick({ tick });
```

Because a tick reads only `ctx.tick` (and sim state derived from prior ticks), the loop
above produces identical results whether driven by a game loop, a WebSocket host, or a
`for` loop in a test.

### Seeded RNG with named `fork(label)`

`createRng(seed)` returns a mulberry32 `Rng` ([`runtime/rng.ts`](src/runtime/rng.ts)).
Derive independent streams with `fork(label)` — the child stream is a pure function of
the parent's next draw and the label string, so two subsystems that fork with different
labels never correlate, and the whole tree is reproducible from one root seed.

```ts
import { createRng, restoreRng } from "@engine/core/runtime";

const rng = createRng(1234);
const weather = rng.fork("weather");   // independent, reproducible sub-stream
weather.nextFloat();                   // [0,1)
weather.int(0, 6);                     // integer in [0,6)
weather.pick(["rain", "sun", "fog"]);

const saved = rng.snapshot();          // { seed, state }
const resumed = restoreRng(saved);     // exact continuation
```

`Rng` also has `nextU32()`, `range(min,max)`, and `snapshot()`/`restoreRng()` for
save-state. **Do not** reach for `Math.random()` — it defeats every guarantee above.

### Message bus (FIPA-ACL-flavored)

`MessageBus` ([`sim/message-bus.ts`](src/sim/message-bus.ts)) is generic pub/sub with a
`performative` + `ontology` + body envelope. The delivery model has three deliberate
phases so message visibility is deterministic within a tick:

1. **`send(msg, tickIssued)`** queues a message *inflight* (not yet visible).
2. **`flush()`** — called once inside the tick — swaps inflight → deliverable, so every
   system in that tick sees the same frozen set (order-independent within the tick).
3. **`notifySubscribers()`** — called by the host *after* the tick — dispatches the
   deliverable set to `subscribeOntology(ontology, handler)` listeners.

```ts
import { MessageBus } from "@engine/core/sim";

const bus = new MessageBus();
const off = bus.subscribeOntology("trade", (m) => { /* observe after the tick */ });

bus.send({ performative: "propose", ontology: "trade",
           sender: 7, recipient: "broadcast", body: { give: "wheat", want: "coin" } }, 42);

bus.flush();              // inside the tick: make queued messages deliverable
// … systems read bus.drain() …
bus.notifySubscribers();  // after the tick: fan out to ontology subscribers
off();
```

`recipient` is an entity id or `"broadcast"`; `sender` is an id or `"world"`. (The bus
also has an optional per-stage read/write audit that throws if one stage both writes and
reads the same ontology — a determinism footgun-catcher; enable with `enableAudit()`.)

### Sim ↔ render seam (snapshots, never shared state)

The engine is built so the ECS world + scheduler run **off the render path**. Sim
produces plain-data snapshots; the view consumes them and interpolates. The transport is
the consumer's choice — the three ways the reference games do it:

- **Server-authoritative (WebSocket).** The farming sim runs in a Node host; the browser
  opens a WebSocket, receives one snapshot per tick, and interpolates between the latest
  two by an `alpha` in `[0,1)`. `Transform` already carries `prevX/prevY` for exactly this.
- **In-browser Web Worker.** The settlement sim runs the scheduler in a Worker and posts
  snapshots over `postMessage`; the main thread only renders. No server needed for solo.
- **Headless direct-drive.** Tests and CLI tools call `scheduler.tick()` on the main
  thread with no transport at all — the canonical way to exercise sim behavior fast.

Because the boundary is a snapshot stream (not shared object references), the same
sim-core code slots into all three without change. Keep anything server- or Worker-only
out of your sim-core.

### Rendering (opinionated, 2D pixel-art)

`createRenderer(canvas, camera, opts?)` returns a `RendererLike` — WebGPU when available,
Canvas2D otherwise, same API either way. It is a **cozy 2D pixel-art** renderer: sprites +
static-bake layers, a `Camera2D`, particles, rain/weather, a day/night wash, optional
cloud-shadow/haze overlays, and a screen-space UI seam (`beginUI`/`pushUI`/`endUI`) that
draws `UIQuad`s in CSS pixels unaffected by the camera. **Every color is an EDG32 palette
hex** — use the named roles in `EDG.*` rather than raw literals (see the palette note in
the audit). If you need a different look, `@engine/ui` lets you swap the whole palette via
a `Theme` (see [`@engine/ui`](../ui/README.md)).

## Determinism testing

Two distinct checks — do both:

1. **Same-seed byte-identity.** Run a seed twice, hash or deep-compare the exported
   end-state; assert identical. This proves *reproducibility* (no hidden wall-clock / RNG
   leak). It is necessary but **not** sufficient for a refactor.
2. **Multi-seed behavior diff.** To prove a refactor is *behavior-preserving*, run several
   seeds through the old and new code and diff the full JSON exports — identical output
   across seeds means you changed the shape of the code, not the behavior. A single
   determinism check can pass while behavior silently changed.

The headless reference runner exposes this via env knobs (`SEED`, `EXPORT=json`,
`CHECK_DETERMINISM=1`); mirror that pattern in your own harness.

## Layering & rules

`@engine/wasm-modules` → `@engine/core` → your game's sim-core → your game's client/server.
The engine is generic and **never imports a game**. Keep `bootstrapSim()`-style setup
transport-agnostic so the same sim runs server-side, in a Worker, and headless.
