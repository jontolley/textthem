import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const dirname = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  plugins: [react()],
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
});
