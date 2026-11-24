#version 300 es
// tile-chunk.vert.glsl — the tile-chunk spike's vertex shader (corpus brief 21). See ../tile-chunk-pass.ts.
//
// One instance per quad, no per-vertex buffer: the corner comes from gl_VertexID, drawn with
// gl.drawArraysInstanced(gl.TRIANGLE_STRIP, 0, 4, count). Per-instance attributes, stride 24 bytes:
//   loc0 a_center  vec2   float32 ×2   the quad's centre, world px
//   loc1 a_size    uvec2  uint16 ×2    width, height, world px
//   loc2 a_uv      uvec4  uint16 ×4    atlas texel rect: x0, y0, x1, y1
//   loc3 a_misc    uvec4  uint8 ×4     turns + 4·flipX + 8·kind, shade byte, edge mask, speckle class
//
// The three small ones are integer attributes (vertexAttribIPointer): a 16- or 8-bit integer read as a
// float has no native vertex format on Direct3D 11, which ANGLE then converts; an integer one does.
//
// Rotation is whole quarter turns, done by swapping axes rather than cos/sin, so every corner stays on
// the world grid exactly as the CPU bake's canvas put it there.
//
// u_view = (scaleX, scaleY, offsetX, offsetY); scaleY is already negative, as in every pass here.

layout(location = 0) in vec2 a_center;
layout(location = 1) in uvec2 a_size;
layout(location = 2) in uvec4 a_uv;
layout(location = 3) in uvec4 a_misc;

uniform vec4 u_view;
uniform vec2 u_texSize;
uniform float u_tile;

out vec2 v_uv;
out vec2 v_world;
flat out vec2 v_tileIndex;
flat out int v_kind;
flat out float v_shade;
flat out int v_edges;
flat out int v_speckle;

void main() {
  int corner = gl_VertexID;
  float cu = float(corner & 1);
  float cv = float((corner >> 1) & 1);

  int bits = int(a_misc.x);
  int turns = bits & 3;
  bool flip = (bits & 4) != 0;

  vec2 size = vec2(a_size);
  float lx = (cu - 0.5) * size.x;
  float ly = (cv - 0.5) * size.y;
  if (flip) lx = -lx;

  // Canvas rotate() with y down: a quarter turn maps (x, y) to (-y, x).
  vec2 local = vec2(lx, ly);
  if (turns == 1) local = vec2(-ly, lx);
  else if (turns == 2) local = vec2(-lx, -ly);
  else if (turns == 3) local = vec2(ly, -lx);

  vec2 world = a_center + local;
  gl_Position = vec4(world.x * u_view.x + u_view.z, world.y * u_view.y + u_view.w, 0.0, 1.0);

  vec4 uv = vec4(a_uv);
  float tu = cu > 0.5 ? uv.z : uv.x;
  float tv = cv > 0.5 ? uv.w : uv.y;
  v_uv = vec2(tu, tv) / u_texSize;
  v_world = world;
  v_tileIndex = floor(a_center / u_tile);
  v_kind = bits >> 3;
  v_shade = (float(a_misc.y) - 128.0) / 255.0;
  v_edges = int(a_misc.z);
  v_speckle = int(a_misc.w);
}
