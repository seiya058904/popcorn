import { defineConfig } from '@playwright/test';
import { GPU_ARGS } from './tools/lib/gpu-args.ts';

const PORT = 5199;

export default defineConfig({
  testDir: 'tests/e2e',
  outputDir: 'artifacts/e2e',
  fullyParallel: false,
  workers: 1,
  timeout: 90_000,
  reporter: [['list']],
  use: {
    baseURL: `http://127.0.0.1:${PORT}`,
    viewport: { width: 1280, height: 720 },
  },
  webServer: {
    command: `npx vite --host 127.0.0.1 --port ${PORT} --strictPort`,
    url: `http://127.0.0.1:${PORT}`,
    reuseExistingServer: true,
    timeout: 60_000,
  },
  projects: [
    {
      name: 'chromium',
      use: { browserName: 'chromium', launchOptions: { args: GPU_ARGS } },
    },
  ],
});
