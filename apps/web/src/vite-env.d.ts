/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_CLERK_PUBLISHABLE_KEY: string;
  readonly VITE_API_BASE_URL: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

/** Git commit this build came from (set in vite.config.ts); null in the dev server. */
declare const __APP_COMMIT__: string | null;
/** ISO-8601 build time (set in vite.config.ts); null in the dev server. */
declare const __APP_BUILT_AT__: string | null;
