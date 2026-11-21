import * as THREE from 'three';

/** Runs of clicks that step the combo burst up a tier. The burst itself comes every 12. */
export const COMBO_TIERS = [12, 24, 48, 96] as const;

/** 0 below the first tier, then 1 to 4. */
export function comboTier(count: number): number {
  let tier = 0;
  for (const at of COMBO_TIERS) if (count >= at) tier += 1;
  return tier;
}

/** True when this click is the one that reached a new tier. */
export const reachedTier = (count: number): boolean => (COMBO_TIERS as readonly number[]).includes(count);

/** The burst's light for each tier: warm white, gold, peach, and for the top tier a turning rainbow. */
const TIER_COLORS = [new THREE.Color(1.9, 1.75, 1.45), new THREE.Color(2.2, 1.65, 0.45), new THREE.Color(2.2, 1.05, 1.2)];

export function comboColor(tier: number, hue: number, out: THREE.Color): THREE.Color {
  if (tier >= 4) return out.setHSL(((hue % 1) + 1) % 1, 0.85, 0.62).multiplyScalar(2);
  return out.copy(TIER_COLORS[Math.max(0, Math.min(2, tier - 1))]!);
}

/** The combo sound goes up the scale with the tier: root, second, third, fifth. */
export const COMBO_PITCH = [1, 1.122, 1.26, 1.498] as const;
