export interface StageDef {
  readonly id: number;
  readonly name: string;
  /** Cumulative popcorn that breaks out of this scene. */
  readonly threshold: number;
  /** Production multiplier granted permanently (for this run) when the scene is broken. */
  readonly reward: number;
  readonly rewardText: string;
  readonly breakLine: string;
}

export const STAGES: readonly StageDef[] = [
  { id: 0, name: '灶台', threshold: 1_000, reward: 1.3, rewardText: '产量 ×1.3，解锁老式爆米花炮和大炮“砰！”', breakLine: '锅盖飞了。它不会回来了。' },
  { id: 1, name: '厨房', threshold: 50_000, reward: 1.1, rewardText: '产量 ×1.1，解锁影院爆米花机', breakLine: '冰箱门被顶开，窗户也放弃了抵抗。' },
  { id: 2, name: '电影院', threshold: 10_000_000, reward: 1.15, rewardText: '产量 ×1.15，解锁焦糖工厂', breakLine: '银幕撑破了。观众说这段特效不错。' },
  { id: 3, name: '小城', threshold: 1_000_000_000, reward: 1, rewardText: '解锁火山炉', breakLine: '今日路况：全城爆米花河，请绕行。' },
  { id: 4, name: '地球', threshold: 20_000_000_000, reward: 1, rewardText: '进入结局', breakLine: '全球下起了爆米花雪。' },
];

export const CANNON_UNLOCK_STAGE = 1;
