import { expect, test, type Page } from '@playwright/test';
import type { QaApi } from '../../src/debug/index.ts';

type QaWindow = Window & { __pop: QaApi };

const ready = (page: Page): Promise<unknown> => page.waitForFunction(() => Boolean((window as unknown as Partial<QaWindow>).__pop));
const qa = <T>(page: Page, body: (api: QaApi) => T): Promise<T> =>
  page.evaluate(`(${body.toString()})(window.__pop)`) as Promise<T>;

test('a new player can make the first purchase without any instructions', async ({ page }) => {
  await page.goto('/?play=1');
  await ready(page);
  await expect(page.locator('.hint')).toBeVisible();
  for (let i = 0; i < 15; i += 1) await page.mouse.click(520, 400);
  const unit = page.locator('[data-unit="0"]');
  await expect(unit).toHaveClass(/is-ready/);
  await expect(unit).toHaveClass(/is-next/);
  await unit.click();
  expect(await qa(page, (api) => api.game.sim.state.owned[0])).toBe(1);
  await expect(unit).not.toHaveClass(/is-next/);
});

for (const size of [
  { width: 1280, height: 720 },
  { width: 1920, height: 1080 },
  { width: 2560, height: 1440 },
  { width: 3840, height: 2160 },
  { width: 1024, height: 768 },
  { width: 900, height: 1200 },
  { width: 1366, height: 768 },
  { width: 2560, height: 1080 },
]) {
  test(`layout holds at ${size.width}×${size.height}`, async ({ page }) => {
    await page.setViewportSize(size);
    await page.goto('/?capture=1');
    await ready(page);
    // Everything that can be on screen at once: toasts, a frenzy and a hopper callout.
    await qa(page, (api) => {
      api.set({ stage: 2, frenzy: 15 });
      api.earn(5e7);
      api.showHopper();
      for (const id of ['first-pop', 'hundred', 'first-pan']) api.game.bus.emit('achievement_unlocked', { id });
      api.advance(1.3);
    });
    // Entrances run to their end; endless pulses are stopped so boxes are measured at rest.
    await page.evaluate(() =>
      document.getAnimations().forEach((animation) => {
        if (Number.isFinite(Number(animation.effect?.getComputedTiming().endTime))) animation.finish();
        else animation.cancel();
      }),
    );
    const issues = await page.evaluate(() => {
      const found: string[] = [];
      const { innerWidth: w, innerHeight: h } = window;
      const edge = parseFloat(getComputedStyle(document.documentElement).fontSize) * 2.4 - 1;
      const boxes = ['.marquee', '.shop', '.stagebar', '.gauge', '.corner', '.menu-button', '.toasts', '.frenzy', '.hopper-call'].map((selector) => {
        const box = document.querySelector(selector)!.getBoundingClientRect();
        // Nothing may come closer to the window edge than the safe margin.
        if (box.left < edge || box.top < edge || box.right > w - edge || box.bottom > h - edge) found.push(`${selector} is closer than the safe margin to the edge`);
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
      // Small text on paper keeps at least 4.5:1 contrast.
      const luminance = (css: string): number => {
        const [r, g, b] = css.match(/[\d.]+/g)!.slice(0, 3).map((value) => {
          const c = Number(value) / 255;
          return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
        });
        return 0.2126 * r! + 0.7152 * g! + 0.0722 * b!;
      };
      const paper = luminance('rgb(255, 250, 242)');
      for (const selector of ['.ticket-blurb', '.toast small', '.bulk-label']) {
        const node = document.querySelector(selector);
        if (!node) continue;
        const text = luminance(getComputedStyle(node).color);
        const ratio = (Math.max(paper, text) + 0.05) / (Math.min(paper, text) + 0.05);
        if (ratio < 4.5) found.push(`${selector} contrast ${ratio.toFixed(2)}`);
      }
      return found;
    });
    expect(issues).toEqual([]);

    // The four upgrade rows fit the shop side by side with nothing cut, and the shop keeps its share
    // of the window (INTERACTION.md §1.7).
    await page.locator('.shop-tab', { hasText: '升级' }).click();
    await qa(page, (api) => api.advance(1));
    await page.evaluate(() => document.getAnimations().forEach((animation) => animation.finish()));
    const shop = await page.evaluate(() => {
      const found: string[] = [];
      const panel = document.querySelector('.shop')!.getBoundingClientRect();
      const share = panel.width / window.innerWidth;
      // At the interface's smallest scale a tall window gives the shop a little more of its width.
      const atFloor = parseFloat(getComputedStyle(document.documentElement).fontSize) <= 6.4 && window.innerHeight > window.innerWidth;
      if (share < 0.219 || share > (atFloor ? 0.32 : 0.301)) found.push(`shop is ${(share * 100).toFixed(1)}% of the window`);
      const rows = [...document.querySelectorAll<HTMLElement>('.row[data-track]')];
      if (rows.length !== 4) found.push(`${rows.length} upgrade rows`);
      const boxes = rows.map((row) => row.getBoundingClientRect());
      boxes.forEach((box, i) => {
        if (box.left < panel.left - 0.5 || box.right > panel.right + 0.5) found.push(`row ${i} leaves the shop sideways`);
        if (box.height < 1) found.push(`row ${i} is not shown`);
        for (let j = i + 1; j < boxes.length; j += 1) {
          const other = boxes[j]!;
          if (box.top < other.bottom - 0.5 && other.top < box.bottom - 0.5) found.push(`rows ${i} and ${j} overlap`);
        }
      });
      for (const node of document.querySelectorAll<HTMLElement>('.row .ticket-name, .row .ticket-price, .row .ticket-blurb, .row-name, .row-count')) {
        if (node.scrollWidth > node.clientWidth + 1 || node.scrollHeight > node.clientHeight + 1) found.push(`${node.className} is cut: ${node.textContent}`);
      }
      return found;
    });
    expect(shop).toEqual([]);
  });
}

test('the counter does not move the layout as its length changes', async ({ page }) => {
  await page.goto('/?capture=1');
  await ready(page);
  const rects = await qa(page, (api) => {
    const read = (): string => JSON.stringify(document.querySelector('.marquee')!.getBoundingClientRect());
    const seen = new Set<string>();
    for (const amount of [5, 500, 9000, 50000, 3e6, 8e8, 2e10, 3e14, 9e16]) {
      api.earn(amount);
      api.advance(0.5);
      seen.add(read());
    }
    return [...seen];
  });
  expect(rects).toHaveLength(1);
});

test('progress survives a reload, and a corrupted save falls back to the backup', async ({ page }) => {
  await page.goto('/?play=1');
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
        (window as unknown as QaWindow).__pop.game.saves.disable();
        localStorage.removeItem('pop-popcorn:rescue');
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
