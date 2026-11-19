export interface ProducerDef {
  readonly id: number;
  readonly name: string;
  readonly blurb: string;
  readonly baseCost: number;
  readonly baseRate: number;
  /** Scene index that must be reached before this unit is offered. */
  readonly unlockStage: number;
}

/** Ten generations: each one costs far more than the last and makes far more per second. */
export const PRODUCERS: readonly ProducerDef[] = [
  { id: 0, name: '小奶锅', blurb: '锅盖总被顶飞，没人再去捡了。', baseCost: 10, baseRate: 0.5, unlockStage: 0 },
  { id: 1, name: '微波炉', blurb: '转盘一停，门就关不上了。', baseCost: 110, baseRate: 4, unlockStage: 0 },
  { id: 2, name: '爆米花推车', blurb: '车轮已被淹没，它不打算走了。', baseCost: 1_300, baseRate: 32, unlockStage: 1 },
  { id: 3, name: '老式爆米花炮', blurb: '每响一炮，全城鸽子搬一次家。', baseCost: 39_000, baseRate: 420, unlockStage: 1 },
  { id: 4, name: '影院爆米花机', blurb: '观众只来吃，没人看电影。', baseCost: 1_200_000, baseRate: 5_400, unlockStage: 2 },
  { id: 5, name: '爆米花卡车', blurb: '后视镜里全是爆米花。', baseCost: 35_000_000, baseRate: 70_000, unlockStage: 2 },
  { id: 6, name: '焦糖工厂', blurb: '下班时，全城都很香。', baseCost: 1.1e9, baseRate: 910_000, unlockStage: 3 },
  { id: 7, name: '爆米花飞艇', blurb: '今日多云，局部有爆米花。', baseCost: 32e9, baseRate: 12e6, unlockStage: 3 },
  { id: 8, name: '火山炉', blurb: '地质学家已放弃解释。', baseCost: 950e9, baseRate: 150e6, unlockStage: 4 },
  { id: 9, name: '轨道聚光站', blurb: '它只是想把月亮烤热一点。', baseCost: 28e12, baseRate: 2e9, unlockStage: 4 },
];

export const PRICE_GROWTH = 1.19;

/** Owning this many of a unit doubles it; after the list, every further 50 doubles it again. */
export const MILESTONES: readonly number[] = [25, 50, 100];
export const MILESTONE_STEP = 50;
