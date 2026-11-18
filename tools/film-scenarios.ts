import type { Page } from '@playwright/test';
import { advance, qa } from './shot-presets.ts';

export interface FilmScenario {
  query?: string;
  size?: { width: number; height: number };
  clip: { x: number; y: number; width: number; height: number };
  frames: number;
  columns?: number;
  setup(page: Page): Promise<void>;
  beforeFrame?(page: Page, frame: number): Promise<void>;
  step(page: Page, frame: number): Promise<void>;
}

const FRAME = 1 / 60;
const POT_CLIP = { x: 340, y: 180, width: 400, height: 300 };
const POT_X = 540;
const POT_Y = 390;

const warmedUp = async (page: Page, amount: number): Promise<void> => {
  await qa(
    page,
    (api, value: number) => {
      api.earn(value);
      api.advance(1.2);
    },
    amount,
  );
};

const click = (page: Page, x: number, y: number): Promise<void> =>
  qa(page, (api, value: { x: number; y: number }) => api.click(value.x, value.y), { x, y });

export const filmScenarios: Record<string, FilmScenario> = {
  /** Every frame of one pop, from press to the flake settling into the heap. */
  click: {
    clip: POT_CLIP,
    frames: 48,
    setup: (page) => warmedUp(page, 20),
    beforeFrame: async (page, frame) => {
      if (frame === 2) await click(page, POT_X, POT_Y);
    },
    step: (page) => advance(page, FRAME),
  },
  /** A newly bought pan dropping onto its burner, then its first machine pop. */
  pan: {
    clip: { x: 0, y: 200, width: 520, height: 420 },
    frames: 32,
    setup: async (page) => {
      await warmedUp(page, 60);
      await qa(page, (api) => api.buy(0), null);
    },
    step: (page) => advance(page, FRAME * 2),
  },
  /** The first breakout, from the rattling lid to the kitchen settling into place. */
  breakout: {
    clip: { x: 0, y: 0, width: 1280, height: 720 },
    frames: 30,
    columns: 6,
    setup: async (page) => {
      await qa(
        page,
        (api) => {
          api.earn(960);
          api.buy(0, 3);
          api.advance(2.5);
          api.earn(200);
        },
        null,
      );
    },
    step: (page) => advance(page, FRAME * 6),
  },
  /** Cannon charge and a perfect shot, in the kitchen. */
  cannon: {
    clip: { x: 0, y: 0, width: 1280, height: 720 },
    frames: 24,
    columns: 6,
    setup: async (page) => {
      await qa(
        page,
        (api) => {
          api.set({ stage: 1, totalEarned: 12000, popcorn: 12000 });
          api.advance(2.5);
        },
        null,
      );
    },
    beforeFrame: async (page, frame) => {
      await qa(
        page,
        (api, f: number) => {
          if (f < 10) api.setCharge((f + 1) / 11);
          if (f === 10) {
            api.setCharge(0);
            api.fireCannon(1.02);
          }
        },
        frame,
      );
    },
    step: (page) => advance(page, FRAME * 4),
  },
  /** The shovel taking payment out of the heap. */
  shovel: {
    clip: { x: 180, y: 120, width: 640, height: 480 },
    frames: 24,
    columns: 6,
    setup: async (page) => {
      await warmedUp(page, 800);
      await advance(page, 2);
      await qa(page, (api) => api.buy(0), null);
    },
    step: (page) => advance(page, FRAME * 2),
  },
  /** Seasoning bottle, sprinkle and the color spreading through the heap. */
  flavor: {
    clip: { x: 180, y: 60, width: 640, height: 540 },
    frames: 28,
    columns: 7,
    setup: async (page) => {
      await warmedUp(page, 900);
      await advance(page, 2);
      await qa(page, (api) => api.game.sim.buyFlavor(), null);
    },
    step: (page) => advance(page, FRAME * 4),
  },
  /** Ten clicks per second, sampled every second frame. */
  rapid: {
    clip: POT_CLIP,
    frames: 40,
    setup: (page) => warmedUp(page, 40),
    beforeFrame: async (page, frame) => {
      if (frame % 3 === 0) await click(page, POT_X + (frame % 7) * 8 - 24, POT_Y);
    },
    step: (page) => advance(page, FRAME * 2),
  },
};
