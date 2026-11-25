import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import type { Page } from '@playwright/test';
import { argValue, startHarness } from './lib/harness.ts';
import { qa, totalAt } from './shot-presets.ts';

/**
 * Usage: node tools/ui-shots.ts [--label=before] [--sizes=1920x1080,...] [--only=state,...]
 *
 * Photographs every screen of the interface in every state worth judging, at the window sizes
 * players use, so a redesign can be compared screen by screen.
 * Output: artifacts/ui/<label>/<size>/<state>.png
 */
const label = argValue('label') ?? 'latest';
const sizes = (argValue('sizes') ?? '1280x720,1920x1080,2560x1440,3840x2160,1024x768,900x1200').split(',').map((text) => {
  const [width, height] = text.split('x').map(Number);
  return { width: width!, height: height!, name: text };
});
const only = argValue('only')?.split(',');

type Step = { name: string; run(page: Page): Promise<void>; moving?: boolean };

const PLENTY = 1e30;

/** Buttons act on release; a click with no pointer behind it (as from the keyboard) acts at once. */
const tab = (index: number) => async (page: Page): Promise<void> => {
  await page.evaluate((i) => {
    document.querySelectorAll('.shop-tab')[i]!.dispatchEvent(new MouseEvent('click', { bubbles: true, detail: 0 }));
  }, index);
};

const closeAll = (page: Page): Promise<void> =>
  qa(page, (api) => {
    api.game.menus.close();
    api.game.hud.closeDialog();
    api.advance(0.4);
  }, null);

const steps: Step[] = [
  { name: 'hud-start', run: (page) => qa(page, (api) => api.advance(1.5), null) },
  {
    name: 'hud-kitchen',
    async run(page) {
      await qa(
        page,
        (api, value: { total: number; plenty: number }) => {
          api.set({ stage: 1, totalEarned: value.total, popcorn: value.plenty, flavors: 3 });
          api.advance(0.2);
          [6, 3, 3, 2].forEach((count, unit) => api.buy(unit, count));
          for (const id of ['craft-1', 'craft-2', 'craft-3']) api.game.sim.buyUpgrade(id);
          api.game.sim.state.stats.clicks = 80;
          api.set({ popcorn: api.game.sim.price(2) * 1.4 });
          api.advance(3);
        },
        { total: totalAt(1, 0.5), plenty: PLENTY },
      );
    },
  },
  {
    name: 'hud-events',
    async run(page) {
      await qa(page, (api) => {
        api.set({ frenzy: 15 });
        api.showHopper();
        for (const id of ['first-pop', 'hundred', 'first-pan']) api.game.bus.emit('achievement_unlocked', { id });
        api.advance(1.3);
      }, null);
    },
  },
  { name: 'shop-flavor', run: tab(1) },
  { name: 'shop-upgrades', run: tab(2) },
  {
    name: 'hud-town',
    async run(page) {
      await tab(0)(page);
      await qa(
        page,
        (api, value: { total: number; plenty: number }) => {
          api.set({ stage: 3, totalEarned: value.total, popcorn: value.plenty, flavors: 7, frenzy: 0 });
          api.advance(0.2);
          [20, 18, 16, 12, 10, 8, 4, 2].forEach((count, unit) => api.buy(unit, count));
          api.set({ popcorn: api.game.sim.price(6) * 0.7 });
          api.advance(3.5);
        },
        { total: totalAt(3, 0.45), plenty: PLENTY },
      );
    },
  },
  { name: 'menu-pause', run: (page) => qa(page, (api) => api.game.menus.showPause(), null) },
  { name: 'menu-settings', run: (page) => qa(page, (api) => api.game.menus.showSettings(true), null) },
  { name: 'menu-saves', run: (page) => qa(page, (api) => api.game.menus.showSaves(true), null) },
  {
    name: 'dialog-achievements',
    async run(page) {
      await closeAll(page);
      await qa(page, (api) => api.game.hud.showAchievements(), null);
    },
  },
  {
    name: 'dialog-offline',
    async run(page) {
      await closeAll(page);
      await qa(page, (api) => api.game.hud.showOffline(3 * 3600 + 25 * 60, 1.23e12), null);
    },
  },
  {
    name: 'dialog-notice',
    async run(page) {
      await closeAll(page);
      await qa(page, (api) => api.game.hud.showNotice('存档出了点状况', '最新存档已损坏，已从备份恢复。'), null);
    },
  },
  {
    name: 'dialog-credits',
    async run(page) {
      await closeAll(page);
      await qa(page, (api) => api.game.hud.showCredits(() => undefined), null);
    },
  },
  {
    name: 'hud-slate',
    moving: true,
    async run(page) {
      await closeAll(page);
      await qa(page, (api) => {
        api.game.hud.setSkipVisible(true);
        api.game.hud.showSlate(3);
      }, null);
      // The title card animates out completely, so it is frozen at its most legible moment.
      await page.evaluate(() => {
        for (const animation of document.querySelector('.slate')!.getAnimations()) {
          animation.pause();
          animation.currentTime = 700;
        }
      });
    },
  },
];

const harness = await startHarness();
try {
  for (const size of sizes) {
    const dir = join('artifacts/ui', label, size.name);
    mkdirSync(dir, { recursive: true });
    const viewport = { width: size.width, height: size.height };

    if (!only || only.includes('title')) {
      const title = await harness.open('capture=1&title=1', viewport);
      await qa(title, (api) => api.advance(3), null);
      await title.waitForTimeout(1200);
      await title.screenshot({ path: join(dir, 'title.png'), animations: 'disabled' });
      await title.close();
    }

    const page = await harness.open('capture=1', viewport);
    for (const step of steps) {
      await step.run(page);
      if (only && !only.includes(step.name)) continue;
      await page.screenshot({ path: join(dir, `${step.name}.png`), animations: step.moving ? 'allow' : 'disabled' });
    }
    await page.close();
    console.log(`${size.name} done`);
  }
} finally {
  await harness.close();
}
