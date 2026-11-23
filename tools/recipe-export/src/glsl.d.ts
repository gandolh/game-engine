// Ambient declaration for GLSL shader sources imported with Vite's `?raw` suffix.
//
// Duplicated per package on purpose: ambient `.d.ts` files are only visible inside a
// program whose `include` covers them, and this package imports the `@engine/core`
// barrel, which transitively pulls in the WebGL2 render passes that
// `import … from "./shaders/*.glsl?raw"`. Without a local copy, `tsc` cannot resolve
// those modules. Mirrors the same arrangement the WGSL declarations used.
declare module "*.glsl?raw" {
  const src: string;
  export default src;
}
