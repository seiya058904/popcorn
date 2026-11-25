import { expect, test, type Page } from '@playwright/test';
import type { QaApi } from '../../src/debug/index.ts';

type QaWindow = Window & { __pop: QaApi; __ui: string[] };

const ready = (page: Page): Promise<unknown> => page.waitForFunction(() => Boolean((window as unknown as Partial<QaWindow>).__pop));
const qa = <T>(page: Page, body: (api: QaApi) => T): Promise<Awaited<T>> => page.evaluate(`(${body.toString()})(window.__pop)`) as Promise<Awaited<T>>;

async function open(page: Page): Promise<void> {
  await page.goto('/?play=1');
  await ready(page);
}

const visibleIds = (page: Page, selector: string, key: 'unit' | 'upgrade'): Promise<string[]> =>
  page.locator(selector).evaluateAll((nodes, name) => nodes.filter((node) => (node as HTMLElement).offsetParent !== null).map((node) => (node as HTMLElement).dataset[name]!), key);

test('machines are grouped by scene, in price order, and a header folds its machines away', async ({ page }) => {
  await open(page);
  await qa(page, (api) => {
    api.set({ stage: 2 });
    api.earn(1e5);
    api.advance(0.3);
  });
  const stove = page.locator('[data-group="0"]');
  const head = stove.locator('.shop-group-head');
  // In the cinema the stove is two scenes back, so it starts folded; its header still counts
  // what can be bought. The kitchen, one scene back, stays open.
  await expect(head).toHaveAttribute('aria-expanded', 'false');
  await expect(stove.locator('[data-unit="0"]')).toBeHidden();
  await expect(head.locator('.badge')).toHaveText('3');
  // The new mixer sits between the cart and the cannon.
  expect(await visibleIds(page, '[data-group="1"] [data-unit]', 'unit')).toEqual(['2', '11', '3']);
  // The next scene shows only a teaser of its first machine; the one after stays hidden.
  expect(await visibleIds(page, '[data-group="3"] [data-unit]', 'unit')).toEqual(['6']);
  await expect(page.locator('[data-group="4"]')).toBeHidden();

  await head.click();
  await expect(head).toHaveAttribute('aria-expanded', 'true');
  await expect(stove.locator('[data-unit="0"]')).toBeVisible();
  // The new toaster sits between the pan and the microwave.
  expect(await visibleIds(page, '[data-group="0"] [data-unit]', 'unit')).toEqual(['0', '10', '1']);
  await qa(page, (api) => api.advance(0.2));
  await expect(head.locator('.badge')).toHaveText('');
  await head.click();
  await expect(stove.locator('[data-unit="0"]')).toBeHidden();

  // A locked scene does not fold.
  await page.locator('[data-group="3"] .shop-group-head').click();
  await expect(page.locator('[data-group="3"]')).not.toHaveClass(/is-collapsed/);
});

test('the upgrade page is four fixed rows, each showing only its next rung, which turns into the next once bought', async ({ page }) => {
  await open(page);
  await qa(page, (api) => {
    api.set({ totalEarned: 1500, popcorn: 1000 });
    api.advance(0.3);
  });
  await page.locator('.shop-tab', { hasText: '升级' }).click();
  const rows = page.locator('.row');
  await expect(rows).toHaveCount(4);
  expect(await rows.evaluateAll((nodes) => nodes.map((node) => (node as HTMLElement).dataset.track))).toEqual(['craft', 'line', 'play', 'decor']);
  expect(await visibleIds(page, '.row [data-upgrade]', 'upgrade')).toEqual(['craft-1', 'line-chain-0', 'play-1', 'decor-neon']);
  // The page itself, not the card, whose height eases over from the tab before.
  const upgradePage = page.locator('.shop-body > section.is-active');
  const height = (await upgradePage.boundingBox())!.height;

  // The cannon's row waits for the kitchen, and says so.
  const play = page.locator('.row[data-track="play"] .ticket');
  await expect(play).toHaveClass(/is-locked/);
  await expect(play.locator('.ticket-lock')).toHaveText('突破「灶台」后解锁 · ');

  // Buying a rung puts the next one in its place and lights the row's first pip.
  const craft = page.locator('.row[data-track="craft"]');
  await expect(craft.locator('.ticket')).toHaveClass(/is-ready/);
  await craft.locator('.ticket').click();
  await expect(craft.locator('.ticket')).toHaveAttribute('data-upgrade', 'craft-2');
  await expect(craft.locator('.row-count')).toHaveText('1/8');
  await expect(craft.locator('.row-pips i.is-on')).toHaveCount(1);
  expect(await qa(page, (api) => api.game.sim.state.upgrades.join(' '))).toBe('craft-1');

  // Too dear: the ticket shakes its head and nothing is bought.
  await qa(page, (api) => {
    api.set({ popcorn: 10 });
    api.advance(0.2);
  });
  await page.locator('.row[data-track="decor"] .ticket').click();
  await expect(page.locator('.row[data-track="decor"] .ticket')).toHaveAttribute('data-upgrade', 'decor-neon');

  // The keyboard buys like a press.
  await qa(page, (api) => {
    api.set({ popcorn: 1000 });
    api.advance(0.2);
  });
  await page.locator('.row[data-track="decor"] .ticket').focus();
  await page.keyboard.press('Enter');
  await expect(page.locator('.row[data-track="decor"] .ticket')).toHaveAttribute('data-upgrade', 'decor-plant');

  // A gold rung waits for every machine of its scene, and counts the one with the fewest.
  await qa(page, (api) => {
    api.set({ stage: 1, upgrades: ['craft-1', 'line-chain-0', 'line-chain-1'], owned: [60, 12, 0, 0, 0, 0, 0, 0, 0, 0, 40, 0, 0, 0, 0] });
    api.advance(0.2);
  });
  const line = page.locator('.row[data-track="line"] .ticket');
  await expect(line).toHaveAttribute('data-upgrade', 'line-gold-0');
  await expect(line).toHaveClass(/is-locked/);
  await expect(line.locator('.ticket-lock')).toHaveText('灶台的三种设备各要 50 台 · ');
  await expect(line.locator('.ticket-owned')).toHaveText('12/50');
  await expect(line.locator('.ticket-icon svg')).toHaveCount(1);

  // A finished row closes with a line of its own, in the same space.
  await qa(page, (api) => {
    const all = ['craft-1', 'craft-2', 'craft-3', 'craft-4', 'craft-5', 'craft-6', 'craft-7', 'craft-8'];
    api.set({ stage: 4, totalEarned: 1e17, upgrades: all });
    api.advance(0.2);
  });
  await expect(craft).toHaveClass(/is-done/);
  await expect(craft.locator('.ticket')).toBeHidden();
  await expect(craft.locator('.row-done')).toContainText('手艺练满了');
  await expect(craft.locator('.row-count')).toHaveText('8/8');
  // From the first pot to the moon, the page keeps its size.
  expect(Math.abs((await upgradePage.boundingBox())!.height - height)).toBeLessThanOrEqual(1);
});

test('the counter keeps every digit on its strip while it climbs every frame', async ({ page }) => {
  await open(page);
  // Real time, so the rolls are interrupted again and again before they finish.
  for (let i = 0; i < 40; i += 1) {
    await qa(page, (api) => {
      api.earn(api.game.sim.state.popcorn * 0.37 + 11);
      api.advance(1 / 60);
    });
    await page.waitForTimeout(16);
  }
  const offsets = await page.locator('.marquee-count .odo-strip').evaluateAll((strips) => strips.map((strip) => Number(/translateY\((-?[\d.]+)%\)/.exec((strip as HTMLElement).style.transform)?.[1] ?? 0)));
  expect(offsets.length).toBeGreaterThan(2);
  // Thirty lines: the last one starts at 96.67% up.
  for (const offset of offsets) {
    expect(offset).toBeLessThanOrEqual(0);
    expect(offset).toBeGreaterThanOrEqual(-96.7);
  }
});

test('a golden kernel bursts with a gold number, and green streaks light the gauge stars', async ({ page }) => {
  await open(page);
  await qa(page, (api) => {
    const sim = api.game.sim;
    api.set({ stage: 1, upgrades: ['craft-3', 'play-5'] });
    // Every click golden, so the test does not wait on luck.
    sim.derived.goldenChance = 1;
    api.advance(0.2);
  });
  const viewport = page.viewportSize()!;
  await page.evaluate(({ x, y }) => {
    const api = (window as unknown as QaWindow).__pop;
    api.click(x, y);
    api.advance(0.4);
  }, { x: viewport.width * 0.35, y: viewport.height * 0.55 });
  await expect(page.locator('.float.is-golden')).toHaveCount(1, { timeout: 5000 });
  expect(await qa(page, (api) => api.game.sim.state.stats.goldenPops)).toBeGreaterThanOrEqual(1);

  const stars = page.locator('.gauge-stars');
  await expect(stars).toBeVisible();
  await expect(stars.locator('i.is-lit')).toHaveCount(0);
  // Five stars in a row, not stacked on one spot.
  const lefts = await stars.locator('svg').evaluateAll((nodes) => nodes.map((node) => node.getBoundingClientRect().left));
  expect(lefts).toHaveLength(5);
  for (let i = 1; i < lefts.length; i += 1) expect(lefts[i]!).toBeGreaterThan(lefts[i - 1]! + 4);
  await qa(page, (api) => {
    api.fireCannon(1.02);
    api.fireCannon(1.02);
    api.advance(0.2);
  });
  await expect(stars.locator('i.is-lit')).toHaveCount(2);
  await qa(page, (api) => {
    api.fireCannon(0.5);
    api.advance(0.2);
  });
  await expect(stars.locator('i.is-lit')).toHaveCount(0);
});
