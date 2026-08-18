#version 300 es
// tint.frag.glsl — full-screen tint (day/night wash), WebGL2 port of
// ../../webgpu/shaders/tint.wgsl's fs_main.
//
// Composites a solid color wash over the scene using source-over blending.
// This is the GPU equivalent of:
//   ctx.globalAlpha = tint.alpha;
//   ctx.fillRect(0, 0, W, H);
//
// Result: out = mix(scene, u_color, u_alpha)
//   = scene * (1 - u_alpha) + u_color * u_alpha
// which is exactly what premultiplied source-over gives when the caller sets
// gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA) and this shader outputs a
// premultiplied colour:
//   out.rgb = src.rgb + dst.rgb * (1 - src.a)
//   out.a   = src.a  + dst.a  * (1 - src.a)
//
// u_color/u_alpha arrive as uniforms resolved on the CPU via `rgbOf` from an
// EDG palette-role constant (see tint-pass.ts) — never a literal here.

precision mediump float;

uniform vec3 u_color;
uniform float u_alpha;

out vec4 o_color;

void main() {
  float a = u_alpha;
  o_color = vec4(u_color * a, a);
}
