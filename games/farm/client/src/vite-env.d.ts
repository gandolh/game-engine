// Ambient typing for import.meta.env — tsconfig sets types:[] so vite/client is not pulled in.
interface ImportMetaEnv {
  /** Deploy base path, set via Vite's `base` config (e.g. "/" or "/farm-valley/"). */
  readonly BASE_URL: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
