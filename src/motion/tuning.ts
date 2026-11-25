export interface TuningField {
  readonly key: TuningKey;
  readonly label: string;
  readonly min: number;
  readonly max: number;
  readonly step: number;
}

/** Live motion values. Starting points come from section 6 of the execution plan. */
export const tuning = {
  squashMs: 80,
  squashY: 0.75,
  hitstopMs: 40,
  hitstopRapidMs: 10,
  burstMs: 90,
  burstOvershoot: 1.25,
  landSquashMs: 120,
  landRadius: 3,
  counterPopMs: 100,
  counterPopScale: 1.08,
  cannonShakeMs: 250,
  breakSilenceMs: 300,
};

export type TuningKey = keyof typeof tuning;

export const tuningFields: readonly TuningField[] = [
  { key: 'squashMs', label: '点击压扁 ms', min: 20, max: 200, step: 5 },
  { key: 'squashY', label: '压扁纵向', min: 0.4, max: 1, step: 0.01 },
  { key: 'hitstopMs', label: '炸开前顿帧 ms', min: 0, max: 120, step: 5 },
  { key: 'hitstopRapidMs', label: '连点顿帧 ms', min: 0, max: 40, step: 1 },
  { key: 'burstMs', label: '炸开膨胀 ms', min: 30, max: 240, step: 5 },
  { key: 'burstOvershoot', label: '膨胀过冲', min: 1, max: 1.8, step: 0.01 },
  { key: 'landSquashMs', label: '落堆挤压 ms', min: 40, max: 320, step: 10 },
  { key: 'landRadius', label: '落堆影响半径', min: 1, max: 8, step: 0.5 },
  { key: 'counterPopMs', label: '数字跳动 ms', min: 40, max: 300, step: 10 },
  { key: 'counterPopScale', label: '数字放大', min: 1, max: 1.4, step: 0.01 },
  { key: 'cannonShakeMs', label: '大炮屏震 ms', min: 0, max: 800, step: 10 },
  { key: 'breakSilenceMs', label: '突破静默 ms', min: 0, max: 800, step: 10 },
];

/**
 * How a heap stays alive between pops, for show only. Rates are per second of production intensity;
 * radii are shares of the heap's landing radius; strengths are in heap units (negative heaves up).
 */
export const HEAP_LIFE = {
  churnRate: 0.35,
  churnRateMax: 2.2,
  churnStrength: 3,
  churnRadius: 0.18,
  /** Share of tumbles that take two or three flakes and leave a dent. */
  slideChance: 0.3,
  slideDent: 2.5,
  slideRadius: 0.14,
};
