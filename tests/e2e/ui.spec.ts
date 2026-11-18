import { expect, test, type Page } from '@playwright/test';
import type { QaApi } from '../../src/debug/index.ts';

type QaWindow = Window & { __pop: QaApi };

const ready = (page: Page): Promise<unknown> => page.waitForFunction(() => Boolean((window as unknown as Partial<QaWindow>).__pop));
const qa = <T>(page: Page, body: (api: QaApi) => T): Promise<T> =>
  page.evaluate(`(${body.toString()})(window.__pop)`) as Promise<T>;

test('a new player can make the first purchase without any instructions', async ({ page }) => {
  await page.goto('/');
  await ready(page);
  await expect(page.locator('.hint')).toBeVisible();
  for (let i = 0; i < 15; i += 1) await page.mouse.click(520, 400);
  const unit = page.locator('[data-unit="0"]');
  await expect(unit).toHaveClass(/is-ready/);
  await expect(unit).toHaveClass(/is-next/);
  await unit.dispatchEvent('pointerdown');
  expect(await qa(page, (api) => api.game.sim.state.owned[0])).toBe(1);
  await expect(unit).not.toHaveClass(/is-next/);
});

for (const size of [
  { width: 1280, height: 720 },
  { width: 1920, height: 1080 },
  { width: 2560, height: 1440 },
  { width: 3840, height: 2160 },
]) {
  test(`layout holds at ${size.width}×${size.height}`, async ({ page }) => {
    await page.setViewportSize(size);
    await page.goto('/?capture=1');
    await ready(page);
    await qa(page, (api) => {
      api.set({ stage: 2 });
      api.earn(3e7);
      api.advance(0.3);
    });
    const issues = await page.evaluate(() => {
      const found: string[] = [];
      const { innerWidth: w, innerHeight: h } = window;
      const boxes = ['.marquee', '.shop', '.stagebar', '.gauge', '.corner'].map((selector) => {
        const box = document.querySelector(selector)!.getBoundingClientRect();
        if (box.left < 0 || box.top < 0 || box.right > w + 0.5 || box.bottom > h + 0.5) found.push(`${selector} leaves the window`);
        return { selector, box };
      });
      for (let i = 0; i < boxes.length; i += 1) {
        for (let j = i + 1; j < boxes.length; j += 1) {
          const a = boxes[i]!.box;
          const b = boxes[j]!.box;
          if (a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom) found.push(`${boxes[i]!.selector} overlaps ${boxes[j]!.selector}`);
        }
      }
      for (const node of document.querySelectorAll<HTMLElement>('.ticket-name, .ticket-price, .marquee-count')) {
        if (node.offsetParent && node.scrollWidth > node.clientWidth + 2 && node.className.includes('marquee')) found.push('counter overflows');
      }
      return found;
    });
    expect(issues).toEqual([]);
  });
}

test('the counter does not move the layout as its length changes', async ({ page }) => {
  await page.goto('/?capture=1');
  await ready(page);
  const rects = await qa(page, (api) => {
    const read = (): string => JSON.stringify(document.querySelector('.marquee')!.getBoundingClientRect());
    const seen = new Set<string>();
    for (const amount of [5, 500, 9000, 50000, 3e6, 8e8, 2e10]) {
      api.earn(amount);
      api.advance(0.5);
      seen.add(read());
    }
    return [...seen];
  });
  expect(rects).toHaveLength(1);
});

test('progress survives a reload, and a corrupted save falls back to the backup', async ({ page }) => {
  await page.goto('/');
  await ready(page);
  await qa(page, (api) => {
    api.earn(500);
    api.buy(0, 2);
    return api.game.saves.save();
  });
  await page.reload();
  await ready(page);
  expect(await qa(page, (api) => api.game.sim.state.owned[0])).toBe(2);

  await page.evaluate(
    () =>
      new Promise<void>((resolve, reject) => {
        // Stop the page from saving over the damage when it unloads.
        (window as unknown as QaWindow).__pop.game.saves.save = () => Promise.resolve();
        const open = indexedDB.open('pop-popcorn', 1);
        open.onsuccess = () => {
          const put = open.result.transaction('saves', 'readwrite').objectStore('saves').put('{"broken', 'main');
          put.onsuccess = () => {
            open.result.close();
            resolve();
          };
          put.onerror = () => reject(put.error);
        };
      }),
  );
  await page.reload();
  await ready(page);
  expect(await qa(page, (api) => api.game.sim.state.owned[0])).toBe(2);
  await expect(page.locator('.dialog h2')).toHaveText('存档出了点状况');
});
