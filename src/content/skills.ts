/** Tunable constants for the cannon, the hopping kernel, offline earnings and new-game bonus. */
export const CANNON = {
  /** Seconds of holding from empty gauge to overpressure. */
  chargeSeconds: 1.2,
  /** Holds shorter than this are treated as a cancelled press. */
  minHoldSeconds: 0.25,
  /** The green zone ends this long before overpressure. */
  greenEndsBefore: 0.1,
  greenWidth: 0.16,
  cooldown: 90,
  normalSeconds: 30,
  perfectSeconds: 60,
  overpressureSeconds: 10,
} as const;

export const HOPPER = {
  minInterval: 120,
  maxInterval: 240,
  /** How long it hops around before escaping. */
  visibleSeconds: 12,
  frenzySeconds: 20,
  frenzyMultiplier: 5,
} as const;

export const OFFLINE = {
  rate: 0.25,
  capHours: 8,
  /** Absences shorter than this are not worth a welcome-back screen. */
  minSeconds: 60,
} as const;

export const CLICK = {
  basePops: 1,
  baseValue: 1,
  rateShare: 0.01,
} as const;

export const NEW_POT = {
  /** Permanent production bonus per finished run. */
  bonusPerRun: 0.25,
} as const;

export const POT_SKINS: readonly string[] = ['经典红', '薄荷绿', '黄油黄', '天空蓝', '午夜黑', '月光银'];
