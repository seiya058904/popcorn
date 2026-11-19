import { synthSpace } from './dsp.ts';
import { BED_LAYERS, BED_WIDTH, bedSurge, SPACES, type BedLayer, type BedMix } from './mix.ts';

export interface AudioLevels {
  master: number;
  music: number;
  effects: number;
}

interface BedVoice {
  sources: AudioBufferSourceNode[];
  gain: GainNode;
}

interface Space {
  input: GainNode;
}

/** Output never exceeds this, whatever piles up during a breakout. */
const CEILING = 0.94;
/** Share of the bed that reaches the room; more than this turns the heap to mud. */
const BED_ROOM_SEND = 0.1;
/** The heap sits under everything the player does. */
const BED_TRIM = 0.5;
/** Browsers add make-up gain inside their compressor; this takes it back out. */
const OUTPUT_TRIM = 0.7;

function softCeiling(context: BaseAudioContext): WaveShaperNode {
  const curve = new Float32Array(2049);
  for (let i = 0; i < curve.length; i += 1) {
    const x = (i / (curve.length - 1)) * 2 - 1;
    const knee = CEILING * 0.8;
    const size = Math.abs(x);
    curve[i] = size < knee ? x : Math.sign(x) * (knee + (CEILING - knee) * Math.tanh((size - knee) / (CEILING - knee)));
  }
  const shaper = context.createWaveShaper();
  shaper.curve = curve;
  shaper.oversample = '2x';
  return shaper;
}

/**
 * Every bus and effect. It accepts any audio context, so the checking tools can render the
 * real mix offline instead of an approximation of it.
 */
export class MixGraph {
  readonly context: BaseAudioContext;
  readonly sfx: GainNode;
  readonly music: GainNode;
  private readonly master: GainNode;
  private readonly bedBus: GainNode;
  private readonly bedDuck: GainNode;
  private readonly musicTrim: GainNode;
  private readonly musicBass: BiquadFilterNode;
  private readonly roomSend: GainNode;
  private readonly bed = new Map<BedLayer, BedVoice>();
  private readonly spaces = new Map<number, Space>();
  private activeSpace = -1;

  constructor(context: BaseAudioContext) {
    this.context = context;
    const compressor = context.createDynamicsCompressor();
    compressor.threshold.value = -14;
    compressor.knee.value = 10;
    compressor.ratio.value = 4;
    compressor.attack.value = 0.003;
    compressor.release.value = 0.16;
    this.master = context.createGain();
    this.sfx = context.createGain();
    this.music = context.createGain();
    this.bedBus = context.createGain();
    this.bedDuck = context.createGain();
    this.musicTrim = context.createGain();
    this.musicBass = context.createBiquadFilter();
    this.musicBass.type = 'lowshelf';
    this.musicBass.frequency.value = 190;
    this.roomSend = context.createGain();

    this.sfx.connect(this.master);
    this.sfx.connect(this.roomSend);
    this.music.connect(this.musicBass).connect(this.musicTrim).connect(this.master);
    this.musicTrim.connect(this.roomSend);
    const bedTrim = context.createGain();
    bedTrim.gain.value = BED_TRIM;
    this.bedDuck.connect(bedTrim).connect(this.bedBus).connect(this.master);
    const bedRoom = context.createGain();
    bedRoom.gain.value = BED_ROOM_SEND;
    this.bedDuck.connect(bedRoom).connect(this.roomSend);
    const outputTrim = context.createGain();
    outputTrim.gain.value = OUTPUT_TRIM;
    this.master.connect(compressor).connect(outputTrim).connect(softCeiling(context)).connect(context.destination);
  }

  applyLevels(levels: AudioLevels, musicDucked: boolean, time = this.context.currentTime): void {
    this.master.gain.setTargetAtTime(levels.master, time, 0.02);
    this.sfx.gain.setTargetAtTime(levels.effects, time, 0.02);
    this.bedBus.gain.setTargetAtTime(levels.effects, time, 0.02);
    if (!musicDucked) this.music.gain.setTargetAtTime(levels.music, time, 0.02);
  }

  /** Everything but the effects drops away, for the held breath before a blast. */
  silence(silent: boolean, levels: AudioLevels): void {
    const now = this.context.currentTime;
    this.music.gain.setTargetAtTime(silent ? 0.0001 : levels.music, now, silent ? 0.025 : 0.35);
    this.bedBus.gain.setTargetAtTime(silent ? 0.0001 : levels.effects, now, silent ? 0.025 : 0.25);
  }

  /** One mono recording played twice, half a loop apart and panned apart, makes a wide bed for free. */
  startBedLayer(name: BedLayer, buffer: AudioBuffer, when = 0): void {
    if (this.bed.has(name)) return;
    const context = this.context;
    const gain = context.createGain();
    gain.gain.value = 0;
    gain.connect(this.bedDuck);
    const width = BED_WIDTH[name];
    const sides = width > 0 ? [-width, width] : [0];
    const sources = sides.map((pan, index) => {
      const source = context.createBufferSource();
      source.buffer = buffer;
      source.loop = true;
      const panner = context.createStereoPanner();
      panner.pan.value = pan;
      source.connect(panner).connect(gain);
      source.start(when || context.currentTime, (index * buffer.duration) / 2);
      return source;
    });
    this.bed.set(name, { sources, gain });
  }

  setBed(mix: BedMix, time = this.context.currentTime, glide = 0.4): void {
    BED_LAYERS.forEach((name, index) => {
      this.bed.get(name)?.gain.gain.setTargetAtTime(mix.layers[name] * bedSurge(index, time), time, glide);
    });
    this.musicTrim.gain.setTargetAtTime(mix.music, time, glide * 2);
    this.musicBass.gain.setTargetAtTime(mix.musicBassDb, time, glide * 2);
  }

  /** The bed ducks under a sound the player caused, then swells back. */
  duckBed(depth: number, time = this.context.currentTime): void {
    const gain = this.bedDuck.gain;
    gain.cancelScheduledValues(time);
    gain.setTargetAtTime(1 - depth, time, 0.006);
    gain.setTargetAtTime(1, time + 0.035, 0.16);
  }

  /** Building a room is the slow part, so the game does it ahead of time, one room per idle moment. */
  prepareSpace(index: number): void {
    if (this.spaces.has(index) || !SPACES[index]) return;
    const context = this.context;
    const space = SPACES[index]!;
    const left = synthSpace(space, 0, context.sampleRate);
    const right = synthSpace(space, 1, context.sampleRate);
    const buffer = context.createBuffer(2, left.length, context.sampleRate);
    buffer.copyToChannel(left as Float32Array<ArrayBuffer>, 0);
    buffer.copyToChannel(right as Float32Array<ArrayBuffer>, 1);
    const convolver = context.createConvolver();
    convolver.buffer = buffer;
    const input = context.createGain();
    input.gain.value = 0;
    const output = context.createGain();
    output.gain.value = space.send;
    this.roomSend.connect(input).connect(convolver).connect(output).connect(this.master);
    this.spaces.set(index, { input });
  }

  setSpace(index: number, fade = 0.5): void {
    this.prepareSpace(index);
    if (index === this.activeSpace) return;
    this.activeSpace = index;
    const now = this.context.currentTime;
    for (const [key, space] of this.spaces) space.input.gain.setTargetAtTime(key === index ? 1 : 0, now, fade);
  }
}
