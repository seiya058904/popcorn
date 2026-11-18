export type UpgradeEffect =
  | { kind: 'clickPops'; pops: number }
  | { kind: 'clickRate'; add: number }
  | { kind: 'unitMult'; unit: number; mult: number }
  | { kind: 'synergy'; from: number; to: number; perOwned: number }
  | { kind: 'cannonWindow'; addSeconds: number }
  | { kind: 'cannonCooldown'; mult: number }
  | { kind: 'cannonPayout'; mult: number }
  | { kind: 'frenzyDuration'; add: number }
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
  readonly effect: UpgradeEffect;
}

export const UPGRADES: readonly UpgradeDef[] = [
  { id: 'pop3', name: '三连爆', blurb: '一次点击炸开 3 粒。手指没变快，是玉米变急了。', group: 'click', cost: 250, showAt: 80, effect: { kind: 'clickPops', pops: 3 } },
  { id: 'pop5', name: '五福临锅', blurb: '一次点击炸开 5 粒。', group: 'click', cost: 12_000, showAt: 3_000, requires: 'pop3', effect: { kind: 'clickPops', pops: 5 } },
  { id: 'pop10', name: '十面开花', blurb: '一次点击炸开 10 粒。锅已经开始躲你。', group: 'click', cost: 1_500_000, showAt: 300_000, requires: 'pop5', effect: { kind: 'clickPops', pops: 10 } },
  { id: 'touch1', name: '热手', blurb: '每粒额外获得每秒产量的 1%。', group: 'click', cost: 4_000, showAt: 1_000, effect: { kind: 'clickRate', add: 0.01 } },
  { id: 'touch2', name: '烫手', blurb: '每粒再额外获得每秒产量的 2%。', group: 'click', cost: 8_000_000, showAt: 1_500_000, requires: 'touch1', effect: { kind: 'clickRate', add: 0.02 } },

  { id: 'pan2', name: '铸铁锅底', blurb: '小奶锅产量 ×1.5。', group: 'unit', cost: 7_000, showAt: 900, effect: { kind: 'unitMult', unit: 0, mult: 1.5 } },
  { id: 'cart2', name: '加大玻璃柜', blurb: '推车产量 ×1.5。', group: 'unit', cost: 67_000, showAt: 9_000, effect: { kind: 'unitMult', unit: 1, mult: 1.5 } },
  { id: 'cannon2', name: '加厚炉膛', blurb: '老式爆米花炮产量 ×1.5。', group: 'unit', cost: 1_000_000, showAt: 120_000, unlockStage: 1, effect: { kind: 'unitMult', unit: 2, mult: 1.5 } },
  { id: 'cinema2', name: '双层传送带', blurb: '影院爆米花机产量 ×1.5。', group: 'unit', cost: 20_000_000, showAt: 2_400_000, unlockStage: 2, effect: { kind: 'unitMult', unit: 3, mult: 1.5 } },
  { id: 'factory2', name: '三班倒', blurb: '焦糖工厂产量 ×1.5。工人们闻起来很开心。', group: 'unit', cost: 800_000_000, showAt: 90_000_000, unlockStage: 3, effect: { kind: 'unitMult', unit: 4, mult: 1.5 } },
  { id: 'volcano2', name: '地幔直供', blurb: '火山炉产量 ×1.5。', group: 'unit', cost: 6_000_000_000, showAt: 2_400_000_000, unlockStage: 4, effect: { kind: 'unitMult', unit: 5, mult: 1.5 } },

  { id: 'syn-pan-cart', name: '小锅供货', blurb: '每口小奶锅让推车产量 +0.25%。', group: 'synergy', cost: 165_000, showAt: 8_000, effect: { kind: 'synergy', from: 0, to: 1, perOwned: 0.0025 } },
  { id: 'syn-cart-cinema', name: '影院专线', blurb: '推车和影院之间铺一条传送带。每辆推车让影院机 +0.25%。', group: 'synergy', cost: 33_000_000, showAt: 2_000_000, unlockStage: 2, effect: { kind: 'synergy', from: 1, to: 3, perOwned: 0.0025 } },
  { id: 'syn-cinema-factory', name: '焦糖回流', blurb: '每台影院机让焦糖工厂 +0.25%。', group: 'synergy', cost: 2_200_000_000, showAt: 150_000_000, unlockStage: 3, effect: { kind: 'synergy', from: 3, to: 4, perOwned: 0.0025 } },
  { id: 'syn-factory-volcano', name: '岩浆拉丝', blurb: '每座焦糖工厂让火山炉 +0.25%。', group: 'synergy', cost: 8_000_000_000, showAt: 2_500_000_000, unlockStage: 4, effect: { kind: 'synergy', from: 4, to: 5, perOwned: 0.0025 } },

  { id: 'cannon-window', name: '老师傅的耳朵', blurb: '大炮绿区放宽 0.08 秒。', group: 'cannon', cost: 25_000, showAt: 6_000, unlockStage: 1, effect: { kind: 'cannonWindow', addSeconds: 0.08 } },
  { id: 'cannon-cool', name: '水冷炮管', blurb: '大炮冷却缩短 30%。', group: 'cannon', cost: 900_000, showAt: 200_000, unlockStage: 1, effect: { kind: 'cannonCooldown', mult: 0.7 } },
  { id: 'cannon-load', name: '双倍装药', blurb: '大炮收益 ×1.5。鸽子已经习惯了。', group: 'cannon', cost: 40_000_000, showAt: 8_000_000, unlockStage: 2, effect: { kind: 'cannonPayout', mult: 1.5 } },

  { id: 'hopper-time', name: '弹簧鞋', blurb: '跳跳粒的狂热多持续 10 秒。', group: 'hopper', cost: 60_000, showAt: 15_000, effect: { kind: 'frenzyDuration', add: 10 } },
  { id: 'hopper-bait', name: '玉米诱饵', blurb: '跳跳粒出现得更频繁。', group: 'hopper', cost: 20_000_000, showAt: 4_000_000, effect: { kind: 'hopperInterval', mult: 0.72 } },

  { id: 'offline-rate', name: '保温锅', blurb: '离线产量提高到 40%。', group: 'offline', cost: 80_000, showAt: 20_000, effect: { kind: 'offlineRate', add: 0.15 } },
  { id: 'offline-cap', name: '夜班保安', blurb: '离线收益上限增加 4 小时。', group: 'offline', cost: 50_000_000, showAt: 10_000_000, effect: { kind: 'offlineCap', addHours: 4 } },
];

export const UPGRADE_BY_ID: ReadonlyMap<string, UpgradeDef> = new Map(UPGRADES.map((upgrade) => [upgrade.id, upgrade]));
