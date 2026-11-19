import { DECOR } from './decor.ts';
import { PRODUCERS, PRODUCERS_IN_ORDER } from './producers.ts';

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

export type UpgradeGroup = 'click' | 'unit' | 'synergy' | 'cannon' | 'hopper' | 'offline' | 'decor';

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
  /** The fourth, gold tier of a machine, which matches its look at 100 owned. */
  readonly gold?: boolean;
  readonly effect: UpgradeEffect;
}

/** Upgrades appear a little before they are affordable, so there is always something to aim for. */
const SHOW_SHARE = 0.25;

const UNIT_TIERS = [
  { costFactor: 25, mult: 1.75, owned: 10 },
  { costFactor: 1_000, mult: 2, owned: 30 },
  { costFactor: 50_000, mult: 2, owned: 60 },
  // About twice the price of the hundredth machine.
  { costFactor: 6e7, mult: 2, owned: 100 },
] as const;

type Copy = readonly [name: string, joke: string];

/** Four tiers of copy per machine, indexed by machine id. */
const UNIT_COPY: Readonly<Record<number, readonly [Copy, Copy, Copy, Copy]>> = {
  0: [['铸铁锅底', '受热均匀，脾气也均匀。'], ['防飞锅盖', '盖子还是会飞，但飞得有计划。'], ['祖传老锅', '奶奶说这口锅炸过三代人。'], ['金边奶锅', '锅沿镀了金，盖子飞得更体面。']],
  1: [['高火档', '别问是几档，旋钮已经断了。'], ['双层转盘', '两层一起转，叮声也加倍。'], ['不叮模式', '它终于学会不停下来。'], ['金色转盘', '转盘一转，像在开奖。']],
  2: [['加大玻璃柜', '玻璃擦得很亮，看得更馋。'], ['电动小马达', '现在它能自己逃跑了。'], ['连锁加盟', '每个路口都有一辆。'], ['镀金车轮', '轮子陷在爆米花里，也闪闪发光。']],
  3: [['加厚炉膛', '响声也厚了一层。'], ['连发炮管', '鸽子来不及搬家了。'], ['礼炮编制', '每次开炮都像过节。'], ['金色炮口', '鸽子们开始收藏弹壳。']],
  4: [['双层传送带', '两条带子，一样停不下来。'], ['巨幕爆米花桶', '桶比银幕还大。'], ['通宵场', '散场这件事被取消了。'], ['金色首映', '红毯一直铺到了机器跟前。']],
  5: [['加长车厢', '转弯时请绕开整条街。'], ['夜间配送', '月亮下的爆米花更好卖。'], ['车队编组', '堵车也算在岗。'], ['金色车队', '收费站直接抬杆敬礼。']],
  6: [['三班倒', '工人们闻起来很开心。'], ['糖浆管道', '全城水管都有点甜。'], ['无人车间', '只剩一个保安，他也在吃。'], ['金字招牌', '老板把招牌也熬成了焦糖。']],
  7: [['加大气囊', '它开始挡住太阳了。'], ['高空撒播', '天气预报已改口。'], ['同温层航线', '连飞机都要让路。'], ['金色气囊', '太阳以为自己有了对手。']],
  8: [['地幔直供', '地球表示有点烫。'], ['岩浆回收', '一滴都不浪费。'], ['全球火山网', '地质学家第二次辞职了。'], ['金色熔岩', '岩浆流过的地方都在发光。']],
  9: [['镜面抛光', '月亮眯了一下眼。'], ['环月阵列', '月亮开始冒汗。'], ['焦点校准', '它听见了一声很轻的“啪”。'], ['金色镜面', '月亮开始戴墨镜了。']],
  10: [['弹簧加劲', '弹得更高，天花板上有了凹痕。'], ['四片槽', '一次弹四块，根本接不过来。'], ['自动连弹', '它不等你按，自己就弹了。'], ['金色压杆', '一按下去，满屋都是金黄色。']],
  11: [['加大搅拌碗', '碗大了，奶油味也大了。'], ['行星搅拌头', '转起来像一颗小行星。'], ['十段变速', '第十段还没人敢开。'], ['金色搅拌头', '搅出来的爆米花自带光泽。']],
  12: [['加装音管', '多一根管，多一个音，多一股爆米花。'], ['双层键盘', '左手低音，右手黄油。'], ['全城共鸣', '整条街都跟着打拍子。'], ['金色音管', '每个音符都闪着光。']],
  13: [['加挂车厢', '站台已经不够长了。'], ['蒸汽加压', '汽笛一响，爆米花先到站。'], ['环城快线', '每站都停，每站都撒。'], ['金色车头', '它现在是一辆观光列车。']],
  14: [['加深风眼', '风眼里很安静，只有爆米花。'], ['季风航线', '它每年都准时回来。'], ['超级台风', '气象图上只剩下一个圈。'], ['金色风眼', '卫星照片拍出来像一枚奖章。']],
};

const unitUpgrades: UpgradeDef[] = PRODUCERS_IN_ORDER.flatMap((producer) =>
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
      ...(index === 3 ? { gold: true } : {}),
      effect: { kind: 'unitMult', unit: producer.id, mult: tier.mult },
    };
  }),
);

const SYNERGY_COST_FACTOR = 60;
const SYNERGY_PER_OWNED = 0.003;
const SYNERGY_NEEDS = 15;

/** Each machine feeds the next one along the chain. */
const SYNERGY_COPY: ReadonlyArray<readonly [id: string, from: number, to: number, name: string, joke: string]> = [
  ['syn-pan-toaster', 0, 10, '锅边烤架', '锅里的热气顺便烤了吐司机。'],
  ['syn-pan-microwave', 0, 1, '小锅预热', '热锅先上，转盘不用等。'],
  ['syn-toaster-microwave', 10, 1, '叮当二重奏', '一个弹，一个叮，节奏刚好。'],
  ['syn-microwave-cart', 1, 2, '叮声招客', '听见一声叮，路人自动排队。'],
  ['syn-cart-mixer', 2, 11, '推车送奶油', '推车顺路把奶油送进了碗里。'],
  ['syn-cart-cannon', 2, 3, '推车运煤', '顺路的事，炮也吃得饱。'],
  ['syn-mixer-cannon', 11, 3, '搅匀装填', '搅匀的爆米花，打得更远。'],
  ['syn-cart-cinema', 2, 4, '影院专线', '推车和影院之间铺一条传送带。'],
  ['syn-cinema-organ', 4, 12, '开场曲', '片头一响，管风琴就停不下来。'],
  ['syn-cinema-truck', 4, 5, '影院外卖', '电影没散场，卡车先出发。'],
  ['syn-organ-truck', 12, 5, '倒车音乐', '卡车倒车时放的是管风琴。'],
  ['syn-truck-factory', 5, 6, '原料直达', '卡车倒进车间，就没再出来。'],
  ['syn-factory-train', 6, 13, '焦糖专列', '每节车厢都刷了一层糖。'],
  ['syn-factory-airship', 6, 7, '焦糖涂层', '气囊刷了糖，飞得黏黏的。'],
  ['syn-train-airship', 13, 7, '空铁联运', '火车开到终点，飞艇接着送。'],
  ['syn-airship-volcano', 7, 8, '空投火种', '从天上点火，省事多了。'],
  ['syn-volcano-typhoon', 8, 14, '热带气旋', '火山烤热海面，台风越转越快。'],
  ['syn-volcano-orbital', 8, 9, '地热供电', '用地球的火，烤天上的月亮。'],
  ['syn-typhoon-orbital', 14, 9, '风力发电', '台风转出来的电，拿去烤月亮。'],
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
    unlockStage: Math.max(target.unlockStage, PRODUCERS[from]!.unlockStage),
    ownedAtLeast: { unit: from, count: SYNERGY_NEEDS },
    effect: { kind: 'synergy', from, to, perOwned: SYNERGY_PER_OWNED },
  };
});

const decorUpgrades: UpgradeDef[] = DECOR.map(
  (decor): UpgradeDef => ({
    id: decor.id,
    name: decor.name,
    blurb: `全部产量 ×${decor.mult}。${decor.joke}`,
    group: 'decor',
    cost: decor.cost,
    showAt: decor.cost * SHOW_SHARE,
    unlockStage: decor.stage,
    effect: { kind: 'globalMult', mult: decor.mult },
  }),
);

const skill = (def: Omit<UpgradeDef, 'showAt'>): UpgradeDef => ({ ...def, showAt: def.cost * SHOW_SHARE });

const skillUpgrades: UpgradeDef[] = [
  skill({ id: 'pop3', name: '三连爆', blurb: '一次点击炸开 3 粒。手指没变快，是玉米变急了。', group: 'click', cost: 60, effect: { kind: 'clickPops', pops: 3 } }),
  skill({ id: 'pop5', name: '五福临锅', blurb: '一次点击炸开 5 粒。', group: 'click', cost: 4_000, requires: 'pop3', effect: { kind: 'clickPops', pops: 5 } }),
  skill({ id: 'pop10', name: '十面开花', blurb: '一次点击炸开 10 粒。锅已经开始躲你。', group: 'click', cost: 6e6, requires: 'pop5', effect: { kind: 'clickPops', pops: 10 } }),
  skill({ id: 'pop20', name: '二十响', blurb: '一次点击炸开 20 粒。听起来像过年。', group: 'click', cost: 37e9, requires: 'pop10', effect: { kind: 'clickPops', pops: 20 } }),
  skill({ id: 'touch1', name: '热手', blurb: '每次点击额外获得每秒产量的 2%。', group: 'click', cost: 1_500, effect: { kind: 'clickRate', add: 0.02 } }),
  skill({ id: 'touch2', name: '烫手', blurb: '每次点击再额外获得每秒产量的 3%。', group: 'click', cost: 3.6e6, requires: 'touch1', effect: { kind: 'clickRate', add: 0.03 } }),
  skill({ id: 'touch3', name: '铁砂掌', blurb: '每次点击再额外获得每秒产量的 5%。', group: 'click', cost: 630e9, requires: 'touch2', effect: { kind: 'clickRate', add: 0.05 } }),
  skill({ id: 'golden1', name: '金色玉米', blurb: '每次点击有 3% 的几率炸出金色玉米，这一下收益 ×10。', group: 'click', cost: 3_000, effect: { kind: 'goldenChance', add: 0.03 } }),
  skill({ id: 'golden2', name: '金玉满锅', blurb: '金色玉米的几率再提高 2%。锅底开始反光了。', group: 'click', cost: 6e7, requires: 'golden1', effect: { kind: 'goldenChance', add: 0.02 } }),
  skill({ id: 'golden3', name: '点玉成金', blurb: '金色玉米的收益从 ×10 提高到 ×20。', group: 'click', cost: 8e11, requires: 'golden2', effect: { kind: 'goldenMult', mult: 20 } }),
  skill({ id: 'hold8', name: '连爆手套', blurb: '按住不放时，每秒连爆从 6 次提高到 8 次。', group: 'click', cost: 20_000, effect: { kind: 'holdRate', perSecond: 8 } }),
  skill({ id: 'auto1', name: '自动搅拌臂', blurb: '每秒替你爆 1 次。它不累，也不领工资。', group: 'click', cost: 800, effect: { kind: 'autoPops', perSecond: 1 } }),
  skill({ id: 'auto2', name: '双臂搅拌机', blurb: '每秒再替你爆 3 次。', group: 'click', cost: 13e6, requires: 'auto1', effect: { kind: 'autoPops', perSecond: 3 } }),
  skill({ id: 'auto3', name: '八爪搅拌机', blurb: '每秒再替你爆 6 次。你可以去喝口水了。', group: 'click', cost: 2.2e12, requires: 'auto2', effect: { kind: 'autoPops', perSecond: 6 } }),

  skill({ id: 'cannon-window', name: '老师傅的耳朵', blurb: '大炮绿区放宽 0.08 秒。', group: 'cannon', cost: 50_000, unlockStage: 1, effect: { kind: 'cannonWindow', addSeconds: 0.08 } }),
  skill({ id: 'cannon-cool', name: '水冷炮管', blurb: '大炮冷却缩短 30%。', group: 'cannon', cost: 26e6, unlockStage: 1, effect: { kind: 'cannonCooldown', mult: 0.7 } }),
  skill({ id: 'cannon-load', name: '双倍装药', blurb: '大炮收益 ×1.5。鸽子已经习惯了。', group: 'cannon', cost: 450e6, unlockStage: 2, effect: { kind: 'cannonPayout', mult: 1.5 } }),
  skill({ id: 'cannon-streak', name: '连环炮', blurb: '连续在绿区开炮，每次收益 +10%，最多 +50%。压力表上会亮起星星。', group: 'cannon', cost: 2e8, unlockStage: 2, effect: { kind: 'cannonStreak', perShot: 0.1, max: 0.5 } }),
  skill({ id: 'cannon-cool2', name: '液氮炮管', blurb: '大炮冷却再缩短 30%。', group: 'cannon', cost: 1.1e12, requires: 'cannon-cool', unlockStage: 3, effect: { kind: 'cannonCooldown', mult: 0.7 } }),
  skill({ id: 'cannon-load2', name: '三倍装药', blurb: '大炮收益再 ×2。鸽子开始买保险。', group: 'cannon', cost: 80e12, requires: 'cannon-load', unlockStage: 3, effect: { kind: 'cannonPayout', mult: 2 } }),
  skill({ id: 'cannon-fireworks', name: '礼花弹', blurb: '大炮收益再 ×1.5。每一炮都附赠一场烟花。', group: 'cannon', cost: 1.5e15, requires: 'cannon-load2', unlockStage: 4, effect: { kind: 'cannonPayout', mult: 1.5 } }),

  skill({ id: 'auto-cannon', name: '定时引信', blurb: '大炮冷却好后，没人管它也会自己开炮。', group: 'cannon', cost: 2.3e6, unlockStage: 1, effect: { kind: 'autoCannon' } }),

  skill({ id: 'auto-hopper', name: '玉米捕手', blurb: '跳跳粒出现后会被自动抓住。', group: 'hopper', cost: 650_000, effect: { kind: 'autoHopper' } }),
  skill({ id: 'hopper-time', name: '弹簧鞋', blurb: '跳跳粒的狂热多持续 10 秒。', group: 'hopper', cost: 30_000, effect: { kind: 'frenzyDuration', add: 10 } }),
  skill({ id: 'hopper-bait', name: '玉米诱饵', blurb: '跳跳粒出现得更频繁。', group: 'hopper', cost: 26e6, effect: { kind: 'hopperInterval', mult: 0.72 } }),
  skill({ id: 'frenzy-click', name: '狂热手速', blurb: '狂热期间，点击收益再 ×2。', group: 'hopper', cost: 3e8, unlockStage: 2, effect: { kind: 'frenzyClick', mult: 2 } }),
  skill({ id: 'hopper-swarm', name: '跳跳粒群', blurb: '跳跳粒有 20% 的几率成群出现，一次来 3 粒；每抓一粒，狂热都会延长。', group: 'hopper', cost: 5e9, unlockStage: 2, effect: { kind: 'hopperSwarm', chance: 0.2, size: 3 } }),
  skill({ id: 'hopper-gold', name: '金色弹簧', blurb: '狂热的产量倍率从 ×5 提高到 ×7。', group: 'hopper', cost: 2.2e12, requires: 'hopper-bait', effect: { kind: 'frenzyMult', mult: 7 } }),

  skill({ id: 'offline-rate', name: '保温锅', blurb: '离线产量提高到 40%。', group: 'offline', cost: 100_000, effect: { kind: 'offlineRate', add: 0.15 } }),
  skill({ id: 'offline-cap', name: '夜班保安', blurb: '离线收益上限增加 4 小时。', group: 'offline', cost: 68e6, effect: { kind: 'offlineCap', addHours: 4 } }),
  skill({ id: 'offline-rate2', name: '恒温仓库', blurb: '离线产量再提高到 60%。', group: 'offline', cost: 1.1e12, requires: 'offline-rate', effect: { kind: 'offlineRate', add: 0.2 } }),
];

export const UPGRADES: readonly UpgradeDef[] = [...skillUpgrades, ...unitUpgrades, ...synergyUpgrades, ...decorUpgrades];

export const UPGRADE_BY_ID: ReadonlyMap<string, UpgradeDef> = new Map(UPGRADES.map((upgrade) => [upgrade.id, upgrade]));
