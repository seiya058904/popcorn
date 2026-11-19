import { PRODUCERS } from '../content/producers.ts';

/** 4: five more machines, golden kernels, swarms, pokes and the easter-egg album. */
export const SAVE_VERSION = 4;

export interface RunStats {
  clicks: number;
  pops: number;
  cannonShots: number;
  cannonPerfect: number;
  cannonOverpressure: number;
  perfectStreak: number;
  hoppersCaught: number;
  hoppersMissed: number;
  purchases: number;
  spent: number;
  offlineCollected: number;
  playSeconds: number;
  goldenPops: number;
  /** Times a working machine was poked. */
  pokes: number;
  /** Swarms caught to the last kernel. */
  swarmsCaught: number;
}

/** Survives "再来一锅". */
export interface Legacy {
  runs: number;
  lifetimeEarned: number;
  /** Highest number of flavors ever owned, shown in the flavor album. */
  flavorAlbum: number;
  potSkin: number;
  achievements: string[];
  /** Easter eggs ever found, in the order they were found. */
  found: string[];
}

export interface GameState {
  version: number;
  popcorn: number;
  totalEarned: number;
  owned: number[];
  flavors: number;
  upgrades: string[];
  /** Index of the current scene; equals the number of scenes already broken. */
  stage: number;
  cannonCooldown: number;
  hopperTimer: number;
  hopperVisible: number;
  hopperId: number;
  /** Kernels of the current swarm still to come after the one on screen. */
  hopperSwarm: number;
  /** Size of the swarm under way, or 0 while kernels come alone. */
  hopperSwarmSize: number;
  frenzy: number;
  rng: number;
  ended: boolean;
  stats: RunStats;
  legacy: Legacy;
  /** Wall-clock milliseconds of the last save; 0 until the first one. */
  savedAt: number;
}

export function createStats(): RunStats {
  return {
    clicks: 0,
    pops: 0,
    cannonShots: 0,
    cannonPerfect: 0,
    cannonOverpressure: 0,
    perfectStreak: 0,
    hoppersCaught: 0,
    hoppersMissed: 0,
    purchases: 0,
    spent: 0,
    offlineCollected: 0,
    playSeconds: 0,
    goldenPops: 0,
    pokes: 0,
    swarmsCaught: 0,
  };
}

export function createLegacy(): Legacy {
  return { runs: 0, lifetimeEarned: 0, flavorAlbum: 0, potSkin: 0, achievements: [], found: [] };
}

export function createState(seed = 0x2f6e2b1): GameState {
  return {
    version: SAVE_VERSION,
    popcorn: 0,
    totalEarned: 0,
    owned: PRODUCERS.map(() => 0),
    flavors: 0,
    upgrades: [],
    stage: 0,
    cannonCooldown: 0,
    hopperTimer: 150,
    hopperVisible: 0,
    hopperId: 0,
    hopperSwarm: 0,
    hopperSwarmSize: 0,
    frenzy: 0,
    rng: seed >>> 0,
    ended: false,
    stats: createStats(),
    legacy: createLegacy(),
    savedAt: 0,
  };
}
