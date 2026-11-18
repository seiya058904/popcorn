import { expect, test, type Page } from '@playwright/test';
import type { QaApi } from '../../src/debug/index.ts';

type QaWindow = Window & { __pop: QaApi };

const ready = (page: Page): Promise<unknown> => page.waitForFunction(() => Boolean((window as unknown as Partial<QaWindow>).__pop));

/** Pixels whose color moved by more than a visible amount between two frames. */
function changedPixels(a: number[], b: number[]): number {
  let changed = 0;
  for (let i = 0; i < a.length; i += 4) {
    const delta = Math.abs(a[i]! - b[i]!) + Math.abs(a[i + 1]! - b[i + 1]!) + Math.abs(a[i + 2]! - b[i + 2]!);
    if (delta > 45) changed += 1;
  }
  return changed;
}

test('a click changes the picture on the very next frame', async ({ page }) => {
  await page.goto('/?capture=1');
  await ready(page);
  const result = await page.evaluate(() => {
    const api = (window as unknown as QaWindow).__pop;
    const region = [400, 240, 280, 200] as const;
    api.earn(20);
    api.advance(4);
    const before = api.readRegion(...region);
    api.advance(1 / 60);
    const idle = api.readRegion(...region);
    api.click(540, 330);
    api.advance(1 / 60);
    const pressed = api.readRegion(...region);
    return { before, idle, pressed };
  });
  const baseline = changedPixels(result.before, result.idle);
  const response = changedPixels(result.idle, result.pressed);
  console.log(`changed pixels: idle frame ${baseline}, frame after click ${response}`);
  expect(response).toBeGreaterThan(baseline + 12);
});

test('clicking ten times per second keeps every frame on time', async ({ page }) => {
  const problems: string[] = [];
  page.on('pageerror', (error) => problems.push(error.message));
  await page.goto('/?play=1');
  await ready(page);
  // Let start-up work finish; the requirement concerns play, not page load.
  await page.waitForTimeout(1500);
  // Clicks are issued inside the page so that automation latency is not measured as game stutter.
  const { intervals, clicks, cpuWorst } = await page.evaluate(async () => {
    const api = (window as unknown as QaWindow).__pop;
    const cpu: number[] = [];
    api.game.onFrame(() => cpu.push(api.game.lastFrameCpuMs));
    const timer = setInterval(() => api.click(540, 390), 100);
    const sampled = await api.sampleFrames(6);
    clearInterval(timer);
    return { intervals: sampled, clicks: api.game.sim.state.stats.clicks, cpuWorst: Math.max(...cpu) };
  });
  const sorted = [...intervals].sort((a, b) => a - b);
  const p99 = sorted[Math.floor(sorted.length * 0.99)]!;
  const worst = sorted[sorted.length - 1]!;
  console.log(`frames ${sorted.length}, p99 ${p99.toFixed(1)} ms, worst ${worst.toFixed(1)} ms, worst CPU ${cpuWorst.toFixed(1)} ms, clicks ${clicks}`);
  expect(clicks).toBeGreaterThanOrEqual(58);
  expect(p99).toBeLessThan(20);
  expect(worst).toBeLessThan(34);
  expect(cpuWorst).toBeLessThan(12);
  expect(problems).toEqual([]);
});
