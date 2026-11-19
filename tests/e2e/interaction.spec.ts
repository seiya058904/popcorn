import { expect, test, type Locator, type Page } from '@playwright/test';
import type { QaApi } from '../../src/debug/index.ts';

type QaWindow = Window & { __pop: QaApi; __ui: string[] };

const ready = (page: Page): Promise<unknown> => page.waitForFunction(() => Boolean((window as unknown as Partial<QaWindow>).__pop));
const qa = <T>(page: Page, body: (api: QaApi) => T): Promise<Awaited<T>> => page.evaluate(`(${body.toString()})(window.__pop)`) as Promise<Awaited<T>>;
const owned = (page: Page): Promise<number> => qa(page, (api) => api.game.sim.state.owned[0]!);

/** Opens the game with money to spend, recording every interface sound it plays. */
async function open(page: Page): Promise<void> {
  await page.goto('/?play=1');
  await ready(page);
  await page.evaluate(() => {
    const w = window as unknown as QaWindow;
    w.__ui = [];
    const audio = w.__pop.game.audio as unknown as { ui(name: string, rate?: number): void };
    const original = audio.ui.bind(audio);
    audio.ui = (name, rate) => {
      w.__ui.push(name);
      original(name, rate);
    };
    w.__pop.earn(5000);
    w.__pop.advance(0.2);
  });
  await expect(page.locator('[data-unit="0"]')).toHaveClass(/is-ready/);
}

async function centre(target: Locator): Promise<{ x: number; y: number }> {
  const box = (await target.boundingBox())!;
  return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
}

const sounds = (page: Page): Promise<string[]> => page.evaluate(() => (window as unknown as QaWindow).__ui);

test('a button shows the press at once and acts only on release', async ({ page }) => {
  await open(page);
  const ticket = page.locator('[data-unit="0"]');
  const { x, y } = await centre(ticket);
  await page.mouse.move(x, y);
  await page.mouse.down();
  // The next frame already shows the press; nothing has been bought yet.
  await page.evaluate(() => new Promise(requestAnimationFrame));
  await expect(ticket).toHaveClass(/is-pressed/);
  expect(await owned(page)).toBe(0);
  expect(await sounds(page)).toContain('ui-press');
  await page.mouse.up();
  expect(await owned(page)).toBe(1);
  await expect(ticket).not.toHaveClass(/is-pressed/);
});

test('dragging away from a pressed button cancels it', async ({ page }) => {
  await open(page);
  const ticket = page.locator('[data-unit="0"]');
  const { x, y } = await centre(ticket);
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.mouse.move(x - 300, y, { steps: 6 });
  await page.mouse.up();
  expect(await owned(page)).toBe(0);
});

test('Enter on a focused button does the same as a press', async ({ page }) => {
  await open(page);
  await page.locator('[data-unit="0"]').focus();
  await page.keyboard.press('Enter');
  expect(await owned(page)).toBe(1);
});

test('holding a machine ticket keeps buying, faster and faster', async ({ page }) => {
  await open(page);
  await qa(page, (api) => api.earn(1e6));
  const { x, y } = await centre(page.locator('[data-unit="0"]'));
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.waitForTimeout(1400);
  await page.mouse.up();
  const bought = await owned(page);
  // 0.4 s before the first repeat, then quicker steps: well over a handful in 1.4 s.
  expect(bought).toBeGreaterThanOrEqual(6);
});

test('a ticket that cannot be bought says no with a shake and a sound', async ({ page }) => {
  await open(page);
  await qa(page, (api) => api.set({ popcorn: 50 }));
  const ticket = page.locator('[data-unit="1"]');
  await expect(ticket).toHaveClass(/is-dim/);
  await ticket.click();
  expect(await sounds(page)).toContain('ui-deny');
  expect(await qa(page, (api) => api.game.sim.state.owned[1])).toBe(0);
});

test('tabs, switches and sliders each answer with their own sound', async ({ page }) => {
  await open(page);
  await page.locator('.shop-tab', { hasText: '口味' }).click();
  await expect(page.locator('[data-flavor="next"]')).toBeVisible();
  await page.keyboard.press('Escape');
  await page.locator('.menu-list .menu-item', { hasText: '设置' }).click();
  const shake = page.locator('.menu-row', { hasText: '屏幕震动' }).locator('.switch');
  await shake.click();
  await expect(shake).toHaveAttribute('aria-checked', 'false');
  const slider = page.locator('.menu-row', { hasText: '音乐' }).locator('input');
  await slider.focus();
  for (let i = 0; i < 12; i += 1) await page.keyboard.press('ArrowRight');
  const heard = await sounds(page);
  expect(heard).toContain('ui-tab');
  expect(heard).toContain('ui-switch-off');
  expect(heard).toContain('ui-tick');
  expect(heard).toContain('ui-open');
});

test('with reduced motion, dialogs fade in without moving', async ({ page }) => {
  await open(page);
  await qa(page, (api) => {
    api.game.settings.reduceMotion = true;
    api.game.applySettings();
  });
  await page.keyboard.press('Escape');
  const moved = await page.evaluate(() =>
    document
      .querySelector('.dialog.menu')!
      .getAnimations()
      .some((animation) => (animation.effect as KeyframeEffect).getKeyframes().some((frame) => frame.transform !== undefined && frame.transform !== 'none')),
  );
  expect(moved).toBe(false);
});
