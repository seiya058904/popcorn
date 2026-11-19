import { expect, test, type Page } from '@playwright/test';
import { STAGES } from '../../src/content/stages.ts';
import type { QaApi } from '../../src/debug/index.ts';

type QaWindow = Window & { __pop: QaApi };

const ready = (page: Page): Promise<unknown> => page.waitForFunction(() => Boolean((window as unknown as Partial<QaWindow>).__pop));
const qa = <T>(page: Page, body: (api: QaApi) => T): Promise<T> =>
  page.evaluate(`(${body.toString()})(window.__pop)`) as Promise<T>;

const LAST_THRESHOLD = STAGES[STAGES.length - 1]!.threshold;

test('the ending can be skipped, and a new pot starts over with its bonus', async ({ page }) => {
  const problems: string[] = [];
  page.on('pageerror', (error) => problems.push(error.message));
  await page.goto('/?play=1');
  await ready(page);
  await page.evaluate((total) => {
    const api = (window as unknown as QaWindow).__pop;
    api.set({ stage: 4, totalEarned: total, popcorn: 1e6, flavors: 12 });
    api.game.sim.state.legacy.flavorAlbum = 12;
  }, LAST_THRESHOLD * 0.995);
  await page.waitForTimeout(400);
  await page.evaluate((extra) => (window as unknown as QaWindow).__pop.earn(extra), LAST_THRESHOLD * 0.01);
  await expect(page.locator('.skip')).toBeVisible();
  await page.locator('.skip').dispatchEvent('pointerdown');
  const credits = page.locator('.dialog.is-credits');
  await expect(credits).toBeVisible();
  await expect(credits.locator('h2')).toHaveText('月亮是一粒玉米');

  await Promise.all([page.waitForEvent('load'), credits.locator('[data-action="restart"]').dispatchEvent('pointerdown')]);
  await ready(page);
  const state = await qa(page, (api) => ({
    total: api.game.sim.state.totalEarned,
    stage: api.game.sim.state.stage,
    album: api.game.sim.state.legacy.flavorAlbum,
    skin: api.game.sim.state.legacy.potSkin,
  }));
  // The pot simmers from the first frame, so the new run may already have a few kernels.
  expect(state.total).toBeLessThan(5);
  expect({ ...state, total: 0 }).toEqual({ total: 0, stage: 0, album: 12, skin: 1 });
  expect(problems).toEqual([]);
});

test('a finished save reopens on the aftermath with the credits', async ({ page }) => {
  await page.goto('/?play=1');
  await ready(page);
  await qa(page, (api) => {
    api.set({ stage: 5, ended: true, totalEarned: 2e17, flavors: 12 });
    return api.game.saves.save();
  });
  await page.reload();
  await ready(page);
  await expect(page.locator('.dialog.is-credits')).toBeVisible();
});

for (const stage of [1, 2, 3, 4]) {
  test(`scene ${stage} loads directly from a save without errors`, async ({ page }) => {
    const problems: string[] = [];
    page.on('pageerror', (error) => problems.push(error.message));
    page.on('console', (message) => {
      if (message.type() === 'error') problems.push(message.text());
    });
    await page.goto('/?capture=1');
    await ready(page);
    await page.evaluate((index) => {
      const api = (window as unknown as QaWindow).__pop;
      api.set({ stage: index, totalEarned: [0, 4e3, 5e7, 5e11, 5e14][index]! });
      api.advance(1);
      api.click(500, 360);
      api.advance(1);
    }, stage);
    const info = await qa(page, (api) => api.info());
    expect(info.drawCalls).toBeLessThanOrEqual(150);
    expect(problems).toEqual([]);
  });
}
