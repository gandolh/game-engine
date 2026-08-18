#version 300 es
// cloud.vert.glsl — fullscreen-triangle vertex shader for the cloud-shadow /
// warm-haze / vignette overlay. WebGL2 port of ../../webgpu/shaders/cloud.wgsl's
// vs_main.
//
// No vertex buffer: the 3 vertices come from gl_VertexID via the classic
// "oversized triangle" trick ([-1,3] instead of [-1,1]), same idea as
// sprite.vert.glsl/shadow.vert.glsl's gl_VertexID-driven quads but for a
// single covering triangle instead of two.
//
// World-anchor derivation (so the fBm noise stays put over the terrain as the
// camera pans/zooms, instead of sliding with the screen): invert the view
// transform to recover world-space position from each clip-space vertex.
//   clip_x = world_x * scale_x + offset_x  =>  world_x = (clip_x - offset_x) / scale_x
//   clip_y = world_y * scale_y + offset_y  =>  world_y = (clip_y - offset_y) / scale_y
//
// Same view-transform convention as every other WebGL2 pass (see
// ../../view-uniform.ts's doc comment): u_scale.y is ALREADY NEGATIVE (the
// clip-space Y-flip is baked in) — do NOT negate again here.
//
// v_ndc passes the raw clip-space xy through unmodified — the fragment
// shader's radial vignette is screen-anchored (hugs the frame), not
// world-anchored, so it needs NDC, not world position.

uniform vec2 u_scale;
uniform vec2 u_offset;

out vec2 v_world_pos;
out vec2 v_ndc;

void main() {
  float cx = (gl_VertexID == 1) ? 3.0 : -1.0;
  float cy = (gl_VertexID == 2) ? 3.0 : -1.0;

  float world_x = (cx - u_offset.x) / u_scale.x;
  float world_y = (cy - u_offset.y) / u_scale.y;

  v_world_pos = vec2(world_x, world_y);
  v_ndc = vec2(cx, cy);
  gl_Position = vec4(cx, cy, 0.0, 1.0);
}
