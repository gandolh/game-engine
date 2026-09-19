# sweep-05 — sprite draw groups fragment by construction, cost 43 GL calls each, and nothing counts them

status: todo
created: 2026-09-19
context: found by a read-only structure/performance/compatibility sweep on 2026-09-19. Sibling of
[sweep-04](../2026-09-19-sweep-04-ui-quads-still-cpu-rasterized.md) — both are in the render hot path, but
this one is **unmeasured**, and its first chunk is the instrument, not the fix. Do not skip step 1.

## The gap

The renderer coalesces sprites into draw groups by walking the sorted queue and grouping
**consecutive** same-atlas sprites
([`renderer.ts`](../../../engine/core/src/render/webgl2/renderer.ts), the `while (i < this._queueLen)`
loop in `endFrame`). That is the right shape. The problem is what it walks.

**1. The comparator does not know atlases exist.**
[`raster2d.ts`](../../../engine/core/src/render/raster2d.ts):

```ts
export function compareSprite(a: Sprite, b: Sprite): number {
  if (a.layer !== b.layer) return a.layer - b.layer;
  return (a.sortY ?? a.y) - (b.sortY ?? b.y);
}
```

`atlasId` is not a key and not a tie-break.

**2. Farm's busiest layer is shared by four different atlas sheets.**
[`layers.ts`](../../../games/farm/sim-core/src/render-systems/layers.ts) — `ACTOR: 50` and
`BUILDING: 50` are **the same number**. And
[`frames.ts`](../../../games/farm/sim-core/src/render-systems/frames.ts)'s `FRAME_PREFIX_TO_ATLAS` splits
what draws there across six sheets:

| frame prefix | atlas | draws on layer 50? |
|---|---|---|
| `farmer`, `npc`, `animal` | `characters` | yes |
| `structure` | `buildings` | yes |
| `crop` | `crops` | yes |
| `decoration` | `props` | yes |
| `tile` | `terrain` | (static layer) |
| `fish`, `tool`, `indicator`, `product`, `fruit`, `debug` | `items-ui` | yes (indicators) |

So along layer 50 the queue is ordered by `sortY` and the atlas **alternates arbitrarily** with world
geometry. A farmer standing between two crop rows in front of a building splits one group into three.
Group count therefore scales with atlas *alternations down the Y axis*, and in the worst case
approaches the sprite count.

**3. Each group costs 43 GL calls.**
`SpriteBatch.drawRange`
([`sprite-batch.ts`](../../../engine/core/src/render/webgl2/sprite-batch.ts)) issues, per group:
`useProgram`, 4 view-uniform uploads, `activeTexture` + `bindTexture` + `uniform1i`, `enable(BLEND)` +
`blendEquationSeparate` + `blendFuncSeparate`, `bindVertexArray`, 2 × `bindBuffer`,
`drawArraysInstanced`, `bindVertexArray(null)` — **and `_setupInstanceAttribs`, which is nine
`setupAttrib` calls of three GL calls each** (`enableVertexAttribArray` + `vertexAttribPointer` +
`vertexAttribDivisor`, all nine carrying `divisor: 1`). 27 + 16 = **43**.

Only **two** of those 43 actually differ between groups: the bound texture and the attribute byte
offsets. The other 41 are re-uploaded identically every group.

**4. The 27 attribute calls exist only because of a WebGL2 limitation, and `drawRange` documents it.**
WebGL2 has no `firstInstance` parameter (no `glDrawArraysInstancedBaseInstance`), so the batch
re-points all nine per-instance attributes at `first * STRIDE_BYTES` before every draw. The file says
so in a long comment. That comment is correct, and it is also the receipt for why group count is
expensive rather than merely inelegant.

## Why it is filed as unmeasured, and what that obliges

**There is no draw-group counter.** The profiler has `ui.quads`
([render-loop.ts](../../../games/farm/client/src/main/render-loop.ts)) but nothing reports `_groupLen`,
and no test asserts anything about it. So:

- the coalescing loop's effectiveness has never been observed, only designed;
- the 2026-08-18 post-migration reading attributes `render.endFrame` 7.73 ms to nothing in particular;
- I can prove the mechanism statically (above) but **I cannot tell you the number**, and neither can
  anyone else today.

That is the finding. An invisible hot path is the problem; the fragmentation is the hypothesis.
[performance.md](../../wiki/performance.md)'s own guardrail applies — *never promote an optimization
without a before/after number* — and this brief cannot be closed by reasoning.

## What to do

1. **Add the counter first, and stop.** Report `_groupLen` and `_queueLen` through the existing
   `profileUi`-style dev-only seam (`lastUiFlush` is the pattern: a plain field the host reads when
   profiling, zero cost otherwise). Wire them into the Farm `?profile` export as `draw.groups` /
   `draw.sprites`. Capture a real reading, all panels open, default zoom.
2. **Then decide, with the ratio in hand.** `groups / sprites` near 1.0 means near-total
   fragmentation; near 1/6 means coalescing is already working and this brief closes as *measured, not
   a problem* — which is a perfectly good outcome, and the corpus has precedent for recording it that
   way. **Write the number into
   [performance-measurements.md](../../wiki/performance-measurements.md) either way.**
3. **If it is bad, the fixes rank like this:**
   - **(a) Hoist the 41 invariant GL calls out of the per-group path.** Set program, view uniforms,
     blend state, `activeTexture`/`uniform1i(u_atlas, 0)` and the VAO **once per frame** before the
     group loop; leave only `bindTexture` + the attribute re-point inside. Behaviour-preserving,
     mechanical, and it cuts a group from 43 calls to ~29 with no design change. Do this first
     regardless of how the rest lands.
   - **(b) One texture for the layer-50 band.** A `TEXTURE_2D_ARRAY` with a per-instance layer index
     (WebGL2-native, no extension) collapses `characters` + `buildings` + `crops` + `props` to **one
     group**, which also retires the attribute re-point entirely. This is the real fix and the larger
     change: it needs a 17th float in the instance format, a shader change (`sampler2DArray`), and a
     decision about layer sizing in the atlas builder — every array slice must share dimensions.
     Merging the four sheets into one 2D atlas is the cheaper cousin and worth costing against (b)
     before committing.
   - **(c) Tie-break the comparator by `atlasId`.** Tempting and mostly wrong: `(layer, sortY)` **is**
     the painter's algorithm, so reordering within a layer changes what occludes what. Only safe as a
     *third* key after both `layer` and `sortY` compare equal, which helps exact ties and nothing else.
     Low value; listed so the next person does not reach for it first.

## The constraint that must survive any of these

**`(layer, sortY)` ordering is correctness, not preference.** Farm's whole depth illusion — pseudo-3D
height, the `z` lift, `_ghostCovered`'s occlusion redraws — rides on it. No fix may change which
sprite draws on top of which. That rules out sorting by atlas as a primary or secondary key, and it
is why (b) is the right answer despite being the bigger one: it removes the *reason* to batch by atlas
instead of changing the order.

## Already flagged elsewhere, do not re-file
`_ghostCovered` is an O(occludable × queue) scan. Brief 118 listed it as **F3**: *"confirm it's
negligible in the profile; fix only if it shows up."* It is still unconfirmed. While you have the
profiler open for step 1, settle it — one line in the measurements table closes a three-brief-old
loose end.

## Files you OWN
- `engine/core/src/render/webgl2/renderer.ts` (group loop, the new counters)
- `engine/core/src/render/webgl2/sprite-batch.ts` (state hoisting; instance format only if (b))
- `engine/core/src/render/webgl2/shaders/sprite.{vert,frag}.glsl` (only if (b))
- `games/farm/client/src/main/render-loop.ts` (profiler wiring)

## Files you must NOT touch
- `compareSprite` — unless you are doing (c) as a strict third key, and then say why in the diff.
- `games/farm/sim-core/src/render-systems/layers.ts` — `ACTOR === BUILDING === 50` is a gameplay
  depth decision, not a batching one. Do not renumber layers to make batching easier.

## Acceptance
- **`draw.groups` exists, is off by default, and has a measured value recorded** in
  [performance-measurements.md](../../wiki/performance-measurements.md) with the capture conditions.
  This alone is a complete, closeable outcome.
- If a fix shipped: a before/after pair for `render.endFrame` and `draw.groups`, plus **a rendered
  frame proven pixel-identical** — this is sort/occlusion-adjacent code and a wrong tie-break shows up
  as one sprite in front of another, which no aggregate metric catches.
- The GLSL lint passes if any shader changed (`#version 300 es`, precision qualifier, no colour
  literals — one lint copy per shader directory).
- `npm run gates`.
