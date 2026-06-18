// Ambient typing for import.meta.env and import.meta.url in Worker construction.
interface ImportMetaEnv {
  readonly BASE_URL: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
  readonly url: string;
}
