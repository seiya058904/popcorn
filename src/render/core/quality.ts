export type QualityTier = 'low' | 'medium' | 'high' | 'ultra';

export interface QualitySettings {
  tier: QualityTier;
  renderScale: number;
  msaa: number;
  shadowSize: number;
  /** Shadows crisp at contact and softer the farther they fall. */
  softShadows: boolean;
  ambientOcclusion: boolean;
  depthOfField: boolean;
  /** Screen-space reflections on polished floors. */
  reflections: boolean;
  /** Glass bends what is seen through it. Needs a multisampled scene. */
  refraction: boolean;
  /** Refraction splits slightly by color at glass edges. */
  dispersion: boolean;
  /** Shiny things reflect the captured room instead of a painted gradient. */
  probes: boolean;
  /** Rays of light in the air toward windows, projectors and the sun. */
  shafts: boolean;
  /** How many local lights are evaluated per pixel. */
  lamps: number;
  /** Model detail: 0 main shapes, 1 medium parts, 2 everything. */
  detail: number;
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
    softShadows: false,
    ambientOcclusion: false,
    depthOfField: false,
    reflections: false,
    refraction: false,
    dispersion: false,
    probes: false,
    shafts: false,
    lamps: 3,
    detail: 0,
    bloomLevels: 3,
    pileInstances: 1200,
    pileGrid: 100,
  },
  medium: {
    tier: 'medium',
    renderScale: 0.9,
    msaa: 2,
    shadowSize: 1536,
    softShadows: false,
    ambientOcclusion: false,
    depthOfField: true,
    reflections: false,
    refraction: false,
    dispersion: false,
    probes: true,
    shafts: false,
    lamps: 6,
    detail: 1,
    bloomLevels: 4,
    pileInstances: 2600,
    pileGrid: 140,
  },
  high: {
    tier: 'high',
    renderScale: 1,
    msaa: 4,
    shadowSize: 2048,
    softShadows: true,
    ambientOcclusion: true,
    depthOfField: true,
    reflections: true,
    refraction: true,
    dispersion: false,
    probes: true,
    shafts: true,
    lamps: 12,
    detail: 2,
    bloomLevels: 5,
    pileInstances: 4000,
    pileGrid: 160,
  },
  ultra: {
    tier: 'ultra',
    renderScale: 1,
    msaa: 4,
    shadowSize: 3072,
    softShadows: true,
    ambientOcclusion: true,
    depthOfField: true,
    reflections: true,
    refraction: true,
    dispersion: true,
    probes: true,
    shafts: true,
    lamps: 12,
    detail: 2,
    bloomLevels: 5,
    pileInstances: 5200,
    pileGrid: 180,
  },
};
