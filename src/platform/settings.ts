import type { QualityTier } from '../render/core/quality.ts';
import type { KeyValueStore } from './storage.ts';

export type QualityChoice = 'auto' | QualityTier;
export type Language = 'zh-CN';

export interface Settings {
  master: number;
  music: number;
  effects: number;
  quality: QualityChoice;
  /** Playback speed of long shows such as breakouts and the ending. */
  showSpeed: number;
  reduceMotion: boolean;
  screenShake: boolean;
  /** Reserved for future translations; only Simplified Chinese ships today. */
  language: Language;
}

export const SHOW_SPEEDS: readonly number[] = [1, 1.5, 2];

export function defaultSettings(prefersReducedMotion = false): Settings {
  return {
    master: 0.85,
    music: 0.6,
    effects: 0.9,
    quality: 'auto',
    showSpeed: 1,
    reduceMotion: prefersReducedMotion,
    screenShake: !prefersReducedMotion,
    language: 'zh-CN',
  };
}

const unit = (value: unknown, fallback: number): number =>
  typeof value === 'number' && Number.isFinite(value) ? Math.min(1, Math.max(0, value)) : fallback;

/** Unknown or damaged values fall back one by one, so one bad field never resets the rest. */
export function parseSettings(text: string | null, defaults: Settings): Settings {
  if (!text) return defaults;
  let raw: Record<string, unknown>;
  try {
    const parsed: unknown = JSON.parse(text);
    if (typeof parsed !== 'object' || parsed === null) return defaults;
    raw = parsed as Record<string, unknown>;
  } catch {
    return defaults;
  }
  const qualities: QualityChoice[] = ['auto', 'low', 'medium', 'high', 'ultra'];
  return {
    master: unit(raw.master, defaults.master),
    music: unit(raw.music, defaults.music),
    effects: unit(raw.effects, defaults.effects),
    quality: qualities.includes(raw.quality as QualityChoice) ? (raw.quality as QualityChoice) : defaults.quality,
    showSpeed: SHOW_SPEEDS.includes(raw.showSpeed as number) ? (raw.showSpeed as number) : defaults.showSpeed,
    reduceMotion: typeof raw.reduceMotion === 'boolean' ? raw.reduceMotion : defaults.reduceMotion,
    screenShake: typeof raw.screenShake === 'boolean' ? raw.screenShake : defaults.screenShake,
    language: 'zh-CN',
  };
}

export async function loadSettings(store: KeyValueStore, defaults: Settings): Promise<Settings> {
  try {
    return parseSettings(await store.read('settings'), defaults);
  } catch {
    return defaults;
  }
}

export function saveSettings(store: KeyValueStore, settings: Settings): void {
  void store.write('settings', JSON.stringify(settings)).catch(() => undefined);
}
