import { ACHIEVEMENTS } from '../content/achievements.ts';
import { FLAVORS } from '../content/flavors.ts';
import { PRODUCERS } from '../content/producers.ts';
import { POT_SKINS } from '../content/skills.ts';
import { STAGES } from '../content/stages.ts';
import { UPGRADE_BY_ID } from '../content/upgrades.ts';
import { createLegacy, createState, createStats, SAVE_VERSION, type GameState } from './state.ts';

const FORMAT = 'pop-popcorn-save';

export type LoadResult = { ok: true; state: GameState; migratedFrom: number | null } | { ok: false; error: LoadError };
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
};

const finite = (value: unknown, fallback: number, min = 0, max = Number.MAX_VALUE): number =>
  typeof value === 'number' && Number.isFinite(value) ? Math.min(max, Math.max(min, value)) : fallback;

const whole = (value: unknown, fallback: number, max: number): number => Math.floor(finite(value, fallback, 0, max));

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
  return { ok: true, state, migratedFrom: original === SAVE_VERSION ? null : original };
}

/** Whole-seconds absence for offline earnings; a clock moved backwards yields zero. */
export function elapsedSince(savedAt: number, now: number): number {
  if (savedAt <= 0 || now <= savedAt) return 0;
  return (now - savedAt) / 1000;
}
