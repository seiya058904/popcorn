import type { Page } from '@playwright/test';
import type { QaApi } from '../src/debug/index.ts';

export interface ShotPreset {
  name: string;
  query?: string;
  size?: { width: number; height: number };
  run(page: Page): Promise<void>;
}

type QaWindow = Window & { __pop: QaApi };

export const advance = (page: Page, seconds: number): Promise<void> =>
  page.evaluate((value) => (window as unknown as QaWindow).__pop.advance(value), seconds);

export const shotPresets: ShotPreset[] = [
  {
    name: 'empty',
    run: (page) => advance(page, 1.5),
  },
];
