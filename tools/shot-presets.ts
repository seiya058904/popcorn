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

export const shotPresets: ShotPreset[] = [
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
