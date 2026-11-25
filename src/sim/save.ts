import { ACHIEVEMENTS } from '../content/achievements.ts';
import { FLAVORS } from '../content/flavors.ts';
import { PRODUCERS } from '../content/producers.ts';
import { EGG_IDS } from '../content/props.ts';
import { POT_SKINS } from '../content/skills.ts';
import { STAGES } from '../content/stages.ts';
import { UPGRADE_BY_ID, UPGRADES } from '../content/upgrades.ts';
import { legacyCost } from './legacy-upgrades.ts';
import { createLegacy, createState, createStats, SAVE_VERSION, type GameState } from './state.ts';

const FORMAT = 'pop-popcorn-save';

/** What became of an old save's upgrades when they moved onto the upgrade rows. */
export interface UpgradeConversion {
  /** Rungs the old upgrades add up to. */
  rungs: number;
  /** Popcorn paid back for the old upgrades that no rung took in. */
  refunded: number;
}

export type LoadResult =
  | { ok: true; state: GameState; migratedFrom: number | null; converted: UpgradeConversion | null }
  | { ok: false; error: LoadError };
export type LoadError = 'not-json' | 'wrong-format' | 'bad-checksum' | 'future-version' | 'invalid-data';

type Json = Record<string, unknown>;

/** FNV-1a over UTF-16 units: enough to detect truncation and accidental edits. */
export function checksum(text: string): string {
  let hash = 0x811c9dc5;
  for (let i = 0; i < text.length; i += 1) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, '0');
}

export function serializeSave(state: GameState): string {
  const body = JSON.stringify(state);
  return JSON.stringify({ format: FORMAT, version: state.version, sum: checksum(body), body });
}

const isObject = (value: unknown): value is Json => typeof value === 'object' && value !== null && !Array.isArray(value);

/** Each entry upgrades a raw state from version N to N + 1. */
const MIGRATIONS: Record<number, (raw: Json) => Json> = {
  // Version 1 was the prototype: only counters and owned units.
  1: (raw) => {
    const fresh = createState();
    return {
      ...fresh,
      popcorn: raw.popcorn,
      totalEarned: raw.totalEarned,
      owned: raw.owned,
      stats: { ...createStats(), clicks: raw.clicks ?? 0 },
      legacy: { ...createLegacy(), lifetimeEarned: raw.totalEarned ?? 0 },
      version: 2,
    };
  },
  // Version 3 rebuilt the economy around ten units, so an old run cannot continue.
  // What the player collected across runs is kept.
  2: (raw) => ({
    ...createState(),
    legacy: { ...createLegacy(), ...(isObject(raw.legacy) ? raw.legacy : {}) },
    version: 3,
  }),
  // Version 4 only adds things: five machines (new ids after the old ones), counters and the egg
  // album. The run carries on; sanitize() fills every new field with its default.
  3: (raw) => ({ ...raw, version: 4 }),
  // Version 5 folds 120 upgrades into four rows of rungs. A rung is owned when every upgrade it
  // replaces was; whatever is left over (half a pair, and the machine tiers that are now
  // milestones) is paid back at its old price. Spending money back does not count as earning it,
  // so the scene and the run's total stay where they were.
  4: (raw) => {
    const old = new Set(Array.isArray(raw.upgrades) ? raw.upgrades.filter((id): id is string => typeof id === 'string') : []);
    const rungs: string[] = [];
    const taken = new Set<string>();
    for (const upgrade of UPGRADES) {
      if (upgrade.from.length > 0 && upgrade.from.every((id) => old.has(id))) {
        rungs.push(upgrade.id);
        for (const id of upgrade.from) taken.add(id);
      }
    }
    let refunded = 0;
    for (const id of old) if (!taken.has(id)) refunded += legacyCost(id);
    const converted: UpgradeConversion = { rungs: rungs.length, refunded };
    return { ...raw, upgrades: rungs, popcorn: finite(raw.popcorn, 0) + refunded, version: 5, [CONVERTED]: converted };
  },
};

/** Where the version 5 migration leaves its report on the raw state, for `parseSave` to pass on. */
const CONVERTED = '__converted';

/** Saves from before this version start a fresh run when loaded; later ones carry on. */
const FIRST_KEPT_RUN_VERSION = 3;

/** Whether loading a save that came from `from` threw its run away. */
export function migrationResetsRun(from: number | null): boolean {
  return from !== null && from < FIRST_KEPT_RUN_VERSION;
}

const finite = (value: unknown, fallback: number, min = 0, max = Number.MAX_VALUE): number =>
  typeof value === 'number' && Number.isFinite(value) ? Math.min(max, Math.max(min, value)) : fallback;

const whole = (value: unknown, fallback: number, max: number): number => Math.floor(finite(value, fallback, 0, max));

/** No swarm is ever this big; anything larger in a save is damage. */
const SWARM_LIMIT = 12;

/** Rebuilds a trusted state field by field; unknown or broken values fall back to safe defaults. */
function sanitize(raw: Json): GameState | null {
  if (!Array.isArray(raw.owned) || typeof raw.totalEarned !== 'number' || !Number.isFinite(raw.totalEarned)) return null;
  const base = createState();
  const rawStats = isObject(raw.stats) ? raw.stats : {};
  const rawLegacy = isObject(raw.legacy) ? raw.legacy : {};
  const stats = createStats();
  for (const key of Object.keys(stats) as Array<keyof typeof stats>) stats[key] = finite(rawStats[key], 0);
  const knownAchievements = new Set(ACHIEVEMENTS.map((achievement) => achievement.id));
  const strings = (value: unknown): string[] =>
    Array.isArray(value) ? [...new Set(value.filter((item): item is string => typeof item === 'string'))] : [];
  return {
    ...base,
    popcorn: finite(raw.popcorn, 0),
    totalEarned: finite(raw.totalEarned, 0),
    owned: PRODUCERS.map((producer) => whole((raw.owned as unknown[])[producer.id], 0, 100_000)),
    flavors: whole(raw.flavors, 0, FLAVORS.length),
    upgrades: strings(raw.upgrades).filter((id) => UPGRADE_BY_ID.has(id)),
    stage: whole(raw.stage, 0, STAGES.length),
    cannonCooldown: finite(raw.cannonCooldown, 0, 0, 3600),
    hopperTimer: finite(raw.hopperTimer, base.hopperTimer, 0, 3600),
    hopperVisible: finite(raw.hopperVisible, 0, 0, 60),
    hopperId: whole(raw.hopperId, 0, Number.MAX_SAFE_INTEGER),
    hopperSwarm: whole(raw.hopperSwarm, 0, SWARM_LIMIT),
    hopperSwarmSize: whole(raw.hopperSwarmSize, 0, SWARM_LIMIT),
    frenzy: finite(raw.frenzy, 0, 0, 600),
    rng: whole(raw.rng, base.rng, 0xffffffff),
    ended: raw.ended === true,
    stats,
    legacy: {
      runs: whole(rawLegacy.runs, 0, 100_000),
      lifetimeEarned: finite(rawLegacy.lifetimeEarned, 0),
      flavorAlbum: whole(rawLegacy.flavorAlbum, 0, FLAVORS.length),
      potSkin: whole(rawLegacy.potSkin, 0, POT_SKINS.length - 1),
      achievements: strings(rawLegacy.achievements).filter((id) => knownAchievements.has(id)),
      found: strings(rawLegacy.found).filter((id) => EGG_IDS.has(id)),
    },
    savedAt: finite(raw.savedAt, 0),
    version: SAVE_VERSION,
  };
}

export function parseSave(text: string): LoadResult {
  let envelope: unknown;
  try {
    envelope = JSON.parse(text);
  } catch {
    return { ok: false, error: 'not-json' };
  }
  if (!isObject(envelope) || envelope.format !== FORMAT || typeof envelope.body !== 'string') {
    return { ok: false, error: 'wrong-format' };
  }
  if (envelope.sum !== checksum(envelope.body)) return { ok: false, error: 'bad-checksum' };
  let raw: unknown;
  try {
    raw = JSON.parse(envelope.body);
  } catch {
    return { ok: false, error: 'not-json' };
  }
  if (!isObject(raw)) return { ok: false, error: 'invalid-data' };

  let version = whole(raw.version, 1, Number.MAX_SAFE_INTEGER);
  const original = version;
  if (version > SAVE_VERSION) return { ok: false, error: 'future-version' };
  let current: Json = raw;
  while (version < SAVE_VERSION) {
    const migrate = MIGRATIONS[version];
    if (!migrate) return { ok: false, error: 'invalid-data' };
    current = migrate(current);
    version += 1;
  }
  const state = sanitize(current);
  if (!state) return { ok: false, error: 'invalid-data' };
  const converted = isObject(current[CONVERTED]) ? (current[CONVERTED] as unknown as UpgradeConversion) : null;
  return { ok: true, state, migratedFrom: original === SAVE_VERSION ? null : original, converted };
}

/** Whole-seconds absence for offline earnings; a clock moved backwards yields zero. */
export function elapsedSince(savedAt: number, now: number): number {
  if (savedAt <= 0 || now <= savedAt) return 0;
  return (now - savedAt) / 1000;
}
