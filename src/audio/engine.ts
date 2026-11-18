import { IMPACTS, type ImpactLevel } from '../motion/impact.ts';
import { Rng } from '../motion/rng.ts';
import { SAMPLE_RATE, synthCrackle, synthPop } from './dsp.ts';

const POP_VARIATIONS = 8;
const CRACKLE_VARIATIONS = 5;
const MAX_VOICES = 12;
/** Combo pitch climbs a major pentatonic, so fast clicking stays musical. */
const COMBO_SCALE = [0, 2, 4, 7, 9, 12, 14, 16, 19, 21, 24];

const LAYERS = ['layer-crackle', 'layer-dense', 'layer-rain', 'layer-rumble'] as const;

interface Voice {
  source: AudioBufferSourceNode;
  gain: GainNode;
  ends: number;
}

interface LoopVoice {
  source: AudioBufferSourceNode;
  gain: GainNode;
}

export interface AudioLevels {
  master: number;
  music: number;
  effects: number;
}

const smooth = (a: number, b: number, x: number): number => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

/** Created lazily on the first gesture, as browsers require. */
export class AudioEngine {
  readonly levels: AudioLevels = { master: 0.85, music: 0.6, effects: 0.9 };
  private context: AudioContext | null = null;
  private master: GainNode | null = null;
  private sfx: GainNode | null = null;
  private musicBus: GainNode | null = null;
  private ambience: GainNode | null = null;
  private reverbSend: GainNode | null = null;
  private pops: AudioBuffer[] = [];
  private crackles: AudioBuffer[] = [];
  private readonly bank = new Map<string, AudioBuffer>();
  private voices: Voice[] = [];
  private readonly layers = new Map<string, LoopVoice>();
  private readonly tracks = new Map<string, { bed: LoopVoice; lead: LoopVoice }>();
  private charge: LoopVoice | null = null;
  private wantedTrack = 'home';
  private activeTrack = '';
  private trackStart = 0;
  private lead = 0;
  private readonly rng = new Rng(31);
  private lastPop = -1;
  private ducked = false;

  unlock(): void {
    if (this.context) {
      if (this.context.state === 'suspended') void this.context.resume();
      return;
    }
    const context = new AudioContext({ latencyHint: 'interactive' });
    this.context = context;
    const compressor = context.createDynamicsCompressor();
    compressor.threshold.value = -12;
    compressor.knee.value = 8;
    compressor.ratio.value = 5;
    compressor.attack.value = 0.002;
    compressor.release.value = 0.14;
    this.master = context.createGain();
    this.sfx = context.createGain();
    this.musicBus = context.createGain();
    this.ambience = context.createGain();
    this.reverbSend = context.createGain();
    this.reverbSend.gain.value = 0.16;
    const reverb = context.createConvolver();
    reverb.buffer = this.roomImpulse(context);
    this.sfx.connect(this.master);
    this.musicBus.connect(this.master);
    this.ambience.connect(this.master);
    this.musicBus.connect(this.reverbSend);
    this.sfx.connect(this.reverbSend);
    this.reverbSend.connect(reverb).connect(this.master);
    this.master.connect(compressor).connect(context.destination);
    this.applyLevels();

    this.pops = Array.from({ length: POP_VARIATIONS }, (_, i) => this.toBuffer(synthPop(i)));
    this.crackles = Array.from({ length: CRACKLE_VARIATIONS }, (_, i) => this.toBuffer(synthCrackle(i)));
    this.loadBank();
  }

  private roomImpulse(context: AudioContext): AudioBuffer {
    const length = Math.floor(context.sampleRate * 1.1);
    const buffer = context.createBuffer(2, length, context.sampleRate);
    for (let channel = 0; channel < 2; channel += 1) {
      const data = buffer.getChannelData(channel);
      const rng = new Rng(900 + channel);
      let low = 0;
      for (let i = 0; i < length; i += 1) {
        const t = i / context.sampleRate;
        low += 0.35 * (rng.next() * 2 - 1 - low);
        data[i] = low * Math.exp(-t / 0.28) * 0.5;
      }
    }
    return buffer;
  }

  private toBuffer(samples: Float32Array): AudioBuffer {
    const buffer = this.context!.createBuffer(1, samples.length, SAMPLE_RATE);
    buffer.copyToChannel(new Float32Array(samples), 0);
    return buffer;
  }

  private loadBank(): void {
    const worker = new Worker(new URL('./bank.worker.ts', import.meta.url), { type: 'module' });
    worker.onmessage = (event: MessageEvent<{ name: string; samples: Float32Array }>) => {
      this.bank.set(event.data.name, this.toBuffer(event.data.samples));
      if (event.data.name.startsWith('layer-')) this.startLayer(event.data.name);
      if (event.data.name.startsWith('music-')) this.syncMusic();
    };
    worker.onerror = (event) => console.warn('Sound bank failed to load', event.message);
  }

  applyLevels(): void {
    if (!this.context) return;
    const now = this.context.currentTime;
    this.master!.gain.setTargetAtTime(this.levels.master, now, 0.02);
    this.sfx!.gain.setTargetAtTime(this.levels.effects, now, 0.02);
    this.ambience!.gain.setTargetAtTime(this.levels.effects, now, 0.02);
    if (!this.ducked) this.musicBus!.gain.setTargetAtTime(this.levels.music, now, 0.02);
  }

  private loop(name: string, destination: AudioNode, gainValue: number, when = 0, offset = 0): LoopVoice | null {
    const buffer = this.bank.get(name);
    if (!buffer || !this.context) return null;
    const source = this.context.createBufferSource();
    source.buffer = buffer;
    source.loop = true;
    const gain = this.context.createGain();
    gain.gain.value = gainValue;
    source.connect(gain).connect(destination);
    source.start(when || this.context.currentTime, offset);
    return { source, gain };
  }

  private startLayer(name: string): void {
    const voice = this.loop(name, this.ambience!, 0);
    if (voice) this.layers.set(name, voice);
  }

  // Music -----------------------------------------------------------------------------

  /** Chooses the piece for the current part of the game; it crossfades in on arrival. */
  setTrack(track: 'home' | 'world'): void {
    this.wantedTrack = track;
    this.syncMusic();
  }

  private syncMusic(): void {
    const context = this.context;
    if (!context || this.activeTrack === this.wantedTrack) return;
    const name = this.wantedTrack;
    let track = this.tracks.get(name);
    if (!track) {
      if (!this.bank.has(`music-${name}-bed`) || !this.bank.has(`music-${name}-lead`)) return;
      const when = context.currentTime + 0.05;
      const bed = this.loop(`music-${name}-bed`, this.musicBus!, 0, when)!;
      const lead = this.loop(`music-${name}-lead`, this.musicBus!, 0, when)!;
      track = { bed, lead };
      this.tracks.set(name, track);
      this.trackStart = when;
    }
    const now = context.currentTime;
    for (const [key, value] of this.tracks) {
      value.bed.gain.gain.setTargetAtTime(key === name ? 1 : 0, now, 0.5);
      if (key !== name) value.lead.gain.gain.setTargetAtTime(0, now, 0.5);
    }
    this.activeTrack = name;
    void this.trackStart;
  }

  // Continuous state --------------------------------------------------------------------

  /**
   * Maps production (log10 of popcorn per second) onto the sound of popping:
   * single pops, then crackle, dense crackle, a rain of pops, and finally a roar.
   */
  update(intensity: number, activity: number): void {
    const context = this.context;
    if (!context) return;
    const now = context.currentTime;
    const gains: Record<(typeof LAYERS)[number], number> = {
      'layer-crackle': smooth(0.1, 1, intensity) * (1 - smooth(3.2, 4.6, intensity) * 0.8),
      'layer-dense': smooth(1.5, 3, intensity) * (1 - smooth(4.6, 6, intensity) * 0.75) * 0.9,
      'layer-rain': smooth(3.4, 5.2, intensity) * 0.9,
      'layer-rumble': smooth(5.2, 7.2, intensity) * 0.85,
    };
    for (const name of LAYERS) this.layers.get(name)?.gain.gain.setTargetAtTime(gains[name], now, 0.4);
    this.lead += (activity - this.lead) * 0.02;
    const track = this.tracks.get(this.activeTrack);
    track?.lead.gain.gain.setTargetAtTime(0.35 + 0.65 * Math.min(1, this.lead), now, 0.6);
  }

  // One-shots -----------------------------------------------------------------------------

  private play(buffer: AudioBuffer, rate: number, volume: number, bus: GainNode | null = this.sfx): void {
    const { context } = this;
    if (!context || !bus) return;
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
    source.connect(gain).connect(bus);
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

  effect(name: string, level: ImpactLevel = 'small', rate = 1): void {
    const buffer = this.bank.get(name);
    if (buffer) this.play(buffer, rate, IMPACTS[level].volume);
  }

  setCharge(charge: number, charging: boolean): void {
    const context = this.context;
    if (!context) return;
    if (charging && !this.charge) this.charge = this.loop('cannon-charge', this.sfx!, 0);
    const voice = this.charge;
    if (!voice) return;
    const now = context.currentTime;
    if (charging) {
      voice.gain.gain.setTargetAtTime(0.25 + charge * 0.5, now, 0.02);
      voice.source.playbackRate.setTargetAtTime(0.7 + charge * charge * 1.5, now, 0.02);
    } else {
      voice.gain.gain.setTargetAtTime(0, now, 0.012);
      voice.source.stop(now + 0.1);
      this.charge = null;
    }
  }

  /** Everything drops away for the silent beat before a breakout. */
  duck(silent: boolean): void {
    const context = this.context;
    if (!context) return;
    this.ducked = silent;
    const now = context.currentTime;
    const music = silent ? 0.0001 : this.levels.music;
    const ambience = silent ? 0.0001 : this.levels.effects;
    this.musicBus!.gain.setTargetAtTime(music, now, silent ? 0.025 : 0.35);
    this.ambience!.gain.setTargetAtTime(ambience, now, silent ? 0.025 : 0.25);
  }
}
