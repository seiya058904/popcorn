import { Rng } from '../motion/rng.ts';
import { Biquad, fadeEdges, makeLoop, normalizePeak, normalizeRms, OnePole, SAMPLE_RATE, seconds, synthCrackle } from './dsp.ts';
import { MUSIC_HOME, MUSIC_WORLD, renderMusic } from './music.ts';

const TAU = Math.PI * 2;

/** Scatters short grains across a buffer; the density is what separates each production layer. */
function grainBed(
  lengthSeconds: number,
  grainsPerSecond: number,
  seed: number,
  grainGain: () => number,
  grains: Float32Array[] = Array.from({ length: 6 }, (_, i) => synthCrackle(i + 20)),
): Float32Array {
  const rng = new Rng(seed);
  const out = seconds(lengthSeconds + 0.5);
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

/** Plays a sound slower and lower, the way a bigger object would make it. */
function stretched(source: Float32Array, factor: number): Float32Array {
  const out = new Float32Array(Math.floor(source.length * factor));
  for (let i = 0; i < out.length; i += 1) {
    const position = i / factor;
    const index = Math.floor(position);
    const next = source[Math.min(index + 1, source.length - 1)]!;
    out[i] = source[index]! + (next - source[index]!) * (position - index);
  }
  return out;
}

/** Struck metal: unrelated partials, the high ones dying first. */
const struck = (frequencies: number[], decay: number, level = 1) => (t: number): number => {
  let sum = 0;
  frequencies.forEach((frequency, index) => {
    sum += (Math.sin(TAU * frequency * t) * Math.exp(-t / (decay / (1 + index * 0.55)))) / (1 + index * 0.5);
  });
  return sum * Math.min(1, t / 0.0015) * level;
};

/** A dull knock: wood, steel doors and anything else that stops suddenly. */
function knock(frequency: number, decay: number, seed: number, duration = 0.2): Float32Array {
  const out = seconds(duration);
  const rng = new Rng(seed);
  const band = new Biquad('band', frequency * 2.4, 1.4);
  for (let i = 0; i < out.length; i += 1) {
    const t = i / SAMPLE_RATE;
    const pitch = frequency * (1 + 0.5 * Math.exp(-t / 0.012));
    out[i] = Math.sin(TAU * pitch * t) * Math.exp(-t / decay) + band.run(rng.next() * 2 - 1) * Math.exp(-t / (decay * 0.3)) * 0.8;
  }
  return out;
}

function hiss(duration: number, seed: number, hz: number, q: number, envelope: (u: number) => number): Float32Array {
  const band = new Biquad('band', hz, q);
  return burstNoise(duration, seed, band, (t) => envelope(t / duration));
}

/** A propeller: a low drone chopped by its blades, for `duration` seconds. */
const propeller = (duration: number, hz: number, bladeHz: number, slide: number) => (t: number): number => {
  const u = t / duration;
  const pitch = hz * (1 + slide * (0.5 - u));
  const chop = 0.55 + 0.45 * Math.sin(TAU * bladeHz * t * (1 + slide * (0.5 - u)));
  return (Math.sin(TAU * pitch * t) + 0.5 * Math.sin(TAU * pitch * 2 * t) + 0.22 * Math.sin(TAU * pitch * 3.02 * t)) * chop;
};

/** A spring let go: a pitch that wobbles and settles, for toasters and bounces. */
function boing(duration: number, hz: number, depth: number): Float32Array {
  return tone(duration, (t) => {
    const wobble = Math.exp(-t * 9);
    const phase = TAU * hz * t - (depth / 24) * Math.cos(TAU * 24 * t) * wobble;
    return Math.sin(phase) * Math.min(1, t / 0.004) * Math.exp(-t / (duration * 0.4)) * 0.5;
  });
}

/** One organ pipe: a soft-started flue tone with octave and twelfth, and a breath of wind. */
function organPipe(duration: number, hz: number, level = 1): Float32Array {
  const out = tone(duration, (t) => {
    const attack = Math.min(1, t / 0.035);
    const release = Math.min(1, (duration - t) / 0.15);
    return (Math.sin(TAU * hz * t) + 0.42 * Math.sin(TAU * hz * 2 * t) + 0.2 * Math.sin(TAU * hz * 3 * t) + 0.08 * Math.sin(TAU * hz * 4 * t)) * attack * release * 0.24 * level;
  });
  mixIn(out, hiss(Math.min(0.2, duration), Math.round(hz), hz * 3, 1.2, (u) => (1 - u) * 0.3 * level), 0);
  return out;
}

export const SOUND_RECIPES: Record<string, () => Float32Array> = {
  // Production layers, quietest to loudest. `mix.ts` decides how they cross over.
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
  // Popcorn by the truckload: the same crackle, but from much bigger pieces.
  'layer-hail': () => {
    const heavy = Array.from({ length: 6 }, (_, i) => stretched(synthCrackle(i + 40), 2.3 + i * 0.12));
    const bed = grainBed(6, 300, 306, () => 0.5, heavy);
    const body = new Biquad('band', 620, 0.6);
    const mass = filteredNoise(6, 307, (n) => body.run(n));
    for (let i = 0; i < Math.min(bed.length, mass.length); i += 1) bed[i]! += mass[i]! * 0.5;
    return normalizeRms(bed, 0.085, 0.55);
  },
  // No single pops left: one continuous mass, breathing like surf.
  'layer-roar': () => {
    const length = 8;
    const rng = new Rng(308);
    const low = new Biquad('band', 170, 0.7);
    const mid = new Biquad('band', 430, 0.6);
    const high = new Biquad('band', 1100, 0.7);
    const out = seconds(length + 0.5);
    for (let i = 0; i < out.length; i += 1) {
      const t = i / SAMPLE_RATE;
      const n = rng.next() * 2 - 1;
      out[i] =
        low.run(n) * 1.6 * (0.72 + 0.28 * Math.sin((TAU * 3 * t) / length)) +
        mid.run(n) * 1.1 * (0.7 + 0.3 * Math.sin((TAU * 5 * t) / length + 1.3)) +
        high.run(n) * 0.34 * (0.65 + 0.35 * Math.sin((TAU * 7 * t) / length + 2.4));
    }
    return normalizeRms(makeLoop(out, 0.5), 0.1, 0.6);
  },
  'layer-rumble': () => {
    const length = 7;
    const low = new Biquad('low', 120, 0.8);
    const lower = new Biquad('low', 60, 0.8);
    const bed = filteredNoise(length, 305, (n) => low.run(n) * 0.6 + lower.run(n) * 1.3);
    // Two close bass tones beat slowly against each other, so the ground seems to heave.
    for (let i = 0; i < bed.length; i += 1) {
      const t = i / SAMPLE_RATE;
      bed[i]! += (Math.sin((TAU * 287 * t) / length) + Math.sin((TAU * 304 * t) / length)) * 0.035;
    }
    return normalizeRms(bed, 0.11, 0.6);
  },
  // The last stretch turns from noise into something like a choir, on the world theme's tonic.
  'layer-swell': () => {
    const length = 12;
    const out = seconds(length);
    // Whole cycles per loop, so every partial closes on itself.
    const partials: Array<[number, number, number]> = [
      [55, 0.9, 1], [82.5, 0.6, 2], [110, 0.75, 3], [165, 0.42, 2], [220, 0.34, 5], [330, 0.2, 3], [440, 0.16, 7], [660, 0.09, 4], [880, 0.06, 5],
    ];
    for (let i = 0; i < out.length; i += 1) {
      const t = i / SAMPLE_RATE;
      let sum = 0;
      for (const [hz, level, drift] of partials) {
        const cycles = Math.round(hz * length);
        const slow = 0.6 + 0.4 * Math.sin((TAU * drift * t) / length + hz);
        sum += (Math.sin((TAU * cycles * t) / length) + Math.sin((TAU * (cycles + drift) * t) / length)) * level * slow;
      }
      out[i] = sum;
    }
    return normalizeRms(out, 0.06, 0.5);
  },

  // Machines at work, kept short and low so that dozens of them stay a texture.
  'work-pan': () => {
    const out = seconds(0.3);
    [0, 0.05, 0.095, 0.13].forEach((at, i) => mixIn(out, tone(0.09, struck([1760, 3120, 4510], 0.03, 1 - i * 0.18)), at));
    return fadeEdges(normalizePeak(out, 0.11), 0, 0.03);
  },
  'work-cart': () => {
    const out = seconds(0.34);
    mixIn(out, tone(0.3, struck([520, 1240, 2230], 0.09)), 0);
    mixIn(out, hiss(0.2, 110, 2400, 0.8, (u) => Math.sin(u * Math.PI)), 0.05, 0.3);
    return fadeEdges(normalizePeak(out, 0.13), 0, 0.03);
  },
  'work-cinema': () => {
    const out = seconds(0.55);
    mixIn(out, knock(240, 0.05, 111), 0, 0.6);
    const grains = grainBed(0.3, 90, 112, () => 0.6);
    mixIn(out, grains, 0.04, 0.8);
    return fadeEdges(normalizePeak(out, 0.14), 0, 0.08);
  },
  'work-factory': () => {
    const out = seconds(0.7);
    mixIn(out, hiss(0.34, 113, 3400, 0.7, (u) => Math.min(1, u * 14) * (1 - u) ** 2), 0);
    mixIn(out, knock(92, 0.09, 114, 0.3), 0.02, 0.7);
    return fadeEdges(normalizePeak(out, 0.15), 0, 0.06);
  },
  'work-volcano': () => {
    const out = boom(0.9, 96, 38, 0.2, 115);
    return fadeEdges(normalizePeak(out, 0.2), 0, 0.1);
  },
  // The drop hatch: a latch, the flutter of the load falling away, the propellers behind it.
  'airship-drop': () => {
    const out = seconds(0.95);
    mixIn(out, knock(330, 0.03, 116, 0.1), 0, 0.8);
    mixIn(out, knock(210, 0.05, 117, 0.14), 0.07, 0.6);
    const flutter = new Biquad('band', 1500, 1.1);
    const falling = new Rng(118);
    const air = seconds(0.72);
    for (let i = 0; i < air.length; i += 1) {
      const u = i / air.length;
      flutter.set(2300 - 1700 * u);
      air[i] = flutter.run(falling.next() * 2 - 1) * Math.sin(u * Math.PI) * (0.65 + 0.35 * Math.sin(TAU * 26 * u));
    }
    mixIn(out, air, 0.08, 1.1);
    mixIn(out, tone(0.9, (t) => propeller(0.9, 74, 19, 0)(t) * Math.sin((t / 0.9) * Math.PI) * 0.12), 0);
    return fadeEdges(normalizePeak(out, 0.17), 0.002, 0.08);
  },

  // Each machine announces itself differently when it arrives.
  'arrive-pan': () => {
    const out = seconds(1.05);
    mixIn(out, tone(0.5, struck([412, 1023, 1876, 2640], 0.16)), 0);
    // The lid lands a moment later and spins itself flat, like a dropped coin.
    let at = 0.2;
    for (let i = 0, gap = 0.1; i < 11; i += 1, gap *= 0.86) {
      mixIn(out, tone(0.07, struck([1980, 3330, 5120], 0.018, 0.56 + i * 0.015)), at);
      at += gap;
    }
    return fadeEdges(normalizePeak(out, 0.42), 0, 0.06);
  },
  'arrive-microwave': () => {
    const out = seconds(0.85);
    mixIn(out, knock(120, 0.07, 120, 0.25), 0, 1);
    mixIn(out, knock(420, 0.03, 121, 0.1), 0.24, 0.55);
    for (const at of [0.36, 0.52]) {
      mixIn(out, tone(0.1, (t) => Math.sign(Math.sin(TAU * 1975 * t)) * 0.22 * Math.min(1, t / 0.003) * Math.min(1, (0.1 - t) / 0.006)), at);
    }
    const soft = new Biquad('low', 5200, 0.7);
    for (let i = 0; i < out.length; i += 1) out[i] = soft.run(out[i]!);
    return fadeEdges(normalizePeak(out, 0.38), 0, 0.04);
  },
  'arrive-cart': () => {
    const out = seconds(1.3);
    const rattle = new Biquad('band', 560, 1.2);
    mixIn(out, burstNoise(0.75, 122, rattle, (t) => Math.min(1, t / 0.08) * (1 - t / 0.75) * (0.55 + 0.45 * Math.sign(Math.sin(TAU * 13 * t)))), 0, 0.8);
    mixIn(out, knock(150, 0.08, 123, 0.25), 0.72, 0.9);
    // A bicycle bell on the handlebar: two quick rings.
    for (const at of [0.8, 0.95]) mixIn(out, tone(0.35, struck([2093, 2794, 4190, 5588], 0.14, 0.6)), at);
    return fadeEdges(normalizePeak(out, 0.4), 0, 0.06);
  },
  'arrive-cannon': () => {
    const out = boom(1.2, 120, 36, 0.22, 124);
    for (let i = 0; i < 7; i += 1) mixIn(out, tone(0.08, struck([2240 + i * 170, 3700 - i * 90], 0.02, 0.16)), 0.09 + i * 0.043);
    return fadeEdges(normalizePeak(out, 0.62), 0, 0.12);
  },
  'arrive-cinema': () => {
    const out = seconds(1.7);
    // A harp run as it rises through the floor, then the marquee's big finish.
    [262, 330, 392, 523, 659, 784, 1047, 1319].forEach((hz, i) => mixIn(out, tone(0.6, bell(hz, 0.2, 0.34)), 0.1 + i * 0.1));
    [523, 659, 784, 1047].forEach((hz) => mixIn(out, tone(0.7, bell(hz, 0.3, 0.42)), 1.02));
    mixIn(out, knock(110, 0.1, 125, 0.3), 1.02, 0.5);
    return fadeEdges(normalizePeak(out, 0.42), 0, 0.1);
  },
  'arrive-truck': () => {
    const out = seconds(1.9);
    for (const at of [0, 0.34, 0.68, 1.02]) mixIn(out, tone(0.17, (t) => Math.sin(TAU * 1046 * t) * Math.min(1, t / 0.005) * Math.min(1, (0.17 - t) / 0.01) * 0.2), at);
    mixIn(out, hiss(0.34, 126, 4200, 0.6, (u) => Math.min(1, u * 20) * (1 - u) ** 2), 1.22, 0.7);
    for (const hz of [311, 392]) mixIn(out, tone(0.22, (t) => Math.sign(Math.sin(TAU * hz * t)) * 0.16 * Math.min(1, t / 0.01) * Math.min(1, (0.22 - t) / 0.03)), 1.56);
    const soft = new Biquad('low', 3400, 0.7);
    for (let i = 0; i < out.length; i += 1) out[i] = soft.run(out[i]!);
    return fadeEdges(normalizePeak(out, 0.36), 0, 0.03);
  },
  'arrive-factory': () => {
    const out = seconds(1.95);
    [0.13, 0.53, 0.93].forEach((at, i) => {
      mixIn(out, knock(150 - i * 18, 0.07, 127 + i, 0.24), at, 0.9);
      mixIn(out, tone(0.1, struck([1540, 2610], 0.03, 0.3)), at);
    });
    // Shift whistle: two pipes a third apart, with steam around them.
    mixIn(out, tone(0.62, (t) => (Math.sin(TAU * 784 * t) + 0.8 * Math.sin(TAU * 988 * t) + 0.2 * Math.sin(TAU * 1568 * t)) * Math.min(1, t / 0.05) * Math.min(1, (0.62 - t) / 0.12) * 0.2), 1.22);
    mixIn(out, hiss(0.66, 130, 5200, 0.5, (u) => Math.sin(u * Math.PI)), 1.2, 0.2);
    return fadeEdges(normalizePeak(out, 0.4), 0, 0.05);
  },
  'arrive-airship': () => {
    const length = 1.9;
    const out = tone(length, (t) => {
      const u = t / length;
      return propeller(length, 86, 23, 0.34)(t) * Math.sin(Math.min(1, u * 1.1) * Math.PI) ** 1.5 * 0.24;
    });
    mixIn(out, hiss(length, 131, 900, 0.5, (u) => Math.sin(u * Math.PI) ** 2), 0, 0.26);
    return fadeEdges(normalizePeak(out, 0.32), 0.03, 0.1);
  },
  'arrive-volcano': () => {
    const rng = new Rng(132);
    const low = new Biquad('low', 110, 1.1);
    const out = seconds(2);
    for (let i = 0; i < out.length; i += 1) {
      const u = i / out.length;
      out[i] = low.run(rng.next() * 2 - 1) * 3 * Math.min(1, u * 3.6) * (1 - u) ** 1.4;
    }
    mixIn(out, boom(1.4, 170, 34, 0.3, 133), 0.74, 1.1);
    const debris = new Biquad('band', 1500, 0.8);
    mixIn(out, burstNoise(0.9, 134, debris, (t) => Math.exp(-t / 0.26) * (0.6 + 0.4 * Math.sin(TAU * 31 * t))), 0.78, 0.5);
    return fadeEdges(normalizePeak(out, 0.62), 0.02, 0.12);
  },
  'arrive-orbital': () => {
    const out = seconds(2.1);
    mixIn(out, hiss(1.45, 135, 2300, 0.45, (u) => Math.min(1, u * 5) * (1 - u) ** 0.6), 0, 0.9);
    mixIn(out, tone(0.9, (t) => Math.sin(TAU * (240 * t + 170 * t * t)) * Math.sin((t / 0.9) * Math.PI) * 0.16), 0.5);
    mixIn(out, knock(170, 0.08, 136, 0.28), 1.42, 1);
    mixIn(out, tone(0.1, struck([1320, 2470], 0.03, 0.4)), 1.46);
    // Docked: a clean sonar ping out into the dark.
    mixIn(out, tone(0.58, bell(1760, 0.18, 0.36)), 1.56);
    return fadeEdges(normalizePeak(out, 0.4), 0.01, 0.05);
  },

  // The five later machines: their work and their arrival.
  'work-toaster': () => {
    const out = seconds(0.6);
    mixIn(out, boing(0.24, 250, 110), 0, 0.8);
    mixIn(out, tone(0.5, bell(2093, 0.14, 0.5)), 0.05);
    return fadeEdges(normalizePeak(out, 0.13), 0, 0.05);
  },
  'work-mixer': () => {
    const out = tone(0.5, (t) => {
      const u = t / 0.5;
      const hz = 95 + 70 * u;
      return (Math.sin(TAU * hz * t) + 0.45 * Math.sin(TAU * hz * 2 * t) + 0.2 * Math.sign(Math.sin(TAU * hz * 3 * t))) * Math.sin(u * Math.PI) * 0.3;
    });
    mixIn(out, hiss(0.5, 140, 1800, 0.9, (u) => Math.sin(u * Math.PI) * 0.6), 0);
    return fadeEdges(normalizePeak(out, 0.12), 0.01, 0.06);
  },
  'work-organ': () => {
    const out = seconds(0.75);
    mixIn(out, organPipe(0.7, 392), 0);
    mixIn(out, organPipe(0.7, 587, 0.5), 0.02);
    return fadeEdges(normalizePeak(out, 0.13), 0, 0.12);
  },
  'work-train': () => {
    const out = seconds(0.7);
    // A two-note steam whistle with a breath of steam round it.
    mixIn(out, tone(0.55, (t) => (Math.sin(TAU * 740 * t) + 0.8 * Math.sin(TAU * 932 * t) + 0.3 * Math.sin(TAU * 1480 * t)) * Math.min(1, t / 0.04) * Math.min(1, (0.55 - t) / 0.12) * 0.22), 0.04);
    mixIn(out, hiss(0.62, 141, 3800, 0.5, (u) => Math.min(1, u * 8) * (1 - u)), 0, 0.5);
    return fadeEdges(normalizePeak(out, 0.13), 0, 0.06);
  },
  'work-typhoon': () => {
    const out = seconds(1);
    const sweep = new Biquad('band', 500, 0.9);
    const rng = new Rng(142);
    for (let i = 0; i < out.length; i += 1) {
      const u = i / out.length;
      sweep.set(380 + 700 * Math.sin(u * Math.PI));
      out[i] = sweep.run(rng.next() * 2 - 1) * Math.sin(u * Math.PI) ** 1.5;
    }
    return fadeEdges(normalizePeak(out, 0.16), 0.02, 0.1);
  },
  'arrive-toaster': () => {
    const out = seconds(1.25);
    mixIn(out, knock(180, 0.06, 143, 0.2), 0.42, 0.9);
    mixIn(out, boing(0.32, 230, 90), 0.43, 0.8);
    mixIn(out, boing(0.24, 300, 60), 0.72, 0.5);
    mixIn(out, tone(0.5, bell(2093, 0.16, 0.42)), 0.9);
    return fadeEdges(normalizePeak(out, 0.38), 0, 0.06);
  },
  'arrive-mixer': () => {
    const out = seconds(1.3);
    const scrape = new Biquad('band', 700, 1.4);
    mixIn(out, burstNoise(0.78, 144, scrape, (t) => Math.min(1, t / 0.05) * (1 - t / 0.78)), 0, 0.45);
    mixIn(out, knock(160, 0.07, 145, 0.25), 0.8, 0.8);
    // The motor turns over twice, like a greeting.
    for (const at of [0.88, 1.06]) mixIn(out, tone(0.14, (t) => Math.sin(TAU * (120 + 400 * t) * t) * Math.sin((t / 0.14) * Math.PI) * 0.3), at);
    return fadeEdges(normalizePeak(out, 0.36), 0, 0.05);
  },
  'arrive-organ': () => {
    const out = seconds(1.9);
    // The lift hums up, then a full chord swells in, a fanfare on the pipes.
    mixIn(out, tone(0.95, (t) => Math.sin(TAU * (60 + 30 * t) * t) * Math.sin((t / 0.95) * Math.PI) * 0.2), 0);
    for (const [hz, delay] of [[262, 0.95], [330, 1.0], [392, 1.05], [523, 1.1]] as const) mixIn(out, organPipe(0.8, hz, 0.7), delay);
    return fadeEdges(normalizePeak(out, 0.42), 0.02, 0.12);
  },
  'arrive-train': () => {
    const out = seconds(2);
    // Chuffs slowing as it pulls in, the brakes, then the bell.
    let at = 0;
    for (let i = 0, gap = 0.13; i < 9; i += 1, gap *= 1.11) {
      mixIn(out, hiss(0.11, 146 + i, 900, 0.8, (u) => (1 - u) ** 2), at, 0.9 - i * 0.05);
      at += gap;
    }
    mixIn(out, hiss(0.4, 156, 4200, 0.6, (u) => Math.min(1, u * 10) * (1 - u) ** 1.5), 1.45, 0.5);
    for (const t of [1.6, 1.78]) mixIn(out, tone(0.3, struck([1568, 2350, 3920], 0.12, 0.5)), t);
    return fadeEdges(normalizePeak(out, 0.36), 0, 0.05);
  },
  'arrive-typhoon': () => {
    const out = seconds(1.7);
    const sweep = new Biquad('band', 300, 0.8);
    const rng = new Rng(157);
    for (let i = 0; i < out.length; i += 1) {
      const u = i / out.length;
      sweep.set(200 + 1300 * u * u);
      out[i] = sweep.run(rng.next() * 2 - 1) * Math.min(1, u * 1.6) * (1 - u) ** 0.5;
    }
    mixIn(out, boom(0.9, 90, 40, 0.25, 158), 1.05, 0.6);
    return fadeEdges(normalizePeak(out, 0.4), 0.02, 0.1);
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
  // A kitchen timer's clear little bell.
  ding: () => fadeEdges(normalizePeak(tone(0.7, bell(2637, 0.16, 0.5)), 0.2), 0, 0.05),
  'truck-horn': () => {
    const out = seconds(0.42);
    for (const frequency of [311, 392]) mixIn(out, tone(0.36, (t) => Math.sign(Math.sin(TAU * frequency * t)) * 0.3 * Math.min(1, t / 0.01) * Math.min(1, (0.36 - t) / 0.04)), 0);
    const soft = new Biquad('low', 1800, 0.7);
    for (let i = 0; i < out.length; i += 1) out[i] = soft.run(out[i]!);
    return fadeEdges(normalizePeak(out, 0.18), 0.004, 0.03);
  },
  'orbital-zap': () => fadeEdges(normalizePeak(tone(0.3, (t) => Math.sin(TAU * (1800 * t - 2200 * t * t)) * Math.exp(-t / 0.08)), 0.14), 0, 0.03),
  combo: () => {
    const out = seconds(0.42);
    [880, 1319].forEach((frequency, i) => mixIn(out, tone(0.36, bell(frequency, 0.09, 0.55)), i * 0.05));
    return fadeEdges(normalizePeak(out, 0.3), 0, 0.04);
  },
  milestone: () => {
    const out = seconds(1);
    [659, 880, 1047, 1319, 1760].forEach((frequency, i) => mixIn(out, tone(0.72, bell(frequency, 0.17, 0.55)), i * 0.055));
    return fadeEdges(normalizePeak(out, 0.5), 0, 0.08);
  },
  unveil: () => {
    const out = seconds(1.3);
    const air = new Biquad('band', 1500, 0.8);
    mixIn(out, burstNoise(0.55, 44, air, (t) => Math.sin(Math.min(1, t / 0.55) * Math.PI)), 0, 0.28);
    [523, 784, 1047].forEach((frequency, i) => mixIn(out, tone(0.9, bell(frequency, 0.26, 0.5)), 0.3 + i * 0.07));
    return fadeEdges(normalizePeak(out, 0.48), 0, 0.1);
  },
  // Interface sounds: one family of soft wooden clicks and small bells, short and quiet, so
  // touching the interface feels like handling a well-made toy. Pitch varies a little per play.
  'ui-press': () => fadeEdges(normalizePeak(knock(1150, 0.011, 81, 0.06), 0.2), 0, 0.01),
  'ui-release': () =>
    fadeEdges(normalizePeak(tone(0.07, (t) => Math.sin(TAU * (620 * t + 2600 * t * t)) * Math.min(1, t / 0.002) * Math.exp(-t / 0.018)), 0.15), 0, 0.01),
  'ui-tab': () => {
    const out = seconds(0.08);
    mixIn(out, knock(1700, 0.009, 82, 0.06), 0);
    mixIn(out, burstNoise(0.02, 83, new Biquad('band', 4200, 1.4), (t) => Math.exp(-t / 0.004)), 0, 0.5);
    return fadeEdges(normalizePeak(out, 0.21), 0, 0.01);
  },
  'ui-switch-on': () => {
    const out = seconds(0.16);
    mixIn(out, knock(1500, 0.01, 84, 0.05), 0);
    mixIn(out, tone(0.1, bell(1319, 0.035, 0.5)), 0.02);
    mixIn(out, tone(0.1, bell(1760, 0.035, 0.45)), 0.055);
    return fadeEdges(normalizePeak(out, 0.22), 0, 0.02);
  },
  'ui-switch-off': () => {
    const out = seconds(0.16);
    mixIn(out, knock(1300, 0.01, 85, 0.05), 0);
    mixIn(out, tone(0.1, bell(1760, 0.035, 0.45)), 0.02);
    mixIn(out, tone(0.1, bell(1175, 0.035, 0.5)), 0.055);
    return fadeEdges(normalizePeak(out, 0.2), 0, 0.02);
  },
  'ui-shutter': () => {
    const out = seconds(0.2);
    // A camera shutter: the blade's snap, a breath of air, and the mirror settling back.
    mixIn(out, knock(2200, 0.008, 91, 0.06), 0);
    mixIn(out, burstNoise(0.05, 92, new Biquad('band', 4200, 1.4), (t) => Math.exp(-t / 0.012)), 0.004, 0.5);
    mixIn(out, knock(1500, 0.01, 93, 0.05), 0.075);
    return fadeEdges(normalizePeak(out, 0.24), 0, 0.02);
  },
  'ui-tick': () => fadeEdges(normalizePeak(burstNoise(0.018, 86, new Biquad('band', 3200, 2.2), (t) => Math.exp(-t / 0.0035)), 0.12), 0, 0.004),
  'ui-open': () => {
    const out = seconds(0.32);
    // Air rising through three bands reads as a sweep without a moving filter.
    [700, 1200, 2000].forEach((hz, i) => mixIn(out, burstNoise(0.16, 87 + i, new Biquad('band', hz, 1.2), (t) => Math.sin(Math.min(1, t / 0.16) * Math.PI)), i * 0.045, 0.32));
    mixIn(out, tone(0.18, bell(1568, 0.06, 0.4)), 0.13);
    return fadeEdges(normalizePeak(out, 0.17), 0.005, 0.04);
  },
  'ui-close': () => {
    const out = seconds(0.2);
    [1800, 1100, 650].forEach((hz, i) => mixIn(out, burstNoise(0.1, 90 + i, new Biquad('band', hz, 1.2), (t) => Math.sin(Math.min(1, t / 0.1) * Math.PI)), i * 0.03, 0.3));
    return fadeEdges(normalizePeak(out, 0.13), 0.004, 0.03);
  },
  'ui-success': () => {
    const out = seconds(0.36);
    mixIn(out, tone(0.25, bell(1047, 0.07, 0.55)), 0);
    mixIn(out, tone(0.28, bell(1568, 0.08, 0.5)), 0.06);
    return fadeEdges(normalizePeak(out, 0.24), 0, 0.04);
  },
  'ui-deny': () => {
    const out = seconds(0.24);
    mixIn(out, knock(190, 0.04, 93, 0.12), 0);
    mixIn(out, knock(160, 0.045, 94, 0.12), 0.085);
    return fadeEdges(normalizePeak(out, 0.3), 0, 0.03);
  },
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

SOUND_RECIPES['moon-heat'] = () => {
  const rng = new Rng(90);
  const low = new Biquad('low', 120, 1.4);
  const band = new Biquad('band', 500, 1.2);
  const out = seconds(4.6);
  for (let i = 0; i < out.length; i += 1) {
    const t = i / SAMPLE_RATE;
    const u = t / 4.6;
    band.set(240 + 2400 * u * u);
    const n = rng.next() * 2 - 1;
    out[i] = (low.run(n) * 2.2 + band.run(n) * u + Math.sin(TAU * (34 + 38 * u) * t) * 0.55) * u * u;
  }
  return fadeEdges(normalizePeak(out, 0.7), 0.3, 0.03);
};
SOUND_RECIPES['moon-pop'] = () => {
  const out = boom(5, 240, 26, 1.4, 91);
  mixIn(out, tone(0.5, (t) => Math.sin(TAU * (520 * t - 300 * t * t)) * Math.exp(-t / 0.08) * 1.4), 0);
  const air = new Biquad('high', 1200);
  mixIn(out, burstNoise(2, 92, air, (t) => Math.exp(-t / 0.5)), 0, 0.5);
  [196, 247, 294, 392].forEach((frequency) => mixIn(out, tone(3.8, bell(frequency, 1.2, 0.2)), 0.5));
  return fadeEdges(normalizePeak(out, 0.86), 0, 0.5);
};
SOUND_RECIPES['hand-whoosh'] = () => {
  const rng = new Rng(93);
  const band = new Biquad('band', 200, 0.7);
  const out = seconds(3.4);
  for (let i = 0; i < out.length; i += 1) {
    const u = i / out.length;
    band.set(90 + 700 * Math.sin(u * Math.PI) ** 2);
    out[i] = band.run(rng.next() * 2 - 1) * Math.sin(u * Math.PI);
  }
  return normalizePeak(out, 0.55);
};
SOUND_RECIPES['hand-grab'] = () => {
  const out = boom(1.6, 110, 40, 0.3, 94);
  const crunch = new Biquad('band', 1300, 0.8);
  mixIn(out, burstNoise(0.5, 95, crunch, (t) => Math.exp(-t / 0.1)), 0.02, 1.2);
  return fadeEdges(normalizePeak(out, 0.8), 0, 0.12);
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
