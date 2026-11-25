/**
 * What every upgrade of save version 4 and earlier cost, so a save from before the upgrade rows
 * can be paid back for whatever does not carry over. Frozen here on purpose: later price changes
 * must not change what an old save is owed.
 */

const SKILLS: Readonly<Record<string, number>> = {
  pop3: 60,
  pop5: 4_000,
  pop10: 6e6,
  pop20: 37e9,
  touch1: 1_500,
  touch2: 3.6e6,
  touch3: 630e9,
  golden1: 3_000,
  golden2: 6e7,
  golden3: 8e11,
  hold8: 20_000,
  auto1: 800,
  auto2: 13e6,
  auto3: 2.2e12,
  'cannon-window': 50_000,
  'cannon-cool': 26e6,
  'cannon-load': 450e6,
  'cannon-streak': 2e8,
  'cannon-cool2': 1.1e12,
  'cannon-load2': 80e12,
  'cannon-fireworks': 1.5e15,
  'auto-cannon': 2.3e6,
  'auto-hopper': 650_000,
  'hopper-time': 30_000,
  'hopper-bait': 26e6,
  'frenzy-click': 3e8,
  'hopper-swarm': 5e9,
  'hopper-gold': 2.2e12,
  'offline-rate': 100_000,
  'offline-cap': 68e6,
  'offline-rate2': 1.1e12,
  'decor-neon': 100,
  'decor-plant': 450,
  'decor-chandelier': 120_000,
  'decor-rug': 1.5e6,
  'decor-carpet': 6e8,
  'decor-stars': 8e9,
  'decor-bunting': 1e12,
  'decor-fountain': 1.2e13,
  'decor-ring': 3e14,
  'decor-aurora': 1.5e15,
};

/** Machine base prices at version 4, by machine id. */
const BASE_COST = [10, 110, 2_500, 74_000, 3.7e6, 1.1e8, 6e9, 1.75e11, 6.6e12, 2e14, 35, 13_000, 2e7, 3.3e10, 3.5e13];
/** The four tiers of each machine cost its base price times these. */
const TIER_FACTOR = [25, 1_000, 50_000, 6e7];

const SYNERGY_TARGET: Readonly<Record<string, number>> = {
  'syn-pan-toaster': 10,
  'syn-pan-microwave': 1,
  'syn-toaster-microwave': 1,
  'syn-microwave-cart': 2,
  'syn-cart-mixer': 11,
  'syn-cart-cannon': 3,
  'syn-mixer-cannon': 3,
  'syn-cart-cinema': 4,
  'syn-cinema-organ': 12,
  'syn-cinema-truck': 5,
  'syn-organ-truck': 5,
  'syn-truck-factory': 6,
  'syn-factory-train': 13,
  'syn-factory-airship': 7,
  'syn-train-airship': 7,
  'syn-airship-volcano': 8,
  'syn-volcano-typhoon': 14,
  'syn-volcano-orbital': 9,
  'syn-typhoon-orbital': 9,
};

/** The price an old save paid for one of its upgrades, or 0 for an id that never existed. */
export function legacyCost(id: string): number {
  if (id in SKILLS) return SKILLS[id]!;
  if (id in SYNERGY_TARGET) return BASE_COST[SYNERGY_TARGET[id]!]! * 60;
  const tier = /^unit-(\d+)-([1-4])$/.exec(id);
  if (tier) {
    const base = BASE_COST[Number(tier[1])];
    return base === undefined ? 0 : base * TIER_FACTOR[Number(tier[2]) - 1]!;
  }
  return 0;
}
