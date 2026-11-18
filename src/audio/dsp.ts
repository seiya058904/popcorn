import { Rng } from '../motion/rng.ts';

export const SAMPLE_RATE = 44100;

/** One-pole filters, enough for the percussive material used here. */
export class OnePole {
  private value = 0;
  private readonly coefficient: number;

  constructor(cutoffHz: number, sampleRate = SAMPLE_RATE) {
    this.coefficient = 1 - Math.exp((-2 * Math.PI * cutoffHz) / sampleRate);
  }

  low(input: number): number {
    this.value += this.coefficient * (input - this.value);
    return this.value;
  }

  high(input: number): number {
    return input - this.low(input);
  }
}

export type BiquadKind = 'low' | 'high' | 'band';

/** RBJ biquad, used where a one-pole slope is too gentle. */
export class Biquad {
  private x1 = 0;
  private x2 = 0;
  private y1 = 0;
  private y2 = 0;
  private b0 = 1;
  private b1 = 0;
  private b2 = 0;
  private a1 = 0;
  private a2 = 0;
  private readonly kind: BiquadKind;
  private readonly q: number;

  constructor(kind: BiquadKind, frequency: number, q = 0.707) {
    this.kind = kind;
    this.q = q;
    this.set(frequency);
  }

  set(frequency: number): void {
    const w = (2 * Math.PI * Math.min(frequency, SAMPLE_RATE * 0.45)) / SAMPLE_RATE;
    const alpha = Math.sin(w) / (2 * this.q);
    const c = Math.cos(w);
    const a0 = 1 + alpha;
    let b0: number;
    let b1: number;
    let b2: number;
    if (this.kind === 'low') {
      b0 = (1 - c) / 2;
      b1 = 1 - c;
      b2 = b0;
    } else if (this.kind === 'high') {
      b0 = (1 + c) / 2;
      b1 = -(1 + c);
      b2 = b0;
    } else {
      b0 = alpha;
      b1 = 0;
      b2 = -alpha;
    }
    this.b0 = b0 / a0;
    this.b1 = b1 / a0;
    this.b2 = b2 / a0;
    this.a1 = (-2 * c) / a0;
    this.a2 = (1 - alpha) / a0;
  }

  run(x: number): number {
    const y = this.b0 * x + this.b1 * this.x1 + this.b2 * this.x2 - this.a1 * this.y1 - this.a2 * this.y2;
    this.x2 = this.x1;
    this.x1 = x;
    this.y2 = this.y1;
    this.y1 = y;
    return y;
  }
}

export function normalizePeak(samples: Float32Array, peak: number): Float32Array {
  let max = 0;
  for (const sample of samples) max = Math.max(max, Math.abs(sample));
  if (max > 0) {
    const gain = peak / max;
    for (let i = 0; i < samples.length; i += 1) samples[i]! *= gain;
  }
  return samples;
}

/** Scales to a target RMS, then soft-limits so peaks stay safe. */
export function normalizeRms(samples: Float32Array, rms: number, ceiling = 0.92): Float32Array {
  let energy = 0;
  for (const sample of samples) energy += sample * sample;
  const current = Math.sqrt(energy / Math.max(1, samples.length));
  const gain = current > 0 ? rms / current : 1;
  for (let i = 0; i < samples.length; i += 1) {
    const x = samples[i]! * gain;
    samples[i] = Math.abs(x) < ceiling * 0.7 ? x : Math.sign(x) * (ceiling * 0.7 + ceiling * 0.3 * Math.tanh((Math.abs(x) - ceiling * 0.7) / (ceiling * 0.3)));
  }
  return samples;
}

export function fadeEdges(samples: Float32Array, inSeconds: number, outSeconds: number): Float32Array {
  const fadeIn = Math.floor(inSeconds * SAMPLE_RATE);
  const fadeOut = Math.floor(outSeconds * SAMPLE_RATE);
  for (let i = 0; i < fadeIn && i < samples.length; i += 1) samples[i]! *= i / fadeIn;
  for (let i = 0; i < fadeOut && i < samples.length; i += 1) samples[samples.length - 1 - i]! *= i / fadeOut;
  return samples;
}

/** Folds the end of a buffer over its start, so it loops without a click. */
export function makeLoop(samples: Float32Array, crossfadeSeconds: number): Float32Array {
  const overlap = Math.floor(crossfadeSeconds * SAMPLE_RATE);
  const length = samples.length - overlap;
  const out = samples.slice(0, length);
  for (let i = 0; i < overlap; i += 1) {
    const t = i / overlap;
    const fadeIn = Math.sin((t * Math.PI) / 2);
    const fadeOut = Math.cos((t * Math.PI) / 2);
    out[i] = out[i]! * fadeIn + samples[length + i]! * fadeOut;
  }
  return out;
}

export const seconds = (s: number): Float32Array => new Float32Array(Math.floor(s * SAMPLE_RATE));

/**
 * The manual "pop": a tight transient, a falling pitched body and a breath of air.
 * Variation numbers shift every component so repeats do not machine-gun.
 */
export function synthPop(variation: number, sampleRate = SAMPLE_RATE): Float32Array {
  const rng = new Rng(1000 + variation * 91);
  const duration = 0.17;
  const out = new Float32Array(Math.floor(duration * sampleRate));
  const base = rng.range(390, 500);
  const sweep = rng.range(2.1, 2.9);
  const bodyDecay = rng.range(0.03, 0.042);
  const airHigh = new OnePole(rng.range(1800, 2600), sampleRate);
  const airLow = new OnePole(rng.range(5200, 7000), sampleRate);
  const clickHigh = new OnePole(3400, sampleRate);
  let phase = 0;
  for (let i = 0; i < out.length; i += 1) {
    const t = i / sampleRate;
    const frequency = base * (1 + (sweep - 1) * Math.exp(-t / 0.0075));
    phase += (2 * Math.PI * frequency) / sampleRate;
    const attack = Math.min(1, t / 0.0006);
    const body = Math.sin(phase + 0.35 * Math.sin(phase * 2)) * Math.exp(-t / bodyDecay) * attack;
    const noise = rng.next() * 2 - 1;
    const click = clickHigh.high(noise) * Math.exp(-t / 0.0016) * attack;
    const air = airLow.low(airHigh.high(noise)) * Math.exp(-t / 0.024) * attack;
    out[i] = Math.tanh((body * 0.85 + click * 0.55 + air * 0.5) * 1.5);
  }
  const tail = Math.floor(0.012 * sampleRate);
  for (let i = 0; i < tail; i += 1) out[out.length - 1 - i]! *= i / tail;
  return normalizePeak(out, 0.82);
}

/** Softer, duller crackle for machines. */
export function synthCrackle(variation: number, sampleRate = SAMPLE_RATE): Float32Array {
  const rng = new Rng(5000 + variation * 53);
  const out = new Float32Array(Math.floor(0.08 * sampleRate));
  const band = new OnePole(rng.range(900, 1500), sampleRate);
  const lowPass = new OnePole(rng.range(3500, 4800), sampleRate);
  for (let i = 0; i < out.length; i += 1) {
    const t = i / sampleRate;
    const noise = rng.next() * 2 - 1;
    const env = Math.min(1, t / 0.0004) * Math.exp(-t / 0.011);
    out[i] = lowPass.low(band.high(noise)) * env;
  }
  return normalizePeak(out, 0.6);
}
