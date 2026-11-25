import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { expect, test, type Page } from '@playwright/test';
import type { QaApi } from '../../src/debug/index.ts';
import { checksum } from '../../src/sim/save.ts';

type QaWindow = Window & { __pop: QaApi };

const ready = (page: Page): Promise<unknown> => page.waitForFunction(() => Boolean((window as unknown as Partial<QaWindow>).__pop));
const qa = <T>(page: Page, body: (api: QaApi) => T): Promise<T> =>
  page.evaluate(`(${body.toString()})(window.__pop)`) as Promise<T>;
const press = (page: Page, selector: string): Promise<void> => page.locator(selector).first().click({ force: true });

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

  await page.locator('.menu-list .menu-item', { hasText: '设置' }).click();
  await expect(page.locator('.menu-row', { hasText: '屏幕震动' }).locator('.switch')).toHaveAttribute('aria-checked', 'true');
  await page.locator('.menu-row', { hasText: '屏幕震动' }).locator('.switch').click();
  await expect(page.locator('.menu-row', { hasText: '屏幕震动' }).locator('.switch')).toHaveAttribute('aria-checked', 'false');
  await page.locator('.menu-row', { hasText: '演出速度' }).locator('.menu-chip', { hasText: '2×' }).click();
  await page.locator('.menu-row', { hasText: '画质' }).locator('.menu-chip', { hasText: '低' }).click();
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
  await fresh.locator('.menu-list .menu-item', { hasText: '存档管理' }).click();
  await fresh.locator('.menu-text').fill('garbage');
  await press(fresh, '[data-action="import"]');
  await expect(fresh.locator('.menu-status')).toContainText('不是有效的存档');
  await fresh.locator('.menu-text').fill(text);
  await Promise.all([fresh.waitForNavigation(), press(fresh, '[data-action="import"]')]);
  await ready(fresh);
  expect(await qa(fresh, (api) => api.game.sim.state.owned[0])).toBe(7);
  await other.close();
});

const importThroughMenu = async (page: Page, text: string): Promise<void> => {
  await page.goto('/?play=1');
  await ready(page);
  await page.keyboard.press('Escape');
  await page.locator('.menu-list .menu-item', { hasText: '存档管理' }).click();
  await page.locator('.menu-text').fill(text);
  await Promise.all([page.waitForNavigation(), press(page, '[data-action="import"]')]);
  await ready(page);
};

test('an exported version 4 save comes in with its upgrades moved onto the rows, and says so', async ({ page }) => {
  // Exported from the last version 4 build (6f6edc5) after its bot had played for a while.
  const text = readFileSync(fileURLToPath(new URL('../fixtures/save-v4.txt', import.meta.url)), 'utf8');
  const before = JSON.parse(JSON.parse(text).body) as { popcorn: number; owned: number[]; upgrades: string[] };
  await importThroughMenu(page, text);
  await expect(page.locator('.dialog h2')).toHaveText('升级改版');
  await expect(page.locator('.dialog', { hasText: '升级改版' })).toContainText('四栏');
  const after = await qa(page, (api) => {
    const sim = api.game.sim;
    return {
      version: sim.state.version,
      popcorn: sim.state.popcorn,
      owned: [...sim.state.owned],
      upgrades: [...sim.state.upgrades],
      heads: (['craft', 'line', 'play', 'decor'] as const).map((track) => sim.trackHead(track)?.id ?? null),
    };
  });
  expect(after.version).toBe(5);
  expect(after.owned).toEqual(before.owned);
  // Whatever no rung took in was paid back, so nothing was lost.
  expect(after.popcorn).toBeGreaterThanOrEqual(before.popcorn);
  expect(after.upgrades.length).toBeGreaterThan(0);
  // Each row shows its next rung, and its dots light up as many rungs as it owns.
  for (const [index, track] of ['craft', 'line', 'play', 'decor'].entries()) {
    const row = page.locator(`[data-track="${track}"]`);
    const owned = after.upgrades.filter((id) => id.startsWith(`${track}-`)).length;
    await expect(row.locator('.row-pips i.is-on')).toHaveCount(owned);
    if (after.heads[index]) await expect(row.locator(`[data-upgrade="${after.heads[index]}"]`)).toHaveCount(1);
  }
  // The notice is shown once; it does not come back on the next reload.
  await page.reload();
  await ready(page);
  await page.waitForTimeout(500);
  await expect(page.locator('.dialog h2')).toHaveCount(0);
});

test('an imported save from a version whose run cannot continue says it starts over', async ({ page }) => {
  const body = JSON.stringify({ version: 1, popcorn: 500, totalEarned: 800, owned: [3, 0, 0, 0, 0, 0], clicks: 90 });
  const text = JSON.stringify({ format: 'pop-popcorn-save', version: 1, sum: checksum(body), body });
  await importThroughMenu(page, text);
  await expect(page.locator('.dialog h2')).toHaveText('配方大改版');
});

test('a save travels from Chromium to Firefox and back',async ({ page, browser, playwright, baseURL }, testInfo) => {
  test.skip(testInfo.project.name !== 'chromium', 'One run covers both engines.');
  const importInto = async (target: Page, text: string): Promise<void> => {
    await target.goto(`${baseURL}/?play=1`);
    await ready(target);
    await target.keyboard.press('Escape');
    await target.locator('.menu-list .menu-item', { hasText: '存档管理' }).click();
    await target.locator('.menu-text').fill(text);
    await Promise.all([target.waitForNavigation(), press(target, '[data-action="import"]')]);
    await ready(target);
  };

  await page.goto('/?play=1');
  await ready(page);
  await qa(page, (api) => {
    api.earn(900);
    api.buy(0, 7);
  });
  const fromChromium = await qa(page, (api) => api.game.saves.exportText());

  const firefox = await playwright.firefox.launch({ firefoxUserPrefs: { 'webgl.force-enabled': true, 'webgl.disabled': false } });
  try {
    const inFirefox = await firefox.newPage({ viewport: { width: 1280, height: 720 } });
    await importInto(inFirefox, fromChromium);
    expect(await qa(inFirefox, (api) => api.game.sim.state.owned[0])).toBe(7);
    await qa(inFirefox, (api) => {
      api.earn(5000);
      api.buy(0, 1);
    });
    const fromFirefox = await qa(inFirefox, (api) => api.game.saves.exportText());

    const other = await browser.newContext();
    const back = await other.newPage();
    await importInto(back, fromFirefox);
    expect(await qa(back, (api) => api.game.sim.state.owned[0])).toBe(8);
    await other.close();
  } finally {
    await firefox.close();
  }
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
  await page.locator('.menu-list .menu-item', { hasText: '存档管理' }).click();
  // A tap does nothing: clearing has to be held.
  await press(page, '[data-action="wipe"]');
  expect(await qa(page, (api) => api.game.sim.state.owned[0])).toBe(3);
  await page.locator('[data-action="wipe"]').hover();
  await Promise.all([page.waitForNavigation(), (async () => {
    await page.mouse.down();
    await page.waitForTimeout(1500);
    await page.mouse.up();
  })()]);
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
