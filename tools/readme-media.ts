import { mkdirSync, writeFileSync } from 'node:fs';
import type { Page } from '@playwright/test';
import { startHarness } from './lib/harness.ts';
import { qa, totalAt } from './shot-presets.ts';

/**
 * Usage: node tools/readme-media.ts
 * The pictures in README.md, all real captures of the game: the title, the five scenes, a breakout
 * in motion, a hidden thing found and a golden kernel. Written to docs/media as JPEG.
 */
const OUT = 'docs/media';
const SIZE = { width: 1600, height: 900 };
const QUALITY = 82;
mkdirSync(OUT, { recursive: true });

/** Every machine of the scenes so far, a dozen each, and every flavor up to `flavors`. */
const MACHINES = [
  [0, 1, 10],
  [2, 3, 11],
  [4, 5, 12],
  [6, 7, 13],
  [8, 9, 14],
];

async function scene(page: Page, stage: number, progress: number, flavors: number): Promise<void> {
  await qa(
    page,
    (api, value: { stage: number; total: number; units: number[]; flavors: number }) => {
      api.set({ stage: value.stage, totalEarned: value.total, popcorn: 1e30, flavors: value.flavors });
      for (const unit of value.units) api.buy(unit, 30);
      api.set({ popcorn: value.total });
      // Anyone this far in has clicked, so the first-click hint is long gone.
      api.game.sim.state.stats.clicks = Math.max(1, api.game.sim.state.stats.clicks);
      api.advance(4);
    },
    { stage, total: totalAt(stage, progress), units: MACHINES.slice(0, stage + 1).flat(), flavors },
  );
}

const save = async (page: Page, name: string): Promise<void> => {
  // The counter's digits roll on the wall clock; let them land.
  await page.waitForTimeout(700);
  writeFileSync(`${OUT}/${name}.jpg`, await page.screenshot({ type: 'jpeg', quality: QUALITY }));
  console.log(name);
};

const harness = await startHarness();
try {
  const title = await harness.open('capture=1&title=1', SIZE);
  await qa(title, (api) => api.advance(3), null);
  await title.waitForTimeout(1500);
  await save(title, 'cover');
  await title.close();

  const shots: Array<[string, number, number, number]> = [
    ['stove', 0, 0.8, 0],
    ['kitchen', 1, 0.6, 2],
    ['cinema', 2, 0.55, 3],
    ['town', 3, 0.85, 6],
    ['earth', 4, 0.45, 8],
  ];
  for (const [name, stage, progress, flavors] of shots) {
    const page = await harness.open('capture=1', SIZE);
    await scene(page, stage, progress, flavors);
    await save(page, name);
    await page.close();
  }

  // Halfway through the climb out of the cinema, motion blur and all.
  const breakout = await harness.open('capture=1', SIZE);
  await scene(breakout, 2, 0.98, 3);
  await qa(breakout, (api) => {
    api.earn(1e12);
    api.advance(2.05);
  }, null);
  await save(breakout, 'breakout');
  await breakout.close();

  // The fridge door flies open and the fridge turns out to be full of popcorn too.
  const egg = await harness.open('capture=1', SIZE);
  await scene(egg, 1, 0.35, 0);
  const point = await qa(egg, (api) => api.eggPoint('egg-fridge'), null);
  if (point) {
    await qa(egg, (api, p: { x: number; y: number }) => api.click(p.x, p.y), point);
    await qa(egg, (api) => api.advance(0.75), null);
    await save(egg, 'eggs');
  }
  await egg.close();

  // A golden kernel, made to happen on the next click.
  const golden = await harness.open('capture=1', SIZE);
  await scene(golden, 0, 0.6, 0);
  await qa(golden, (api) => {
    const sim = api.game.sim;
    const click = sim.click.bind(sim);
    sim.click = () => ({ ...click(), golden: true });
    api.click(700, 500);
    api.advance(0.38);
  }, null);
  await save(golden, 'golden');
  await golden.close();
} finally {
  await harness.close();
}
