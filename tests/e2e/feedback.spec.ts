import { expect, test, type Page } from '@playwright/test';
import type { QaApi } from '../../src/debug/index.ts';

type QaWindow = Window & { __pop: QaApi };

const ready = (page: Page): Promise<unknown> => page.waitForFunction(() => Boolean((window as unknown as Partial<QaWindow>).__pop));
const qa = <T>(page: Page, body: (api: QaApi) => T): Promise<Awaited<T>> => page.evaluate(`(${body.toString()})(window.__pop)`) as Promise<Awaited<T>>;

async function open(page: Page): Promise<void> {
  await page.goto('/?play=1');
  await ready(page);
}

/** How far the first pan has got into its entrance (negative while it waits), and tickets in the air. */
const panArrival = (page: Page) =>
  qa(page, (api) => {
    const runtime = api.game.world.current as unknown as { rigs: Map<string, { states: Array<{ age: number }> }> };
    return { age: runtime.rigs.get('pan')?.states[0]?.age ?? 1, flying: document.querySelectorAll('.flyin-ticket').length };
  });

/** The pan rig's hover glow: which copy, and how strong. */
const panGlow = (page: Page) =>
  qa(page, (api) => {
    const runtime = api.game.world.current as unknown as { rigs: Map<string, { rig: { materials: { body: { uniforms: { uHover: { value: { x: number; y: number } } } } } } }> };
    const value = runtime.rigs.get('pan')!.rig.materials.body.uniforms.uHover.value;
    return { copy: value.x, amount: value.y };
  });

test('a bought machine’s ticket flies from the shop to its place, and the machine arrives as it lands', async ({ page }) => {
  await open(page);
  await qa(page, (api) => {
    api.set({ popcorn: 1000, totalEarned: 1000 });
    api.advance(0.5);
  });
  await page.locator('.ticket[data-unit="0"]').click();
  const during = await panArrival(page);
  expect(during.flying).toBe(1);
  // The pan waits for its ticket.
  expect(during.age).toBeLessThan(0);
  await expect(page.locator('.flyin-ticket')).toHaveCount(0);
  expect((await panArrival(page)).age).toBeGreaterThan(0);
});

test('with reduced motion the ticket only fades where it is, and the machine does not wait for it', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await open(page);
  await qa(page, (api) => {
    api.set({ popcorn: 1000, totalEarned: 1000 });
    api.advance(0.5);
  });
  const stub = (await page.locator('.ticket[data-unit="0"] .ticket-stub').boundingBox())!;
  await page.locator('.ticket[data-unit="0"]').click();
  const ticket = page.locator('.flyin-ticket');
  const box = await ticket.boundingBox();
  if (box) {
    // Still over the stub it came from.
    expect(Math.abs(box.x + box.width / 2 - (stub.x + stub.width / 2))).toBeLessThan(4);
    expect(Math.abs(box.y + box.height / 2 - (stub.y + stub.height / 2))).toBeLessThan(4);
  }
  // Only the usual short drop delay, not the flight.
  expect((await panArrival(page)).age).toBeGreaterThan(-0.3);
  await expect(ticket).toHaveCount(0);
});

test('each combo tier lights the marquee in its own color, and stepping up streams popcorn into the counter', async ({ page }) => {
  await open(page);
  await qa(page, (api) => {
    api.set({ popcorn: 0, totalEarned: 50 });
    api.advance(1);
  });
  const ring = page.locator('.marquee-combo');
  await qa(page, (api) => {
    const director = api.game.world.current!.director!;
    for (let i = 0; i < 40 && director.comboCount < 24; i += 1) api.click(640, 420);
  });
  await expect(ring).toHaveAttribute('data-tier', '2');
  await expect(ring).toHaveClass(/is-on/);
  await expect(page.locator('.flyin-crumb').first()).toBeAttached();
  // Every piece reaches the counter and goes.
  await expect(page.locator('.flyin-crumb')).toHaveCount(0, { timeout: 5000 });
});

test('the machine under the pointer glows warm round its edges, and lets go when the pointer leaves', async ({ page }) => {
  await open(page);
  await qa(page, (api) => {
    api.set({ popcorn: 1000, totalEarned: 1000 });
    api.buy(0, 3);
    api.advance(2.5);
  });
  const pan = (await qa(page, (api) => api.machinePoint(0)))!;
  await page.mouse.move(pan.x, pan.y);
  await qa(page, (api) => api.advance(0.4));
  const on = await panGlow(page);
  expect(on.copy).toBeGreaterThanOrEqual(0);
  expect(on.amount).toBeGreaterThan(0.5);
  await page.mouse.move(5, 5);
  await qa(page, (api) => api.advance(0.6));
  expect((await panGlow(page)).amount).toBeLessThan(0.05);
});
