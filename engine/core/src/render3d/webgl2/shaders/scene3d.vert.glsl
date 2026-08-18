#version 300 es

// scene3d.vert.glsl — WebGL2/GLSL ES 3.00 port of ../../webgpu/shaders/scene3d.wgsl's
// vs_main. Attribute locations are FIXED by ../pipeline-cache.ts (mechanically derived
// from ../../buffers.ts's packing contract, itself owned by brief 10/11) — this file
// declares matching layout(location = N) qualifiers; it does not choose the numbers.
//
// The one deliberate change from the WGSL original: clip-space depth convention.
// ../../mat4.ts's perspective() targets WebGPU/D3D's z in [0,1] clip-space range
// (shared code, must not change — see its own header). WebGL2's rasterizer expects
// OpenGL's z in [-1,1] range. The remap happens HERE, on gl_Position, rather than in
// mat4.ts: the standard "zero-to-one -> negative-one-to-one" fixup is
// z' = z*2 - w (equivalent to 2*(z/w) - 1 after the perspective divide, but applied
// pre-divide so interpolation stays perspective-correct). Left uncorrected, near/far
// ordering stays monotonic (so nothing renders "inside out"), but only the top half
// of the GL depth buffer's range would ever be used, wasting precision — this fixup
// restores full use of the buffer.

layout(std140) uniform Frame {
  mat4 viewProj;
  vec3 sunDir;
  float dayNight;
  float ambient;
  float time;
} frame;

layout(location = 0) in vec3 a_position;
layout(location = 1) in float a_materialIndex;
layout(location = 2) in vec4 a_modelCol0;
layout(location = 3) in vec4 a_modelCol1;
layout(location = 4) in vec4 a_modelCol2;
layout(location = 5) in vec4 a_modelCol3;
layout(location = 6) in vec4 a_tint;

out vec3 v_worldPos;
flat out uint v_materialIndex;
out vec4 v_tint;

void main() {
  mat4 model = mat4(a_modelCol0, a_modelCol1, a_modelCol2, a_modelCol3);
  vec4 worldPos = model * vec4(a_position, 1.0);
  vec4 clipPosition = frame.viewProj * worldPos;

  // WebGPU/D3D clip-space z in [0,1] -> GL clip-space z in [-1,1]. See this
  // file's header for why the fixup lives here and not in the shared mat4.ts.
  gl_Position = vec4(clipPosition.xy, clipPosition.z * 2.0 - clipPosition.w, clipPosition.w);

  v_worldPos = worldPos.xyz;
  v_materialIndex = uint(a_materialIndex);
  v_tint = a_tint;
}
