#version 300 es
// sprite.frag.glsl — WebGL2 port of ../../webgpu/shaders/sprite.wgsl's fs_main.
//
// Sample atlas (straight alpha), multiply RGB by tint RGB, multiply alpha by
// tint.a, then convert to premultiplied alpha for output — matching the WGSL
// original exactly. Output is consumed by the premultiplied blend state
// SpriteBatch sets in drawRange (srcFactor=ONE, dstFactor=ONE_MINUS_SRC_ALPHA):
//   out.rgb = straight_rgb * tint.rgb * total_alpha
//   out.a   = total_alpha
// where total_alpha = texColor.a * tint.a. Transparent padding pixels
// (texColor.a == 0) stay transparent regardless of tint.
precision mediump float;

uniform sampler2D u_atlas;

in vec2 v_uv;
in vec4 v_tint;

out vec4 o_color;

void main() {
  vec4 tex_color = texture(u_atlas, v_uv);

  vec3 rgb = tex_color.rgb * v_tint.rgb;
  float alpha = tex_color.a * v_tint.a;

  o_color = vec4(rgb * alpha, alpha);
}
