// Ambient typing for import.meta.env.
interface ImportMetaEnv {
  /** Deploy base path, set via Vite's `base` config ("/" or "/games/"). */
  readonly BASE_URL: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

// Vite bundles imported stylesheets.
declare module "*.css";
