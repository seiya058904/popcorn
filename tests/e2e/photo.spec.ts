import { readFileSync } from 'node:fs';
import { expect, test, type Page } from '@playwright/test';
import type { QaApi } from '../../src/debug/index.ts';

type QaWindow = Window & { __pop: QaApi };

const ready = (page: Page): Promise<unknown> => page.waitForFunction(() => Boolean((window as unknown as Partial<QaWindow>).__pop));
const qa = <T>(page: Page, body: (api: QaApi) => T): Promise<Awaited<T>> => page.evaluate(`(${body.toString()})(window.__pop)`) as Promise<Awaited<T>>;

/** A stove with three pans at work, so the count keeps climbing while the game runs. */
async function open(page: Page): Promise<void> {
  await page.goto('/?play=1');
  await ready(page);
  await qa(page, (api) => {
    api.set({ popcorn: 1000, totalEarned: 1000 });
    api.buy(0, 3);
    api.advance(2.5);
  });
}

const popcorn = (page: Page) => qa(page, (api) => api.game.sim.state.popcorn);
const ui = (page: Page) => page.locator('#ui');

/** The camera's angle down from straight up, round what it looks at, and its distance. */
const orbit = (page: Page) =>
  qa(page, (api) => {
    const photo = (api.game as unknown as { photo: { controls: { target: { x: number; y: number; z: number } } | null } }).photo;
    const camera = api.game.stage.camera.position;
    const target = photo.controls!.target;
    const dx = camera.x - target.x;
    const dy = camera.y - target.y;
    const dz = camera.z - target.z;
    const distance = Math.hypot(dx, dy, dz);
    return { polar: Math.acos(dy / distance), distance };
  });

test('photo mode opens from the pause menu, holds the economy, and Esc gives everything back', async ({ page }) => {
  await open(page);
  await page.locator('[data-action="menu"]').click();
  await page.locator('.menu-item', { hasText: '拍照模式' }).click();
  await expect(ui(page)).toHaveClass(/is-photo/);
  await expect(page.locator('.photo-bar')).toHaveCSS('opacity', '1');
  await expect(page.locator('.marquee')).toHaveCSS('opacity', '0');

  const held = await popcorn(page);
  await page.waitForTimeout(800);
  expect(await popcorn(page)).toBe(held);
  // Space does not charge the cannon, and Esc leaves photo mode instead of opening the pause menu.
  await page.keyboard.press('Space');
  await page.keyboard.press('Escape');
  await expect(ui(page)).not.toHaveClass(/is-photo/);
  await expect(page.locator('.menu-veil')).not.toHaveClass(/is-open/);
  await expect.poll(() => popcorn(page)).toBeGreaterThan(held);
});

test('P opens photo mode, H hides the toolbar, and the shutter saves a PNG of the scene', async ({ page }) => {
  await open(page);
  await page.keyboard.press('p');
  await expect(ui(page)).toHaveClass(/is-photo/);
  await page.keyboard.press('h');
  await expect(ui(page)).toHaveClass(/is-photo-bare/);
  await page.keyboard.press('h');
  await expect(ui(page)).not.toHaveClass(/is-photo-bare/);

  const download = page.waitForEvent('download');
  await page.locator('[data-action="photo-shoot"]').click();
  const file = await download;
  expect(file.suggestedFilename()).toMatch(/^popcorn-stove-\d{8}-\d{6}\.png$/);
  const bytes = readFileSync((await file.path())!);
  expect(bytes.subarray(1, 4).toString()).toBe('PNG');
  expect(bytes.length).toBeGreaterThan(20000);

  await page.keyboard.press('p');
  await expect(ui(page)).not.toHaveClass(/is-photo/);
});

test('the photo camera turns and zooms, but never under the floor or far out of the scene', async ({ page }) => {
  await open(page);
  const home = await qa(page, (api) => api.game.stage.camera.position.toArray());
  await page.keyboard.press('p');
  const before = await orbit(page);
  // Drag far downward: the camera would swing under the scene if nothing stopped it.
  await page.mouse.move(640, 300);
  await page.mouse.down();
  await page.mouse.move(640, 700, { steps: 12 });
  await page.mouse.up();
  // Over the picture, not the toolbar along the bottom.
  await page.mouse.move(640, 360);
  for (let i = 0; i < 12; i += 1) await page.mouse.wheel(0, 600);
  await page.waitForTimeout(600);
  const after = await orbit(page);
  expect(after.polar).toBeLessThanOrEqual(Math.PI * 0.48 + 0.01);
  expect(after.distance).toBeLessThanOrEqual(before.distance * 1.6 + 0.01);
  expect(after.distance).toBeGreaterThan(before.distance * 1.05);

  // Leaving, the camera glides home.
  await page.keyboard.press('Escape');
  await expect
    .poll(async () => {
      const now = await qa(page, (api) => api.game.stage.camera.position.toArray());
      return Math.hypot(now[0]! - home[0]!, now[1]! - home[1]!, now[2]! - home[2]!);
    })
    .toBeLessThan(0.5);
});
