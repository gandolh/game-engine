// Ambient declaration for WGSL shader sources imported with Vite's `?raw`
// suffix. `@engine/ui` imports `@engine/core/render`, which transitively reaches
// the WebGPU render passes that `import … from "./shaders/*.wgsl?raw"`. This keeps
// `tsc --noEmit` happy for this package (it never actually loads a shader).
declare module "*.wgsl?raw" {
  const src: string;
  export default src;
}
