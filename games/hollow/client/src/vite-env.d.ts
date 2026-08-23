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

// GLSL ES 3.00 shader sources imported with Vite's `?raw` suffix (WebGL2
// migration brief 11). `@hollow/client`'s `render3d/app.ts` imports
// `@engine/core/render3d`'s barrel, which re-exports the WebGL2
// `SceneRenderer3D` (`render3d/webgl2/renderer3d.ts`), itself importing
// `"./shaders/scene3d.{vert,frag}.glsl?raw"` — hence this ambient declaration.
// (A `*.wgsl?raw` twin lived here until 2026-08-18; WGSL is gone with WebGPU.)
declare module "*.glsl?raw" {
  const src: string;
  export default src;
}

// CSS imported for its side effect (Vite injects it). `import "./style.css"`.
declare module "*.css";
