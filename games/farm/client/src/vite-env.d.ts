// Ambient typing for import.meta.env — tsconfig sets types:[] so vite/client is not pulled in.
interface ImportMetaEnv {
  /** Deploy base path, set via Vite's `base` config (e.g. "/" or "/farm-valley/"). */
  readonly BASE_URL: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

// WGSL shader sources imported with Vite's `?raw` suffix — pulled into the farm
// client's type graph via `@engine/core`'s WebGPU renderer stack (parity with the
// Citadel client, which declares the same module).
declare module "*.wgsl?raw" {
  const src: string;
  export default src;
}
