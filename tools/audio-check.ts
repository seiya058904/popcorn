import { execFileSync, spawnSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { LOAD_ORDER, SOUND_RECIPES } from '../src/audio/bank.ts';
import { SAMPLE_RATE, synthPop } from '../src/audio/dsp.ts';
import { startHarness } from './lib/harness.ts';

/**
 * Technical audio checks: clipping, true peak, loudness, DC offset, loop seams and variation,
 * on every sound and on the real mixer, rendered offline in a browser.
 * These cannot judge whether something sounds good; that still needs human ears.
 */
const outDir = join('artifacts', 'audio');
mkdirSync(outDir, { recursive: true });

function writeWav(path: string, channels: Float32Array[]): void {
  const frames = channels[0]!.length;
  const data = Buffer.alloc(frames * channels.length * 2);
  for (let i = 0; i < frames; i += 1) {
    channels.forEach((channel, c) => data.writeInt16LE(Math.round(Math.max(-1, Math.min(1, channel[i]!)) * 32767), (i * channels.length + c) * 2));
  }
  const header = Buffer.alloc(44);
  header.write('RIFF', 0);
  header.writeUInt32LE(36 + data.length, 4);
  header.write('WAVEfmt ', 8);
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20);
  header.writeUInt16LE(channels.length, 22);
  header.writeUInt32LE(SAMPLE_RATE, 24);
  header.writeUInt32LE(SAMPLE_RATE * channels.length * 2, 28);
  header.writeUInt16LE(channels.length * 2, 32);
  header.writeUInt16LE(16, 34);
  header.write('data', 36);
  header.writeUInt32LE(data.length, 40);
  writeFileSync(path, Buffer.concat([header, data]));
}

interface Report {
  name: string;
  seconds: number;
  peakDb: number;
  truePeakDb: number | null;
  lufs: number | null;
  clipped: number;
  dc: number;
  seam?: number;
}

const db = (x: number): number => Number((20 * Math.log10(Math.max(x, 1e-9))).toFixed(1));

function analyze(name: string, channels: Float32Array[], picture = false): Report {
  let peak = 0;
  let sum = 0;
  let clipped = 0;
  for (const samples of channels) {
    for (const value of samples) {
      const abs = Math.abs(value);
      peak = Math.max(peak, abs);
      sum += value;
      if (abs >= 0.999) clipped += 1;
    }
  }
  const path = join(outDir, `${name}.wav`);
  writeWav(path, channels);
  const log = spawnSync('ffmpeg', ['-hide_banner', '-nostats', '-i', path, '-af', 'apad=pad_dur=1,ebur128=peak=true', '-f', 'null', '-'], { encoding: 'utf8' }).stderr;
  const summary = log.slice(log.lastIndexOf('Summary:'));
  const lufs = /I:\s+(-?[\d.]+) LUFS/.exec(summary);
  const truePeak = /Peak:\s+(-?[\d.]+) dBFS/.exec(summary);
  if (picture) execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-i', path, '-filter_complex', 'showwavespic=s=1400x180:colors=0xffc84a', '-frames:v', '1', join(outDir, `${name}.png`)]);
  return {
    name,
    seconds: Number((channels[0]!.length / SAMPLE_RATE).toFixed(2)),
    peakDb: db(peak),
    truePeakDb: truePeak ? Number(truePeak[1]) : null,
    lufs: lufs ? Number(lufs[1]) : null,
    clipped,
    dc: Number((sum / (channels[0]!.length * channels.length)).toFixed(5)),
  };
}

const bank = new Map<string, Float32Array>();
for (const name of LOAD_ORDER) bank.set(name, SOUND_RECIPES[name]!());
const reports = LOAD_ORDER.map((name) => {
  const samples = bank.get(name)!;
  const report = analyze(name, [samples]);
  if (name.startsWith('layer') || name.startsWith('music') || name === 'cannon-charge') {
    // The jump across the loop point, relative to typical sample-to-sample movement.
    let movement = 0;
    for (let i = 1; i < samples.length; i += 1) movement += Math.abs(samples[i]! - samples[i - 1]!);
    report.seam = Number((Math.abs(samples[0]! - samples[samples.length - 1]!) / (movement / samples.length + 1e-6)).toFixed(1));
  }
  return report;
});
console.table(reports);

// The real mixer -----------------------------------------------------------------------------

interface MixSpec {
  name: string;
  seconds: number;
  /** Everything before this is left out of the measurement, while the bed settles. */
  skip: number;
  intensity: number;
  stage: number;
  track: 'home' | 'world' | null;
  bed: boolean;
  clicks: number[];
  effects?: Array<[string, number, number]>;
}

const clicksAt = (rate: number, from: number, to: number): number[] => Array.from({ length: Math.floor((to - from) * rate) }, (_, i) => from + i / rate);

const STEADY = { seconds: 13, skip: 3 };
const SPECS: MixSpec[] = [
  { ...STEADY, name: 'mix-stove', intensity: 1, stage: 0, track: 'home', bed: true, clicks: clicksAt(3, 3, 13) },
  { ...STEADY, name: 'mix-rapid-10cps', intensity: 1.4, stage: 0, track: 'home', bed: true, clicks: clicksAt(10, 3, 13) },
  { ...STEADY, name: 'mix-kitchen', intensity: 2.5, stage: 1, track: 'home', bed: true, clicks: clicksAt(3, 3, 13) },
  { ...STEADY, name: 'mix-cinema', intensity: 4, stage: 2, track: 'world', bed: true, clicks: clicksAt(3, 3, 13) },
  { ...STEADY, name: 'mix-town', intensity: 5.5, stage: 3, track: 'world', bed: true, clicks: clicksAt(3, 3, 13) },
  { ...STEADY, name: 'mix-earth', intensity: 6.9, stage: 4, track: 'world', bed: true, clicks: clicksAt(3, 3, 13) },
  { ...STEADY, name: 'mix-earth-no-clicks', intensity: 6.9, stage: 4, track: 'world', bed: true, clicks: [] },
  { ...STEADY, name: 'mix-kitchen-no-clicks', intensity: 2.5, stage: 1, track: 'home', bed: true, clicks: [] },
  { seconds: 9, skip: 3, name: 'mix-breakout', intensity: 5.5, stage: 3, track: 'world', bed: true, clicks: [], effects: [['break-blast', 4, 1], ['break-whoosh', 4, 0.9]] },
  ...[1, 2, 3, 4, 5, 6, 7].map((intensity): MixSpec => ({ seconds: 9, skip: 3, name: `bed-${intensity}`, intensity, stage: 2, track: null, bed: true, clicks: [] })),
];

const harness = await startHarness();
const rendered = new Map<string, Float32Array[]>();
try {
  const page = await harness.open('capture=1', { width: 640, height: 360 });
  page.setDefaultTimeout(300_000);
  const encoded = await page.evaluate(
    async ({ specs, rate }) => {
      const load = (path: string): Promise<Record<string, never>> => import(/* @vite-ignore */ path);
      const { SOUND_RECIPES: recipes } = (await load('/src/audio/bank.ts')) as unknown as typeof import('../src/audio/bank.ts');
      const { MixGraph } = (await load('/src/audio/graph.ts')) as unknown as typeof import('../src/audio/graph.ts');
      const { BED_LAYERS, bedMix } = (await load('/src/audio/mix.ts')) as unknown as typeof import('../src/audio/mix.ts');
      const { synthPop: pop } = (await load('/src/audio/dsp.ts')) as unknown as typeof import('../src/audio/dsp.ts');
      const samples = new Map<string, Float32Array>();
      const sound = (name: string): Float32Array => {
        let found = samples.get(name);
        if (!found) {
          found = recipes[name]!();
          samples.set(name, found);
        }
        return found;
      };
      const pops = Array.from({ length: 8 }, (_, i) => pop(i));
      const levels = { master: 0.85, music: 0.6, effects: 0.9, ui: 0.7 };
      const scale = [0, 2, 4, 7, 9, 12, 14, 16, 19, 21, 24];
      const out: Record<string, string[]> = {};
      for (const spec of specs) {
        const context = new OfflineAudioContext(2, Math.floor(spec.seconds * rate), rate);
        const buffer = (data: Float32Array): AudioBuffer => {
          const made = context.createBuffer(1, data.length, rate);
          made.copyToChannel(data as Float32Array<ArrayBuffer>, 0);
          return made;
        };
        const graph = new MixGraph(context);
        graph.applyLevels(levels, false, 0);
        graph.setSpace(spec.stage, 0.001);
        const mix = bedMix(spec.intensity);
        if (spec.bed) for (const layer of BED_LAYERS) graph.startBedLayer(layer, buffer(sound(layer)), 0.001);
        graph.setBed(mix, 0, 0.05);
        const start = (name: string, destination: AudioNode, when: number, gainValue: number, loop: boolean, playback = 1): void => {
          const source = context.createBufferSource();
          source.buffer = buffer(sound(name));
          source.loop = loop;
          source.playbackRate.value = playback;
          const gain = context.createGain();
          gain.gain.value = gainValue;
          source.connect(gain).connect(destination);
          source.start(when);
        };
        if (spec.track) {
          start(`music-${spec.track}-bed`, graph.music, 0.001, 1, true);
          start(`music-${spec.track}-lead`, graph.music, 0.001, 0.7, true);
        }
        spec.clicks.forEach((when, index) => {
          const source = context.createBufferSource();
          source.buffer = buffer(pops[index % pops.length]!);
          source.playbackRate.value = 2 ** (scale[Math.min(Math.floor(index / 3) % 12, scale.length - 1)]! / 12);
          const gain = context.createGain();
          gain.gain.value = 0.83;
          source.connect(gain).connect(graph.sfx);
          source.start(when);
          graph.duckBed(mix.clickDuck, when);
        });
        for (const [name, when, volume] of spec.effects ?? []) {
          start(name, graph.sfx, when, volume, false);
          graph.duckBed(0.6, when);
        }
        const result = await context.startRendering();
        const first = Math.floor(spec.skip * rate);
        out[spec.name] = [0, 1].map((channel) => {
          const data = result.getChannelData(channel).subarray(first);
          const bytes = new Uint8Array(new Float32Array(data).buffer);
          let text = '';
          for (let i = 0; i < bytes.length; i += 32768) text += String.fromCharCode(...bytes.subarray(i, i + 32768));
          return btoa(text);
        });
      }
      return out;
    },
    { specs: SPECS, rate: SAMPLE_RATE },
  );
  for (const [name, channels] of Object.entries(encoded)) {
    rendered.set(
      name,
      channels.map((text) => {
        const bytes = Buffer.from(text, 'base64');
        return new Float32Array(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.length));
      }),
    );
  }
} finally {
  await harness.close();
}

const mixes = SPECS.map((spec) => analyze(spec.name, rendered.get(spec.name)!, spec.name.startsWith('mix') && !spec.name.endsWith('no-clicks')));
console.table(mixes);
const mixReport = (name: string): Report => mixes.find((mix) => mix.name === name)!;

/** Energy below `hz` as a share of the whole, from a one-pole split. */
function lowShare(channels: Float32Array[], hz: number): number {
  const k = 1 - Math.exp((-2 * Math.PI * hz) / SAMPLE_RATE);
  let low = 0;
  let lowEnergy = 0;
  let energy = 0;
  for (const value of channels[0]!) {
    low += k * (value - low);
    lowEnergy += low * low;
    energy += value * value;
  }
  return lowEnergy / Math.max(energy, 1e-12);
}

/** How far a click stands above everything else in the 70 ms after it, in decibels. */
function clickClarity(withClicks: Float32Array[], without: Float32Array[], times: number[]): number {
  let clickEnergy = 0;
  let restEnergy = 0;
  const window = Math.floor(0.07 * SAMPLE_RATE);
  for (const time of times) {
    const start = Math.floor(time * SAMPLE_RATE);
    for (let i = start; i < start + window && i < withClicks[0]!.length; i += 1) {
      for (let c = 0; c < 2; c += 1) {
        clickEnergy += (withClicks[c]![i]! - without[c]![i]!) ** 2;
        restEnergy += without[c]![i]! ** 2;
      }
    }
  }
  return Number((10 * Math.log10(clickEnergy / Math.max(restEnergy, 1e-12))).toFixed(1));
}

const clickTimes = clicksAt(3, 0, 10);
const clarity = {
  kitchen: clickClarity(rendered.get('mix-kitchen')!, rendered.get('mix-kitchen-no-clicks')!, clickTimes),
  earth: clickClarity(rendered.get('mix-earth')!, rendered.get('mix-earth-no-clicks')!, clickTimes),
};
const bass = {
  kitchen: Number(lowShare(rendered.get('bed-2')!, 110).toFixed(3)),
  earth: Number(lowShare(rendered.get('bed-7')!, 110).toFixed(3)),
};
console.log('Click above everything else (dB):', clarity);
console.log('Share of the heap below 110 Hz:', bass);

const pops = Array.from({ length: 8 }, (_, index) => synthPop(index));
let maxSimilarity = 0;
for (let a = 0; a < pops.length; a += 1) {
  for (let b = a + 1; b < pops.length; b += 1) {
    let dot = 0;
    let na = 0;
    let nb = 0;
    const length = Math.min(pops[a]!.length, pops[b]!.length);
    for (let i = 0; i < length; i += 1) {
      dot += pops[a]![i]! * pops[b]![i]!;
      na += pops[a]![i]! ** 2;
      nb += pops[b]![i]! ** 2;
    }
    maxSimilarity = Math.max(maxSimilarity, Math.abs(dot) / Math.sqrt(na * nb));
  }
}
console.log(`Highest waveform similarity between pop variations: ${maxSimilarity.toFixed(3)}`);

const problems: string[] = [];
for (const report of reports) {
  if (report.clipped > 0) problems.push(`${report.name}: clipped samples`);
  if ((report.truePeakDb ?? 0) > -0.3) problems.push(`${report.name}: true peak ${report.truePeakDb}`);
  if (Math.abs(report.dc) > 0.01) problems.push(`${report.name}: DC offset ${report.dc}`);
  if ((report.seam ?? 0) > 12) problems.push(`${report.name}: audible loop seam (${report.seam})`);
}
for (const mix of mixes) {
  if (mix.clipped > 0) problems.push(`${mix.name}: clipped samples`);
  if ((mix.truePeakDb ?? 0) > 0) problems.push(`${mix.name}: true peak ${mix.truePeakDb}`);
  if (mix.name.startsWith('mix') && !mix.name.endsWith('breakout') && ((mix.lufs ?? 0) > -12 || (mix.lufs ?? -99) < -26)) problems.push(`${mix.name}: loudness ${mix.lufs} LUFS outside -26..-12`);
}
// The heap must keep getting bigger, all the way up.
for (let level = 2; level <= 7; level += 1) {
  const quieter = mixReport(`bed-${level - 1}`).lufs ?? -99;
  const louder = mixReport(`bed-${level}`).lufs ?? -99;
  if (louder < quieter + 0.5) problems.push(`bed loudness does not grow from ${level - 1} (${quieter}) to ${level} (${louder})`);
}
if ((mixReport('bed-7').lufs ?? 0) > -15) problems.push(`the bed alone is too loud at the top: ${mixReport('bed-7').lufs} LUFS`);
if (clarity.earth < -9) problems.push(`clicks are buried at the end of the game: ${clarity.earth} dB`);
if (bass.earth <= bass.kitchen) problems.push('the heap should sound heavier at the end than in the kitchen');
if (problems.length > 0) {
  console.error(problems.join('\n'));
  process.exit(1);
}
console.log('All technical audio checks passed.');
