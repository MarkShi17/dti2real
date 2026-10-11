import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';
export default defineConfig({
  resolve: { alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) } },
  test: { include: ['tests/evaluation/outfit-live.test.ts'], environment: 'node', testTimeout: 1200000, hookTimeout: 120000 },
});
