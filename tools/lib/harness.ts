import { chromium, type Browser, type Page } from '@playwright/test';
import { createServer, type ViteDevServer } from 'vite';
import { GPU_ARGS, UNCAPPED_ARGS } from './gpu-args.ts';
import type { QaApi } from '../../src/debug/index.ts';

export interface Harness {
  server: ViteDevServer;
  browser: Browser;
  baseUrl: string;
  open(query: string, size: { width: number; height: number }): Promise<Page>;
  close(): Promise<void>;
}

export async function startHarness(options: { uncapped?: boolean; extraArgs?: string[] } = {}): Promise<Harness> {
  const server = await createServer({
    // No file watching: tools must not be interrupted by edits made while they run.
    server: { host: '127.0.0.1', port: 0, hmr: false, watch: null },
    logLevel: 'warn',
  });
  await server.listen();
  const baseUrl = server.resolvedUrls?.local[0];
  if (!baseUrl) throw new Error('Vite did not report a local URL');
  const browser = await chromium.launch({
    args: [...GPU_ARGS, ...(options.uncapped ? UNCAPPED_ARGS : []), ...(options.extraArgs ?? [])],
  });

  return {
    server,
    browser,
    baseUrl,
    async open(query, size) {
      const page = await browser.newPage({ viewport: size, deviceScaleFactor: 1 });
      page.on('pageerror', (error) => console.error(`[pageerror] ${error.message}`));
      page.on('console', (message) => {
        if (message.type() === 'error') console.error(`[console] ${message.text()}`);
      });
      await page.goto(`${baseUrl}?play=1&${query}`);
      await page.waitForFunction(() => Boolean((window as Window & { __pop?: QaApi }).__pop));
      return page;
    },
    async close() {
      await browser.close();
      await server.close();
    },
  };
}

export function argValue(name: string): string | undefined {
  const prefix = `--${name}=`;
  return process.argv.find((arg) => arg.startsWith(prefix))?.slice(prefix.length);
}

export function hasFlag(name: string): boolean {
  return process.argv.includes(`--${name}`);
}
