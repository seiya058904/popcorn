import { chromium } from '@playwright/test';
import { preview } from 'vite';
import { argValue } from './lib/harness.ts';
import { GPU_ARGS } from './lib/gpu-args.ts';

/**
 * Usage: node tools/first-visit.ts [--mbps=10] [--latency=40] [--size=1920x1080] [--url=https://…]
 *
 * A first visit to the production build, as a new player makes it: empty cache, a throttled
 * connection, then ten seconds of play right after the title. Reports when the loading screen
 * and the title appeared, how much was downloaded, and the frames of the first seconds of play.
 * Needs a fresh `npm run build`, unless --url points at a deployed copy.
 */
const mbps = Number(argValue('mbps') ?? 10);
const latency = Number(argValue('latency') ?? 40);
const [width, height] = (argValue('size') ?? '1920x1080').split('x').map(Number);
const remote = argValue('url');

const server = remote ? null : await preview({ preview: { host: '127.0.0.1', port: 0 }, logLevel: 'warn' });
const url = remote ?? server!.resolvedUrls!.local[0]!;
const browser = await chromium.launch({ args: GPU_ARGS });
try {
  const context = await browser.newContext({ viewport: { width: width!, height: height! }, deviceScaleFactor: 1 });
  const page = await context.newPage();
  const problems: string[] = [];
  page.on('pageerror', (error) => problems.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error') problems.push(message.text());
  });
  page.on('requestfailed', (request) => problems.push(`failed: ${request.url()}`));
  const cdp = await context.newCDPSession(page);
  await cdp.send('Network.enable');
  await cdp.send('Network.setCacheDisabled', { cacheDisabled: true });
  await cdp.send('Network.emulateNetworkConditions', {
    offline: false,
    latency,
    downloadThroughput: (mbps * 1e6) / 8,
    uploadThroughput: (mbps * 1e6) / 16,
  });
  let bytes = 0;
  let requests = 0;
  cdp.on('Network.loadingFinished', (event: { encodedDataLength: number }) => {
    bytes += event.encodedDataLength;
    requests += 1;
  });

  await page.goto(url, { waitUntil: 'commit' });
  await page.waitForFunction(() => !document.querySelector('#boot') && document.querySelector('.title-logo'), undefined, { timeout: 120_000 });
  const timing = await page.evaluate(() => {
    const paint = performance.getEntriesByName('first-contentful-paint')[0];
    const marks = Object.fromEntries(performance.getEntriesByType('mark').filter((mark) => mark.name.startsWith('boot:')).map((mark) => [mark.name.slice(5), Math.round(mark.startTime)]));
    return { firstPaintMs: Math.round(paint?.startTime ?? -1), titleMs: Math.round(performance.now()), marks };
  });

  // Start, then pop the pot for ten seconds, timing every frame.
  // The start button breathes, so it is never "stable": press its center like a player would.
  const start = (await page.locator('[data-action="start"]').boundingBox())!;
  await page.mouse.click(start.x + start.width / 2, start.y + start.height / 2);
  await page.waitForFunction(() => !document.querySelector('.title'));
  const frames = await page.evaluate(
    ({ w, h }) =>
      new Promise<number[]>((resolve) => {
        const intervals: number[] = [];
        const canvas = document.querySelector('#stage')!;
        const click = setInterval(() => {
          const init = { clientX: w * 0.42, clientY: h * 0.55, button: 0, bubbles: true, pointerId: 1, isPrimary: true };
          canvas.dispatchEvent(new PointerEvent('pointerdown', init));
          canvas.dispatchEvent(new PointerEvent('pointerup', init));
        }, 125);
        let last = performance.now();
        const end = last + 10_000;
        const step = (now: number): void => {
          intervals.push(now - last);
          last = now;
          if (now < end) requestAnimationFrame(step);
          else {
            clearInterval(click);
            resolve(intervals);
          }
        };
        requestAnimationFrame(step);
      }),
    { w: width!, h: height! },
  );
  const sorted = [...frames].sort((a, b) => a - b);
  console.log(
    JSON.stringify({
      network: `${mbps} Mbps, ${latency} ms`,
      requests,
      downloadedMb: Number((bytes / 1048576).toFixed(2)),
      ...timing,
      play: {
        frames: frames.length,
        meanMs: Number((frames.reduce((sum, value) => sum + value, 0) / frames.length).toFixed(2)),
        p99Ms: Number(sorted[Math.floor((sorted.length - 1) * 0.99)]!.toFixed(1)),
        maxMs: Number(sorted[sorted.length - 1]!.toFixed(1)),
        over50ms: frames.filter((value) => value > 50).length,
      },
      problems,
    }),
  );
} finally {
  await browser.close();
  await server?.close();
}
