// Ambient typing for import.meta.env and import.meta.url in Worker construction.
interface ImportMetaEnv {
  readonly BASE_URL: string;
  /** Vite dev-mode flag — true under `vite dev`, false in a production build. */
  readonly DEV: boolean;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
  readonly url: string;
}

// WGSL shader sources imported with Vite's `?raw` suffix. `@hollow/client`
// imports the `@engine/core` root barrel (via @hollow/sim-core), which
// transitively re-exports `render3d/webgpu/pipeline-cache.ts`'s `import …
// from "./shaders/scene3d.wgsl?raw"` (still present, not yet deleted — brief
// 12 removes it once every consumer is off it). This keeps `tsc --noEmit`
// happy, mirroring Citadel's vite-env.d.ts.

// GLSL ES 3.00 shader sources imported with Vite's `?raw` suffix (WebGL2
// migration brief 11). `@hollow/client`'s `render3d/app.ts` now imports
// `@engine/core/render3d`'s barrel, which re-exports the WebGL2
// `SceneRenderer3D` (`render3d/webgl2/renderer3d.ts`), itself importing
// `"./shaders/scene3d.{vert,frag}.glsl?raw"` — same ambient-declaration need
// as the WGSL entry above, one file extension over.
declare module "*.glsl?raw" {
  const src: string;
  export default src;
}

// CSS imported for its side effect (Vite injects it). `import "./style.css"`.
declare module "*.css";
