import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';
export default defineConfig({
  resolve: { alias: { '@': fileURLToPath(new URL('../../src', import.meta.url)) } },
  test: { include: ['scripts/search-precision/experiment.test.ts'], environment: 'node', testTimeout: 1800000, fileParallelism: false },
});
