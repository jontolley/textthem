import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { execSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const dirname = path.dirname(fileURLToPath(import.meta.url));

/** The commit being built: Cloudflare Pages provides it; locally, ask git. */
function buildCommit(): string | null {
  if (process.env.CF_PAGES_COMMIT_SHA) return process.env.CF_PAGES_COMMIT_SHA;
  try {
    return execSync('git rev-parse HEAD', { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim();
  } catch {
    return null;
  }
}

export default defineConfig(({ command }) => ({
  plugins: [react()],
  // Shown on the Help page. The dev server isn't a build, so it reports none.
  define: {
    __APP_COMMIT__: JSON.stringify(command === 'build' ? buildCommit() : null),
    __APP_BUILT_AT__: JSON.stringify(command === 'build' ? new Date().toISOString() : null),
  },
  // Read env from the monorepo root so a single .env serves api + web.
  // Only VITE_-prefixed vars are exposed to client code.
  envDir: path.resolve(dirname, '../..'),
  resolve: {
    alias: {
      '@': path.resolve(dirname, './src'),
    },
  },
  server: {
    port: 5173,
  },
}));
