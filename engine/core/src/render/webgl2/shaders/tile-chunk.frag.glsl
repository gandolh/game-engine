#version 300 es
// tile-chunk.frag.glsl — the tile-chunk spike's fragment shader (corpus brief 21). See ../tile-chunk-pass.ts.
//
// Two kinds of quad:
//   kind 0, a sprite: the atlas texel, then the tile's decoration as shader terms. On a tile with an
//     opaque ground sprite the CPU bake painted the decoration over the whole stack; both terms are
//     affine per pixel, so applying them to each sprite of the stack gives the same result.
//       shade: multiply by u_shadeDark (shade < 0) or screen by u_shadeLight (shade > 0), at |shade|
//       edges: multiply bands by u_edgeColor, u_edgeBandPx thick, alphas u_edgeAlpha, from each edge
//         in the mask (1 top, 2 right, 4 bottom, 8 left)
//   kind 1, a decoration quad on a tile with no opaque ground (water, bridges): the shade square, then
//     the speckles, both source-over, as one premultiplied colour.
//
// The speckle hash is engine/core/src/render/noise.ts's hash2 in 32-bit unsigned arithmetic, compared
// as integers (u_speckleCut is ceil(density · 2^32)), so it picks the same cells as the CPU decorator.
// highp int is required: mediump integers would wrap the hash on a phone.
//
// Every colour arrives as a uniform; output is premultiplied, as in every pass here.
precision highp float;
precision highp int;

uniform sampler2D u_tex;
uniform float u_tile;
uniform vec3 u_shadeDark;
uniform vec3 u_shadeLight;
uniform vec3 u_edgeColor;
uniform float u_edgeBandPx;
uniform vec4 u_edgeAlpha;
uniform float u_specklePx;
uniform uint u_speckleSeed;
uniform uint u_speckleColorSeed;
uniform uvec2 u_speckleCut;
uniform vec2 u_speckleAlpha;
uniform vec3 u_speckleA0;
uniform vec3 u_speckleB0;
uniform vec3 u_speckleA1;
uniform vec3 u_speckleB1;

in vec2 v_uv;
in vec2 v_world;
flat in vec2 v_tileIndex;
flat in int v_kind;
flat in float v_shade;
flat in int v_edges;
flat in int v_speckle;

out vec4 o_color;

uint hashCell(uint x, uint y, uint seed) {
  uint h = seed ^ (x * 374761393u) ^ (y * 668265263u);
  h = (h ^ (h >> 13u)) * 1274126177u;
  return h ^ (h >> 16u);
}

float bandAlpha(float d) {
  int band = int(floor(d / u_edgeBandPx));
  if (band == 0) return u_edgeAlpha.x;
  if (band == 1) return u_edgeAlpha.y;
  if (band == 2) return u_edgeAlpha.z;
  if (band == 3) return u_edgeAlpha.w;
  return 0.0;
}

vec3 edgeFactor(vec2 local) {
  float last = u_tile - 1.0;
  vec3 f = vec3(1.0);
  if ((v_edges & 1) != 0) f *= 1.0 - bandAlpha(local.y) * (1.0 - u_edgeColor);
  if ((v_edges & 2) != 0) f *= 1.0 - bandAlpha(last - local.x) * (1.0 - u_edgeColor);
  if ((v_edges & 4) != 0) f *= 1.0 - bandAlpha(last - local.y) * (1.0 - u_edgeColor);
  if ((v_edges & 8) != 0) f *= 1.0 - bandAlpha(local.x) * (1.0 - u_edgeColor);
  return f;
}

void main() {
  vec2 local = floor(v_world) - v_tileIndex * u_tile;
  float shadeAlpha = abs(v_shade);

  if (v_kind == 0) {
    vec4 c = texture(u_tex, v_uv);
    vec3 rgb = c.rgb;
    if (v_shade < 0.0) rgb *= 1.0 - shadeAlpha * (1.0 - u_shadeDark);
    else if (v_shade > 0.0) rgb += shadeAlpha * u_shadeLight * (1.0 - rgb);
    if (v_edges != 0) rgb *= edgeFactor(local);
    o_color = vec4(rgb * c.a, c.a);
    return;
  }

  vec3 shadeRgb = v_shade < 0.0 ? u_shadeDark : u_shadeLight;
  vec4 col = vec4(shadeRgb * shadeAlpha, shadeAlpha);
  if (v_speckle > 0) {
    float sub = floor(u_tile / u_specklePx);
    vec2 cell = floor(local / u_specklePx);
    if (cell.x < sub && cell.y < sub) {
      uint gx = uint(v_tileIndex.x * sub + cell.x);
      uint gy = uint(v_tileIndex.y * sub + cell.y);
      bool second = v_speckle == 2;
      uint cut = second ? u_speckleCut.y : u_speckleCut.x;
      if (hashCell(gx, gy, u_speckleSeed) < cut) {
        bool pickB = (hashCell(gx, gy, u_speckleColorSeed) >> 31u) != 0u;
        vec3 s = second ? (pickB ? u_speckleB1 : u_speckleA1) : (pickB ? u_speckleB0 : u_speckleA0);
        float sa = second ? u_speckleAlpha.y : u_speckleAlpha.x;
        col = vec4(s * sa, sa) + col * (1.0 - sa);
      }
    }
  }
  if (col.a <= 0.0) discard;
  o_color = col;
}
