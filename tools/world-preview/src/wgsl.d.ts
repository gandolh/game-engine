// Ambient declaration for WGSL shader sources imported with Vite's `?raw`
// suffix. `@tool/world-preview` imports the `@engine/core` root barrel, which
// transitively re-exports the WebGPU render passes that `import … from
// "./shaders/*.wgsl?raw"`. The preview renders through Canvas2D and never
// loads a shader; this keeps `tsc --noEmit` happy.
declare module "*.wgsl?raw" {
  const src: string;
  export default src;
}
