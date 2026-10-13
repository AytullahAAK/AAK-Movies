/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_TMDB_API_KEY?: string
  readonly VITE_TMDB_READ_ACCESS_TOKEN?: string
  readonly VITE_SITE_URL?: string
  readonly DEV: boolean
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
