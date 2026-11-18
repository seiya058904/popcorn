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

export function normalizePeak(samples: Float32Array, peak: number): Float32Array {
  let max = 0;
  for (const sample of samples) max = Math.max(max, Math.abs(sample));
  if (max > 0) {
    const gain = peak / max;
    for (let i = 0; i < samples.length; i += 1) samples[i]! *= gain;
  }
  return samples;
}

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
    const mixed = body * 0.85 + click * 0.55 + air * 0.5;
    out[i] = Math.tanh(mixed * 1.5);
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
