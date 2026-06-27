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
// renders via the @engine WebGPU stack — brief 27).
declare module "*.wgsl?raw" {
  const src: string;
  export default src;
}

// CSS imported for its side effect (Vite injects it). `import "./style.css"`.
declare module "*.css";
