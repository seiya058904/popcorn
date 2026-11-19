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

test('upgrades filter by kind, sort by price, and "buy them all" buys the affordable ones cheapest first', async ({ page }) => {
  await open(page);
  await qa(page, (api) => {
    api.set({ totalEarned: 1e4, popcorn: 1000 });
    api.advance(0.3);
  });
  await page.locator('.shop-tab', { hasText: '升级' }).click();
  const buyAll = page.locator('[data-action="buy-all"]');
  await expect(buyAll).toHaveClass(/is-ready/);
  await expect(buyAll.locator('.buy-all-count')).toHaveText('3 项 · 610');

  const filter = page.locator('[data-control="upgrade-filter"] .seg-item');
  await filter.filter({ hasText: '装修' }).click();
  await qa(page, (api) => api.advance(0.2));
  expect(await visibleIds(page, '.upgrade-list [data-upgrade]', 'upgrade')).toEqual(['decor-neon', 'decor-plant']);
  await filter.filter({ hasText: '全部' }).click();

  await page.locator('[data-action="sort"]').click();
  await expect(page.locator('[data-action="sort"]')).toHaveAttribute('aria-pressed', 'true');
  await qa(page, (api) => api.advance(0.2));
  const costs = await page.locator('.upgrade-list [data-upgrade]').evaluateAll((nodes) =>
    nodes.filter((node) => (node as HTMLElement).offsetParent !== null).map((node) => (node as HTMLElement).dataset.upgrade!),
  );
  const prices = await qa(page, (api) => Object.fromEntries(api.game.sim.availableUpgrades.map((upgrade) => [upgrade.id, upgrade.cost])));
  expect(costs.length).toBeGreaterThan(3);
  expect(costs.map((id) => prices[id]!)).toEqual([...costs.map((id) => prices[id]!)].sort((a, b) => a - b));

  await buyAll.click();
  await expect.poll(() => qa(page, (api) => api.game.sim.state.upgrades.join(' '))).toBe('pop3 decor-neon decor-plant');
  // 1000 − 60 − 100 − 450, plus what the pot simmered meanwhile.
  const left = await qa(page, (api) => api.game.sim.state.popcorn);
  expect(left).toBeGreaterThanOrEqual(390);
  expect(left).toBeLessThan(400);
  await qa(page, (api) => api.advance(0.2));
  await expect(buyAll).not.toHaveClass(/is-ready/);
  await expect(buyAll.locator('.buy-all-count')).toHaveText('暂时买不起');
});

test('a golden kernel bursts with a gold number, and green streaks light the gauge stars', async ({ page }) => {
  await open(page);
  await qa(page, (api) => {
    const sim = api.game.sim;
    api.set({ stage: 1, upgrades: ['golden1', 'cannon-streak'] });
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
