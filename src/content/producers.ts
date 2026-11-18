export interface ProducerDef {
  readonly id: number;
  readonly name: string;
  readonly blurb: string;
  readonly baseCost: number;
  readonly baseRate: number;
  /** Scene index that must be reached before this unit is offered. */
  readonly unlockStage: number;
}

export const PRODUCERS: readonly ProducerDef[] = [
  { id: 0, name: '小奶锅', blurb: '锅盖总被顶飞，没人再去捡了。', baseCost: 15, baseRate: 0.2, unlockStage: 0 },
  { id: 1, name: '爆米花推车', blurb: '车轮已被淹没，它不打算走了。', baseCost: 1_200, baseRate: 1.5, unlockStage: 0 },
  { id: 2, name: '老式爆米花炮', blurb: '每响一炮，全城鸽子搬一次家。', baseCost: 20_000, baseRate: 10, unlockStage: 1 },
  { id: 3, name: '影院爆米花机', blurb: '观众只来吃，没人看电影。', baseCost: 500_000, baseRate: 55, unlockStage: 2 },
  { id: 4, name: '焦糖工厂', blurb: '下班时，全城都很香。', baseCost: 6_000_000, baseRate: 225, unlockStage: 3 },
  { id: 5, name: '火山炉', blurb: '地质学家已放弃解释。', baseCost: 220_000_000, baseRate: 1_200, unlockStage: 4 },
];

export const PRICE_GROWTH = 1.15;

/** Owning this many of a unit doubles it; after the list, every further 50 doubles it again. */
export const MILESTONES: readonly number[] = [25, 50, 100];
export const MILESTONE_STEP = 50;
