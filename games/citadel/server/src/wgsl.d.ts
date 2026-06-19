// Ambient declaration for WGSL shader sources imported with Vite's `?raw`
// suffix. `@citadel/server` imports `@citadel/sim-core`, which pulls in the
// `@engine/core` root barrel that transitively re-exports the WebGPU render
// passes (they `import … from "./shaders/*.wgsl?raw"`). The headless server
// never loads a shader; this keeps `tsc --noEmit` happy.
declare module "*.wgsl?raw" {
  const src: string;
  export default src;
}
