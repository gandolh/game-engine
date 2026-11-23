#version 300 es
// overlay-light.frag.glsl — the light pool's falloff, the three stops the CPU gradient had.
//
// t is the distance from the pool's centre over its radius. The falloff is piecewise
// linear: the peak at t = 0, u_stops.y of the peak at t = u_stops.x, nothing at t = 1.
// The two stop values come from overlay-light-pass.ts (LIGHT_FALLOFF_*), the same
// constants its unit test checks, so there is one source for them.
//
// The colour is a palette role passed in as instance data; there is no colour literal
// here. Output is premultiplied (rgb * alpha) for the caller's additive blend
// (gl.blendFunc(ONE, ONE)), matching the old "lighter" composite.
precision mediump float;

uniform vec2 u_stops;

in vec2 v_local;
in float v_peak;
in vec3 v_color;

out vec4 o_color;

void main() {
  float t = length(v_local);
  if (t >= 1.0) {
    discard;
  }
  float inner = 1.0 - (1.0 - u_stops.y) * (t / u_stops.x);
  float outer = u_stops.y * (1.0 - (t - u_stops.x) / (1.0 - u_stops.x));
  float a = v_peak * ((t < u_stops.x) ? inner : outer);
  o_color = vec4(v_color * a, a);
}
