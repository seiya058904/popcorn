export type FlavorEffect = 'none' | 'salt' | 'rainbow' | 'stars' | 'gold' | 'mystery';

export interface FlavorDef {
  readonly id: number;
  readonly name: string;
  readonly blurb: string;
  readonly cream: string;
  readonly shade: string;
  readonly deep: string;
  readonly hull: string;
  readonly sheen: number;
  readonly effect: FlavorEffect;
  /** Seasoning bottle color used by the purchase animation. */
  readonly bottle: string;
}

/** Plain popcorn, before any flavor is bought. */
export const PLAIN_FLAVOR: FlavorDef = {
  id: -1,
  name: '原味',
  blurb: '朴素，但已经失控。',
  cream: '#fffaf0',
  shade: '#fbd596',
  deep: '#d0822f',
  hull: '#8a4a1e',
  sheen: 0.3,
  effect: 'none',
  bottle: '#fff1d0',
};

export const FLAVORS: readonly FlavorDef[] = [
  { id: 0, name: '黄油', blurb: '香味飘到了隔壁。', cream: '#fff3bd', shade: '#ffc64f', deep: '#d98719', hull: '#8a4a12', sheen: 0.5, effect: 'none', bottle: '#ffd257' },
  { id: 1, name: '海盐', blurb: '每一粒都闪着咸味的光。', cream: '#fafdff', shade: '#cbdfee', deep: '#7f9fba', hull: '#5a6f82', sheen: 0.45, effect: 'salt', bottle: '#9fd8ff' },
  { id: 2, name: '焦糖', blurb: '牙医开始关注这个项目。', cream: '#ffe3b0', shade: '#f2b265', deep: '#c47a33', hull: '#6e3a12', sheen: 0.95, effect: 'none', bottle: '#c9772c' },
  { id: 3, name: '草莓', blurb: '粉色警报，已无法撤销。', cream: '#ffd6e0', shade: '#ff93ae', deep: '#c9365f', hull: '#7d1c3a', sheen: 0.55, effect: 'none', bottle: '#ff6f95' },
  { id: 4, name: '抹茶', blurb: '吃起来很有修养。', cream: '#dff2a8', shade: '#a2cb5e', deep: '#557f25', hull: '#35521a', sheen: 0.3, effect: 'none', bottle: '#83b84a' },
  { id: 5, name: '巧克力', blurb: '终于不用担心它太白了。', cream: '#e6b488', shade: '#bb8150', deep: '#84502c', hull: '#3c1d0e', sheen: 0.95, effect: 'none', bottle: '#6b3a1e' },
  { id: 6, name: '芝士', blurb: '拉丝这件事，它尽力了。', cream: '#ffe680', shade: '#ffb82f', deep: '#d9760e', hull: '#8f4a08', sheen: 0.6, effect: 'none', bottle: '#ffb52e' },
  { id: 7, name: '辣椒', blurb: '喷嚏把锅盖又吹飞一次。', cream: '#ffa77f', shade: '#ee5436', deep: '#a8241e', hull: '#5a0d0d', sheen: 0.6, effect: 'none', bottle: '#e0301e' },
  { id: 8, name: '彩虹', blurb: '每一朵都拒绝和别人一样。', cream: '#ffffff', shade: '#ffd9f0', deep: '#a884ff', hull: '#5b3fa8', sheen: 0.6, effect: 'rainbow', bottle: '#c98bff' },
  { id: 9, name: '星空', blurb: '咬一口，能看见银河系。', cream: '#3b3d8f', shade: '#1d1f58', deep: '#0a0b2a', hull: '#04041a', sheen: 0.9, effect: 'stars', bottle: '#2a2d7a' },
  { id: 10, name: '黄金', blurb: '吃下去之前请先咨询银行。', cream: '#ffe07a', shade: '#dfa526', deep: '#7a4f0a', hull: '#3f2804', sheen: 1, effect: 'gold', bottle: '#f5c542' },
  { id: 11, name: '神秘味道', blurb: '没人说得清，但月亮好像闻到了。', cream: '#d9fff4', shade: '#8ce0ff', deep: '#7a4dff', hull: '#2b1466', sheen: 0.85, effect: 'mystery', bottle: '#7a4dff' },
];

export const FLAVOR_MULTIPLIER = 1.35;
export const FLAVOR_BASE_COST = 400;
export const FLAVOR_COST_GROWTH = 28;
