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

// WGSL shader sources imported with Vite's `?raw` suffix (used once Citadel
// renders via the @engine WebGL2 stack — brief 27).
declare module "*.wgsl?raw" {
  const src: string;
  export default src;
}

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
