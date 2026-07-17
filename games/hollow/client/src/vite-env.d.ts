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
// transitively re-exports the WebGPU render passes that `import … from
// "./shaders/*.wgsl?raw"`. Hollow has no renderer yet (chunk hollow-01), but
// this keeps `tsc --noEmit` happy, mirroring Citadel's vite-env.d.ts.
declare module "*.wgsl?raw" {
  const src: string;
  export default src;
}

// CSS imported for its side effect (Vite injects it). `import "./style.css"`.
declare module "*.css";
