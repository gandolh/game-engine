export const TILEMAP_WGSL = /* wgsl */ `
struct VsOut {
  @builtin(position) pos: vec4f,
  @location(0) uv: vec2f,
};

struct Camera {
  viewProj: mat4x4f,
};

// One instance per non-empty tile in a chunk.
// posSize.xy = world position of tile origin (bottom-left or top-left in world units)
// posSize.zw = world-space size of tile (width, height)
// uvRect.xy  = atlas uv origin
// uvRect.zw  = atlas uv size
// depth      = render depth (z) — used as layer ordering
struct TileInstance {
  posSize: vec4f,
  uvRect: vec4f,
  depth: vec4f,
};

@group(0) @binding(0) var<uniform> camera: Camera;
@group(0) @binding(1) var atlasTex: texture_2d<f32>;
@group(0) @binding(2) var atlasSamp: sampler;
@group(0) @binding(3) var<storage, read> instances: array<TileInstance>;

@vertex
fn vs_main(@builtin(vertex_index) vi: u32, @builtin(instance_index) ii: u32) -> VsOut {
  let quad = array<vec2f, 6>(
    vec2f(0.0, 0.0), vec2f(1.0, 0.0), vec2f(0.0, 1.0),
    vec2f(1.0, 0.0), vec2f(1.0, 1.0), vec2f(0.0, 1.0),
  );
  let inst = instances[ii];
  let local = quad[vi];
  let worldPos = inst.posSize.xy + vec2f(local.x * inst.posSize.z, local.y * inst.posSize.w);
  let depth = clamp(inst.depth.x / 1024.0, -0.99, 0.99);

  var out: VsOut;
  out.pos = camera.viewProj * vec4f(worldPos, depth, 1.0);
  out.uv = inst.uvRect.xy + local * inst.uvRect.zw;
  return out;
}

@fragment
fn fs_main(in: VsOut) -> @location(0) vec4f {
  return textureSample(atlasTex, atlasSamp, in.uv);
}
`;
