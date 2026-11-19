export interface ProducerDef {
  /** Position in the save's `owned` list. New machines take new numbers, so old saves still line up. */
  readonly id: number;
  /** Where it sits in the shop and in the order machines come along: by price, cheapest first. */
  readonly order: number;
  readonly name: string;
  readonly blurb: string;
  readonly baseCost: number;
  readonly baseRate: number;
  /** Scene index that must be reached before this unit is offered. */
  readonly unlockStage: number;
}

/**
 * Fifteen machines, three per scene. Ids 10–14 came later and slot in between the two machines of
 * their scene; `order` is what decides the shop.
 *
 * From the kitchen on, prices sit above the old ten-machine curve (about ×1.9, ×3, ×5.5 and ×7 for
 * the four later scenes), which keeps a run near 2.5 hours with the extra multipliers that golden
 * kernels, swarms and decorations bring. See docs/BALANCE.md.
 */
export const PRODUCERS: readonly ProducerDef[] = [
  { id: 0, order: 0, name: '小奶锅', blurb: '锅盖总被顶飞，没人再去捡了。', baseCost: 10, baseRate: 0.5, unlockStage: 0 },
  { id: 1, order: 2, name: '微波炉', blurb: '转盘一停，门就关不上了。', baseCost: 110, baseRate: 4, unlockStage: 0 },
  { id: 2, order: 3, name: '爆米花推车', blurb: '车轮已被淹没，它不打算走了。', baseCost: 2_500, baseRate: 32, unlockStage: 1 },
  { id: 3, order: 5, name: '老式爆米花炮', blurb: '每响一炮，全城鸽子搬一次家。', baseCost: 74_000, baseRate: 420, unlockStage: 1 },
  { id: 4, order: 6, name: '影院爆米花机', blurb: '观众只来吃，没人看电影。', baseCost: 3.7e6, baseRate: 5_400, unlockStage: 2 },
  { id: 5, order: 8, name: '爆米花卡车', blurb: '后视镜里全是爆米花。', baseCost: 1.1e8, baseRate: 70_000, unlockStage: 2 },
  { id: 6, order: 9, name: '焦糖工厂', blurb: '下班时，全城都很香。', baseCost: 6e9, baseRate: 910_000, unlockStage: 3 },
  { id: 7, order: 11, name: '爆米花飞艇', blurb: '今日多云，局部有爆米花。', baseCost: 1.75e11, baseRate: 12e6, unlockStage: 3 },
  { id: 8, order: 12, name: '火山炉', blurb: '地质学家已放弃解释。', baseCost: 6.6e12, baseRate: 150e6, unlockStage: 4 },
  { id: 9, order: 14, name: '轨道聚光站', blurb: '它只是想把月亮烤热一点。', baseCost: 2e14, baseRate: 2e9, unlockStage: 4 },
  { id: 10, order: 1, name: '弹跳吐司机', blurb: '弹出来的不是吐司，是两块爆米花砖。', baseCost: 35, baseRate: 1.5, unlockStage: 0 },
  { id: 11, order: 4, name: '复古厨师机', blurb: '机头一抬，半个厨房都是奶油味。', baseCost: 13_000, baseRate: 140, unlockStage: 1 },
  { id: 12, order: 7, name: '剧院管风琴', blurb: '每个音符都喷出一把爆米花。', baseCost: 2e7, baseRate: 20_000, unlockStage: 2 },
  { id: 13, order: 10, name: '爆米花小火车', blurb: '每多买一台，就多挂一节车厢。', baseCost: 3.3e10, baseRate: 3.3e6, unlockStage: 3 },
  { id: 14, order: 13, name: '爆米花台风', blurb: '气象局把它登记为设备，而不是灾害。', baseCost: 3.5e13, baseRate: 5.5e8, unlockStage: 4 },
];

/** The machines as the shop lists them. */
export const PRODUCERS_IN_ORDER: readonly ProducerDef[] = [...PRODUCERS].sort((a, b) => a.order - b.order);

export const PRICE_GROWTH = 1.19;

/** Owning this many of a unit doubles it; after the list, every further 50 doubles it again. */
export const MILESTONES: readonly number[] = [25, 50, 100];
export const MILESTONE_STEP = 50;
