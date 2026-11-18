import { Rng } from './rng.ts';

export type ImpactLevel = 'tap' | 'small' | 'medium' | 'large' | 'epic';

interface ImpactSpec {
  shake: number;
  flash: number;
  hitstop: number;
  chroma: number;
  /** Ceiling for one-shot sound volume at this level. */
  volume: number;
}

/** The single table deciding how loud any event may be, so small things stay small. */
export const IMPACTS: Record<ImpactLevel, ImpactSpec> = {
  tap: { shake: 0, flash: 0, hitstop: 0, chroma: 0, volume: 0.8 },
  small: { shake: 0, flash: 0, hitstop: 0, chroma: 0, volume: 0.85 },
  medium: { shake: 0.14, flash: 0.02, hitstop: 0, chroma: 0.0006, volume: 0.9 },
  large: { shake: 0.5, flash: 0.1, hitstop: 0.05, chroma: 0.0028, volume: 1 },
  epic: { shake: 1, flash: 0.42, hitstop: 0.09, chroma: 0.006, volume: 1 },
};

export interface MotionPreferences {
  screenShake: boolean;
  reduceMotion: boolean;
  /** Multiplies flash strength; lowered for comfort. */
  flash: number;
}

export class ImpactDirector {
  readonly prefs: MotionPreferences = { screenShake: true, reduceMotion: false, flash: 1 };
  shakeX = 0;
  shakeY = 0;
  shakeRoll = 0;
  flash = 0;
  chroma = 0;
  private trauma = 0;
  private hitstop = 0;
  private time = 0;
  private readonly seed = new Rng(404).next() * 100;

  hit(level: ImpactLevel): void {
    const spec = IMPACTS[level];
    this.trauma = Math.min(1, Math.max(this.trauma, spec.shake));
    this.flash = Math.max(this.flash, spec.flash * this.prefs.flash);
    this.chroma = Math.max(this.chroma, spec.chroma);
    if (!this.prefs.reduceMotion) this.hitstop = Math.max(this.hitstop, spec.hitstop);
  }

  /** Scales presentation time; zero during a hit-stop. Input and the economy never pause. */
  timeScale(deltaSeconds: number): number {
    if (this.hitstop <= 0) return 1;
    this.hitstop -= deltaSeconds;
    return 0;
  }

  update(deltaSeconds: number): void {
    this.time += deltaSeconds;
    this.trauma = Math.max(0, this.trauma - deltaSeconds * 2.6);
    this.flash *= Math.exp(-deltaSeconds * 11);
    if (this.flash < 0.001) this.flash = 0;
    this.chroma *= Math.exp(-deltaSeconds * 9);
    if (this.chroma < 0.00005) this.chroma = 0;
    const enabled = this.prefs.screenShake && !this.prefs.reduceMotion;
    const power = enabled ? this.trauma * this.trauma : 0;
    const t = this.time * 31 + this.seed;
    this.shakeX = power * 0.34 * (Math.sin(t) + 0.5 * Math.sin(t * 2.3 + 1.3));
    this.shakeY = power * 0.3 * (Math.sin(t * 1.17 + 2.1) + 0.5 * Math.sin(t * 2.7 + 0.4));
    this.shakeRoll = power * 0.022 * Math.sin(t * 0.83 + 4.2);
  }
}
