import { defineConfig } from 'vitest/config';

export default defineConfig(({ mode }) => ({
  base: './',
  define: {
    // Debug panel, QA hooks and cheats exist only outside the production build.
    __QA__: JSON.stringify(mode !== 'production'),
  },
  build: {
    target: 'es2022',
    outDir: mode === 'qa' ? 'dist-qa' : 'dist',
    assetsInlineLimit: 0,
    chunkSizeWarningLimit: 1600,
    sourcemap: false,
  },
  test: {
    include: ['tests/unit/**/*.test.ts'],
    environment: 'node',
  },
}));
