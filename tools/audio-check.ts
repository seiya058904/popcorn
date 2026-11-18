import { execFileSync, spawnSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { SAMPLE_RATE, synthCrackle, synthPop } from '../src/audio/dsp.ts';

const outDir = join('artifacts', 'audio');
mkdirSync(outDir, { recursive: true });

export function writeWav(path: string, samples: Float32Array, sampleRate = SAMPLE_RATE): void {
  const data = Buffer.alloc(samples.length * 2);
  samples.forEach((value, index) => {
    data.writeInt16LE(Math.round(Math.max(-1, Math.min(1, value)) * 32767), index * 2);
  });
  const header = Buffer.alloc(44);
  header.write('RIFF', 0);
  header.writeUInt32LE(36 + data.length, 4);
  header.write('WAVEfmt ', 8);
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20);
  header.writeUInt16LE(1, 22);
  header.writeUInt32LE(sampleRate, 24);
  header.writeUInt32LE(sampleRate * 2, 28);
  header.writeUInt16LE(2, 32);
  header.writeUInt16LE(16, 34);
  header.write('data', 36);
  header.writeUInt32LE(data.length, 40);
  writeFileSync(path, Buffer.concat([header, data]));
}

function mixInto(target: Float32Array, source: Float32Array, at: number, gain: number, rate: number): void {
  const start = Math.floor(at * SAMPLE_RATE);
  const length = Math.floor(source.length / rate);
  for (let i = 0; i < length && start + i < target.length; i += 1) {
    const position = i * rate;
    const index = Math.floor(position);
    const next = source[Math.min(index + 1, source.length - 1)]!;
    target[start + i]! += (source[index]! + (next - source[index]!) * (position - index)) * gain;
  }
}

interface Report {
  name: string;
  peakDb: number;
  rmsDb: number;
  lufs: number | null;
  truePeakDb: number | null;
  clipped: number;
  dcOffset: number;
}

function analyze(name: string, samples: Float32Array): Report {
  let peak = 0;
  let energy = 0;
  let sum = 0;
  let clipped = 0;
  for (const value of samples) {
    const abs = Math.abs(value);
    peak = Math.max(peak, abs);
    energy += value * value;
    sum += value;
    if (abs >= 0.999) clipped += 1;
  }
  const path = join(outDir, `${name}.wav`);
  writeWav(path, samples);
  const run = spawnSync('ffmpeg', ['-hide_banner', '-nostats', '-i', path, '-af', 'apad=pad_dur=1,ebur128=peak=true', '-f', 'null', '-'], {
    encoding: 'utf8',
  });
  const log = run.stderr;
  const summary = log.slice(log.lastIndexOf('Summary:'));
  const lufs = /I:\s+(-?[\d.]+) LUFS/.exec(summary);
  const truePeak = /Peak:\s+(-?[\d.]+) dBFS/.exec(summary);
  execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-i', path, '-filter_complex', 'showwavespic=s=1200x200:colors=0xffc84a', '-frames:v', '1', join(outDir, `${name}.png`)]);
  const db = (x: number): number => Number((20 * Math.log10(Math.max(x, 1e-9))).toFixed(1));
  return {
    name,
    peakDb: db(peak),
    rmsDb: db(Math.sqrt(energy / samples.length)),
    lufs: lufs ? Number(lufs[1]) : null,
    truePeakDb: truePeak ? Number(truePeak[1]) : null,
    clipped,
    dcOffset: Number((sum / samples.length).toFixed(5)),
  };
}

const pops = Array.from({ length: 8 }, (_, index) => synthPop(index));
const crackles = Array.from({ length: 5 }, (_, index) => synthCrackle(index));

const single = new Float32Array(SAMPLE_RATE);
mixInto(single, pops[0]!, 0.1, 0.75 * 0.83, 1);

// Ten clicks per second through the master gain, climbing the combo scale like the game does.
const scale = [0, 2, 4, 7, 9, 12, 14, 16, 19, 21, 24];
const rapid = new Float32Array(SAMPLE_RATE * 6);
for (let click = 0; click < 60; click += 1) {
  const step = scale[Math.min(Math.floor(click / 3), scale.length - 1)]!;
  mixInto(rapid, pops[click % pops.length]!, click * 0.1, 0.75 * 0.83, 2 ** (step / 12));
}

const machines = new Float32Array(SAMPLE_RATE * 4);
for (let index = 0; index < 40; index += 1) {
  mixInto(machines, crackles[index % crackles.length]!, index * 0.1 + (index % 3) * 0.013, 0.75 * 0.2, 0.9 + (index % 4) * 0.1);
}

const reports = [analyze('pop-single', single), analyze('pop-rapid-10cps', rapid), analyze('machines', machines)];
console.table(reports);

// Each pop must differ audibly from the others: compare normalized waveforms pairwise.
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

const problems = reports.filter((report) => report.clipped > 0 || (report.truePeakDb ?? 0) > -0.5 || Math.abs(report.dcOffset) > 0.005);
if (problems.length > 0) {
  console.error(`Technical problems: ${problems.map((problem) => problem.name).join(', ')}`);
  process.exit(1);
}
