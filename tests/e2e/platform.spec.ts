import { expect, test, type Page } from '@playwright/test';
import type { Game } from '../../src/game.ts';
import type { QaApi } from '../../src/debug/index.ts';

type QaWindow = Window & { __pop: QaApi };
/** The few private members these tests need to drive directly. */
type GameInternals = Pick<Game, 'stop' | 'settings' | 'stage' | 'simSteps'> & { watchPerformance(seconds: number): void; lastTimestamp: number };
type TestWindow = QaWindow & { clockShift: number; pageVisibility: DocumentVisibilityState };

const ready = (page: Page): Promise<unknown> => page.waitForFunction(() => Boolean((window as unknown as Partial<QaWindow>).__pop));
const qa = <T>(page: Page, body: (api: QaApi) => T): Promise<Awaited<T>> =>
  page.evaluate(`(${body.toString()})(window.__pop)`) as Promise<Awaited<T>>;

const open = async (page: Page, query = 'play=1'): Promise<void> => {
  await page.goto(`/?${query}`);
  await ready(page);
};

const earnAndBuy = (page: Page): Promise<void> =>
  qa(page, (api) => {
    api.earn(900);
    api.buy(0, 5);
    return api.game.saves.save();
  });

/** Writes garbage into the given slots, and stops the page from saving over it on the way out. */
const corrupt = (page: Page, slots: string[]): Promise<void> =>
  page.evaluate(
    (names) =>
      new Promise<void>((resolve, reject) => {
        (window as unknown as QaWindow).__pop.game.saves.disable();
        localStorage.removeItem('pop-popcorn:rescue');
        const request = indexedDB.open('pop-popcorn', 1);
        request.onerror = () => reject(request.error);
        request.onsuccess = () => {
          const tx = request.result.transaction('saves', 'readwrite');
          for (const slot of names) tx.objectStore('saves').put('{"broken', slot);
          tx.oncomplete = () => {
            request.result.close();
            resolve();
          };
          tx.onerror = () => reject(tx.error);
        };
      }),
    slots,
  );

test('the system reduced-motion preference starts the game calm', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await open(page);
  const state = await qa(page, (api) => ({
    reduce: api.game.settings.reduceMotion,
    shake: api.game.settings.screenShake,
    flash: api.game.impact.prefs.flash,
    world: api.game.world.reduceMotion,
  }));
  expect(state).toEqual({ reduce: true, shake: false, flash: 0.35, world: true });
});

test('automatic quality softens the picture, then steps down, and respects an explicit choice', async ({ page }) => {
  await open(page);
  const result = await page.evaluate(() => {
    const game = (window as unknown as QaWindow).__pop.game as unknown as GameInternals;
    game.stop();
    const look = (): string => `${game.stage.quality.tier}@${game.stage.dynamicScale}`;
    game.settings.quality = 'auto';
    game.stage.setQuality('high');
    const slow: string[] = [];
    // Each step needs two slow windows of 120 frames.
    for (let step = 0; step < 3; step += 1) {
      for (let i = 0; i < 240; i += 1) game.watchPerformance(0.05);
      slow.push(look());
    }
    // A long smooth stretch earns the sharper picture back, one step at a time.
    game.stage.setDynamicScale(0.85);
    for (let i = 0; i < 120 * 40; i += 1) game.watchPerformance(1 / 60);
    const recovered = look();
    game.stage.setQuality('high');
    game.settings.quality = 'high';
    for (let i = 0; i < 480; i += 1) game.watchPerformance(0.05);
    return { slow, recovered, explicit: look() };
  });
  expect(result).toEqual({ slow: ['high@0.85', 'high@0.72', 'medium@1'], recovered: 'medium@1', explicit: 'high@1' });
});

test('a hidden tab saves, and coming back pays for the time away exactly once', async ({ page }) => {
  await open(page);
  await earnAndBuy(page);
  const result = await page.evaluate(async () => {
    const win = window as unknown as TestWindow;
    const { game } = win.__pop;
    const realNow = Date.now.bind(Date);
    win.clockShift = 0;
    win.pageVisibility = 'visible';
    Date.now = () => realNow() + win.clockShift;
    Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => win.pageVisibility });
    const change = (state: DocumentVisibilityState): void => {
      win.pageVisibility = state;
      document.dispatchEvent(new Event('visibilitychange'));
    };
    const savedBefore = game.sim.state.savedAt;
    await new Promise((resolve) => setTimeout(resolve, 20));
    change('hidden');
    const savedOnHide = game.sim.state.savedAt > savedBefore;
    win.clockShift = 3_600_000;
    const before = game.sim.state.totalEarned;
    change('visible');
    const paid = game.sim.state.totalEarned - before;
    const steady = game.sim.state.totalEarned;
    change('hidden');
    change('visible');
    return { savedOnHide, paid, again: game.sim.state.totalEarned - steady };
  });
  expect(result.savedOnHide).toBe(true);
  expect(result.paid).toBeGreaterThan(0);
  expect(result.again).toBeLessThan(result.paid / 100);
});

test('coming back to a busy late scene after ten minutes away is smooth: one welcome back, no long frames', async ({ page }, testInfo) => {
  await open(page);
  await qa(page, (api) => {
    api.set({ stage: 3, totalEarned: 5e13, popcorn: 1e15 });
    for (const unit of [0, 10, 1, 2, 11, 3, 4, 12, 5, 6, 13, 7]) api.buy(unit, 40);
    api.set({ frenzy: 30 });
    return api.game.saves.save();
  });
  // Let the scene settle in before leaving.
  await page.waitForFunction(() => !(window as unknown as QaWindow).__pop.game.world.inTransition);
  await page.waitForTimeout(1500);
  const result = await page.evaluate(async () => {
    const win = window as unknown as TestWindow;
    const { game } = win.__pop;
    const realNow = Date.now.bind(Date);
    win.clockShift = 0;
    win.pageVisibility = 'visible';
    Date.now = () => realNow() + win.clockShift;
    Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => win.pageVisibility });
    const change = (state: DocumentVisibilityState): void => {
      win.pageVisibility = state;
      document.dispatchEvent(new Event('visibilitychange'));
    };
    change('hidden');
    win.clockShift = 10 * 60_000;
    const before = game.sim.state.totalEarned;
    change('visible');
    const paid = game.sim.state.totalEarned - before;
    const frames = await win.__pop.sampleFrames(3);
    return { paid, long: frames.filter((ms) => ms > 50) };
  });
  expect(result.paid).toBeGreaterThan(0);
  // Timing is judged on the GPU-backed run, as in feel.spec.ts: elsewhere this scene is slow throughout.
  if (testInfo.project.name === 'chromium') expect(result.long).toEqual([]);
  // The time away is paid in one sum and said in one dialog.
  await expect(page.locator('.dialog h2', { hasText: '欢迎回来' })).toHaveCount(1);
  await expect(page.locator('.dialog h2', { hasText: '欢迎回来' })).toBeVisible();
});

test('a long stall between frames does not fast-forward the simulation', async ({ page }) => {
  await open(page);
  const steps = await page.evaluate(async () => {
    const game = (window as unknown as QaWindow).__pop.game as unknown as GameInternals;
    const before = game.simSteps;
    game.lastTimestamp = performance.now() - 120_000;
    await new Promise((resolve) => setTimeout(resolve, 200));
    return game.simSteps - before;
  });
  expect(steps).toBeLessThan(30);
});

test('with both saves damaged the game explains itself and stays playable', async ({ page }) => {
  await open(page);
  await earnAndBuy(page);
  await corrupt(page, ['main', 'backup']);
  await page.reload();
  await ready(page);
  await expect(page.locator('.dialog h2')).toHaveText('存档出了点状况');
  expect(await qa(page, (api) => api.game.sim.state.owned[0])).toBe(0);
  await qa(page, (api) => api.click(400, 300));
  expect(await qa(page, (api) => api.game.sim.state.stats.clicks)).toBe(1);
});

test('progress survives leaving the page and closing the tab', async ({ page, context }) => {
  await open(page);
  await earnAndBuy(page);
  // Leaving by navigation relies on the save made as the page goes away.
  await qa(page, (api) => api.buy(0, 1));
  await page.goto('about:blank');
  await open(page);
  expect(await qa(page, (api) => api.game.sim.state.owned[0])).toBe(6);
  await qa(page, (api) => api.game.saves.save());
  await page.close();
  const reopened = await context.newPage();
  await open(reopened);
  expect(await qa(reopened, (api) => api.game.sim.state.owned[0])).toBe(6);
});

test('saving falls back to localStorage, then to memory, when storage is blocked', async ({ page }) => {
  const problems: string[] = [];
  page.on('pageerror', (error) => problems.push(error.message));
  await page.addInitScript(() => {
    Object.defineProperty(window, 'indexedDB', {
      get() {
        throw new DOMException('blocked', 'SecurityError');
      },
    });
  });
  await open(page);
  await earnAndBuy(page);
  expect(await page.evaluate(() => localStorage.getItem('pop-popcorn:main') !== null)).toBe(true);
  await page.reload();
  await ready(page);
  expect(await qa(page, (api) => api.game.sim.state.owned[0])).toBe(5);

  await page.addInitScript(() => {
    Storage.prototype.setItem = () => {
      throw new DOMException('blocked', 'QuotaExceededError');
    };
  });
  await page.reload();
  await ready(page);
  await qa(page, (api) => {
    api.earn(100);
    return api.game.saves.save();
  });
  expect(problems).toEqual([]);
});

test('losing the graphics context reloads into the same game', async ({ page }) => {
  await open(page);
  await earnAndBuy(page);
  const reloaded = page.waitForEvent('load');
  await page.evaluate(() => {
    const gl = (window as unknown as QaWindow).__pop.game.stage.renderer.getContext();
    const lose = gl.getExtension('WEBGL_lose_context')!;
    lose.loseContext();
    setTimeout(() => lose.restoreContext(), 100);
  });
  await reloaded;
  await ready(page);
  expect(await qa(page, (api) => api.game.sim.state.owned[0])).toBe(5);
});

test('a browser without WebGL 2 gets a clear message instead of a blank page', async ({ page }) => {
  const crashes: string[] = [];
  page.on('pageerror', (error) => crashes.push(error.message));
  await page.addInitScript(() => {
    const original = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = function (this: HTMLCanvasElement, type: string, ...rest: unknown[]) {
      return type === 'webgl2' ? null : (original as (...args: unknown[]) => unknown).call(this, type, ...rest);
    } as typeof original;
  });
  await page.goto('/');
  // The loading screen turns into the message; reloading would not help, so it offers no retry.
  await expect(page.locator('#boot.is-failed .boot-title')).toHaveText('这口锅点不着火');
  await expect(page.locator('#boot .boot-note')).toContainText('WebGL 2');
  await expect(page.locator('#boot .boot-retry')).toBeHidden();
  expect(crashes).toEqual([]);
});
