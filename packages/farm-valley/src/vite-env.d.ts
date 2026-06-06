// Minimal ambient typing for the Vite-injected import.meta.env we rely on.
// (The repo's tsconfig sets `types: []`, so we don't pull in `vite/client`.)
interface ImportMetaEnv {
  /** Deploy base path, set via Vite's `base` config (e.g. "/" or "/farm-valley/"). */
  readonly BASE_URL: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
