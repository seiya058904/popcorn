export type QualityTier = 'low' | 'medium' | 'high' | 'ultra';

export interface QualitySettings {
  tier: QualityTier;
  renderScale: number;
  msaa: number;
  shadowSize: number;
  ambientOcclusion: boolean;
  depthOfField: boolean;
  bloomLevels: number;
  pileInstances: number;
  pileGrid: number;
}

export const QUALITY: Record<QualityTier, QualitySettings> = {
  low: {
    tier: 'low',
    renderScale: 0.75,
    msaa: 0,
    shadowSize: 1024,
    ambientOcclusion: false,
    depthOfField: false,
    bloomLevels: 3,
    pileInstances: 900,
    pileGrid: 100,
  },
  medium: {
    tier: 'medium',
    renderScale: 0.9,
    msaa: 2,
    shadowSize: 1536,
    ambientOcclusion: false,
    depthOfField: true,
    bloomLevels: 4,
    pileInstances: 1800,
    pileGrid: 140,
  },
  high: {
    tier: 'high',
    renderScale: 1,
    msaa: 4,
    shadowSize: 2048,
    ambientOcclusion: true,
    depthOfField: true,
    bloomLevels: 5,
    pileInstances: 2400,
    pileGrid: 160,
  },
  ultra: {
    tier: 'ultra',
    renderScale: 1,
    msaa: 4,
    shadowSize: 3072,
    ambientOcclusion: true,
    depthOfField: true,
    bloomLevels: 5,
    pileInstances: 3000,
    pileGrid: 180,
  },
};
