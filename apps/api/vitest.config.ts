import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
    testTimeout: 30000, // mongodb-memory-server can be slow to start
    pool: 'forks',
  },
});
