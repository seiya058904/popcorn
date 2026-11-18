import type { Page } from '@playwright/test';
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

const kitchen = (name: string, total: number, units: [number, number, number]): ShotPreset => ({
  name,
  size: { width: 1920, height: 1080 },
  async run(page) {
    await qa(
      page,
      (api, value: { total: number; units: [number, number, number] }) => {
        api.set({ stage: 1, totalEarned: value.total, popcorn: 1e9 });
        api.advance(0.2);
        value.units.forEach((count, unit) => api.buy(unit, count));
        api.set({ popcorn: value.total });
        api.advance(3);
      },
      { total, units },
    );
  },
});

const scene = (name: string, stage: number, total: number, units: number[]): ShotPreset => ({
  name,
  size: { width: 1920, height: 1080 },
  async run(page) {
    await qa(
      page,
      (api, value: { stage: number; total: number; units: number[] }) => {
        api.set({ stage: value.stage, totalEarned: value.total, popcorn: 1e15, flavors: value.stage * 2 });
        api.advance(0.2);
        value.units.forEach((count, unit) => api.buy(unit, count));
        api.set({ popcorn: value.total });
        api.advance(3.5);
      },
      { stage, total, units },
    );
  },
});

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
        (api) => {
          api.set({ stage: 1, totalEarned: 9000, popcorn: 9000 });
          api.advance(2);
          api.showHopper();
          api.advance(1.3);
        },
        null,
      );
    },
  },
  scene('m5-cinema-start', 2, 6e4, [0, 0, 0, 0]),
  scene('m5-cinema-mid', 2, 6e5, [4, 3, 2, 4]),
  scene('m5-cinema-full', 2, 9.5e6, [6, 4, 2, 8]),
  scene('m5-town-start', 3, 1.2e7, [0, 0, 0, 0, 0]),
  scene('m5-town-mid', 3, 1.2e8, [0, 2, 2, 4, 4]),
  scene('m5-town-full', 3, 9.5e8, [0, 4, 3, 4, 8]),
  scene('m5-earth-start', 4, 1.1e9, [0, 0, 0, 0, 0, 0]),
  scene('m5-earth-mid', 4, 4e9, [0, 1, 2, 2, 3, 4]),
  scene('m5-earth-full', 4, 1.9e10, [0, 2, 2, 2, 3, 8]),
  kitchen('m4-kitchen-start', 1200, [0, 0, 0]),
  kitchen('m4-kitchen-mid', 7000, [6, 3, 1]),
  kitchen('m4-kitchen-full', 46000, [8, 6, 4]),
  earned('m1-start', 0),
  earned('m1-early', 12),
  earned('m1-mid', 120, 2),
  earned('m1-late', 950, 6),
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
          api.earn(900);
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
          api.earn(60);
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
        (api) => {
          api.set({ stage: 2 });
          api.earn(900000);
          api.buy(0, 22);
          api.buy(1, 9);
          api.buy(2, 3);
          api.advance(1.5);
        },
        null,
      );
    },
  },
  {
    name: 'm3-720p',
    size: { width: 1280, height: 720 },
    async run(page) {
      await qa(
        page,
        (api) => {
          api.set({ stage: 1 });
          api.earn(30000);
          api.buy(0, 12);
          api.buy(1, 3);
          api.advance(1.5);
        },
        null,
      );
    },
  },
  {
    name: 'm3-flavor-spread',
    async run(page) {
      await qa(
        page,
        (api) => {
          api.earn(700);
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
          api.earn(30000);
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
