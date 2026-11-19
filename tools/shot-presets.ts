import type { Page } from '@playwright/test';
import { STAGES } from '../src/content/stages.ts';
import type { QaApi } from '../src/debug/index.ts';

export interface ShotPreset {
  name: string;
  query?: string;
  size?: { width: number; height: number };
  run(page: Page): Promise<void>;
}

type QaWindow = Window & { __pop: QaApi };

export const qa = <T, A>(page: Page, action: (api: QaApi, arg: A) => T, arg: A): Promise<T> =>
  page.evaluate(
    ({ source, value }) => {
      const api = (window as unknown as QaWindow).__pop;
      return new Function('api', 'value', `return (${source})(api, value)`)(api, value) as T;
    },
    { source: action.toString(), value: arg },
  );

export const advance = (page: Page, seconds: number): Promise<void> =>
  qa(page, (api, value: number) => api.advance(value), seconds);

/** Cumulative popcorn at a point through a scene, on the log scale the heap follows. */
export const totalAt = (stage: number, progress: number): number => {
  const from = Math.log1p(stage > 0 ? STAGES[stage - 1]!.threshold : 0);
  const to = Math.log1p(STAGES[stage]!.threshold);
  return Math.expm1(from + (to - from) * progress);
};

/** Enough to buy anything, while setting up a scene. */
const PLENTY = 1e24;

const earned = (name: string, amount: number, pans = 0): ShotPreset => ({
  name,
  async run(page) {
    await qa(
      page,
      (api, value: { amount: number; pans: number }) => {
        api.earn(value.amount);
        api.advance(0.5);
        api.buy(0, value.pans);
        api.advance(2.5);
      },
      { amount: amount + 400 * pans, pans },
    );
  },
});

interface SceneSetup {
  stage: number;
  total: number;
  units: number[];
  flavors: number;
  plenty: number;
}

const stageShot = (name: string, stage: number, progress: number, units: number[], flavors: number, settle: number): ShotPreset => ({
  name,
  size: { width: 1920, height: 1080 },
  async run(page) {
    await qa(
      page,
      (api, value: SceneSetup & { settle: number }) => {
        api.set({ stage: value.stage, totalEarned: value.total, popcorn: value.plenty, flavors: value.flavors });
        api.advance(0.2);
        value.units.forEach((count, unit) => api.buy(unit, count));
        api.set({ popcorn: value.total });
        api.advance(value.settle);
      },
      { stage, total: totalAt(stage, progress), units, flavors, plenty: PLENTY, settle },
    );
  },
});

/** Units are listed in shop order: pan, microwave, cart, cannon. */
const kitchen = (name: string, progress: number, units: number[]): ShotPreset => stageShot(name, 1, progress, units, 0, 3);

const scene = (name: string, stage: number, progress: number, units: number[]): ShotPreset => stageShot(name, stage, progress, units, stage * 2, 3.5);

export const shotPresets: ShotPreset[] = [
  {
    name: 'm6-title',
    query: 'title=1',
    size: { width: 1920, height: 1080 },
    async run(page) {
      await advance(page, 3);
      await page.waitForTimeout(1500);
    },
  },
  {
    name: 'm6-hopper',
    size: { width: 1920, height: 1080 },
    async run(page) {
      await qa(
        page,
        (api, total: number) => {
          api.set({ stage: 1, totalEarned: total, popcorn: total });
          api.advance(2);
          api.showHopper();
          api.advance(1.3);
        },
        totalAt(1, 0.56),
      );
    },
  },
  // Every machine of the second phase, in the scene it belongs to.
  { ...earned('p2-stove-machines', 1500, 4), async run(page) {
    await qa(
      page,
      (api) => {
        api.earn(1500);
        api.advance(0.5);
        api.set({ popcorn: 1e6 });
        api.buy(0, 4);
        api.buy(1, 3);
        api.set({ popcorn: 0 });
        api.advance(2.5);
      },
      null,
    );
  }, size: { width: 1920, height: 1080 } },
  {
    name: 'p5-stirrer',
    size: { width: 1920, height: 1080 },
    async run(page) {
      await qa(
        page,
        (api) => {
          api.earn(320);
          api.advance(0.3);
          api.set({ popcorn: 1e6 });
          api.buy(0, 4);
          api.buy(1, 2);
          api.game.sim.state.totalEarned = 1200;
          api.game.sim.buyUpgrade('auto1');
          api.set({ popcorn: 0, totalEarned: 320 });
          api.advance(2.8);
        },
        null,
      );
    },
  },
  kitchen('p2-kitchen-machines', 0.45, [4, 3, 3, 2]),
  scene('p2-cinema-machines', 2, 0.45, [4, 0, 3, 0, 4, 4]),
  scene('p2-town-machines', 3, 0.45, [0, 0, 0, 0, 4, 4, 4, 4]),
  scene('p2-earth-machines', 4, 0.45, [0, 0, 0, 0, 0, 0, 3, 3, 4, 3]),
  { ...scene('p7-720p-late', 4, 0.45, [5, 5, 5, 5, 5, 5, 3, 3, 4, 3]), size: { width: 1280, height: 720 } },
  scene('m5-cinema-start', 2, 0.03, [0, 0, 0, 0, 0, 0]),
  scene('m5-cinema-mid', 2, 0.47, [4, 0, 3, 2, 4, 2]),
  scene('m5-cinema-full', 2, 0.99, [6, 0, 4, 2, 8, 4]),
  scene('m5-town-start', 3, 0.04, [0, 0, 0, 0, 0, 0, 0, 0]),
  scene('m5-town-mid', 3, 0.54, [0, 0, 0, 0, 4, 2, 4, 2]),
  scene('m5-town-full', 3, 0.99, [0, 0, 0, 0, 4, 4, 8, 4]),
  scene('m5-earth-start', 4, 0.03, [0, 0, 0, 0, 0, 0, 0, 0, 0, 0]),
  scene('m5-earth-mid', 4, 0.46, [0, 0, 0, 0, 0, 0, 3, 2, 4, 2]),
  scene('m5-earth-full', 4, 0.98, [0, 0, 0, 0, 0, 0, 3, 3, 8, 3]),
  // Overflow stages, where the heap changes shape around the vessel and the table.
  kitchen('m6-overflow-a', 0.64, [6, 2, 3, 1]),
  kitchen('m6-overflow-b', 0.74, [6, 2, 3, 1]),
  kitchen('m6-overflow-c', 0.85, [4, 3, 4, 2]),
  scene('m6-overflow-d', 2, 0.65, [4, 0, 3, 2, 4, 2]),
  scene('m6-overflow-e', 2, 0.79, [6, 0, 3, 2, 6, 3]),
  scene('m6-overflow-f', 2, 0.9, [6, 0, 4, 2, 8, 4]),
  {
    name: 'm6-cinema-belt',
    size: { width: 1920, height: 1080 },
    async run(page) {
      await qa(
        page,
        (api, value: { total: number; plenty: number }) => {
          api.set({ stage: 2, totalEarned: value.total, popcorn: value.plenty, flavors: 4 });
          api.advance(0.2);
          [4, 0, 16, 2, 4, 2].forEach((count, unit) => api.buy(unit, count));
          api.game.sim.buyUpgrade('syn-cart-cinema');
          api.set({ popcorn: value.total });
          api.advance(3.5);
        },
        { total: totalAt(2, 0.73), plenty: PLENTY },
      );
    },
  },
  // The same busy moment at every quality tier.
  { ...kitchen('m7-tier-low', 0.85, [4, 3, 4, 2]), query: 'quality=low' },
  { ...kitchen('m7-tier-medium', 0.85, [4, 3, 4, 2]), query: 'quality=medium' },
  { ...kitchen('m7-tier-high', 0.85, [4, 3, 4, 2]), query: 'quality=high' },
  { ...kitchen('m7-tier-ultra', 0.85, [4, 3, 4, 2]), query: 'quality=ultra' },
  kitchen('m4-kitchen-start', 0.05, [0, 0, 0, 0]),
  kitchen('m4-kitchen-mid', 0.5, [6, 2, 3, 1]),
  kitchen('m4-kitchen-full', 0.98, [4, 3, 6, 4]),
  earned('m1-start', 0),
  earned('m1-early', 17),
  earned('m1-mid', 190, 2),
  earned('m1-late', 1880, 6),
  {
    name: 'm1-flakes',
    async run(page) {
      await qa(
        page,
        (api) => {
          api.showcase();
          api.advance(0.1);
        },
        null,
      );
    },
  },
  {
    name: 'm1-pile-close',
    async run(page) {
      await qa(
        page,
        (api) => {
          api.earn(1700);
          api.advance(3);
          api.viewFrom([1.6, 3.5, 5.2], [0.4, 2.0, 0.6], 24);
          api.advance(0.1);
        },
        null,
      );
    },
  },
  {
    name: 'm1-burst',
    async run(page) {
      await qa(
        page,
        (api) => {
          api.earn(100);
          api.advance(1);
          for (let i = 0; i < 6; i += 1) {
            api.click(500 + i * 18, 400);
            api.advance(0.1);
          }
          api.advance(0.08);
        },
        null,
      );
    },
  },
  {
    name: 'm3-shop',
    size: { width: 1920, height: 1080 },
    async run(page) {
      await qa(
        page,
        (api, total: number) => {
          api.set({ stage: 2, totalEarned: total, popcorn: total });
          api.buy(0, 22);
          api.buy(1, 9);
          api.buy(2, 3);
          api.advance(2.8);
        },
        totalAt(2, 0.1),
      );
    },
  },
  {
    name: 'm3-720p',
    size: { width: 1280, height: 720 },
    async run(page) {
      await qa(
        page,
        (api, total: number) => {
          api.set({ stage: 1, totalEarned: total, popcorn: total });
          api.buy(0, 12);
          api.buy(1, 3);
          api.advance(2.8);
        },
        totalAt(1, 0.3),
      );
    },
  },
  {
    name: 'm3-flavor-spread',
    async run(page) {
      await qa(
        page,
        (api) => {
          api.earn(1300);
          api.advance(2.5);
          api.game.sim.buyFlavor();
          api.advance(0.95);
        },
        null,
      );
    },
  },
  {
    name: 'm3-strawberry',
    async run(page) {
      await qa(
        page,
        (api) => {
          api.earn(1500);
          api.set({ popcorn: 1e7 });
          api.advance(1.5);
          for (let i = 0; i < 4; i += 1) {
            api.game.sim.buyFlavor();
            api.advance(1.9);
          }
          api.advance(1);
        },
        null,
      );
    },
  },
];
