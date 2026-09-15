# audit-16 — `packInstances` allocates a throwaway Float32Array per instance, every frame

status: todo
created: 2026-09-13
context: repo audit 2026-09-13 (`improve`). Engine-level, three-line fix, no API break.

## The defect

[engine/core/src/render3d/buffers.ts:146-152](../../../engine/core/src/render3d/buffers.ts#L146-L152):

```ts
export function packInstances(list: readonly InstanceInput[]): Float32Array {
  const out = new Float32Array(list.length * FLOATS_PER_INSTANCE);
  list.forEach((inst, i) => {
    out.set(packInstance(inst.model, inst.tint), i * FLOATS_PER_INSTANCE);
  });
  return out;
}
```

`packInstance` ([:128-137](../../../engine/core/src/render3d/buffers.ts#L128-L137)) allocates its own
`new Float32Array(20)`, fills it, returns it — and `out.set` immediately copies it in and discards it.
So every instance costs one wasted 20-float allocation plus a redundant copy.

## Failure scenario

Hollow calls `packInstances` per frame for the ground, territory tiles, hearth, graveyard, corpses, each
home-mesh group, each resource-node kind and each agent mesh-variant
([render3d/app.ts](../../../games/hollow/client/src/render3d/app.ts) lines 389, 401, 420, 434, 447, 477, 499,
508, 610). At population 40 that is ~130-180 instances per frame, so ~8-11k short-lived typed arrays per
second — the allocation pattern that produces periodic GC sawtooth in a rAF loop. Hollow is the only 3D
game, so this is its frame-time tax specifically.

## Fix sketch

Add `writeInstanceInto(out, offset, model, tint)` that writes the 16 model floats and 4 tint floats
directly into `out`; have `packInstances` call it. Keep `packInstance` for the single-instance/test path
so nothing else changes.

Optional follow-on (state whether you did it): a per-mesh reusable staging buffer in Hollow's app would
remove the outer `new Float32Array` too. Only do this if the buffer's lifetime is genuinely
frame-scoped — a shared mutable buffer handed to the GL layer is a correctness hazard if upload is
deferred.

## Files you OWN
- [engine/core/src/render3d/buffers.ts](../../../engine/core/src/render3d/buffers.ts) + its tests
- [games/hollow/client/src/render3d/app.ts](../../../games/hollow/client/src/render3d/app.ts) if you add staging buffers

## Files you must NOT touch
- `FLOATS_PER_INSTANCE` / the std140 layout — the packed byte layout must stay identical
- the WebGL2 3D passes and shaders

## Acceptance
- Byte-for-byte identical output: a test asserts `packInstances` produces exactly the same buffer contents
  as before for a multi-instance list. This is the whole safety argument — the GPU layout must not shift.
- Allocation count per `packInstances` call drops from `n + 1` to `1` (or 0 with staging). Report it.
- Verified **in a real browser** (`npm run hollow`): the 3D scene renders identically — ground, homes,
  agents, corpses, territory all in the right places with the right tints.
- `npm run test -w @engine/core` green.
