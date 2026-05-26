export const SPRITE_WGSL = /* wgsl */ `
struct VsOut {
  @builtin(position) pos: vec4f,
  @location(0) uv: vec2f,
  @location(1) tint: vec4f,
};

struct Camera {
  viewProj: mat4x4f,
};

struct Instance {
  posSize: vec4f,
  uvRect: vec4f,
  tint: vec4f,
  rotLayer: vec4f,
};

@group(0) @binding(0) var<uniform> camera: Camera;
@group(0) @binding(1) var atlasTex: texture_2d<f32>;
@group(0) @binding(2) var atlasSamp: sampler;
@group(0) @binding(3) var<storage, read> instances: array<Instance>;

@vertex
fn vs_main(@builtin(vertex_index) vi: u32, @builtin(instance_index) ii: u32) -> VsOut {
  let quad = array<vec2f, 6>(
    vec2f(0.0, 0.0), vec2f(1.0, 0.0), vec2f(0.0, 1.0),
    vec2f(1.0, 0.0), vec2f(1.0, 1.0), vec2f(0.0, 1.0),
  );
  let inst = instances[ii];
  let local = quad[vi] - vec2f(0.5, 0.5);
  let rot = inst.rotLayer.x;
  let c = cos(rot);
  let s = sin(rot);
  let scaled = vec2f(local.x * inst.posSize.z, local.y * inst.posSize.w);
  let rotated = vec2f(scaled.x * c - scaled.y * s, scaled.x * s + scaled.y * c);
  let worldPos = rotated + inst.posSize.xy;
  let depth = clamp(inst.rotLayer.y / 1024.0, -0.99, 0.99);

  var out: VsOut;
  out.pos = camera.viewProj * vec4f(worldPos, depth, 1.0);
  out.uv = inst.uvRect.xy + quad[vi] * inst.uvRect.zw;
  out.tint = inst.tint;
  return out;
}

@fragment
fn fs_main(in: VsOut) -> @location(0) vec4f {
  let s = textureSample(atlasTex, atlasSamp, in.uv);
  return s * in.tint;
}
`;
