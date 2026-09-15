# audit-08 — The message-bus ontology/body seam is untyped (~150 unchecked casts)

status: todo
created: 2026-09-13
context: repo audit 2026-09-13 (`improve`). The largest hole in a codebase that otherwise holds a strict-TS line (0 `@ts-ignore`, 0 real `as any`, 0 empty catches repo-wide).

## The defect

The message bus is the project's gameplay spine — FIPA-ACL `performative` + `ontology` + body, ported
from the Python SPADE prototype ([decisions.md](../../wiki/decisions.md) → Source-of-truth). Both of its
key fields are untyped:

[engine/core/src/sim/message-bus.ts:5-11](../../../engine/core/src/sim/message-bus.ts#L5-L11):
```ts
export interface OutgoingMessage {
  ontology: string;                     // any string compiles
  body: Record<string, unknown>;        // any shape compiles
  …
}
```
Subscribers are keyed by raw string ([message-bus.ts:26](../../../engine/core/src/sim/message-bus.ts#L26)),
and `AgentMessage.ontology` is likewise `string`
([ecs/components.ts:50](../../../engine/core/src/ecs/components.ts#L50)).

Measured 2026-09-13:
- **53** send-side `as unknown as Record<string, unknown>` double casts
- **~100** receive-side `msg.body as …` casts
- **14** of those are *inline structural* casts, and **11 of them independently re-declare the same
  shape**: `msg.body as { day: number }` in `crop-growth`, `weather`, `tile-features`, `festival`,
  `notice-board`, `shop-slate`, `bubbles`, `tavern`, `run-history`, `orchard`, `livestock`, `harbor`.

Meanwhile [protocols/simulation.ts:18-21](../../../games/farm/sim-core/src/protocols/simulation.ts#L18-L21)
already exports the correct type:
```ts
export interface DayStartBody { day: number; daysRemaining: number; }
```

The protocol layer is in fact well-built — per-ontology `ONT_*` const objects plus a named `*Body`
interface each ([protocols/index.ts](../../../games/farm/sim-core/src/protocols/index.ts)). The types exist;
they are simply never *bound* to the ontology they belong to.

## Failure scenarios (two, both silent)

1. **Rename a body field.** Change `DayStartBody.day` → `dayIndex`. The declaration compiles, the sender
   compiles, and all 11 inline `as { day: number }` reads compile — then read `undefined` at runtime.
   Every day-boundary hook in Farm (crop growth, weather, festivals, harbor contracts, livestock,
   orchard, the event feed) silently stops firing. `noUncheckedIndexedAccess` and
   `exactOptionalPropertyTypes` cannot help: the cast asserts the shape away.
2. **Typo an ontology string.** `"encounter.met"` instead of `ONT_ENCOUNTER.MEET` compiles, is queued,
   is delivered to nobody (the subscriber map has no such key), and throws nothing. A protocol silently
   goes dead.

Both are exactly the "shipped inert while tests stayed green" pattern the corpus has recorded twice.

## Fix sketch

Bind ontology → body with a declaration-merged registry, then make `send` generic:

```ts
// engine side: an open map games extend
export interface OntologyBodies {}                    // games add entries via declaration merging
export type Ontology = keyof OntologyBodies & string;

send<K extends Ontology>(msg: { ontology: K; body: OntologyBodies[K]; … }, tick: number): void;
```

Each game's protocol module then declares its own entries:
```ts
declare module "@engine/core/sim" {
  interface OntologyBodies { "simulation.day-start": DayStartBody; /* … */ }
}
```

This keeps the engine game-agnostic (it ships an empty map; games populate it), so the dependency rule
is untouched. Receive-side gets a narrowing helper — `bodyOf(msg, ONT_SIMULATION.DAY_START)` returning
`DayStartBody | null` after checking the discriminant — replacing the inline casts.

**Scope control.** This is a wide mechanical change across four games. Do it in this order and stop at
any point that gets hairy rather than half-converting a game:
1. Engine: the registry type + generic `send` + the narrowing helper, with the map empty (no behaviour
   change, everything still compiles via the `string` fallback path).
2. Farm's `simulation.day-start` only — this alone removes the 11 duplicated inline casts.
3. The rest of Farm's ontologies.
4. Citadel / Hollow / MateQuest.

## Files you OWN
- [engine/core/src/sim/message-bus.ts](../../../engine/core/src/sim/message-bus.ts) + its test
- [engine/core/src/ecs/components.ts](../../../engine/core/src/ecs/components.ts) (`AgentMessage.ontology`)
- each game's `protocols/` modules and the call sites you convert

## Files you must NOT touch
- **Any system's logic.** This is a typing change only — no behavioural edits, no reordering, no
  "while I'm here" fixes. The scheduler order encodes real data dependencies
  ([wiki/system-ordering.md](../../wiki/system-ordering.md)).
- No game may import another game; the registry must be extended per-game via declaration merging.

## Acceptance
- `ontology` is a union type at the send site; a typo'd ontology string is a **compile error**.
  Demonstrate with a deliberate typo.
- The 11 duplicated `as { day: number }` casts are replaced by the shared `DayStartBody`; renaming
  `DayStartBody.day` now **fails typecheck**. Demonstrate this, then revert — it is the whole point.
- Report the before/after count of `as unknown as Record<string, unknown>` and `msg.body as …` sites.
- **Determinism unchanged.** This is a pure typing refactor, so prove behaviour preservation the way
  [wiki/performance.md](../../wiki/performance.md) requires: a multi-seed `EXPORT=json` diff, not just a
  reproducibility check. Use the fast 3-day/3-seed diff, and **ask before any full determinism run**
  (hardware limits — see routing.md).
- `npm run typecheck` + `npm run test` green. Because audit-01 is unfixed at authoring time, run the
  typecheck with `--force` so downstream packages are actually re-verified.
