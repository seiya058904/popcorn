export interface ProducerDef {
  readonly id: number;
  readonly name: string;
  readonly baseCost: number;
  readonly baseRate: number;
}

export const PRODUCERS: readonly ProducerDef[] = [
  { id: 0, name: '小奶锅', baseCost: 15, baseRate: 0.2 },
  { id: 1, name: '爆米花推车', baseCost: 200, baseRate: 1.5 },
  { id: 2, name: '老式爆米花炮', baseCost: 4_000, baseRate: 10 },
  { id: 3, name: '影院爆米花机', baseCost: 80_000, baseRate: 60 },
  { id: 4, name: '焦糖工厂', baseCost: 2_000_000, baseRate: 400 },
  { id: 5, name: '火山炉', baseCost: 60_000_000, baseRate: 2_800 },
];

export const PRICE_GROWTH = 1.15;
