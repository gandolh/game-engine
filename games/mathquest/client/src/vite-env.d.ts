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

// WGSL shader sources imported with Vite's `?raw` suffix. `@mathquest/client`
// imports the `@engine/core` root barrel (via `@mathquest/sim-core` and
// directly in `main.ts`), which transitively re-exports the WebGPU render
// passes that `import … from "./shaders/*.wgsl?raw"`. MateQuest's M0
// renderer explicitly requests the `"canvas2d"` backend (no WebGPU), but
// this keeps `tsc --noEmit` happy regardless — mirrors Hollow's
// vite-env.d.ts.

// CSS imported for its side effect (Vite injects it). `import "./style.css"`.
declare module "*.css";

// Ambient declaration for GLSL shader sources imported with Vite's `?raw` suffix.
// Needed per package: ambient `.d.ts` files are only visible inside a program whose
// `include` covers them, and this client imports the `@engine/core` barrel, which
// pulls in the WebGL2 render passes that `import … from "./shaders/*.glsl?raw"`.
declare module "*.glsl?raw" {
  const src: string;
  export default src;
}
