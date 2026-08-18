#version 300 es
precision highp float;

// scene3d.frag.glsl — WebGL2/GLSL ES 3.00 port of ../../webgpu/shaders/scene3d.wgsl's
// fs_main. Preserves its cozy lighting model exactly: half-Lambert diffuse with a
// shadow floor so no face is ever crushed to black, a cheap hemispheric "AO-ish"
// ambient boost for upward-facing normals, a night dim floor, and an emissive
// override for glowing windows. See the WGSL original for the full design
// rationale — the comments below carry it over where the logic is unchanged.
//
// Flat shading: derived PER-FACE from screen-space derivatives of world position
// (dFdx/dFdy — core in GLSL ES 3.00, no extension needed), mirroring exactly what
// the WGSL original does with dpdx/dpdy. This is NOT a `flat`-qualified normal
// varying and NOT per-vertex normals — no per-vertex normal data is packed
// anywhere in this pipeline (see ../../buffers.ts's FLOATS_PER_VERTEX), so this is
// the only option that matches the existing vertex layout, and it is what the
// original relies on too.
//
// WebGL2-specific change from the WGSL original: `materials` was an UNBOUNDED
// storage buffer (`var<storage, read> materials: array<MaterialEntry>`) — WebGL2
// has no storage buffers, so this becomes a fixed-size std140 uniform block.
// MAX_MATERIALS is injected as a `#define` by renderer3d.ts immediately after the
// `#version` line above (see its `injectMaxMaterials` helper) — the source of
// truth is renderer3d.ts's `MAX_MATERIALS` constant, checked against the device's
// MAX_UNIFORM_BLOCK_SIZE at construction. Do not hardcode a number here.
// FLOATS_PER_MATERIAL (../../buffers.ts) is exactly 4 floats — one vec4 per
// entry, which is precisely std140's array stride for vec4, so packMaterials'
// Float32Array uploads unchanged: no repacking, no padding.

in vec3 v_worldPos;
flat in uint v_materialIndex;
in vec4 v_tint;

layout(std140) uniform Frame {
  mat4 viewProj;
  vec3 sunDir;
  float dayNight;
  float ambient;
  float time;
} frame;

layout(std140) uniform Materials {
  vec4 entries[MAX_MATERIALS];
} materials;

out vec4 o_color;

void main() {
  vec4 entry = materials.entries[v_materialIndex];
  vec3 base = entry.rgb;
  float emissive = entry.a;

  vec3 faceNormal = normalize(cross(dFdx(v_worldPos), dFdy(v_worldPos)));

  // Smooth wrapped ("half-Lambert") diffuse instead of a hard toon ramp: the raw
  // dot in [-1,1] is remapped to [0,1] and softened, so light falls off GRADUALLY
  // across every face (no banding) and faces angled away from the sun still get a
  // gentle gradient rather than snapping to a flat shadow band. A shadow FLOOR
  // then lifts the darkest faces to a cozy dim — this is what guarantees every
  // surface stays readable, whatever its orientation.
  float ndl = dot(faceNormal, normalize(frame.sunDir));
  float wrapped = ndl * 0.5 + 0.5;
  float diffuse = wrapped * wrapped;
  float shadowFloor = 0.45;
  float shade = mix(shadowFloor, 1.0, diffuse);

  // Cheap hemispheric "AO-ish" ambient term: upward-facing faces (roofs,
  // ground) read a touch brighter than vertical walls, at zero extra cost.
  // Added ON TOP of the directional term so shadowed sides never fall to black.
  float upFactor = 0.5 + 0.5 * clamp(faceNormal.z, 0.0, 1.0);
  float ambientTerm = frame.ambient * upFactor;

  // Night dims the DIRECTIONAL term toward a lifted floor (never 0) as
  // dayNight -> 0, for a cozy dim night rather than a black-out. Ambient is
  // applied outside this so even full night keeps every surface readable.
  float nightFloor = 0.35;
  float dayFactor = mix(nightFloor, 1.0, frame.dayNight);

  vec3 lit = base * (shade * dayFactor + ambientTerm);

  if (emissive > 0.5) {
    // Emissive surfaces (glowing windows) ignore lighting entirely and
    // brighten as night falls, so they read as light sources after dusk.
    float glowBoost = mix(1.6, 1.0, frame.dayNight);
    lit = base * glowBoost;
  }

  lit = lit * v_tint.rgb;

  o_color = vec4(lit, v_tint.a);
}
