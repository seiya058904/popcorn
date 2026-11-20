import { expect, test, type Page } from '@playwright/test';
import type { QaApi } from '../../src/debug/index.ts';

type QaWindow = Window & { __pop: QaApi };

const ready = (page: Page): Promise<unknown> => page.waitForFunction(() => Boolean((window as unknown as Partial<QaWindow>).__pop));
const qa = <T>(page: Page, body: (api: QaApi) => T): Promise<Awaited<T>> => page.evaluate(`(${body.toString()})(window.__pop)`) as Promise<Awaited<T>>;

for (const size of [
  { width: 390, height: 844 },
  { width: 844, height: 390 },
]) {
  test(`at ${size.width}×${size.height} a word about the desktop comes first, fits, and lets the player go on`, async ({ page }) => {
    await page.setViewportSize(size);
    await page.goto('/');
    const card = page.locator('.handheld-card');
    await expect(card).toBeVisible();
    const box = (await card.boundingBox())!;
    expect(box.x).toBeGreaterThanOrEqual(0);
    expect(box.y).toBeGreaterThanOrEqual(0);
    expect(box.x + box.width).toBeLessThanOrEqual(size.width);
    expect(box.y + box.height).toBeLessThanOrEqual(size.height);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    await card.getByRole('button', { name: '仍要进入' }).click();
    await expect(page.locator('.handheld')).toHaveCount(0);
    await expect(page.locator('.title-logo')).toBeVisible();
  });
}

test('a desktop window goes straight to the title', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('.title-logo')).toBeVisible();
  await expect(page.locator('.handheld')).toHaveCount(0);
});

test('the first hint names what holds the kernels, and goes once the player has bought something', async ({ page }) => {
  await page.goto('/?play=1');
  await ready(page);
  const hint = page.locator('.hint');
  await qa(page, (api) => api.advance(0.2));
  await expect(hint).toHaveText('点一下锅里的玉米，也可以按住不放');
  await expect(hint).not.toHaveClass(/is-gone/);
  await qa(page, (api) => {
    api.set({ stage: 1, totalEarned: 40000 });
    api.advance(0.2);
  });
  await expect(hint).toHaveText('点一下碗里的玉米，也可以按住不放');
  await qa(page, (api) => {
    api.set({ popcorn: 1e6 });
    api.buy(0, 1);
    api.advance(0.2);
  });
  await expect(hint).toHaveClass(/is-gone/);
});
