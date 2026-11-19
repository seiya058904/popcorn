import { IMPACTS, type ImpactLevel } from '../motion/impact.ts';
import { Rng } from '../motion/rng.ts';
import { SAMPLE_RATE, synthCrackle, synthPop } from './dsp.ts';
import { MixGraph, type AudioLevels } from './graph.ts';
import { BED_LAYERS, bedMix, spaceForStage, SPACES, type BedLayer } from './mix.ts';

export type { AudioLevels } from './graph.ts';

const POP_VARIATIONS = 8;
const CRACKLE_VARIATIONS = 5;
const MAX_VOICES = 12;
/** Background noises stop here, so they can never take a voice from a click. */
const MAX_BACKGROUND_VOICES = 7;
/** Combo pitch climbs a major pentatonic, so fast clicking stays musical. */
const COMBO_SCALE = [0, 2, 4, 7, 9, 12, 14, 16, 19, 21, 24];
const MACHINE_VOLUME = 0.72;
/** Seconds between two plays of the same interface sound. */
const UI_MIN_GAP = 0.03;
/** How far big moments push the heap aside. */
const IMPACT_DUCK: Record<ImpactLevel, number> = { tap: 0, small: 0, medium: 0.18, large: 0.38, epic: 0.6 };

interface Voice {
  source: AudioBufferSourceNode;
  gain: GainNode;
  ends: number;
  background: boolean;
}

interface LoopVoice {
  source: AudioBufferSourceNode;
  gain: GainNode;
}

/** Created lazily on the first gesture, as browsers require. */
export class AudioEngine {
  readonly levels: AudioLevels = { master: 0.85, music: 0.6, effects: 0.9, ui: 0.7 };
  /** When each interface sound last played, so a burst of presses never stacks into noise. */
  private readonly uiClock = new Map<string, number>();
  private context: AudioContext | null = null;
  private graph: MixGraph | null = null;
  private pops: AudioBuffer[] = [];
  private crackles: AudioBuffer[] = [];
  private readonly bank = new Map<string, AudioBuffer>();
  private voices: Voice[] = [];
  private readonly tracks = new Map<string, { bed: LoopVoice; lead: LoopVoice }>();
  private charge: LoopVoice | null = null;
  private wantedTrack = 'home';
  private activeTrack = '';
  private wantedSpace = 0;
  private lead = 0;
  private clickDuck = 0.1;
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
    this.graph = new MixGraph(context);
    this.applyLevels();
    this.graph.setSpace(this.wantedSpace, 0.01);
    this.prepareNextSpace();

    this.pops = Array.from({ length: POP_VARIATIONS }, (_, i) => this.toBuffer(synthPop(i)));
    this.crackles = Array.from({ length: CRACKLE_VARIATIONS }, (_, i) => this.toBuffer(synthCrackle(i)));
    this.loadBank();
  }

  private toBuffer(samples: Float32Array): AudioBuffer {
    const buffer = this.context!.createBuffer(1, samples.length, SAMPLE_RATE);
    buffer.copyToChannel(new Float32Array(samples), 0);
    return buffer;
  }

  private loadBank(): void {
    const worker = new Worker(new URL('./bank.worker.ts', import.meta.url), { type: 'module' });
    worker.onmessage = (event: MessageEvent<{ name: string; samples: Float32Array }>) => {
      const { name, samples } = event.data;
      const buffer = this.toBuffer(samples);
      this.bank.set(name, buffer);
      if ((BED_LAYERS as readonly string[]).includes(name)) this.graph!.startBedLayer(name as BedLayer, buffer);
      if (name.startsWith('music-')) this.syncMusic();
    };
    worker.onerror = (event) => console.warn('Sound bank failed to load', event.message);
  }

  applyLevels(): void {
    this.graph?.applyLevels(this.levels, this.ducked);
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

  // Places ----------------------------------------------------------------------------

  /** Moves the sound into the room of the given stage. */
  setSpace(stage: number): void {
    this.wantedSpace = spaceForStage(stage);
    this.graph?.setSpace(this.wantedSpace);
    this.prepareNextSpace();
  }

  private prepareNextSpace(): void {
    const next = this.wantedSpace + 1;
    if (next < SPACES.length) setTimeout(() => this.graph?.prepareSpace(next), 1500);
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
      const bed = this.loop(`music-${name}-bed`, this.graph!.music, 0, when)!;
      const lead = this.loop(`music-${name}-lead`, this.graph!.music, 0, when)!;
      track = { bed, lead };
      this.tracks.set(name, track);
    }
    const now = context.currentTime;
    for (const [key, value] of this.tracks) {
      value.bed.gain.gain.setTargetAtTime(key === name ? 1 : 0, now, 0.5);
      if (key !== name) value.lead.gain.gain.setTargetAtTime(0, now, 0.5);
    }
    this.activeTrack = name;
  }

  // Continuous state --------------------------------------------------------------------

  /** Follows production on the compressed scale of `showIntensity`, and the player's activity. */
  update(intensity: number, activity: number): void {
    const { context, graph } = this;
    if (!context || !graph) return;
    const mix = bedMix(intensity);
    this.clickDuck = mix.clickDuck;
    graph.setBed(mix);
    this.lead += (activity - this.lead) * 0.02;
    const track = this.tracks.get(this.activeTrack);
    track?.lead.gain.gain.setTargetAtTime(0.35 + 0.65 * Math.min(1, this.lead), context.currentTime, 0.6);
  }

  // One-shots -----------------------------------------------------------------------------

  private play(buffer: AudioBuffer, rate: number, volume: number, background = false, bus?: AudioNode): void {
    const { context, graph } = this;
    if (!context || !graph) return;
    const now = context.currentTime;
    this.voices = this.voices.filter((voice) => voice.ends > now);
    if (background && this.voices.filter((voice) => voice.background).length >= MAX_BACKGROUND_VOICES) return;
    if (this.voices.length >= MAX_VOICES) {
      // Background noises go first; anything the player did stays.
      const index = Math.max(0, this.voices.findIndex((voice) => voice.background));
      const [oldest] = this.voices.splice(index, 1);
      oldest!.gain.gain.setTargetAtTime(0, now, 0.004);
      oldest!.source.stop(now + 0.02);
    }
    const source = context.createBufferSource();
    source.buffer = buffer;
    source.playbackRate.value = rate;
    const gain = context.createGain();
    gain.gain.value = volume;
    source.connect(gain).connect(bus ?? graph.sfx);
    source.start(now);
    this.voices.push({ source, gain, ends: now + buffer.duration / rate, background });
  }

  pop(combo: number): void {
    if (this.pops.length === 0) return;
    let index = this.rng.int(0, POP_VARIATIONS);
    if (index === this.lastPop) index = (index + 1) % POP_VARIATIONS;
    this.lastPop = index;
    const step = COMBO_SCALE[Math.min(Math.floor(combo / 3), COMBO_SCALE.length - 1)]!;
    const rate = 2 ** (step / 12) * this.rng.range(0.97, 1.03);
    this.graph!.duckBed(this.clickDuck);
    this.play(this.pops[index]!, rate, this.rng.range(0.74, 0.92));
  }

  crackle(): void {
    if (this.crackles.length === 0) return;
    const buffer = this.crackles[this.rng.int(0, CRACKLE_VARIATIONS)]!;
    this.play(buffer, this.rng.range(0.85, 1.25), this.rng.range(0.14, 0.26), true);
  }

  effect(name: string, level: ImpactLevel = 'small', rate = 1): void {
    const buffer = this.bank.get(name);
    if (!buffer) return;
    if (IMPACT_DUCK[level] > 0) this.graph!.duckBed(IMPACT_DUCK[level]);
    this.play(buffer, rate, IMPACTS[level].volume);
  }

  /** An interface sound: dry, close, a hair different in pitch each time. */
  ui(name: string, rate = 1): void {
    const { context, graph } = this;
    const buffer = this.bank.get(name);
    if (!context || !graph || !buffer) return;
    const now = context.currentTime;
    if (now - (this.uiClock.get(name) ?? -1) < UI_MIN_GAP) return;
    this.uiClock.set(name, now);
    this.play(buffer, rate * this.rng.range(0.97, 1.03), 1, false, graph.ui);
  }

  /** A machine at work: never twice at quite the same pitch, and never in the way. */
  machine(name: string): void {
    const buffer = this.bank.get(name);
    if (buffer) this.play(buffer, this.rng.range(0.95, 1.05), MACHINE_VOLUME, true);
  }

  setCharge(charge: number, charging: boolean): void {
    const { context, graph } = this;
    if (!context || !graph) return;
    if (charging && !this.charge) this.charge = this.loop('cannon-charge', graph.sfx, 0);
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

  setPaused(paused: boolean): void {
    if (!this.context) return;
    void (paused ? this.context.suspend() : this.context.resume());
  }

  /** Everything drops away for the silent beat before a breakout. */
  duck(silent: boolean): void {
    if (!this.graph) return;
    this.ducked = silent;
    this.graph.silence(silent, this.levels);
  }
}
