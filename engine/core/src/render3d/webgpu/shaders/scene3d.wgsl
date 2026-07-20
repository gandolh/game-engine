// Cozy flat/toon-shaded scene shader for the WebGPU 3D render layer (08b).
//
// Bind groups grouped by update frequency:
//   @group(0) — per-frame uniform (viewProj, sun direction, day/night mix,
//               ambient strength, render-clock time).
//   @group(1) — the material table, bound once per frame (a storage array of
//               flat-color + emissive-flag entries; see buffers.ts packMaterials
//               for the exact byte layout this must match).
// Per-instance data (model matrix + tint) comes through vertex buffer 1
// (instance step mode), NOT a bind group — see pipeline-cache.ts.

struct FrameUniform {
  viewProj: mat4x4<f32>,
  sunDir: vec3<f32>,
  dayNight: f32, // 0 = full night, 1 = full day
  ambient: f32,
  time: f32,
};

@group(0) @binding(0) var<uniform> frame: FrameUniform;

struct MaterialEntry {
  color: vec3<f32>,
  emissive: f32,
};

@group(1) @binding(0) var<storage, read> materials: array<MaterialEntry>;

struct VertexInput {
  @location(0) position: vec3<f32>,
  @location(1) materialIndex: f32,
  @location(2) modelCol0: vec4<f32>,
  @location(3) modelCol1: vec4<f32>,
  @location(4) modelCol2: vec4<f32>,
  @location(5) modelCol3: vec4<f32>,
  @location(6) tint: vec4<f32>,
};

struct VertexOutput {
  @builtin(position) clipPosition: vec4<f32>,
  @location(0) worldPos: vec3<f32>,
  @location(1) @interpolate(flat) materialIndex: u32,
  @location(2) tint: vec4<f32>,
};

@vertex
fn vs_main(input: VertexInput) -> VertexOutput {
  let model = mat4x4<f32>(input.modelCol0, input.modelCol1, input.modelCol2, input.modelCol3);
  let worldPos = model * vec4<f32>(input.position, 1.0);

  var out: VertexOutput;
  out.clipPosition = frame.viewProj * worldPos;
  out.worldPos = worldPos.xyz;
  out.materialIndex = u32(input.materialIndex);
  out.tint = input.tint;
  return out;
}

@fragment
fn fs_main(input: VertexOutput) -> @location(0) vec4<f32> {
  let entry = materials[input.materialIndex];
  let base = entry.color;

  // Flat shading: derive the true per-face normal from screen-space
  // derivatives of world position instead of packing per-vertex normals —
  // exact for flat-faceted low-poly geometry and needs no extra vertex data.
  let faceNormal = normalize(cross(dpdx(input.worldPos), dpdy(input.worldPos)));

  // Smooth wrapped ("half-Lambert") diffuse instead of a hard toon ramp: the
  // raw dot in [-1,1] is remapped to [0,1] and softened, so light falls off
  // GRADUALLY across every face (no banding) and faces angled away from the
  // sun still receive a gentle gradient rather than snapping to a flat shadow
  // band. A shadow FLOOR then lifts the darkest faces to a cozy dim — this is
  // what guarantees "lighting is applied to every asset": no surface is ever
  // crushed to pure black, whatever its orientation.
  //   DEFERRED SEAM: a TOON_STEPS uniform to quantize this smooth curve back
  //   into hard cel bands would be a cheap follow-up; the pipeline cache
  //   already keys on a toon-steps value so it can slot in without touching
  //   call sites.
  let ndl = dot(faceNormal, normalize(frame.sunDir));
  let wrapped = ndl * 0.5 + 0.5;      // [0,1], smooth across the terminator
  let diffuse = wrapped * wrapped;    // half-Lambert softening
  let shadowFloor = 0.45;             // darkest a directional face may get
  let shade = mix(shadowFloor, 1.0, diffuse);

  // Cheap hemispheric "AO-ish" ambient term: upward-facing faces (roofs,
  // ground) read a touch brighter than vertical walls, at zero extra cost.
  // Added ON TOP of the directional term so shadowed sides never fall to black.
  //   DEFERRED SEAM: true vertex-baked AO / SSAO is intentionally NOT
  //   implemented in this pass (too heavy/risky for a first WebGPU cut) —
  //   this hemispheric term is the documented cheap stand-in.
  //   DEFERRED SEAM: a soft dark contact-shadow disc under each instance
  //   would read nicely but is optional and not implemented here.
  let upFactor = 0.5 + 0.5 * clamp(faceNormal.z, 0.0, 1.0);
  let ambientTerm = frame.ambient * upFactor;

  // Night dims the DIRECTIONAL term toward a lifted floor (never 0) as
  // dayNight -> 0, for a cozy dim night rather than a black-out. Ambient is
  // applied outside this so even full night keeps every surface readable.
  let nightFloor = 0.35;
  let dayFactor = mix(nightFloor, 1.0, frame.dayNight);

  var lit = base * (shade * dayFactor + ambientTerm);

  if (entry.emissive > 0.5) {
    // Emissive surfaces (glowing windows) ignore lighting entirely and
    // brighten as night falls, so they read as light sources after dusk.
    let glowBoost = mix(1.6, 1.0, frame.dayNight);
    lit = base * glowBoost;
  }

  lit = lit * input.tint.rgb;

  return vec4<f32>(lit, input.tint.a);
}
