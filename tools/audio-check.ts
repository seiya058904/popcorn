import { execFileSync, spawnSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { LOAD_ORDER, SOUND_RECIPES } from '../src/audio/bank.ts';
import { SAMPLE_RATE, synthCrackle, synthPop } from '../src/audio/dsp.ts';

/**
 * Technical audio checks: clipping, true peak, loudness, DC offset, loop seams and variation.
 * These cannot judge whether something sounds good; that still needs human ears.
 */
const outDir = join('artifacts', 'audio');
mkdirSync(outDir, { recursive: true });

function writeWav(path: string, samples: Float32Array): void {
  const data = Buffer.alloc(samples.length * 2);
  samples.forEach((value, index) => data.writeInt16LE(Math.round(Math.max(-1, Math.min(1, value)) * 32767), index * 2));
  const header = Buffer.alloc(44);
  header.write('RIFF', 0);
  header.writeUInt32LE(36 + data.length, 4);
  header.write('WAVEfmt ', 8);
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20);
  header.writeUInt16LE(1, 22);
  header.writeUInt32LE(SAMPLE_RATE, 24);
  header.writeUInt32LE(SAMPLE_RATE * 2, 28);
  header.writeUInt16LE(2, 32);
  header.writeUInt16LE(16, 34);
  header.write('data', 36);
  header.writeUInt32LE(data.length, 40);
  writeFileSync(path, Buffer.concat([header, data]));
}

function mixInto(target: Float32Array, source: Float32Array, at: number, gain: number, rate = 1): void {
  const start = Math.floor(at * SAMPLE_RATE);
  const length = Math.floor(source.length / rate);
  for (let i = 0; i < length && start + i < target.length; i += 1) {
    const position = i * rate;
    const index = Math.floor(position);
    const next = source[Math.min(index + 1, source.length - 1)]!;
    target[start + i]! += (source[index]! + (next - source[index]!) * (position - index)) * gain;
  }
}

const loopInto = (target: Float32Array, source: Float32Array, gain: number): void => {
  for (let i = 0; i < target.length; i += 1) target[i]! += source[i % source.length]! * gain;
};

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

function analyze(name: string, samples: Float32Array, picture = false): Report {
  let peak = 0;
  let sum = 0;
  let clipped = 0;
  for (const value of samples) {
    const abs = Math.abs(value);
    peak = Math.max(peak, abs);
    sum += value;
    if (abs >= 0.999) clipped += 1;
  }
  const path = join(outDir, `${name}.wav`);
  writeWav(path, samples);
  const log = spawnSync('ffmpeg', ['-hide_banner', '-nostats', '-i', path, '-af', 'apad=pad_dur=1,ebur128=peak=true', '-f', 'null', '-'], { encoding: 'utf8' }).stderr;
  const summary = log.slice(log.lastIndexOf('Summary:'));
  const lufs = /I:\s+(-?[\d.]+) LUFS/.exec(summary);
  const truePeak = /Peak:\s+(-?[\d.]+) dBFS/.exec(summary);
  if (picture) execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-i', path, '-filter_complex', 'showwavespic=s=1400x180:colors=0xffc84a', '-frames:v', '1', join(outDir, `${name}.png`)]);
  return {
    name,
    seconds: Number((samples.length / SAMPLE_RATE).toFixed(2)),
    peakDb: db(peak),
    truePeakDb: truePeak ? Number(truePeak[1]) : null,
    lufs: lufs ? Number(lufs[1]) : null,
    clipped,
    dc: Number((sum / samples.length).toFixed(5)),
  };
}

const bank = new Map<string, Float32Array>();
for (const name of LOAD_ORDER) bank.set(name, SOUND_RECIPES[name]!());
const reports = LOAD_ORDER.map((name) => {
  const samples = bank.get(name)!;
  const report = analyze(name, samples);
  if (name.startsWith('layer') || name.startsWith('music') || name === 'cannon-charge') {
    // The jump across the loop point, relative to typical sample-to-sample movement.
    let movement = 0;
    for (let i = 1; i < samples.length; i += 1) movement += Math.abs(samples[i]! - samples[i - 1]!);
    report.seam = Number((Math.abs(samples[0]! - samples[samples.length - 1]!) / (movement / samples.length + 1e-6)).toFixed(1));
  }
  return report;
});
console.table(reports);

// Mixes that mirror the engine's gains at master 0.85, music 0.6, effects 0.9.
const MASTER = 0.85;
const MUSIC = 0.6 * MASTER;
const FX = 0.9 * MASTER;
const scale = [0, 2, 4, 7, 9, 12, 14, 16, 19, 21, 24];
const pops = Array.from({ length: 8 }, (_, index) => synthPop(index));
const crackles = Array.from({ length: 5 }, (_, index) => synthCrackle(index));

const early = new Float32Array(SAMPLE_RATE * 12);
loopInto(early, bank.get('music-home-bed')!, MUSIC);
loopInto(early, bank.get('music-home-lead')!, MUSIC * 0.8);
loopInto(early, bank.get('layer-crackle')!, FX * 0.6);
for (let click = 0; click < 36; click += 1) {
  const step = scale[Math.min(Math.floor(click / 3), scale.length - 1)]!;
  mixInto(early, pops[click % pops.length]!, click * 0.33, FX * 0.83, 2 ** (step / 12));
}

const rapid = new Float32Array(SAMPLE_RATE * 6);
loopInto(rapid, bank.get('music-home-bed')!, MUSIC);
for (let click = 0; click < 60; click += 1) {
  const step = scale[Math.min(Math.floor(click / 3), scale.length - 1)]!;
  mixInto(rapid, pops[click % pops.length]!, click * 0.1, FX * 0.83, 2 ** (step / 12));
}

const late = new Float32Array(SAMPLE_RATE * 12);
loopInto(late, bank.get('music-world-bed')!, MUSIC);
loopInto(late, bank.get('music-world-lead')!, MUSIC * 0.6);
loopInto(late, bank.get('layer-dense')!, FX * 0.2);
loopInto(late, bank.get('layer-rain')!, FX * 0.9);
loopInto(late, bank.get('layer-rumble')!, FX * 0.85);
for (let index = 0; index < 60; index += 1) mixInto(late, crackles[index % crackles.length]!, index * 0.19, FX * 0.2);

const blast = new Float32Array(SAMPLE_RATE * 5);
loopInto(blast, bank.get('music-home-bed')!, MUSIC);
mixInto(blast, bank.get('break-blast')!, 1, FX);
mixInto(blast, bank.get('break-whoosh')!, 1, FX);

const mixes = [analyze('mix-early', early, true), analyze('mix-rapid-10cps', rapid, true), analyze('mix-late', late, true), analyze('mix-breakout', blast, true)];
console.table(mixes);

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

// The compressor in the engine catches short overs, so raw mixes may touch the ceiling briefly.
const problems: string[] = [];
for (const report of reports) {
  if (report.clipped > 0) problems.push(`${report.name}: clipped samples`);
  if ((report.truePeakDb ?? 0) > -0.3) problems.push(`${report.name}: true peak ${report.truePeakDb}`);
  if (Math.abs(report.dc) > 0.01) problems.push(`${report.name}: DC offset ${report.dc}`);
  if ((report.seam ?? 0) > 12) problems.push(`${report.name}: audible loop seam (${report.seam})`);
}
for (const mix of mixes) {
  if ((mix.lufs ?? 0) > -12 || (mix.lufs ?? -99) < -26) problems.push(`${mix.name}: loudness ${mix.lufs} LUFS outside -26..-12`);
}
if (problems.length > 0) {
  console.error(problems.join('\n'));
  process.exit(1);
}
console.log('All technical audio checks passed.');
