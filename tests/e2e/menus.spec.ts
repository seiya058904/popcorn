import { expect, test, type Page } from '@playwright/test';
import type { QaApi } from '../../src/debug/index.ts';

type QaWindow = Window & { __pop: QaApi };

const ready = (page: Page): Promise<unknown> => page.waitForFunction(() => Boolean((window as unknown as Partial<QaWindow>).__pop));
const qa = <T>(page: Page, body: (api: QaApi) => T): Promise<T> =>
  page.evaluate(`(${body.toString()})(window.__pop)`) as Promise<T>;
const press = (page: Page, selector: string): Promise<void> => page.locator(selector).first().dispatchEvent('pointerdown');

test('the title screen holds the economy until the game starts', async ({ page }) => {
  await page.goto('/');
  await ready(page);
  await expect(page.locator('.title-logo')).toBeVisible();
  // The pot's side of the screen: the canvas is exposed here, beside the title column.
  await page.mouse.click(900, 400);
  await page.waitForTimeout(300);
  expect(await qa(page, (api) => api.game.sim.state.stats.clicks)).toBe(0);
  await press(page, '[data-action="start"]');
  // The first click counts straight away, even while the title is still fading out.
  await page.mouse.click(400, 500);
  expect(await qa(page, (api) => api.game.sim.state.stats.clicks)).toBe(1);
  await expect(page.locator('.title')).toHaveCount(0);
});

test('pause stops production and settings persist across a reload', async ({ page }) => {
  await page.goto('/?play=1');
  await ready(page);
  await qa(page, (api) => {
    api.earn(500);
    api.buy(0, 5);
  });
  await page.keyboard.press('Escape');
  await expect(page.locator('.dialog.menu h2')).toHaveText('暂停一下');
  const before = await qa(page, (api) => api.game.sim.state.totalEarned);
  await page.waitForTimeout(500);
  expect(await qa(page, (api) => api.game.sim.state.totalEarned)).toBe(before);

  await page.locator('.menu-list .btn', { hasText: '设置' }).dispatchEvent('pointerdown');
  await page.locator('.menu-row', { hasText: '屏幕震动' }).locator('.menu-chip', { hasText: '关' }).dispatchEvent('pointerdown');
  await page.locator('.menu-row', { hasText: '演出速度' }).locator('.menu-chip', { hasText: '2×' }).dispatchEvent('pointerdown');
  await page.locator('.menu-row', { hasText: '画质' }).locator('.menu-chip', { hasText: '低' }).dispatchEvent('pointerdown');
  expect(await qa(page, (api) => api.game.stage.quality.tier)).toBe('low');
  await page.waitForTimeout(100);
  await page.reload();
  await ready(page);
  const settings = await qa(page, (api) => ({ ...api.game.settings, tier: api.game.stage.quality.tier }));
  expect(settings).toMatchObject({ screenShake: false, showSpeed: 2, quality: 'low', tier: 'low' });
});

test('a save exported here can be imported into a fresh browser profile', async ({ page, browser }) => {
  await page.goto('/?play=1');
  await ready(page);
  await qa(page, (api) => {
    api.earn(900);
    api.buy(0, 7);
  });
  const text = await qa(page, (api) => api.game.saves.exportText());

  const other = await browser.newContext();
  const fresh = await other.newPage();
  await fresh.goto('/?play=1');
  await ready(fresh);
  await fresh.keyboard.press('Escape');
  await fresh.locator('.menu-list .btn', { hasText: '存档管理' }).dispatchEvent('pointerdown');
  await fresh.locator('.menu-text').fill('garbage');
  await press(fresh, '[data-action="import"]');
  await expect(fresh.locator('.menu-status')).toContainText('不是有效的存档');
  await fresh.locator('.menu-text').fill(text);
  await Promise.all([fresh.waitForNavigation(), press(fresh, '[data-action="import"]')]);
  await ready(fresh);
  expect(await qa(fresh, (api) => api.game.sim.state.owned[0])).toBe(7);
  await other.close();
});

test('wiping needs confirmation and really clears the save', async ({ page }) => {
  await page.goto('/?play=1');
  await ready(page);
  await qa(page, (api) => {
    api.earn(900);
    api.buy(0, 3);
    return api.game.saves.save();
  });
  await page.keyboard.press('Escape');
  await page.locator('.menu-list .btn', { hasText: '存档管理' }).dispatchEvent('pointerdown');
  await press(page, '[data-action="wipe"]');
  expect(await qa(page, (api) => api.game.sim.state.owned[0])).toBe(3);
  await Promise.all([page.waitForNavigation(), press(page, '[data-action="wipe"]')]);
  await ready(page);
  expect(await qa(page, (api) => api.game.sim.state.owned[0])).toBe(0);
});

test('time away pays out, and a clock moved backward pays nothing', async ({ page }) => {
  await page.goto('/?play=1');
  await ready(page);
  await qa(page, (api) => {
    api.earn(900);
    api.buy(0, 10);
    return api.game.saves.save();
  });
  const paid = await qa(page, (api) => {
    const before = api.game.sim.state.totalEarned;
    const later = Date.now() + 3_600_000;
    api.game.saves.resume(later);
    const first = api.game.sim.state.totalEarned - before;
    // Returning again at the same moment must not pay a second time.
    api.game.saves.resume(later);
    return { first, second: api.game.sim.state.totalEarned - before - first };
  });
  expect(paid.first).toBeGreaterThan(0);
  expect(paid.second).toBe(0);
  const rolledBack = await qa(page, (api) => {
    const before = api.game.sim.state.totalEarned;
    api.game.sim.state.savedAt = Date.now() + 86_400_000;
    api.game.saves.resume(Date.now());
    return api.game.sim.state.totalEarned - before;
  });
  expect(rolledBack).toBe(0);
});
