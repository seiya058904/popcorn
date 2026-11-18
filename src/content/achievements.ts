export interface AchievementView {
  totalEarned: number;
  lifetimeEarned: number;
  popcorn: number;
  perSecond: number;
  owned: readonly number[];
  flavors: number;
  upgrades: number;
  stage: number;
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
  runs: number;
  ended: boolean;
}

export interface AchievementDef {
  readonly id: string;
  readonly name: string;
  readonly blurb: string;
  test(view: AchievementView): boolean;
}

const totalOwned = (view: AchievementView): number => view.owned.reduce((sum, count) => sum + count, 0);

export const ACHIEVEMENTS: readonly AchievementDef[] = [
  { id: 'first-pop', name: '砰！', blurb: '炸开第一粒玉米。一切都从这里开始变糟。', test: (v) => v.pops >= 1 },
  { id: 'hundred', name: '够吃了', blurb: '累计 100 粒。正常人到这里就该停了。', test: (v) => v.totalEarned >= 100 },
  { id: 'first-pan', name: '第二口锅', blurb: '买下第一口小奶锅。家里开始不够放了。', test: (v) => v.owned[0]! >= 1 },
  { id: 'click-1k', name: '腱鞘预警', blurb: '点击 1,000 次。', test: (v) => v.clicks >= 1_000 },
  { id: 'click-10k', name: '手指已离职', blurb: '点击 10,000 次。它们现在有自己的想法。', test: (v) => v.clicks >= 10_000 },
  { id: 'pans-25', name: '锅碗瓢盆', blurb: '拥有 25 口小奶锅。邻居来借过锅，然后走不了了。', test: (v) => v.owned[0]! >= 25 },
  { id: 'carts-25', name: '堵车', blurb: '拥有 25 辆推车。交警表示很香。', test: (v) => v.owned[1]! >= 25 },
  { id: 'all-units', name: '全家福', blurb: '六种设备各拥有至少一台。', test: (v) => v.owned.every((count) => count >= 1) },
  { id: 'units-300', name: '产能过剩', blurb: '总共拥有 300 台设备。', test: (v) => totalOwned(v) >= 300 },
  { id: 'flavor-1', name: '开始讲究', blurb: '买下第一种口味。', test: (v) => v.flavors >= 1 },
  { id: 'flavor-6', name: '味觉混乱', blurb: '集齐 6 种口味。', test: (v) => v.flavors >= 6 },
  { id: 'flavor-12', name: '说不清的味道', blurb: '集齐全部 12 种口味。月亮动了一下。', test: (v) => v.flavors >= 12 },
  { id: 'upgrades-10', name: '技术改造', blurb: '买下 10 项升级。', test: (v) => v.upgrades >= 10 },
  { id: 'cannon-first', name: '鸽子搬家', blurb: '第一次开炮。', test: (v) => v.cannonShots >= 1 },
  { id: 'cannon-perfect', name: '耳朵很灵', blurb: '第一次在绿区开炮。', test: (v) => v.cannonPerfect >= 1 },
  { id: 'cannon-streak', name: '炮王', blurb: '连续 5 次绿区开炮。', test: (v) => v.perfectStreak >= 5 },
  { id: 'cannon-oops', name: '炮盖去哪了', blurb: '过压 3 次。那是个相当贵的盖子。', test: (v) => v.cannonOverpressure >= 3 },
  { id: 'hopper-first', name: '抓住它！', blurb: '第一次抓到跳跳粒。', test: (v) => v.hoppersCaught >= 1 },
  { id: 'hopper-10', name: '玉米牧人', blurb: '抓到 10 粒跳跳粒。', test: (v) => v.hoppersCaught >= 10 },
  { id: 'hopper-miss', name: '它自由了', blurb: '放跑 5 粒跳跳粒。它们在外面过得不错。', test: (v) => v.hoppersMissed >= 5 },
  { id: 'offline', name: '睡后收入', blurb: '第一次领取离线收益。锅没有睡。', test: (v) => v.offlineCollected > 0 },
  { id: 'spender', name: '铲屎官', blurb: '累计花掉 100 万爆米花。铲子快秃了。', test: (v) => v.spent >= 1_000_000 },
  { id: 'town', name: '头条新闻', blurb: '让爆米花淹没小城。', test: (v) => v.stage >= 4 },
  { id: 'moon', name: '月亮是一粒玉米', blurb: '看到真相。', test: (v) => v.ended },
];
