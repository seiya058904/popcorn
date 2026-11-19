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
  { id: 0, name: '灶台', threshold: 2_000, reward: 1.1, rewardText: '产量 ×1.1，解锁推车、老式爆米花炮和大炮“砰！”', breakLine: '锅盖飞了。它不会回来了。' },
  { id: 1, name: '厨房', threshold: 33e6, reward: 1.1, rewardText: '产量 ×1.1，解锁影院爆米花机和爆米花卡车', breakLine: '冰箱门被顶开，窗户也放弃了抵抗。' },
  { id: 2, name: '电影院', threshold: 300e9, reward: 1.1, rewardText: '产量 ×1.1，解锁焦糖工厂和爆米花飞艇', breakLine: '银幕撑破了。观众说这段特效不错。' },
  { id: 3, name: '小城', threshold: 250e12, reward: 1.1, rewardText: '产量 ×1.1，解锁火山炉和轨道聚光站', breakLine: '今日路况：全城爆米花河，请绕行。' },
  { id: 4, name: '地球', threshold: 130e15, reward: 1, rewardText: '进入结局', breakLine: '全球下起了爆米花雪。' },
];

export const CANNON_UNLOCK_STAGE = 1;
