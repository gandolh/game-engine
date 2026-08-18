#version 300 es
// blit.frag.glsl — trivial passthrough textured quad fragment shader.
//
// Samples u_tex at v_uv and writes it out unmodified. No colour math here,
// so there is nothing to source from a palette-role uniform yet — later
// passes that tint or blend MUST bring their colour in via a uniform
// (see the "no raw hex/RGB literal" rule enforced by ./glsl-lint.test.ts),
// never as a literal in the shader body.
precision mediump float;

uniform sampler2D u_tex;

in vec2 v_uv;
out vec4 o_color;

void main() {
  o_color = texture(u_tex, v_uv);
}
