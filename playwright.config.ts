import { existsSync } from 'node:fs';
import { defineConfig, type PlaywrightTestConfig } from '@playwright/test';
import { GPU_ARGS } from './tools/lib/gpu-args.ts';

const PORT = 5199;
/** A deployed copy to test instead of a local server, such as the live site; ends with a slash. */
const remote = process.env.E2E_BASE_URL;
const preview = process.env.E2E_TARGET === 'production' || Boolean(remote);
const baseURL = remote ?? `http://127.0.0.1:${PORT}/`;

// Branded browsers are tested when this machine has them; Playwright cannot download them for us here.
const chromeInstalled = [
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
  `${process.env.LOCALAPPDATA ?? ''}/Google/Chrome/Application/chrome.exe`,
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/opt/google/chrome/chrome',
].some((path) => existsSync(path));
const edgeInstalled = [
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
  '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge',
  '/opt/microsoft/msedge/msedge',
].some((path) => existsSync(path));

const projects: NonNullable<PlaywrightTestConfig['projects']> = [
  { name: 'chromium', use: { browserName: 'chromium', launchOptions: { args: GPU_ARGS } } },
  { name: 'firefox', use: { browserName: 'firefox', launchOptions: { firefoxUserPrefs: { 'webgl.force-enabled': true, 'webgl.disabled': false } } } },
];
if (chromeInstalled) projects.push({ name: 'chrome', use: { browserName: 'chromium', channel: 'chrome', launchOptions: { args: GPU_ARGS } } });
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
  webServer: remote
    ? undefined
    : {
        command: preview ? `npx vite preview --host 127.0.0.1 --port ${PORT} --strictPort` : `npx vite --host 127.0.0.1 --port ${PORT} --strictPort`,
        url: baseURL,
        reuseExistingServer: false,
        timeout: 60_000,
      },
  projects,
});
