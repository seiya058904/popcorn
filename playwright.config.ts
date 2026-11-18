import { existsSync } from 'node:fs';
import { defineConfig, type PlaywrightTestConfig } from '@playwright/test';
import { GPU_ARGS } from './tools/lib/gpu-args.ts';

const PORT = 5199;
const preview = process.env.E2E_TARGET === 'production';
const baseURL = `http://127.0.0.1:${PORT}`;

const edgeInstalled = ['C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', 'C:/Program Files/Microsoft/Edge/Application/msedge.exe'].some((path) =>
  existsSync(path),
);

const projects: NonNullable<PlaywrightTestConfig['projects']> = [
  { name: 'chromium', use: { browserName: 'chromium', launchOptions: { args: GPU_ARGS } } },
  { name: 'chrome', use: { browserName: 'chromium', channel: 'chrome', launchOptions: { args: GPU_ARGS } } },
  { name: 'firefox', use: { browserName: 'firefox', launchOptions: { firefoxUserPrefs: { 'webgl.force-enabled': true, 'webgl.disabled': false } } } },
];
if (edgeInstalled) projects.push({ name: 'edge', use: { browserName: 'chromium', channel: 'msedge', launchOptions: { args: GPU_ARGS } } });

export default defineConfig({
  testDir: preview ? 'tests/production' : 'tests/e2e',
  outputDir: 'artifacts/e2e',
  fullyParallel: false,
  workers: 1,
  timeout: 120_000,
  expect: { timeout: 10_000 },
  reporter: [['list']],
  use: { baseURL, viewport: { width: 1280, height: 720 } },
  webServer: {
    command: preview ? `npx vite preview --host 127.0.0.1 --port ${PORT} --strictPort` : `npx vite --host 127.0.0.1 --port ${PORT} --strictPort`,
    url: baseURL,
    reuseExistingServer: false,
    timeout: 60_000,
  },
  projects,
});
