/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Google Analytics 4 measurement id (production only, see .env.production). */
  readonly VITE_GA_ID?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
