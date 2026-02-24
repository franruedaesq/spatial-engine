import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
  resolve: {
    alias: {
      '@spatial-engine/core': path.resolve(__dirname, 'packages/core/src/index.ts'),
      '@spatial-engine/three': path.resolve(__dirname, 'packages/three/src/index.ts'),
    },
  },
  test: {
    include: ['packages/*/tests/**/*.test.ts'],
    environment: 'node',
  },
});
