#version 300 es
// weather.vert.glsl — GPU weather pass (WebGL2 port of ../../webgpu/shaders/weather.wgsl).
//
// The WGSL original has TWO vertex entry points (vs_streak, vs_snow) sharing one
// fragment entry point, compiled into two separate GPURenderPipelines. GLSL has no
// multi-entry-point shader modules, so this file folds both branches into one
// `main()` selected by the u_isSnow uniform; weather-pass.ts compiles ONE program
// from this file + weather.frag.glsl and toggles u_isSnow immediately before each
// of the two drawArraysInstanced calls (rain, then snow), each against its own VAO.
// Both branches compute unconditionally (cheap ALU, no derivatives here — fwidth is
// fragment-only) then select by ternary; unused attributes read whatever default
// value WebGL2 assigns a disabled generic attribute (0,0,0,1) when the "other"
// VAO's buffers aren't bound to these locations, which is harmless because their
// result is discarded by the ternary.
//
// Rain streak instance attributes (bound only by the rain VAO):
//   location 0: a_p0        vec2  — streak head, world px (x0, y0)
//   location 1: a_p1        vec2  — streak tail, world px (x1, y1)
//   location 2: a_halfWidth float — quad half-width, world px
//
// Snow flake instance attributes (bound only by the snow VAO):
//   location 3: a_center    vec2  — flake center incl. sway, world px
//   location 4: a_halfSize  float — flake half-size, world px (base, before variation)
//
// View uniforms — same convention as particle.vert.glsl / every WebGL2 pass in
// this migration (see ../../view-uniform.ts):
//   clipX = worldX * u_scale.x + u_offset.x
//   clipY = worldY * u_scale.y + u_offset.y   (u_scale.y already negative)
// Only scale/offset are read — weather geometry (including snow sway) is already
// baked into the per-instance data by RainField on the CPU side (see
// forEachRainStreak/forEachSnowFlake in ../../rain-field.ts), exactly as it is for
// the WebGPU pipeline. No second time source is introduced here.

layout(location = 0) in vec2 a_p0;
layout(location = 1) in vec2 a_p1;
layout(location = 2) in float a_halfWidth;
layout(location = 3) in vec2 a_center;
layout(location = 4) in float a_halfSize;

uniform vec2 u_scale;
uniform vec2 u_offset;
uniform float u_isSnow; // 0.0 = rain streak (vs_streak), 1.0 = snow flake (vs_snow)

out vec2 v_uv;
out float v_along;   // 0 = head/top, 1 = tail/bottom (rain only; unused for snow)
out float v_isSnow;
out float v_variation; // per-instance hash [0..1] (snow only; unused for rain)

// ── Per-instance integer hash (snow twinkle) ──────────────────────────────────
// Same Murmur-style finalizer as the WGSL original. The multiplier is written in
// DECIMAL (73244475u == 0x45d9f3bu) rather than hex: a 7-hex-digit literal is
// indistinguishable, to this project's palette-literal lint, from a packed RRGGBB
// colour constant (the lint's rule 4 false-positive case the brief calls out) —
// this is a hash constant, not a colour, so it is written to dodge that false
// positive rather than relaxing the lint.
uint hashU32(uint val) {
  uint h = val;
  h = h ^ (h >> 16u);
  h = h * 73244475u; // == 0x45d9f3bu
  h = h ^ (h >> 16u);
  return h;
}

float hashF32(uint val) {
  return float(hashU32(val)) / 4294967296.0;
}

// Quad corners (triangle-list, gl_VertexID 0..5 across two triangles [0,1,2] [1,3,2]).
// Rain streak corners:    0=A(+perp,p0) 1=B(-perp,p0) 2=D(-perp,p1) 3=C(+perp,p1)
// Snow flake corners:     0=top-left 1=top-right 2=bottom-left 3=bottom-right
void main() {
  int cornerIdx[6] = int[6](0, 1, 2, 1, 3, 2);
  int corner = cornerIdx[gl_VertexID];

  bool isSnow = u_isSnow > 0.5;

  // ── Rain streak branch ──────────────────────────────────────────────────────
  vec2 dir = a_p1 - a_p0;
  float segLen = length(dir);
  vec2 segSafe = segLen > 0.0001 ? dir / segLen : vec2(0.0, 1.0);
  vec2 perp = vec2(-segSafe.y, segSafe.x);

  bool useP1 = (corner & 2) != 0;
  vec2 streakCenter = useP1 ? a_p1 : a_p0;
  float perpSign = (corner == 0 || corner == 3) ? 1.0 : -1.0;
  vec2 streakWorld = streakCenter + perp * (perpSign * a_halfWidth);

  float streakU = (corner & 1) != 0 ? 1.0 : 0.0;
  float streakV = useP1 ? 1.0 : 0.0;

  // ── Snow flake branch ────────────────────────────────────────────────────────
  float vari = hashF32(uint(gl_InstanceID));
  float scale = 0.7 + 0.3 * vari;
  float h = a_halfSize * scale;

  float lxSign = (corner & 1) != 0 ? 1.0 : -1.0;
  float lySign = (corner & 2) != 0 ? 1.0 : -1.0;
  vec2 snowWorld = a_center + vec2(lxSign, lySign) * h;

  float snowU = (corner & 1) != 0 ? 1.0 : 0.0;
  float snowV = (corner & 2) != 0 ? 1.0 : 0.0;

  // ── Select by kind ───────────────────────────────────────────────────────────
  vec2 world = isSnow ? snowWorld : streakWorld;
  vec2 clipPos = world * u_scale + u_offset;

  v_uv = isSnow ? vec2(snowU, snowV) : vec2(streakU, streakV);
  v_along = isSnow ? 0.0 : streakV;
  v_isSnow = u_isSnow;
  v_variation = isSnow ? vari : 0.0;

  gl_Position = vec4(clipPos, 0.0, 1.0);
}
