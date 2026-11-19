import { PRODUCERS } from './producers.ts';

export type UpgradeEffect =
  | { kind: 'clickPops'; pops: number }
  | { kind: 'clickRate'; add: number }
  | { kind: 'autoPops'; perSecond: number }
  | { kind: 'autoCannon' }
  | { kind: 'autoHopper' }
  | { kind: 'unitMult'; unit: number; mult: number }
  | { kind: 'synergy'; from: number; to: number; perOwned: number }
  | { kind: 'cannonWindow'; addSeconds: number }
  | { kind: 'cannonCooldown'; mult: number }
  | { kind: 'cannonPayout'; mult: number }
  | { kind: 'frenzyDuration'; add: number }
  | { kind: 'frenzyMult'; mult: number }
  | { kind: 'hopperInterval'; mult: number }
  | { kind: 'offlineRate'; add: number }
  | { kind: 'offlineCap'; addHours: number };

export type UpgradeGroup = 'click' | 'unit' | 'synergy' | 'cannon' | 'hopper' | 'offline';

export interface UpgradeDef {
  readonly id: string;
  readonly name: string;
  readonly blurb: string;
  readonly group: UpgradeGroup;
  readonly cost: number;
  /** Offered only once the run has earned this much in total. */
  readonly showAt: number;
  readonly requires?: string;
  readonly unlockStage?: number;
  /** Offered only once this many of a unit are owned. */
  readonly ownedAtLeast?: { readonly unit: number; readonly count: number };
  readonly effect: UpgradeEffect;
}

/** Upgrades appear a little before they are affordable, so there is always something to aim for. */
const SHOW_SHARE = 0.25;

const UNIT_TIERS = [
  { costFactor: 25, mult: 1.75, owned: 10 },
  { costFactor: 1_000, mult: 2, owned: 30 },
  { costFactor: 50_000, mult: 2, owned: 60 },
] as const;

const UNIT_COPY: ReadonlyArray<readonly [readonly [string, string], readonly [string, string], readonly [string, string]]> = [
  [['铸铁锅底', '受热均匀，脾气也均匀。'], ['防飞锅盖', '盖子还是会飞，但飞得有计划。'], ['祖传老锅', '奶奶说这口锅炸过三代人。']],
  [['高火档', '别问是几档，旋钮已经断了。'], ['双层转盘', '两层一起转，叮声也加倍。'], ['不叮模式', '它终于学会不停下来。']],
  [['加大玻璃柜', '玻璃擦得很亮，看得更馋。'], ['电动小马达', '现在它能自己逃跑了。'], ['连锁加盟', '每个路口都有一辆。']],
  [['加厚炉膛', '响声也厚了一层。'], ['连发炮管', '鸽子来不及搬家了。'], ['礼炮编制', '每次开炮都像过节。']],
  [['双层传送带', '两条带子，一样停不下来。'], ['巨幕爆米花桶', '桶比银幕还大。'], ['通宵场', '散场这件事被取消了。']],
  [['加长车厢', '转弯时请绕开整条街。'], ['夜间配送', '月亮下的爆米花更好卖。'], ['车队编组', '堵车也算在岗。']],
  [['三班倒', '工人们闻起来很开心。'], ['糖浆管道', '全城水管都有点甜。'], ['无人车间', '只剩一个保安，他也在吃。']],
  [['加大气囊', '它开始挡住太阳了。'], ['高空撒播', '天气预报已改口。'], ['同温层航线', '连飞机都要让路。']],
  [['地幔直供', '地球表示有点烫。'], ['岩浆回收', '一滴都不浪费。'], ['全球火山网', '地质学家第二次辞职了。']],
  [['镜面抛光', '月亮眯了一下眼。'], ['环月阵列', '月亮开始冒汗。'], ['焦点校准', '它听见了一声很轻的“啪”。']],
];

const unitUpgrades: UpgradeDef[] = PRODUCERS.flatMap((producer) =>
  UNIT_TIERS.map((tier, index): UpgradeDef => {
    const [name, joke] = UNIT_COPY[producer.id]![index]!;
    const cost = producer.baseCost * tier.costFactor;
    return {
      id: `unit-${producer.id}-${index + 1}`,
      name,
      blurb: `${producer.name}产量 ×${tier.mult}。${joke}`,
      group: 'unit',
      cost,
      showAt: cost * SHOW_SHARE,
      unlockStage: producer.unlockStage,
      ownedAtLeast: { unit: producer.id, count: tier.owned },
      ...(index > 0 ? { requires: `unit-${producer.id}-${index}` } : {}),
      effect: { kind: 'unitMult', unit: producer.id, mult: tier.mult },
    };
  }),
);

const SYNERGY_COST_FACTOR = 60;
const SYNERGY_PER_OWNED = 0.003;
const SYNERGY_NEEDS = 15;

const SYNERGY_COPY: ReadonlyArray<readonly [id: string, from: number, to: number, name: string, joke: string]> = [
  ['syn-pan-microwave', 0, 1, '小锅预热', '热锅先上，转盘不用等。'],
  ['syn-microwave-cart', 1, 2, '叮声招客', '听见一声叮，路人自动排队。'],
  ['syn-cart-cannon', 2, 3, '推车运煤', '顺路的事，炮也吃得饱。'],
  ['syn-cart-cinema', 2, 4, '影院专线', '推车和影院之间铺一条传送带。'],
  ['syn-cinema-truck', 4, 5, '影院外卖', '电影没散场，卡车先出发。'],
  ['syn-truck-factory', 5, 6, '原料直达', '卡车倒进车间，就没再出来。'],
  ['syn-factory-airship', 6, 7, '焦糖涂层', '气囊刷了糖，飞得黏黏的。'],
  ['syn-airship-volcano', 7, 8, '空投火种', '从天上点火，省事多了。'],
  ['syn-volcano-orbital', 8, 9, '地热供电', '用地球的火，烤天上的月亮。'],
];

const synergyUpgrades: UpgradeDef[] = SYNERGY_COPY.map(([id, from, to, name, joke]): UpgradeDef => {
  const target = PRODUCERS[to]!;
  const cost = target.baseCost * SYNERGY_COST_FACTOR;
  return {
    id,
    name,
    blurb: `每台${PRODUCERS[from]!.name}让${target.name} +${Number((SYNERGY_PER_OWNED * 100).toFixed(2))}%。${joke}`,
    group: 'synergy',
    cost,
    showAt: cost * SHOW_SHARE,
    unlockStage: target.unlockStage,
    ownedAtLeast: { unit: from, count: SYNERGY_NEEDS },
    effect: { kind: 'synergy', from, to, perOwned: SYNERGY_PER_OWNED },
  };
});

const skill = (def: Omit<UpgradeDef, 'showAt'>): UpgradeDef => ({ ...def, showAt: def.cost * SHOW_SHARE });

const skillUpgrades: UpgradeDef[] = [
  skill({ id: 'pop3', name: '三连爆', blurb: '一次点击炸开 3 粒。手指没变快，是玉米变急了。', group: 'click', cost: 60, effect: { kind: 'clickPops', pops: 3 } }),
  skill({ id: 'pop5', name: '五福临锅', blurb: '一次点击炸开 5 粒。', group: 'click', cost: 4_000, requires: 'pop3', effect: { kind: 'clickPops', pops: 5 } }),
  skill({ id: 'pop10', name: '十面开花', blurb: '一次点击炸开 10 粒。锅已经开始躲你。', group: 'click', cost: 6e6, requires: 'pop5', effect: { kind: 'clickPops', pops: 10 } }),
  skill({ id: 'pop20', name: '二十响', blurb: '一次点击炸开 20 粒。听起来像过年。', group: 'click', cost: 37e9, requires: 'pop10', effect: { kind: 'clickPops', pops: 20 } }),
  skill({ id: 'touch1', name: '热手', blurb: '每次点击额外获得每秒产量的 2%。', group: 'click', cost: 1_500, effect: { kind: 'clickRate', add: 0.02 } }),
  skill({ id: 'touch2', name: '烫手', blurb: '每次点击再额外获得每秒产量的 3%。', group: 'click', cost: 3.6e6, requires: 'touch1', effect: { kind: 'clickRate', add: 0.03 } }),
  skill({ id: 'touch3', name: '铁砂掌', blurb: '每次点击再额外获得每秒产量的 5%。', group: 'click', cost: 630e9, requires: 'touch2', effect: { kind: 'clickRate', add: 0.05 } }),
  skill({ id: 'auto1', name: '自动搅拌臂', blurb: '每秒替你爆 1 次。它不累，也不领工资。', group: 'click', cost: 800, effect: { kind: 'autoPops', perSecond: 1 } }),
  skill({ id: 'auto2', name: '双臂搅拌机', blurb: '每秒再替你爆 2 次。', group: 'click', cost: 13e6, requires: 'auto1', effect: { kind: 'autoPops', perSecond: 2 } }),
  skill({ id: 'auto3', name: '八爪搅拌机', blurb: '每秒再替你爆 4 次。你可以去喝口水了。', group: 'click', cost: 2.2e12, requires: 'auto2', effect: { kind: 'autoPops', perSecond: 4 } }),

  skill({ id: 'cannon-window', name: '老师傅的耳朵', blurb: '大炮绿区放宽 0.08 秒。', group: 'cannon', cost: 50_000, unlockStage: 1, effect: { kind: 'cannonWindow', addSeconds: 0.08 } }),
  skill({ id: 'cannon-cool', name: '水冷炮管', blurb: '大炮冷却缩短 30%。', group: 'cannon', cost: 26e6, unlockStage: 1, effect: { kind: 'cannonCooldown', mult: 0.7 } }),
  skill({ id: 'cannon-load', name: '双倍装药', blurb: '大炮收益 ×1.5。鸽子已经习惯了。', group: 'cannon', cost: 450e6, unlockStage: 2, effect: { kind: 'cannonPayout', mult: 1.5 } }),
  skill({ id: 'cannon-cool2', name: '液氮炮管', blurb: '大炮冷却再缩短 30%。', group: 'cannon', cost: 1.1e12, requires: 'cannon-cool', unlockStage: 3, effect: { kind: 'cannonCooldown', mult: 0.7 } }),
  skill({ id: 'cannon-load2', name: '三倍装药', blurb: '大炮收益再 ×2。鸽子开始买保险。', group: 'cannon', cost: 80e12, requires: 'cannon-load', unlockStage: 3, effect: { kind: 'cannonPayout', mult: 2 } }),

  skill({ id: 'auto-cannon', name: '定时引信', blurb: '大炮冷却好后，没人管它也会自己开炮。', group: 'cannon', cost: 2.3e6, unlockStage: 1, effect: { kind: 'autoCannon' } }),

  skill({ id: 'auto-hopper', name: '玉米捕手', blurb: '跳跳粒出现后会被自动抓住。', group: 'hopper', cost: 650_000, effect: { kind: 'autoHopper' } }),
  skill({ id: 'hopper-time', name: '弹簧鞋', blurb: '跳跳粒的狂热多持续 10 秒。', group: 'hopper', cost: 30_000, effect: { kind: 'frenzyDuration', add: 10 } }),
  skill({ id: 'hopper-bait', name: '玉米诱饵', blurb: '跳跳粒出现得更频繁。', group: 'hopper', cost: 26e6, effect: { kind: 'hopperInterval', mult: 0.72 } }),
  skill({ id: 'hopper-gold', name: '金色弹簧', blurb: '狂热的产量倍率从 ×5 提高到 ×7。', group: 'hopper', cost: 2.2e12, requires: 'hopper-bait', effect: { kind: 'frenzyMult', mult: 7 } }),

  skill({ id: 'offline-rate', name: '保温锅', blurb: '离线产量提高到 40%。', group: 'offline', cost: 100_000, effect: { kind: 'offlineRate', add: 0.15 } }),
  skill({ id: 'offline-cap', name: '夜班保安', blurb: '离线收益上限增加 4 小时。', group: 'offline', cost: 68e6, effect: { kind: 'offlineCap', addHours: 4 } }),
  skill({ id: 'offline-rate2', name: '恒温仓库', blurb: '离线产量再提高到 60%。', group: 'offline', cost: 1.1e12, requires: 'offline-rate', effect: { kind: 'offlineRate', add: 0.2 } }),
];

export const UPGRADES: readonly UpgradeDef[] = [...skillUpgrades, ...unitUpgrades, ...synergyUpgrades];

export const UPGRADE_BY_ID: ReadonlyMap<string, UpgradeDef> = new Map(UPGRADES.map((upgrade) => [upgrade.id, upgrade]));
