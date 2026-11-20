/**
 * Hidden things to find: three per scene. Tapping one plays its gag; the first find goes into the
 * album, which survives "再来一锅". The scenes give them a shape and a gag; this is the list.
 */
export interface EggDef {
  readonly id: string;
  readonly stage: number;
  readonly name: string;
  /** The album line, shown once found. */
  readonly blurb: string;
}

export const EGGS: readonly EggDef[] = [
  { id: 'egg-clock', stage: 0, name: '挂钟', blurb: '指针转得飞快，它也想早点下班。' },
  { id: 'egg-window-moon', stage: 0, name: '窗外的月亮', blurb: '它好像往窗里看了一眼。' },
  { id: 'egg-pepper', stage: 0, name: '胡椒瓶', blurb: '一个喷嚏，锅里又多了三粒。' },
  { id: 'egg-fridge', stage: 1, name: '冰箱', blurb: '门一开，里面也塞满了爆米花。' },
  { id: 'egg-lamp', stage: 1, name: '吊灯', blurb: '晃了两下，掉下来一粒。' },
  { id: 'egg-radio', stage: 1, name: '收音机', blurb: '每个台都在播爆米花。' },
  { id: 'egg-projector', stage: 2, name: '放映机', blurb: '倒带之后，爆米花飞回了桶里。' },
  { id: 'egg-audience', stage: 2, name: '观众席的玩具小人', blurb: '他站起来鼓掌，手里的桶洒了。' },
  { id: 'egg-curtain', stage: 2, name: '幕布拉绳', blurb: '一拉，幕后也全是爆米花。' },
  { id: 'egg-pigeons', stage: 3, name: '鸽群', blurb: '受了惊一起飞走，嘴里的爆米花掉了一地。' },
  { id: 'egg-clocktower', stage: 3, name: '钟楼', blurb: '报时的不是钟声，是爆米花。' },
  { id: 'egg-fountain', stage: 3, name: '喷泉', blurb: '许个愿吧，投进去的是玉米。' },
  { id: 'egg-satellite', stage: 4, name: '卫星', blurb: '它拍下了一张爆米花自拍。' },
  { id: 'egg-cloud', stage: 4, name: '云', blurb: '捏一下，下起了爆米花雨。' },
  { id: 'egg-moon', stage: 4, name: '月亮', blurb: '戳了一下，它有点发烫。' },
];

export const EGG_IDS: ReadonlySet<string> = new Set(EGGS.map((egg) => egg.id));
