import { DECOR } from './decor.ts';
import { EGGS } from './props.ts';

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
  goldenPops: number;
  pokes: number;
  swarmsCaught: number;
  /** Upgrades of a few kinds, counted for the collection achievements. */
  decorOwned: number;
  goldOwned: number;
  /** Easter eggs ever found, across runs. */
  eggsFound: number;
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
  { id: 'carts-25', name: '堵车', blurb: '拥有 25 辆推车。交警表示很香。', test: (v) => v.owned[2]! >= 25 },
  { id: 'first-microwave', name: '叮！', blurb: '买下第一台微波炉。它比你更急。', test: (v) => v.owned[1]! >= 1 },
  { id: 'first-truck', name: '上路了', blurb: '买下第一辆爆米花卡车。', test: (v) => v.owned[5]! >= 1 },
  { id: 'first-airship', name: '天气转爆', blurb: '买下第一艘爆米花飞艇。记得带伞。', test: (v) => v.owned[7]! >= 1 },
  { id: 'first-orbital', name: '月亮警报', blurb: '买下第一座轨道聚光站。月亮开始不自在。', test: (v) => v.owned[9]! >= 1 },
  { id: 'first-toaster', name: '早餐好了', blurb: '买下第一台弹跳吐司机。只是早餐全是爆米花。', test: (v) => v.owned[10]! >= 1 },
  { id: 'first-organ', name: '开场白', blurb: '买下第一台剧院管风琴。观众开始跟着唱。', test: (v) => v.owned[12]! >= 1 },
  { id: 'first-train', name: '呜——', blurb: '买下第一节爆米花小火车。请站在黄线以外。', test: (v) => v.owned[13]! >= 1 },
  { id: 'first-typhoon', name: '风力十二级', blurb: '买下第一个爆米花台风。天气预报主持人请了假。', test: (v) => v.owned[14]! >= 1 },
  { id: 'all-units', name: '全家福', blurb: '十五种设备各拥有至少一台。', test: (v) => v.owned.every((count) => count >= 1) },
  { id: 'total-1e12', name: '万亿俱乐部', blurb: '累计爆出 1 万亿。会费用爆米花交。', test: (v) => v.totalEarned >= 1e12 },
  { id: 'total-1e16', name: '亿亿之后', blurb: '累计爆出 1 亿亿。数学老师沉默了。', test: (v) => v.totalEarned >= 1e16 },
  { id: 'units-300', name: '产能过剩', blurb: '总共拥有 300 台设备。', test: (v) => totalOwned(v) >= 300 },
  { id: 'flavor-1', name: '开始讲究', blurb: '买下第一种口味。', test: (v) => v.flavors >= 1 },
  { id: 'flavor-6', name: '味觉混乱', blurb: '集齐 6 种口味。', test: (v) => v.flavors >= 6 },
  { id: 'flavor-12', name: '说不清的味道', blurb: '集齐全部 12 种口味。月亮动了一下。', test: (v) => v.flavors >= 12 },
  { id: 'upgrades-10', name: '技术改造', blurb: '买下 10 项升级。', test: (v) => v.upgrades >= 10 },
  { id: 'cannon-first', name: '鸽子搬家', blurb: '第一次开炮。', test: (v) => v.cannonShots >= 1 },
  { id: 'cannon-perfect', name: '耳朵很灵', blurb: '第一次在绿区开炮。', test: (v) => v.cannonPerfect >= 1 },
  { id: 'cannon-streak', name: '炮王', blurb: '连续 5 次绿区开炮。', test: (v) => v.perfectStreak >= 5 },
  { id: 'cannon-streak-10', name: '炮神', blurb: '连续 10 次绿区开炮。鸽子已经学会鼓掌。', test: (v) => v.perfectStreak >= 10 },
  { id: 'cannon-oops', name: '炮盖去哪了', blurb: '过压 3 次。那是个相当贵的盖子。', test: (v) => v.cannonOverpressure >= 3 },
  { id: 'golden-first', name: '金光一闪', blurb: '第一次炸出金色玉米。', test: (v) => v.goldenPops >= 1 },
  { id: 'golden-100', name: '淘金热', blurb: '炸出 100 粒金色玉米。镇上来了一批拿筛子的人。', test: (v) => v.goldenPops >= 100 },
  { id: 'hopper-first', name: '抓住它！', blurb: '第一次抓到跳跳粒。', test: (v) => v.hoppersCaught >= 1 },
  { id: 'hopper-10', name: '玉米牧人', blurb: '抓到 10 粒跳跳粒。', test: (v) => v.hoppersCaught >= 10 },
  { id: 'hopper-swarm', name: '一网打尽', blurb: '把一整群跳跳粒全部抓住。', test: (v) => v.swarmsCaught >= 1 },
  { id: 'hopper-miss', name: '它自由了', blurb: '放跑 5 粒跳跳粒。它们在外面过得不错。', test: (v) => v.hoppersMissed >= 5 },
  { id: 'gold-tier', name: '金牌供应商', blurb: '买下第一项金牌升级。', test: (v) => v.goldOwned >= 1 },
  { id: 'decor-first', name: '装修队进场', blurb: '买下第一件场景装修。', test: (v) => v.decorOwned >= 1 },
  { id: 'decor-all', name: '样板间', blurb: '买齐全部 10 件场景装修。', test: (v) => v.decorOwned >= DECOR.length },
  { id: 'poke-first', name: '戳一下', blurb: '戳一下正在干活的设备。它没生气，只是更卖力了。', test: (v) => v.pokes >= 1 },
  { id: 'poke-100', name: '监工', blurb: '戳设备 100 次。', test: (v) => v.pokes >= 100 },
  { id: 'egg-first', name: '咦？', blurb: '发现第一个彩蛋。', test: (v) => v.eggsFound >= 1 },
  { id: 'egg-all', name: '彩蛋猎人', blurb: '找齐全部 15 个彩蛋。', test: (v) => v.eggsFound >= EGGS.length },
  { id: 'offline', name: '睡后收入', blurb: '第一次领取离线收益。锅没有睡。', test: (v) => v.offlineCollected > 0 },
  { id: 'spender', name: '铲屎官', blurb: '累计花掉 1 万亿爆米花。铲子快秃了。', test: (v) => v.spent >= 1e12 },
  { id: 'town', name: '头条新闻', blurb: '让爆米花淹没小城。', test: (v) => v.stage >= 4 },
  { id: 'moon', name: '月亮是一粒玉米', blurb: '看到真相。', test: (v) => v.ended },
];
