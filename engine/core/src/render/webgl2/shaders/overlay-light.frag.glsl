#version 300 es
// overlay-light.frag.glsl — samples the CPU-baked additive light overlay (Farm's
// night glows, see overlay-light-pass.ts) and writes it out unmodified.
//
// The colour math (radial gradients, intensity gating, palette colours) all happens
// on the CPU inside the `OverlayFn` callback the game supplies — this shader is a
// pure blit, so there is nothing to source from a palette-role uniform here (same
// reasoning as blit.frag.glsl). The additive effect comes entirely from the CALLER's
// blend state (`gl.blendFunc(gl.ONE, gl.ONE)`), not from anything in this shader.
//
// u_tex holds the baked canvas uploaded with UNPACK_PREMULTIPLY_ALPHA_WEBGL = true,
// so its RGB already carries `color * alpha` — additive blending then sums that
// premultiplied light directly onto the scene, matching the Canvas2D
// `globalCompositeOperation = "lighter"` semantics the OverlayFn callback was
// originally authored against.

precision mediump float;

uniform sampler2D u_tex;

in vec2 v_uv;
out vec4 o_color;

void main() {
  o_color = texture(u_tex, v_uv);
}
