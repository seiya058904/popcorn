import { expect, test, type Page } from '@playwright/test';
import { EGGS } from '../../src/content/props.ts';
import type { QaApi } from '../../src/debug/index.ts';

type QaWindow = Window & { __pop: QaApi };

const ready = (page: Page): Promise<unknown> => page.waitForFunction(() => Boolean((window as unknown as Partial<QaWindow>).__pop));
const qa = <T>(page: Page, body: (api: QaApi) => T): Promise<Awaited<T>> => page.evaluate(`(${body.toString()})(window.__pop)`) as Promise<Awaited<T>>;
const state = (page: Page) =>
  qa(page, (api) => {
    const s = api.game.sim.state;
    return { found: [...s.legacy.found], pokes: s.stats.pokes, clicks: s.stats.clicks, achievements: [...s.legacy.achievements] };
  });

async function open(page: Page): Promise<void> {
  await page.goto('/?play=1');
  await ready(page);
}

/** Every machine of the scenes so far, so the camera has opened out to its widest shot. */
const MACHINES_BY_SCENE = [
  [0, 1, 10],
  [2, 3, 11],
  [4, 5, 12],
  [6, 7, 13],
  [8, 9, 14],
];
/** Early in each scene, before the heap has buried anything. */
const EARLY = [300, 40000, 1e9, 6e11, 4e14];

async function enterScene(page: Page, stage: number): Promise<void> {
  await page.evaluate(
    ({ stage, total, units }) => {
      const api = (window as unknown as QaWindow).__pop;
      api.set({ stage, totalEarned: total, popcorn: 1e30 });
      for (const unit of units) api.buy(unit, 12);
      api.set({ popcorn: 10 });
      api.advance(3);
      api.skipTransition();
      api.advance(1);
    },
    { stage, total: EARLY[stage]!, units: MACHINES_BY_SCENE.slice(0, stage + 1).flat() },
  );
}

test('pointing at a machine names it, and a poke squashes it without taking the pop away', async ({ page }) => {
  await open(page);
  await qa(page, (api) => {
    api.set({ popcorn: 1000, totalEarned: 1000 });
    api.buy(0, 3);
    api.advance(2.5);
  });
  const pan = (await qa(page, (api) => api.machinePoint(0)))!;
  await page.mouse.move(pan.x, pan.y);
  await qa(page, (api) => api.advance(0.1));
  const tag = page.locator('.hover-tag');
  await expect(tag).toHaveClass(/is-on/);
  await expect(tag).toHaveText('戳一下 · 小奶锅');

  const before = await state(page);
  // A held press keeps popping, but it pokes the machine only once.
  await page.mouse.down();
  await page.waitForTimeout(1200);
  await page.mouse.up();
  const after = await state(page);
  expect(after.pokes).toBe(before.pokes + 1);
  expect(after.clicks).toBeGreaterThan(before.clicks + 1);
  expect(after.achievements).toContain('poke-first');

  // Off the machines, the tag goes away.
  await page.mouse.move(5, 5);
  await page.mouse.move(640, 690);
  await qa(page, (api) => api.advance(0.1));
  await expect(tag).not.toHaveClass(/is-on/);
});

test('all fifteen hidden things can be found: each says its line, the album fills and both achievements come', async ({ page }) => {
  test.setTimeout(180_000);
  await open(page);
  const viewport = page.viewportSize()!;
  for (let stage = 0; stage < 5; stage += 1) {
    await enterScene(page, stage);
    for (const egg of EGGS.filter((item) => item.stage === stage)) {
      const point = await page.evaluate((id) => (window as unknown as QaWindow).__pop.eggPoint(id), egg.id);
      expect(point, egg.id).not.toBeNull();
      expect(point!.x, egg.id).toBeGreaterThan(0);
      expect(point!.y, egg.id).toBeGreaterThan(0);
      expect(point!.x, egg.id).toBeLessThan(viewport.width);
      expect(point!.y, egg.id).toBeLessThan(viewport.height);
      await page.mouse.click(point!.x, point!.y);
      await expect(page.locator('.egg-bubble'), egg.id).toHaveText(egg.blurb);
      expect((await state(page)).found, egg.id).toContain(egg.id);
      await qa(page, (api) => api.advance(0.5));
    }
  }
  const final = await state(page);
  expect(final.found).toHaveLength(EGGS.length);
  expect(final.achievements).toEqual(expect.arrayContaining(['egg-first', 'egg-all']));

  // The album in the achievements page shows every one of them.
  await qa(page, (api) => api.game.hud.showAchievements());
  const album = page.locator('.album-head');
  await expect(album.locator('.count-chip')).toHaveText(`${EGGS.length} / ${EGGS.length}`);
});

test('a found thing can be tapped again for its gag, but it does not count twice', async ({ page }) => {
  await open(page);
  await enterScene(page, 0);
  const point = (await page.evaluate(() => (window as unknown as QaWindow).__pop.eggPoint('egg-clock')))!;
  await page.mouse.click(point.x, point.y);
  await qa(page, (api) => api.advance(5));
  await page.mouse.click(point.x, point.y);
  const after = await state(page);
  expect(after.found.filter((id) => id === 'egg-clock')).toHaveLength(1);
  // A second find shows its line again but no new "found" toast.
  await expect(page.locator('.toast', { hasText: '发现彩蛋：挂钟' })).toHaveCount(1);
});
