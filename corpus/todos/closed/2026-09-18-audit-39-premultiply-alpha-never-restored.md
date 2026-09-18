# audit-39 — `UNPACK_PREMULTIPLY_ALPHA_WEBGL` is set and never restored, so later texture uploads double-premultiply

status: todo
created: 2026-09-18
context: found by the client/render lens of the 2026-09-18 sweep. The sibling passes document this
exact bug class in a comment; this pass is the one that does it.

## The gap

[`overlay-light-pass.ts:154`](../../../engine/core/src/render/webgl2/overlay-light-pass.ts#L154) sets a
**context-global** pixel-store flag before its per-frame upload and never sets it back:

```ts
gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, true);
gl.bindTexture(gl.TEXTURE_2D, this.texture);
gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, this.bakeCanvas as TexImageSource);
// no matching pixelStorei(..., false) anywhere in the file
```

A repo-wide grep confirms this is the **only** occurrence of `UNPACK_PREMULTIPLY_ALPHA_WEBGL` — there
is no restore anywhere. Every other flag in the stack is set/restored in a pair
([`static-layer-pass.ts:77-79`](../../../engine/core/src/render/webgl2/static-layer-pass.ts#L77-L79),
[`water-pass.ts:56-58`](../../../engine/core/src/render/webgl2/water-pass.ts#L56-L58),
[`gl-atlas-store.ts:65-67`](../../../engine/core/src/render/webgl2/gl-atlas-store.ts#L65-L67)), and
`static-layer-pass.ts:61-63` says why in as many words:

> *"Restoring the pixelStorei flag afterward matters because it is context-global state — leaving it
> set would silently flip every OTHER pass's texture upload this frame."*

The upload itself is correct — the additive light pass genuinely wants premultiplied data, and the
comment above it explains that well. Only the restore is missing.

## The consequence

`static-layer.frag.glsl` expects **straight** alpha and premultiplies itself:

```glsl
vec4 c = texture(u_tex, v_uv);
o_color = vec4(c.rgb * c.a, c.a);
```

So a static-layer texture uploaded while the flag is stuck `true` renders sub-opaque pixels at
`rgb·a²` — darkened. Fully opaque pixels (`a = 1`) are unaffected, which is why this has survived a
real-browser check: it darkens decorators and edges, not the whole terrain.

Farm is the only affected client (the only one passing an `OverlayFn`), and the re-upload path is not
a boot race — **it recurs deterministically on every season change**, where `SimHost` re-bakes and
re-posts the static layer after thousands of overlay frames have already set the flag.

## What to do

Add the matching restore immediately after the `texImage2D`, mirroring the set/restore pairs in the
sibling passes. One line.

Then check whether any other pass should be defending itself rather than trusting the caller — but
prefer the restore over defensive re-sets everywhere; one owner per flag is the pattern already here.

## Files you OWN
- [`engine/core/src/render/webgl2/overlay-light-pass.ts`](../../../engine/core/src/render/webgl2/overlay-light-pass.ts)
- [`engine/core/src/render/webgl2/overlay-light-pass.test.ts`](../../../engine/core/src/render/webgl2/overlay-light-pass.test.ts)

## Files you must NOT touch
- the GLSL — `c.rgb * c.a` is correct for a straight-alpha texture, and the shaders are guarded by
  `glsl-lint.test.ts` (GLSL ES 3.00, no colour literals)
- `static-layer-pass.ts` / `water-pass.ts` / `gl-atlas-store.ts` upload paths — they are correct; they
  are the victims, not the cause
- the additive `blendFunc(ONE, ONE)` and the premultiplied upload itself — both are deliberate

## Acceptance
- `overlay-light-pass.test.ts:149` currently asserts only that `pixelStorei` was called with `true` —
  i.e. the existing test **pins the bug**. Extend it to assert the flag is restored to `false` after
  `draw()`, so the pair is enforced the way the other passes' tests enforce theirs.
- A test that the flag is `false` after a full `endFrame` with an overlay present.
- `npm run test -w @engine/core` green.
- Worth doing and cheap: the A/B probe-harness technique recorded in
  [`wiki/status.md`](../../wiki/status.md) (render the real path twice, once with the fix) — a control
  shot is what turns "looks better" into evidence. Delete the harness afterwards.
