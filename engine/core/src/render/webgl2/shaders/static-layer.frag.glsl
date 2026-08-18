#version 300 es
// static-layer.frag.glsl — ported from ../../webgpu/static-layer-pass.ts's inline STATIC_WGSL.
precision mediump float;

uniform sampler2D u_tex;

in vec2 v_uv;
out vec4 o_color;

void main() {
  vec4 c = texture(u_tex, v_uv);
  // Premultiplied output (matches the WGSL original's canvas alphaMode = "premultiplied").
  o_color = vec4(c.rgb * c.a, c.a);
}
