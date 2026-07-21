// Ambient declaration for WGSL shader sources imported with Vite's `?raw`
// suffix. `@mathquest/sim-core` imports the `@engine/core` root barrel, which
// transitively re-exports the WebGPU render passes that `import … from
// "./shaders/*.wgsl?raw"`. This keeps `tsc --noEmit` happy for the headless
// sim package (the sim never actually loads a shader) — same precedent as
// `@hollow/sim-core`'s own `src/wgsl.d.ts`.
declare module "*.wgsl?raw" {
  const src: string;
  export default src;
}
