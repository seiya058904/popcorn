import { Rng } from '../motion/rng.ts';
import { Biquad, fadeEdges, makeLoop, normalizePeak, normalizeRms, OnePole, SAMPLE_RATE, seconds, synthCrackle } from './dsp.ts';
import { MUSIC_HOME, MUSIC_WORLD, renderMusic } from './music.ts';

const TAU = Math.PI * 2;

/** Scatters short grains across a buffer; the density is what separates each production layer. */
function grainBed(lengthSeconds: number, grainsPerSecond: number, seed: number, grainGain: () => number): Float32Array {
  const rng = new Rng(seed);
  const out = seconds(lengthSeconds + 0.5);
  const grains = Array.from({ length: 6 }, (_, i) => synthCrackle(i + 20));
  const count = Math.floor(grainsPerSecond * lengthSeconds);
  for (let n = 0; n < count; n += 1) {
    const grain = grains[rng.int(0, grains.length)]!;
    const start = rng.int(0, out.length - grain.length);
    const gain = grainGain() * rng.range(0.4, 1);
    for (let i = 0; i < grain.length; i += 1) out[start + i]! += grain[i]! * gain;
  }
  return makeLoop(out, 0.5);
}

function filteredNoise(lengthSeconds: number, seed: number, shape: (noise: number) => number): Float32Array {
  const rng = new Rng(seed);
  const out = seconds(lengthSeconds + 0.5);
  for (let i = 0; i < out.length; i += 1) out[i] = shape(rng.next() * 2 - 1);
  return makeLoop(out, 0.5);
}

function burstNoise(duration: number, seed: number, filter: Biquad, envelope: (t: number) => number): Float32Array {
  const rng = new Rng(seed);
  const out = seconds(duration);
  for (let i = 0; i < out.length; i += 1) out[i] = filter.run(rng.next() * 2 - 1) * envelope(i / SAMPLE_RATE);
  return out;
}

function mixIn(target: Float32Array, source: Float32Array, atSeconds: number, gain = 1): void {
  const start = Math.floor(atSeconds * SAMPLE_RATE);
  for (let i = 0; i < source.length && start + i < target.length; i += 1) target[start + i]! += source[i]! * gain;
}

function tone(duration: number, voice: (t: number) => number): Float32Array {
  const out = seconds(duration);
  for (let i = 0; i < out.length; i += 1) out[i] = voice(i / SAMPLE_RATE);
  return out;
}

const bell = (frequency: number, decay: number, level = 1) => (t: number): number =>
  (Math.sin(TAU * frequency * t) + 0.5 * Math.sin(TAU * frequency * 2.01 * t) * Math.exp(-t / (decay * 0.5)) + 0.22 * Math.sin(TAU * frequency * 3.9 * t) * Math.exp(-t / (decay * 0.2))) *
  Math.min(1, t / 0.002) *
  Math.exp(-t / decay) *
  level;

function boom(duration: number, startHz: number, endHz: number, decay: number, seed: number): Float32Array {
  const out = seconds(duration);
  const rng = new Rng(seed);
  const low = new Biquad('low', 900);
  const lowNoise = new Biquad('low', 180);
  let phase = 0;
  for (let i = 0; i < out.length; i += 1) {
    const t = i / SAMPLE_RATE;
    const frequency = endHz + (startHz - endHz) * Math.exp(-t / 0.05);
    phase += (TAU * frequency) / SAMPLE_RATE;
    const noise = rng.next() * 2 - 1;
    const crack = low.run(noise) * Math.exp(-t / 0.05) * 1.3;
    const rumble = lowNoise.run(noise) * Math.exp(-t / (decay * 0.8)) * 3.2;
    out[i] = Math.tanh((Math.sin(phase) * Math.exp(-t / decay) * 1.4 + crack + rumble) * 1.5);
  }
  return out;
}

export const SOUND_RECIPES: Record<string, () => Float32Array> = {
  // Production layers, quietest to loudest.
  'layer-crackle': () => normalizeRms(grainBed(7, 16, 301, () => 0.7), 0.05, 0.5),
  'layer-dense': () => normalizeRms(grainBed(6, 110, 302, () => 0.55), 0.075, 0.55),
  'layer-rain': () => {
    const band = new Biquad('band', 3200, 0.55);
    const air = new OnePole(900);
    const bed = filteredNoise(6, 303, (n) => air.high(band.run(n)));
    const grains = grainBed(6.0, 240, 304, () => 0.4);
    for (let i = 0; i < Math.min(bed.length, grains.length); i += 1) bed[i]! += grains[i]! * 0.45;
    return normalizeRms(bed, 0.075, 0.5);
  },
  'layer-rumble': () => {
    const low = new Biquad('low', 120, 0.8);
    const lower = new Biquad('low', 60, 0.8);
    return normalizeRms(filteredNoise(7, 305, (n) => low.run(n) * 0.6 + lower.run(n) * 1.3), 0.1, 0.55);
  },

  buy: () => {
    const out = seconds(0.3);
    mixIn(out, tone(0.28, bell(1320, 0.07, 0.6)), 0);
    mixIn(out, tone(0.26, bell(1980, 0.06, 0.45)), 0.05);
    const wood = new Biquad('band', 420, 2);
    mixIn(out, burstNoise(0.05, 40, wood, (t) => Math.exp(-t / 0.012)), 0, 1.4);
    return fadeEdges(normalizePeak(out, 0.6), 0, 0.02);
  },
  shovel: () => {
    const scrape = new Biquad('band', 2400, 0.9);
    const out = seconds(0.5);
    mixIn(out, burstNoise(0.28, 41, scrape, (t) => Math.min(1, t / 0.05) * Math.exp(-t / 0.09)), 0);
    const crunch = new Biquad('band', 900, 0.8);
    mixIn(out, burstNoise(0.22, 42, crunch, (t) => Math.exp(-t / 0.05)), 0.14, 1.5);
    return fadeEdges(normalizePeak(out, 0.5), 0, 0.03);
  },
  shake: () => {
    const out = seconds(0.62);
    const hiss = new Biquad('high', 5200);
    for (let i = 0; i < 7; i += 1) {
      mixIn(out, burstNoise(0.08, 50 + i, hiss, (t) => Math.min(1, t / 0.008) * Math.exp(-t / 0.024)), i * 0.075, i % 2 ? 0.7 : 1);
    }
    return fadeEdges(normalizePeak(out, 0.42), 0, 0.03);
  },
  chime: () => {
    const out = seconds(1.4);
    [1047, 1319, 1568, 2093].forEach((frequency, i) => mixIn(out, tone(1.1, bell(frequency, 0.32, 0.55)), i * 0.075));
    return fadeEdges(normalizePeak(out, 0.55), 0, 0.1);
  },
  achievement: () => {
    const out = seconds(1.1);
    [784, 988, 1175, 1568].forEach((frequency, i) => mixIn(out, tone(0.8, bell(frequency, 0.2, i === 3 ? 0.8 : 0.55)), i * 0.09));
    return fadeEdges(normalizePeak(out, 0.5), 0, 0.08);
  },
  boing: () =>
    fadeEdges(
      normalizePeak(
        tone(0.5, (t) => Math.sin(TAU * (260 * t + (150 / 13) * (1 - Math.exp(-t * 13)) * (1 + 0.25 * Math.sin(t * 60)))) * Math.min(1, t / 0.004) * Math.exp(-t / 0.14)),
        0.42,
      ),
      0,
      0.03,
    ),
  catch: () => {
    const out = seconds(0.9);
    [1319, 1760, 2349, 2637, 3136].forEach((frequency, i) => mixIn(out, tone(0.5, bell(frequency, 0.13, 0.5)), i * 0.045));
    return fadeEdges(normalizePeak(out, 0.55), 0, 0.06);
  },

  'cannon-charge': () => {
    // A rattling loop; the engine raises its pitch with the pressure.
    const rng = new Rng(60);
    const out = seconds(1.5);
    const band = new Biquad('band', 750, 1.6);
    const hiss = new Biquad('high', 3800);
    for (let i = 0; i < out.length; i += 1) {
      const t = i / SAMPLE_RATE;
      const gate = Math.pow(Math.max(0, Math.sin(TAU * 14 * t)), 8);
      const n = rng.next() * 2 - 1;
      out[i] = band.run(n) * gate * 1.6 + hiss.run(n) * 0.12 + Math.sin(TAU * 58 * t) * 0.16;
    }
    return normalizePeak(makeLoop(out, 0.2), 0.5);
  },
  'cannon-fire': () => fadeEdges(normalizePeak(boom(1.5, 190, 46, 0.42, 61), 0.88), 0, 0.12),
  'cannon-perfect': () => {
    const out = seconds(1.2);
    [523, 659, 784, 1047, 1319].forEach((frequency, i) => mixIn(out, tone(0.9, bell(frequency, 0.24, 0.6)), i * 0.05));
    return fadeEdges(normalizePeak(out, 0.55), 0, 0.08);
  },
  'cannon-oops': () => {
    const out = seconds(1.3);
    mixIn(out, tone(0.5, (t) => Math.sin(TAU * (900 * t - 700 * t * t)) * Math.exp(-t / 0.16) * 0.8), 0);
    const hiss = new Biquad('high', 2600);
    mixIn(out, burstNoise(0.6, 62, hiss, (t) => Math.exp(-t / 0.2)), 0, 0.4);
    // A descending, deflated slide: the comedy beat of a blown lid.
    mixIn(out, tone(0.7, (t) => Math.sin(TAU * (330 * t - 170 * t * t) + 0.8 * Math.sin(TAU * 7 * t)) * Math.min(1, t / 0.02) * Math.max(0, 1 - t / 0.7) * 0.7), 0.42);
    return fadeEdges(normalizePeak(out, 0.6), 0, 0.05);
  },
  'pigeons': () => {
    const out = seconds(0.9);
    const band = new Biquad('band', 1300, 1.1);
    for (let i = 0; i < 10; i += 1) {
      mixIn(out, burstNoise(0.07, 70 + i, band, (t) => Math.sin(Math.min(1, t / 0.06) * Math.PI)), i * 0.075, 1 - i * 0.06);
    }
    return fadeEdges(normalizePeak(out, 0.3), 0, 0.05);
  },

  'break-strain': () => {
    const rng = new Rng(80);
    const low = new Biquad('low', 200, 1.2);
    const band = new Biquad('band', 800, 1);
    const out = seconds(0.62);
    for (let i = 0; i < out.length; i += 1) {
      const t = i / SAMPLE_RATE;
      const u = t / 0.62;
      band.set(500 + 2600 * u * u);
      const n = rng.next() * 2 - 1;
      out[i] = (low.run(n) * 2 + band.run(n) * (0.5 + u) + Math.sin(TAU * (50 + 70 * u) * t) * 0.6) * u * u;
    }
    return fadeEdges(normalizePeak(out, 0.72), 0.01, 0.015);
  },
  'break-blast': () => {
    const out = boom(3, 150, 34, 0.85, 81);
    const air = new Biquad('high', 1500);
    mixIn(out, burstNoise(1.2, 82, air, (t) => Math.exp(-t / 0.3)), 0, 0.5);
    return fadeEdges(normalizePeak(out, 0.86), 0, 0.3);
  },
  'break-whoosh': () => {
    const rng = new Rng(83);
    const band = new Biquad('band', 400, 0.8);
    const out = seconds(1.8);
    for (let i = 0; i < out.length; i += 1) {
      const u = i / out.length;
      band.set(260 + 2300 * Math.sin(u * Math.PI));
      out[i] = band.run(rng.next() * 2 - 1) * Math.sin(u * Math.PI);
    }
    return normalizePeak(out, 0.42);
  },
  'break-arrive': () => {
    const out = seconds(1.8);
    [392, 523, 659, 784].forEach((frequency) => mixIn(out, tone(1.6, bell(frequency, 0.5, 0.42)), 0));
    mixIn(out, tone(1.5, bell(1047, 0.4, 0.45)), 0.12);
    return fadeEdges(normalizePeak(out, 0.6), 0, 0.15);
  },
};

const STEM_CACHE = new Map<string, ReturnType<typeof renderMusic>>();
const stems = (key: string, spec: Parameters<typeof renderMusic>[0]): ReturnType<typeof renderMusic> => {
  let rendered = STEM_CACHE.get(key);
  if (!rendered) {
    rendered = renderMusic(spec);
    STEM_CACHE.set(key, rendered);
  }
  return rendered;
};

SOUND_RECIPES['music-home-bed'] = () => stems('home', MUSIC_HOME).bed;
SOUND_RECIPES['music-home-lead'] = () => stems('home', MUSIC_HOME).lead;
SOUND_RECIPES['music-world-bed'] = () => stems('world', MUSIC_WORLD).bed;
SOUND_RECIPES['music-world-lead'] = () => stems('world', MUSIC_WORLD).lead;

/** Sounds the player needs first come first, so a slow machine still gets feedback early. */
export const LOAD_ORDER: readonly string[] = Object.keys(SOUND_RECIPES).sort((a, b) => Number(a.startsWith('music')) - Number(b.startsWith('music')));
