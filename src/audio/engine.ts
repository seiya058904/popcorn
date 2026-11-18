import { Rng } from '../motion/rng.ts';
import { SAMPLE_RATE, synthCrackle, synthPop } from './dsp.ts';

const POP_VARIATIONS = 8;
const CRACKLE_VARIATIONS = 5;
const MAX_VOICES = 12;
/** Combo pitch climbs a major pentatonic, so fast clicking stays musical. */
const COMBO_SCALE = [0, 2, 4, 7, 9, 12, 14, 16, 19, 21, 24];

interface Voice {
  source: AudioBufferSourceNode;
  gain: GainNode;
  ends: number;
}

/** Created lazily on the first gesture, as browsers require. */
export class AudioEngine {
  private context: AudioContext | null = null;
  private master: GainNode | null = null;
  private pops: AudioBuffer[] = [];
  private crackles: AudioBuffer[] = [];
  private voices: Voice[] = [];
  private readonly rng = new Rng(31);
  private lastPop = -1;

  unlock(): void {
    if (this.context) {
      if (this.context.state === 'suspended') void this.context.resume();
      return;
    }
    const context = new AudioContext({ latencyHint: 'interactive' });
    this.context = context;
    const compressor = context.createDynamicsCompressor();
    compressor.threshold.value = -14;
    compressor.ratio.value = 4;
    compressor.attack.value = 0.002;
    compressor.release.value = 0.12;
    this.master = context.createGain();
    this.master.gain.value = 0.75;
    this.master.connect(compressor).connect(context.destination);
    const toBuffer = (samples: Float32Array): AudioBuffer => {
      const buffer = context.createBuffer(1, samples.length, SAMPLE_RATE);
      buffer.copyToChannel(new Float32Array(samples), 0);
      return buffer;
    };
    this.pops = Array.from({ length: POP_VARIATIONS }, (_, i) => toBuffer(synthPop(i)));
    this.crackles = Array.from({ length: CRACKLE_VARIATIONS }, (_, i) => toBuffer(synthCrackle(i)));
  }

  private play(buffer: AudioBuffer, rate: number, volume: number): void {
    const { context, master } = this;
    if (!context || !master) return;
    const now = context.currentTime;
    this.voices = this.voices.filter((voice) => voice.ends > now);
    if (this.voices.length >= MAX_VOICES) {
      const oldest = this.voices.shift()!;
      oldest.gain.gain.setTargetAtTime(0, now, 0.004);
      oldest.source.stop(now + 0.02);
    }
    const source = context.createBufferSource();
    source.buffer = buffer;
    source.playbackRate.value = rate;
    const gain = context.createGain();
    gain.gain.value = volume;
    source.connect(gain).connect(master);
    source.start(now);
    this.voices.push({ source, gain, ends: now + buffer.duration / rate });
  }

  pop(combo: number): void {
    if (this.pops.length === 0) return;
    let index = this.rng.int(0, POP_VARIATIONS);
    if (index === this.lastPop) index = (index + 1) % POP_VARIATIONS;
    this.lastPop = index;
    const step = COMBO_SCALE[Math.min(Math.floor(combo / 3), COMBO_SCALE.length - 1)]!;
    const rate = 2 ** (step / 12) * this.rng.range(0.97, 1.03);
    this.play(this.pops[index]!, rate, this.rng.range(0.74, 0.92));
  }

  crackle(): void {
    if (this.crackles.length === 0) return;
    const buffer = this.crackles[this.rng.int(0, CRACKLE_VARIATIONS)]!;
    this.play(buffer, this.rng.range(0.85, 1.25), this.rng.range(0.14, 0.26));
  }
}
