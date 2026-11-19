import { execFileSync } from 'node:child_process';
import { mkdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import type { Page } from '@playwright/test';
import { argValue, startHarness } from './lib/harness.ts';
import { qa } from './shot-presets.ts';

/**
 * Usage: node tools/ui-film.ts [--only=pause-open,...] [--reduced]
 *
 * Films interface animations frame by frame: starts an interaction, freezes every running
 * animation, then steps them through fixed times and photographs a region at each step. The frames
 * are joined into one strip per scenario, to check every transition for jumps and glitches.
 * Output: artifacts/ui-film/<scenario>.png
 */
const only = argValue('only')?.split(',');
const reduced = process.argv.includes('--reduced');
const SIZE = { width: 1920, height: 1080 };
const STEPS_MS = [0, 30, 60, 90, 120, 160, 200, 250, 300, 380, 480];

type Clip = { x: number; y: number; width: number; height: number };

interface Scenario {
  name: string;
  /** A fixed region, or an element to frame with some room around it. */
  clip: Clip | string;
  /** Gets the page ready; nothing animates yet. */
  setup?(page: Page): Promise<void>;
  /** Starts the animation to film. */
  start(page: Page): Promise<void>;
}

const centre = async (page: Page, selector: string): Promise<{ x: number; y: number }> => {
  const box = (await page.locator(selector).first().boundingBox())!;
  return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
};

const scenarios: Scenario[] = [
  { name: 'pause-open', clip: { x: 560, y: 260, width: 800, height: 560 }, start: (page) => qa(page, (api) => api.game.menus.showPause(), null) },
  {
    name: 'settings-push',
    clip: { x: 560, y: 120, width: 800, height: 840 },
    setup: async (page) => {
      await qa(page, (api) => api.game.menus.showPause(), null);
      await page.waitForTimeout(600);
    },
    start: (page) => page.locator('.menu-list .menu-item', { hasText: '设置' }).click(),
  },
  {
    name: 'switch-toggle',
    clip: '.menu-row:has(.switch[aria-label="屏幕震动"])',
    setup: async (page) => {
      await qa(page, (api) => api.game.menus.showSettings(true), null);
      await page.waitForTimeout(600);
    },
    start: (page) => page.locator('.menu-row', { hasText: '屏幕震动' }).locator('.switch').click(),
  },
  { name: 'tab-switch', clip: { x: 1440, y: 20, width: 470, height: 360 }, start: (page) => page.locator('.shop-tab', { hasText: '升级' }).click() },
  {
    name: 'achievements-open',
    clip: { x: 480, y: 60, width: 960, height: 520 },
    start: (page) => qa(page, (api) => api.game.hud.showAchievements(), null),
  },
  {
    name: 'toast-in',
    // Toasts from the setup would reach their real-time exit while filming; start with none.
    setup: async (page) => {
      await page.evaluate(() => {
        document.querySelectorAll('.toast').forEach((toast) => toast.remove());
        // Each frame takes about a second to photograph, so the toast's real 4.2 s dismissal
        // would fire mid-film. Long timers are held back while filming.
        const original = window.setTimeout;
        window.setTimeout = ((handler: TimerHandler, ms?: number, ...rest: unknown[]) => ((ms ?? 0) >= 2000 ? 0 : original(handler, ms, ...rest))) as typeof window.setTimeout;
      });
    },
    clip: { x: 0, y: 80, width: 460, height: 300 },
    start: (page) => qa(page, (api) => api.game.bus.emit('achievement_unlocked', { id: 'hundred' }), null),
  },
  {
    name: 'callout-in',
    clip: '.frenzy',
    start: async (page) => {
      // Capture mode only steps when told to.
      await qa(page, (api) => {
        api.game.sim.state.frenzy = 30;
        api.advance(0.1);
      }, null);
      await page.waitForFunction(() => document.querySelector('.frenzy')?.classList.contains('is-on'));
    },
  },
  {
    name: 'ticket-press',
    clip: '[data-unit="0"]',
    start: async (page) => {
      const { x, y } = await centre(page, '[data-unit="0"]');
      await page.mouse.move(x, y);
      await page.mouse.down();
    },
  },
  {
    name: 'ticket-release',
    clip: '[data-unit="0"]',
    setup: async (page) => {
      const { x, y } = await centre(page, '[data-unit="0"]');
      await page.mouse.move(x, y);
      await page.mouse.down();
      await page.waitForTimeout(150);
    },
    start: (page) => page.mouse.up(),
  },
  {
    name: 'ticket-deny',
    clip: '[data-unit="1"]',
    start: (page) => page.locator('[data-unit="1"]').click(),
  },
  {
    name: 'group-fold',
    clip: { x: 1440, y: 20, width: 470, height: 820 },
    start: (page) => page.locator('[data-group="0"] .shop-group-head').click(),
  },
  {
    name: 'group-unfold',
    clip: { x: 1440, y: 20, width: 470, height: 820 },
    setup: async (page) => {
      await page.locator('[data-group="0"] .shop-group-head').click();
      await page.waitForTimeout(600);
    },
    start: (page) => page.locator('[data-group="0"] .shop-group-head').click(),
  },
];

const outDir = 'artifacts/ui-film';
mkdirSync(outDir, { recursive: true });
const harness = await startHarness();
try {
  for (const scenario of scenarios) {
    if (only && !only.includes(scenario.name)) continue;
    const page = await harness.open('capture=1', SIZE);
    await qa(
      page,
      (api, value: { reduced: boolean }) => {
        api.set({ stage: 1, totalEarned: 3e6, popcorn: 2000, flavors: 2 });
        api.advance(0.3);
        api.buy(0, 3);
        api.set({ popcorn: 60 });
        api.game.settings.reduceMotion = value.reduced;
        api.game.applySettings();
        api.advance(1);
      },
      { reduced },
    );
    // Let any entrance from the setup itself finish before filming.
    await page.evaluate(() => {
      for (const animation of document.getAnimations()) {
        if (Number.isFinite(Number(animation.effect?.getComputedTiming().endTime))) animation.finish();
      }
    });
    await scenario.setup?.(page);
    await scenario.start(page);
    await page.evaluate(() => document.getAnimations().forEach((animation) => animation.pause()));
    // Framed once the interaction has begun, so text and classes it adds are measured too.
    let clip = scenario.clip as Clip;
    if (typeof scenario.clip === 'string') {
      const box = (await page.locator(scenario.clip).first().boundingBox())!;
      const room = 24;
      clip = { x: Math.max(0, box.x - room), y: Math.max(0, box.y - room), width: box.width + room * 2, height: box.height + room * 2 };
    }
    const frames: string[] = [];
    for (const [index, at] of STEPS_MS.entries()) {
      await page.evaluate((time) => {
        for (const animation of document.getAnimations()) {
          const end = Number(animation.effect?.getComputedTiming().endTime ?? 0);
          // Endless pulses keep their place; everything else is shown at this moment.
          if (Number.isFinite(end)) animation.currentTime = Math.min(time, end - 0.01);
        }
      }, at);
      const file = join(outDir, `${scenario.name}-${String(index).padStart(2, '0')}.png`);
      await page.screenshot({ path: file, clip, animations: 'allow' });
      frames.push(file);
    }
    await page.close();
    const inputs = frames.flatMap((file) => ['-i', file]);
    const filter = `${frames.map((_, i) => `[${i}:v]`).join('')}hstack=inputs=${frames.length}`;
    const strip = join(outDir, `${scenario.name}${reduced ? '-reduced' : ''}.png`);
    execFileSync('ffmpeg', ['-y', '-loglevel', 'error', ...inputs, '-filter_complex', filter, '-frames:v', '1', '-update', '1', strip]);
    for (const file of frames) rmSync(file);
    console.log(`${strip}  (${STEPS_MS.join(' / ')} ms)`);
  }
} finally {
  await harness.close();
}
