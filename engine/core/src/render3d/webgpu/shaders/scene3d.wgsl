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

  let ndl = clamp(dot(faceNormal, normalize(frame.sunDir)), 0.0, 1.0);

  // 3-step warm toon ramp: hard bands rather than a continuous multiply, the
  // hallmark of cel/toon shading. Mid + dark bands are nudged warm (their
  // red channel sits a hair above green/blue) so shadowed faces read as
  // "cozy dusk" rather than flat neutral grey.
  //   DEFERRED SEAM: a TOON_STEPS uniform to swap in a harder 2-step or
  //   softer 4-step ramp would be a cheap follow-up (the shader would just
  //   branch on an extra frame-uniform int); not implemented here because
  //   the fixed 3-step ramp below already reads as toon-ish and there is no
  //   way to screenshot-compare knob values in this headless pass anyway.
  var ramp: vec3<f32>;
  if (ndl > 0.66) {
    ramp = vec3<f32>(1.0, 1.0, 1.0);
  } else if (ndl > 0.33) {
    ramp = vec3<f32>(0.76, 0.72, 0.68);
  } else {
    ramp = vec3<f32>(0.56, 0.50, 0.46);
  }

  // Cheap hemispheric "AO-ish" ambient term: upward-facing faces (roofs,
  // ground) read a touch brighter than vertical walls, at zero extra cost.
  //   DEFERRED SEAM: true vertex-baked AO / SSAO is intentionally NOT
  //   implemented in this pass (too heavy/risky for a first WebGPU cut) —
  //   this hemispheric term is the documented cheap stand-in.
  //   DEFERRED SEAM: a soft dark contact-shadow disc under each instance
  //   would read nicely but is optional and not implemented here.
  let upFactor = 0.5 + 0.5 * clamp(faceNormal.z, 0.0, 1.0);
  let ambientTerm = frame.ambient * upFactor;

  // Night dims lit (non-emissive) surfaces toward a dim floor as dayNight -> 0.
  let nightFloor = 0.18;
  let dayFactor = mix(nightFloor, 1.0, frame.dayNight);

  var lit = base * ramp * dayFactor + base * ambientTerm;

  if (entry.emissive > 0.5) {
    // Emissive surfaces (glowing windows) ignore lighting entirely and
    // brighten as night falls, so they read as light sources after dusk.
    let glowBoost = mix(1.6, 1.0, frame.dayNight);
    lit = base * glowBoost;
  }

  lit = lit * input.tint.rgb;

  return vec4<f32>(lit, input.tint.a);
}
