/**
 * The mix as plain numbers, with no Web Audio in sight, so it can be tested and rendered offline.
 * Intensity is the compressed production scale from `showIntensity`: about 1 on the stove,
 * 2.5 in the kitchen, 4 in the cinema, 5.5 in the town and 7 at the end of the game.
 */

export const BED_LAYERS = ['layer-crackle', 'layer-dense', 'layer-rain', 'layer-hail', 'layer-roar', 'layer-rumble', 'layer-swell'] as const;
export type BedLayer = (typeof BED_LAYERS)[number];

/** Stereo spread of each layer. The rumble stays centered, as low notes should. */
export const BED_WIDTH: Record<BedLayer, number> = {
  'layer-crackle': 0.55,
  'layer-dense': 0.7,
  'layer-rain': 0.85,
  'layer-hail': 0.8,
  'layer-roar': 0.6,
  'layer-rumble': 0,
  'layer-swell': 0.9,
};

export interface BedMix {
  layers: Record<BedLayer, number>;
  /** Music gives way a little as the heap gets louder. */
  music: number;
  /** Bass cut on the music, in decibels, leaving the low end to the rumble. */
  musicBassDb: number;
  /** How far the bed dips under a click, so a single pop is still heard at the very end. */
  clickDuck: number;
}

const smooth = (a: number, b: number, x: number): number => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

/** Each stage of the game gets its own texture: pops, crackle, rain, hail, roar, then the earth moving. */
export function bedMix(intensity: number): BedMix {
  const x = intensity;
  return {
    layers: {
      'layer-crackle': smooth(0.1, 1, x) * 0.62 * (1 - smooth(2.6, 3.8, x) * 0.75),
      'layer-dense': smooth(1.2, 2.4, x) * 0.62 * (1 - smooth(3.8, 5, x) * 0.7),
      'layer-rain': smooth(2.8, 4, x) * 0.72 * (1 - smooth(5.2, 6.3, x) * 0.45),
      'layer-hail': smooth(4, 5.2, x) * 0.95 * (1 - smooth(6.2, 7, x) * 0.2),
      'layer-roar': smooth(5, 6.2, x) * 1.1,
      'layer-rumble': smooth(5.6, 7, x) * 1.25,
      'layer-swell': smooth(6.1, 7.1, x) * 0.95,
    },
    music: 1 - smooth(4.5, 7, x) * 0.2,
    musicBassDb: -7 * smooth(4.5, 6.5, x),
    clickDuck: 0.1 + smooth(3, 7, x) * 0.3,
  };
}

/** Slow, unrelated swells, so a huge sustained sound moves like weather instead of sitting still. */
export function bedSurge(layer: number, time: number): number {
  return 1 + 0.09 * Math.sin(time * (0.31 + layer * 0.07) + layer * 1.9) + 0.06 * Math.sin(time * (0.83 - layer * 0.05) + layer * 4.3);
}

export interface AcousticSpace {
  name: string;
  /** Time for the tail to fall by 60 dB. */
  decay: number;
  preDelay: number;
  /** Low-pass at the start of the tail, and where it ends up. */
  brightHz: number;
  darkHz: number;
  /** Discrete echoes: delay in seconds and level. */
  echoes: ReadonlyArray<readonly [number, number]>;
  send: number;
}

/** One room per scene: the sound of the place grows along with everything else. */
export const SPACES: readonly AcousticSpace[] = [
  { name: 'stove', decay: 0.45, preDelay: 0.004, brightHz: 7000, darkHz: 2600, echoes: [[0.011, 0.5], [0.019, 0.32]], send: 0.13 },
  { name: 'kitchen', decay: 0.8, preDelay: 0.009, brightHz: 6000, darkHz: 1900, echoes: [[0.023, 0.45], [0.037, 0.34], [0.052, 0.2]], send: 0.17 },
  { name: 'cinema', decay: 2, preDelay: 0.028, brightHz: 4200, darkHz: 900, echoes: [[0.061, 0.36], [0.094, 0.28], [0.141, 0.2]], send: 0.24 },
  { name: 'town', decay: 1.1, preDelay: 0.02, brightHz: 5200, darkHz: 1500, echoes: [[0.118, 0.34], [0.214, 0.22], [0.331, 0.13]], send: 0.14 },
  { name: 'earth', decay: 3.4, preDelay: 0.05, brightHz: 2600, darkHz: 420, echoes: [[0.19, 0.2], [0.42, 0.14]], send: 0.22 },
];

export const spaceForStage = (stage: number): number => Math.min(Math.max(0, stage), SPACES.length - 1);
