/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Base URL of the extraction API the Extract page calls. Defaults to
   *  http://127.0.0.1:8000 — see `src/pages/extract/config.ts`. */
  readonly VITE_EXTRACT_API_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
