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
  /** A ready cannon waits this long before the automatic fuse fires it, so the player can go first. */
  autoFireDelay: 4,
} as const;

export const HOPPER = {
  minInterval: 120,
  maxInterval: 240,
  /** How long it hops around before escaping. */
  visibleSeconds: 12,
  frenzySeconds: 20,
  frenzyMultiplier: 5,
  /** The automatic catcher lets the kernel hop around for a moment first. */
  autoCatchSeconds: 3,
  /** In a swarm the next kernel pops up this soon after one is caught. */
  swarmGapSeconds: 1.2,
  /** Catching more of a swarm stacks the frenzy, up to this many frenzies' worth. */
  swarmFrenzyCap: 3,
} as const;

/** A golden kernel: a lucky click that pays many times over. Chance and payout come from upgrades. */
export const GOLDEN = {
  baseMultiplier: 10,
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
  /** Each click also pays this share of one second of production, so clicks stay useful late. */
  rateShare: 0.08,
} as const;

/** Holding the mouse down keeps popping, so nobody has to hammer the button. */
export const HOLD_POP = {
  firstDelay: 0.22,
  /** Pops per second while held; an upgrade raises it. */
  perSecond: 6,
} as const;

/** The pot simmers by itself: a player who never clicks still gets started. */
export const POT = {
  idleRate: 1,
} as const;

export const NEW_POT = {
  /** Permanent production bonus per finished run. */
  bonusPerRun: 0.25,
} as const;

export const POT_SKINS: readonly string[] = ['经典红', '薄荷绿', '黄油黄', '天空蓝', '午夜黑', '月光银'];
