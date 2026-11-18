import { Rng } from '../motion/rng.ts';
import { Biquad, normalizeRms, SAMPLE_RATE } from './dsp.ts';

export interface MusicSpec {
  seed: number;
  bpm: number;
  /** MIDI note of the tonic. */
  root: number;
  /** One chord per half bar: semitone offset of the chord root plus its voicing. */
  chords: Array<[number, number[]]>;
  /** Melody as [beat, scale-free semitone offset from root, length in beats]. */
  melody: Array<[number, number, number]>;
  swing: number;
  brushLevel: number;
}

const mtof = (midi: number): number => 440 * 2 ** ((midi - 69) / 12);

const MAJ7 = [0, 4, 7, 11];
const MIN7 = [0, 3, 7, 10];
const DOM7 = [0, 4, 7, 10];
const SIX = [0, 4, 7, 9];
const MIN6 = [0, 3, 7, 9];
const DIM = [0, 3, 6, 9];

/** Bright lounge shuffle for the kitchen-sized part of the game. */
export const MUSIC_HOME: MusicSpec = {
  seed: 11,
  bpm: 104,
  root: 60,
  swing: 0.62,
  brushLevel: 1,
  chords: [
    [2, MIN7], [7, DOM7], [0, MAJ7], [9, DOM7],
    [2, MIN7], [7, DOM7], [4, MIN7], [9, DOM7],
    [5, MAJ7], [5, MIN6], [0, SIX], [9, DOM7],
    [2, MIN7], [7, DOM7], [0, SIX], [7, DOM7],
    [2, MIN7], [7, DOM7], [0, MAJ7], [9, DOM7],
    [2, MIN7], [7, DOM7], [4, MIN7], [9, DOM7],
    [5, MAJ7], [6, DIM], [0, SIX], [9, DOM7],
    [2, MIN7], [7, DOM7], [0, SIX], [0, SIX],
  ],
  melody: [
    [0, 16, 1], [1, 14, 0.5], [1.5, 12, 0.5], [2, 9, 1.5], [4, 11, 1], [5, 14, 1], [6, 17, 1.5],
    [8, 16, 0.5], [8.5, 19, 1], [10, 21, 1], [11, 19, 1], [12, 16, 2],
    [16, 17, 1], [17, 16, 0.5], [17.5, 14, 0.5], [18, 12, 1], [19.5, 14, 0.5], [20, 16, 1.5], [22, 11, 1],
    [24, 12, 1], [25, 16, 1], [26, 19, 1], [27, 24, 1.5], [29, 21, 1],
    [32, 21, 1], [33, 19, 0.5], [33.5, 17, 0.5], [34, 21, 1.5], [36, 20, 1], [37, 17, 1], [38, 14, 1.5],
    [40, 16, 1], [41, 19, 0.5], [41.5, 21, 0.5], [42, 24, 1.5], [44, 21, 1], [45, 18, 1],
    [48, 17, 1], [49, 14, 1], [50, 11, 1], [51, 14, 1], [52, 12, 3],
    [56, 16, 0.5], [56.5, 14, 0.5], [57, 12, 0.5], [57.5, 9, 0.5], [58, 7, 1], [59, 11, 1], [60, 12, 2.5],
  ],
};

/** Grander, slower and in a minor color: the world has started to notice. */
export const MUSIC_WORLD: MusicSpec = {
  seed: 29,
  bpm: 92,
  root: 57,
  swing: 0.58,
  brushLevel: 0.8,
  chords: [
    [0, MIN7], [5, DOM7], [10, MAJ7], [3, MAJ7],
    [8, MAJ7], [2, MIN6], [7, DOM7], [7, DOM7],
    [0, MIN7], [5, DOM7], [10, MAJ7], [3, MAJ7],
    [8, MAJ7], [7, DOM7], [0, MIN6], [0, MIN6],
    [5, MIN7], [10, DOM7], [3, MAJ7], [8, MAJ7],
    [2, DIM], [7, DOM7], [0, MIN7], [0, MIN7],
    [5, MIN7], [10, DOM7], [3, MAJ7], [8, MAJ7],
    [2, DIM], [7, DOM7], [0, MIN6], [7, DOM7],
  ],
  melody: [
    [0, 12, 2], [2, 15, 1], [3, 17, 1], [4, 19, 3], [8, 22, 1.5], [10, 19, 1], [11, 17, 1], [12, 15, 3],
    [16, 12, 2], [18, 15, 1], [19, 17, 1], [20, 19, 2], [22, 24, 2], [24, 23, 2], [26, 19, 1], [27, 14, 1], [28, 15, 3],
    [32, 17, 1.5], [33.5, 20, 0.5], [34, 22, 2], [36, 24, 2], [38, 22, 1], [39, 20, 1], [40, 18, 2], [42, 19, 2], [44, 15, 3],
    [48, 17, 1.5], [49.5, 20, 0.5], [50, 22, 2], [52, 24, 1], [53, 27, 2], [56, 26, 2], [58, 23, 2], [60, 24, 3],
  ],
};

export interface MusicStems {
  bed: Float32Array;
  lead: Float32Array;
}

/** Adds into a looping buffer, so tails wrap around to the start of the track. */
function addVoice(buffer: Float32Array, startSeconds: number, seconds: number, voice: (t: number) => number): void {
  const start = Math.floor(startSeconds * SAMPLE_RATE);
  const count = Math.floor(seconds * SAMPLE_RATE);
  const length = buffer.length;
  for (let i = 0; i < count; i += 1) buffer[(start + i) % length]! += voice(i / SAMPLE_RATE);
}

function bassNote(frequency: number, level: number): (t: number) => number {
  return (t) => {
    const w = 2 * Math.PI * frequency * t;
    const pluck = Math.min(1, t / 0.006) * Math.exp(-t / 0.42);
    const thump = Math.exp(-t / 0.028) * 0.5;
    return (Math.sin(w) + 0.42 * Math.sin(2 * w) * Math.exp(-t / 0.16) + 0.16 * Math.sin(3 * w) * Math.exp(-t / 0.08)) * pluck * level * (1 + thump);
  };
}

function keysNote(frequency: number, level: number): (t: number) => number {
  // Tine electric piano: a bell-like attack settling into a warm tone.
  return (t) => {
    const w = 2 * Math.PI * frequency * t;
    const modulator = Math.sin(w * 7) * 1.1 * Math.exp(-t / 0.09) + Math.sin(w) * 0.5 * Math.exp(-t / 0.5);
    return Math.sin(w + modulator) * Math.min(1, t / 0.004) * Math.exp(-t / 0.62) * level;
  };
}

function vibesNote(frequency: number, level: number): (t: number) => number {
  return (t) => {
    const w = 2 * Math.PI * frequency * t;
    const tremolo = 1 + 0.2 * Math.sin(2 * Math.PI * 5.2 * t);
    const body = Math.sin(w) + 0.32 * Math.sin(w * 4) * Math.exp(-t / 0.16) + 0.1 * Math.sin(w * 10) * Math.exp(-t / 0.035);
    return body * Math.min(1, t / 0.0025) * Math.exp(-t / 0.95) * tremolo * level;
  };
}

/** Renders a seamless 16-bar loop as two stems, so the lead can come and go with the action. */
export function renderMusic(spec: MusicSpec): MusicStems {
  const rng = new Rng(spec.seed);
  const beat = 60 / spec.bpm;
  const beats = 64;
  const length = Math.floor(beats * beat * SAMPLE_RATE);
  const bass = new Float32Array(length);
  const keys = new Float32Array(length);
  const brush = new Float32Array(length);
  const lead = new Float32Array(length);
  const swung = (b: number): number => {
    const whole = Math.floor(b);
    const fraction = b - whole;
    return (whole + (fraction === 0.5 ? spec.swing : fraction)) * beat;
  };

  spec.chords.forEach(([degree, voicing], index) => {
    const start = index * 2;
    const rootNote = spec.root - 24 + degree;
    // Walking bass: root, chord tone, then a step leading toward the next chord.
    const next = spec.chords[(index + 1) % spec.chords.length]![0];
    const line = [rootNote, rootNote + voicing[rng.int(1, 3)]!];
    const approach = spec.root - 24 + next + (next > degree ? -1 : 1);
    addVoice(bass, swung(start), beat * 2.2, bassNote(mtof(line[0]!), 0.8));
    addVoice(bass, swung(start + 1), beat * 1.1, bassNote(mtof(rng.next() < 0.5 ? line[1]! : approach), 0.66));

    // Charleston comping: a stab on the beat and another on the upbeat of two.
    const hits = index % 4 === 3 ? [0, 0.5, 1.5] : [0, 1.5];
    hits.forEach((hit, hitIndex) => {
      const when = swung(start + hit);
      voicing.forEach((interval, voice) => {
        const midi = spec.root + degree + interval - (degree > 6 ? 12 : 0);
        addVoice(keys, when + voice * 0.004, beat * 1.2, keysNote(mtof(midi), (hitIndex === 0 ? 0.2 : 0.16) * (0.9 + rng.next() * 0.2)));
      });
    });
  });

  // Brushes: a swung ride pattern and a soft sweep on two and four.
  const brushNoise = new Rng(spec.seed + 7);
  for (let b = 0; b < beats; b += 1) {
    for (const [offset, level] of [
      [0, 0.32],
      [0.5, 0.2],
    ] as const) {
      if (offset === 0.5 && b % 2 === 0) continue;
      const high = new Biquad('high', 5200);
      addVoice(brush, swung(b + offset), 0.12, (t) => high.run(brushNoise.next() * 2 - 1) * Math.min(1, t / 0.002) * Math.exp(-t / 0.032) * level);
    }
    if (b % 2 === 1) {
      const band = new Biquad('band', 1900, 0.7);
      addVoice(brush, swung(b), 0.26, (t) => band.run(brushNoise.next() * 2 - 1) * Math.min(1, t / 0.012) * Math.exp(-t / 0.075) * 0.34);
    }
    if (b % 4 === 0) {
      const low = new Biquad('low', 110);
      addVoice(brush, swung(b), 0.22, (t) => low.run(Math.sin(2 * Math.PI * 62 * t)) * Math.exp(-t / 0.08) * 1.2);
    }
  }

  for (const [when, offset, duration] of spec.melody) {
    addVoice(lead, swung(when), Math.max(1.5, duration * beat * 2.4), vibesNote(mtof(spec.root + offset), 0.42 * (0.9 + rng.next() * 0.2)));
  }

  const warmth = new Biquad('low', 5200);
  const bed = new Float32Array(length);
  for (let i = 0; i < length; i += 1) {
    bed[i] = warmth.run(bass[i]! * 0.9 + keys[i]! * 0.72) + brush[i]! * 0.42 * spec.brushLevel;
  }
  return { bed: normalizeRms(bed, 0.13, 0.82), lead: normalizeRms(lead, 0.05, 0.6) };
}
