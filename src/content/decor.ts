/**
 * Scene decorations: two per scene. Each is an upgrade that raises all production a little, and
 * once bought it appears in its scene for real. Costs are set so each one is normally bought while
 * its scene is still the one on screen (see docs/BALANCE.md).
 */
export interface DecorDef {
  readonly id: string;
  /** The scene it belongs to and is offered in. */
  readonly stage: number;
  readonly name: string;
  readonly joke: string;
  readonly cost: number;
  readonly mult: number;
}

export const DECOR: readonly DecorDef[] = [
  { id: 'decor-neon', stage: 0, name: '霓虹「砰」字招牌', joke: '墙上多了一个会发光的字。', cost: 100, mult: 1.05 },
  { id: 'decor-plant', stage: 0, name: '窗台盆栽', joke: '它每天晒太阳，顺便长出爆米花。', cost: 450, mult: 1.05 },
  { id: 'decor-chandelier', stage: 1, name: '水晶吊灯', joke: '每颗水晶里都映着一锅爆米花。', cost: 120_000, mult: 1.05 },
  { id: 'decor-rug', stage: 1, name: '彩色地垫', joke: '爆米花也爱在上面打滚。', cost: 1.5e6, mult: 1.05 },
  { id: 'decor-carpet', stage: 2, name: '红地毯与丝绒围栏', joke: '爆米花机走上了红地毯。', cost: 6e8, mult: 1.05 },
  { id: 'decor-stars', stage: 2, name: '穹顶星空灯', joke: '抬头是星空，低头是爆米花。', cost: 8e9, mult: 1.05 },
  { id: 'decor-bunting', stage: 3, name: '彩旗与路灯花篮', joke: '全城都在为爆米花过节。', cost: 1e12, mult: 1.05 },
  { id: 'decor-fountain', stage: 3, name: '喷泉灯光秀', joke: '喷泉跟着爆米花的节拍起舞。', cost: 5e12, mult: 1.05 },
  { id: 'decor-ring', stage: 4, name: '环球霓虹广告环', joke: '从太空也能看清那个「砰」。', cost: 3e14, mult: 1.05 },
  { id: 'decor-aurora', stage: 4, name: '爆米花极光', joke: '极光是黄油的颜色。', cost: 1.5e15, mult: 1.05 },
];
