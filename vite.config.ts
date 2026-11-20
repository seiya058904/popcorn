import { execSync } from 'node:child_process';
import { defineConfig } from 'vitest/config';

/** The commit a build was made from, so a deployed copy can be matched to its source. */
function buildCommit(): string {
  if (process.env.GITHUB_SHA) return process.env.GITHUB_SHA;
  try {
    return execSync('git rev-parse HEAD', { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim();
  } catch {
    return 'unknown';
  }
}

export default defineConfig(({ mode }) => ({
  base: './',
  define: {
    // Debug panel, QA hooks and cheats exist only outside the production build.
    __QA__: JSON.stringify(mode !== 'production'),
  },
  plugins: [
    {
      name: 'build-commit',
      apply: 'build',
      transformIndexHtml: (html: string) => html.replace('</head>', `  <meta name="build" content="${buildCommit()}" />\n  </head>`),
    },
  ],
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
