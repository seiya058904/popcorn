import { DECOR } from './decor.ts';
import { PRODUCERS } from './producers.ts';

export type UpgradeEffect =
  | { kind: 'clickPops'; pops: number }
  | { kind: 'clickRate'; add: number }
  | { kind: 'autoPops'; perSecond: number }
  | { kind: 'holdRate'; perSecond: number }
  | { kind: 'goldenChance'; add: number }
  | { kind: 'goldenMult'; mult: number }
  | { kind: 'autoCannon' }
  | { kind: 'autoHopper' }
  | { kind: 'unitMult'; unit: number; mult: number }
  | { kind: 'synergy'; from: number; to: number; perOwned: number }
  | { kind: 'globalMult'; mult: number }
  | { kind: 'cannonWindow'; addSeconds: number }
  | { kind: 'cannonCooldown'; mult: number }
  | { kind: 'cannonPayout'; mult: number }
  | { kind: 'cannonStreak'; perShot: number; max: number }
  | { kind: 'frenzyDuration'; add: number }
  | { kind: 'frenzyMult'; mult: number }
  | { kind: 'frenzyClick'; mult: number }
  | { kind: 'hopperInterval'; mult: number }
  | { kind: 'hopperSwarm'; chance: number; size: number }
  | { kind: 'offlineRate'; add: number }
  | { kind: 'offlineCap'; addHours: number };

/**
 * The four fixed rows of the upgrade page. Each is a ladder: the shop only ever shows its next
 * rung, which turns into the one after it once bought.
 */
export type UpgradeTrack = 'craft' | 'line' | 'play' | 'decor';

export interface TrackDef {
  readonly id: UpgradeTrack;
  readonly name: string;
  /** Shown in place of the ticket once every rung is bought. */
  readonly done: string;
}

export const TRACKS: readonly TrackDef[] = [
  { id: 'craft', name: '手艺', done: '手艺练满了。锅已经开始躲你。' },
  { id: 'line', name: '产线', done: '每条产线都镀了金。' },
  { id: 'play', name: '玩法', done: '大炮、跳跳粒和保温锅都升到顶了。' },
  { id: 'decor', name: '装修', done: '十件装修都摆上了。' },
];

export interface UpgradeDef {
  readonly id: string;
  readonly name: string;
  /** One line: what it gives first, then at most half a joke. */
  readonly blurb: string;
  readonly track: UpgradeTrack;
  readonly cost: number;
  /** Scene index that must be reached before this rung can be bought. */
  readonly unlockStage: number;
  /** Each of the three machines of this scene must be owned at least `count` times. */
  readonly needs?: { readonly stage: number; readonly count: number };
  /** A gold rung, counted by the "gold supplier" achievement. */
  readonly gold?: boolean;
  readonly effects: readonly UpgradeEffect[];
  /** Upgrade ids of save version 4 and earlier that this rung replaces, for converting old saves. */
  readonly from: readonly string[];
}

/** The three machines of a scene, by id. */
export const sceneUnits = (stage: number): number[] => PRODUCERS.filter((producer) => producer.unlockStage === stage).map((producer) => producer.id);

type Rung = Omit<UpgradeDef, 'track'>;

const craft: Rung[] = [
  { id: 'craft-1', name: '三连爆', blurb: '一次点击炸开 3 粒。手指没变快，是玉米变急了。', cost: 60, unlockStage: 0, from: ['pop3'], effects: [{ kind: 'clickPops', pops: 3 }] },
  { id: 'craft-2', name: '自动搅拌臂', blurb: '每秒替你爆 1 次。它不累，也不领工资。', cost: 800, unlockStage: 0, from: ['auto1'], effects: [{ kind: 'autoPops', perSecond: 1 }] },
  {
    id: 'craft-3',
    name: '热手金粒',
    blurb: '每次点击多得 2% 秒产，3% 几率炸出 ×10 的金色玉米。',
    cost: 4_500,
    unlockStage: 0,
    from: ['touch1', 'golden1'],
    effects: [
      { kind: 'clickRate', add: 0.02 },
      { kind: 'goldenChance', add: 0.03 },
    ],
  },
  {
    id: 'craft-4',
    name: '五福连爆',
    blurb: '一次炸开 5 粒，按住时每秒连爆 8 次。',
    cost: 24_000,
    unlockStage: 0,
    from: ['pop5', 'hold8'],
    effects: [
      { kind: 'clickPops', pops: 5 },
      { kind: 'holdRate', perSecond: 8 },
    ],
  },
  {
    id: 'craft-5',
    name: '十面开花',
    blurb: '一次炸开 10 粒，每次点击再多得 3% 秒产。',
    cost: 9.6e6,
    unlockStage: 0,
    from: ['pop10', 'touch2'],
    effects: [
      { kind: 'clickPops', pops: 10 },
      { kind: 'clickRate', add: 0.03 },
    ],
  },
  {
    id: 'craft-6',
    name: '双臂金玉',
    blurb: '每秒再替你爆 3 次，金色玉米几率再加 2%。',
    cost: 7.3e7,
    unlockStage: 0,
    from: ['auto2', 'golden2'],
    effects: [
      { kind: 'autoPops', perSecond: 3 },
      { kind: 'goldenChance', add: 0.02 },
    ],
  },
  { id: 'craft-7', name: '二十响', blurb: '一次点击炸开 20 粒。听起来像过年。', cost: 37e9, unlockStage: 0, from: ['pop20'], effects: [{ kind: 'clickPops', pops: 20 }] },
  {
    id: 'craft-8',
    name: '点玉八爪',
    blurb: '金色玉米 ×20，点击再多得 5% 秒产，每秒再自动爆 6 次。',
    cost: 3.6e12,
    unlockStage: 0,
    from: ['touch3', 'golden3', 'auto3'],
    effects: [
      { kind: 'goldenMult', mult: 20 },
      { kind: 'clickRate', add: 0.05 },
      { kind: 'autoPops', perSecond: 6 },
    ],
  },
];

const SYNERGY_PER_OWNED = 0.003;

/** The old one-to-one synergies, grouped by the scene in which both machines are on sale. */
const SYNERGIES: ReadonlyArray<readonly [id: string, from: number, to: number]> = [
  ['syn-pan-toaster', 0, 10],
  ['syn-pan-microwave', 0, 1],
  ['syn-toaster-microwave', 10, 1],
  ['syn-microwave-cart', 1, 2],
  ['syn-cart-mixer', 2, 11],
  ['syn-cart-cannon', 2, 3],
  ['syn-mixer-cannon', 11, 3],
  ['syn-cart-cinema', 2, 4],
  ['syn-cinema-organ', 4, 12],
  ['syn-cinema-truck', 4, 5],
  ['syn-organ-truck', 12, 5],
  ['syn-truck-factory', 5, 6],
  ['syn-factory-train', 6, 13],
  ['syn-factory-airship', 6, 7],
  ['syn-train-airship', 13, 7],
  ['syn-airship-volcano', 7, 8],
  ['syn-volcano-typhoon', 8, 14],
  ['syn-volcano-orbital', 8, 9],
  ['syn-typhoon-orbital', 14, 9],
];

const synergyStage = (from: number, to: number): number => Math.max(PRODUCERS[from]!.unlockStage, PRODUCERS[to]!.unlockStage);

/** A scene's chain: every machine feeds the next one along, each owned one adding a little. */
function chain(stage: number, name: string, joke: string, cost: number): UpgradeDef {
  const links = SYNERGIES.filter(([, from, to]) => synergyStage(from, to) === stage);
  return {
    id: `line-chain-${stage}`,
    name,
    blurb: `每台上游设备让下游 +${Number((SYNERGY_PER_OWNED * 100).toFixed(2))}%。${joke}`,
    track: 'line',
    cost,
    unlockStage: stage,
    from: links.map(([id]) => id),
    effects: links.map(([, from, to]) => ({ kind: 'synergy', from, to, perOwned: SYNERGY_PER_OWNED })),
  };
}

/** A scene's gold rung: its three machines double once each of them is owned in numbers. */
function gold(stage: number, unlockStage: number, count: number, name: string, joke: string, cost: number): UpgradeDef {
  const units = sceneUnits(stage);
  return {
    id: `line-gold-${stage}`,
    name,
    blurb: `${units.map((unit) => PRODUCERS[unit]!.name).join('、')}产量 ×2。${joke}`,
    track: 'line',
    cost,
    unlockStage,
    needs: { stage, count },
    gold: true,
    // The fourth tier of each machine was its gold one.
    from: units.map((unit) => `unit-${unit}-4`),
    effects: units.map((unit) => ({ kind: 'unitMult', unit, mult: 2 })),
  };
}

const line: UpgradeDef[] = [
  chain(0, '灶台联动', '锅、吐司机和微波炉排好了队。', 15_000),
  chain(1, '厨房联动', '推车顺路把奶油送进了碗里。', 1.5e6),
  gold(0, 1, 50, '金边灶台', '锅沿镀了金，盖子飞得更体面。', 2e7),
  chain(2, '影院联动', '片头一响，卡车就出发了。', 2e9),
  gold(1, 2, 50, '金色厨房', '搅出来的爆米花自带光泽。', 1e10),
  chain(3, '小城联动', '火车开到终点，飞艇接着送。', 8e11),
  gold(2, 3, 50, '金色首映', '红毯一直铺到了机器跟前。', 6e12),
  chain(4, '地球联动', '用地球的火，烤天上的月亮。', 1.5e14),
  gold(3, 4, 30, '金色车队', '收费站直接抬杆敬礼。', 4e14),
  gold(4, 4, 8, '金色风眼', '卫星照片拍出来像一枚奖章。', 1.2e15),
];

const play: Rung[] = [
  {
    id: 'play-1',
    name: '老师傅的耳朵',
    blurb: '大炮绿区放宽 0.08 秒，跳跳粒的狂热多 10 秒。',
    cost: 80_000,
    unlockStage: 1,
    from: ['cannon-window', 'hopper-time'],
    effects: [
      { kind: 'cannonWindow', addSeconds: 0.08 },
      { kind: 'frenzyDuration', add: 10 },
    ],
  },
  {
    id: 'play-2',
    name: '保温捕手',
    blurb: '跳跳粒出现后会被自动抓住，离线产量提高到 40%。',
    cost: 750_000,
    unlockStage: 1,
    from: ['auto-hopper', 'offline-rate'],
    effects: [{ kind: 'autoHopper' }, { kind: 'offlineRate', add: 0.15 }],
  },
  { id: 'play-3', name: '定时引信', blurb: '大炮冷却好后，没人管它也会自己开炮。', cost: 2.3e6, unlockStage: 1, from: ['auto-cannon'], effects: [{ kind: 'autoCannon' }] },
  {
    id: 'play-4',
    name: '水冷诱饵',
    blurb: '大炮冷却缩短 30%，跳跳粒来得更勤，离线上限多 4 小时。',
    cost: 1.2e8,
    unlockStage: 1,
    from: ['cannon-cool', 'hopper-bait', 'offline-cap'],
    effects: [
      { kind: 'cannonCooldown', mult: 0.7 },
      { kind: 'hopperInterval', mult: 0.72 },
      { kind: 'offlineCap', addHours: 4 },
    ],
  },
  {
    id: 'play-5',
    name: '连环双装',
    blurb: '大炮收益 ×1.5，连续绿区每次再 +10%（最多 +50%），狂热时点击 ×2。',
    cost: 9.5e8,
    unlockStage: 2,
    from: ['cannon-load', 'cannon-streak', 'frenzy-click'],
    effects: [
      { kind: 'cannonPayout', mult: 1.5 },
      { kind: 'cannonStreak', perShot: 0.1, max: 0.5 },
      { kind: 'frenzyClick', mult: 2 },
    ],
  },
  {
    id: 'play-6',
    name: '跳跳粒群',
    blurb: '跳跳粒有 20% 的几率一次来 3 粒，每抓一粒狂热都会延长。',
    cost: 5e9,
    unlockStage: 2,
    from: ['hopper-swarm'],
    effects: [{ kind: 'hopperSwarm', chance: 0.2, size: 3 }],
  },
  {
    id: 'play-7',
    name: '液氮金簧',
    blurb: '大炮冷却再缩短 30%，狂热倍率升到 ×7，离线产量升到 60%。',
    cost: 1.5e12,
    unlockStage: 3,
    from: ['cannon-cool2', 'hopper-gold', 'offline-rate2'],
    effects: [
      { kind: 'cannonCooldown', mult: 0.7 },
      { kind: 'frenzyMult', mult: 7 },
      { kind: 'offlineRate', add: 0.2 },
    ],
  },
  {
    id: 'play-8',
    name: '礼花三装',
    blurb: '大炮收益再 ×3。每一炮都附赠一场烟花，鸽子开始买保险。',
    cost: 3e14,
    unlockStage: 4,
    from: ['cannon-load2', 'cannon-fireworks'],
    effects: [{ kind: 'cannonPayout', mult: 3 }],
  },
];

const decor: UpgradeDef[] = DECOR.map(
  (item): UpgradeDef => ({
    id: item.id,
    name: item.name,
    blurb: `全部产量 ×${item.mult}。${item.joke}`,
    track: 'decor',
    cost: item.cost,
    unlockStage: item.stage,
    from: [item.id],
    effects: [{ kind: 'globalMult', mult: item.mult }],
  }),
);

const tagged = (track: UpgradeTrack, list: readonly Rung[]): UpgradeDef[] => list.map((upgrade) => ({ ...upgrade, track }));

/** Every rung of every row, each row in its ladder order. */
export const UPGRADES: readonly UpgradeDef[] = [...tagged('craft', craft), ...line, ...tagged('play', play), ...decor];

export const UPGRADE_BY_ID: ReadonlyMap<string, UpgradeDef> = new Map(UPGRADES.map((upgrade) => [upgrade.id, upgrade]));

/** Each row's rungs, in order. */
export const TRACK_RUNGS: ReadonlyMap<UpgradeTrack, readonly UpgradeDef[]> = new Map(TRACKS.map((track) => [track.id, UPGRADES.filter((upgrade) => upgrade.track === track.id)]));

/**
 * What became of the upgrades of save version 4 and earlier: each old id names the rung that took
 * it in, or null where the old upgrade is now part of a machine's milestones (the four tiers of
 * every machine but the gold one).
 */
export function legacyRung(oldId: string): UpgradeDef | null {
  for (const upgrade of UPGRADES) if (upgrade.from.includes(oldId)) return upgrade;
  return null;
}
