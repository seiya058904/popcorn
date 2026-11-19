import { easeInCubic, easeOutBack, easeOutCubic } from '../../motion/ease.ts';
import type { UnitKindName } from '../scenes/types.ts';
import type { UnitHost, UnitState } from './common.ts';

/**
 * How each machine arrives. A pan gets tossed in, a truck reverses into its spot, a factory goes
 * up floor by floor. Offsets are in the machine's own units, along its own axes.
 */
export interface EntrancePose {
  x: number;
  y: number;
  z: number;
  rx: number;
  ry: number;
  rz: number;
  sx: number;
  sy: number;
  sz: number;
}

export interface EntranceSpot {
  /** Where the machine ends up, in the scene. */
  x: number;
  y: number;
  z: number;
  /** The machine's working end, in the scene. */
  mx: number;
  my: number;
  mz: number;
  /** The machine's scale. */
  s: number;
}

export interface EntranceBeat {
  at: number;
  run(host: UnitHost, spot: EntranceSpot, st: UnitState): void;
}

export interface Entrance {
  seconds: number;
  pose(t: number, out: EntrancePose, index: number): void;
  beats: EntranceBeat[];
}

const TAU = Math.PI * 2;
const after = (t: number, start: number): number => Math.max(0, t - start);
/** A decaying wobble that starts the moment something lands. */
const ring = (t: number, hz: number, decay: number): number => Math.exp(-t * decay) * Math.cos(t * hz);
const hop = (t: number, hz: number, decay: number): number => Math.abs(Math.sin(t * hz)) * Math.exp(-t * decay);

function squash(out: EntrancePose, amount: number): void {
  out.sy = 1 - amount;
  out.sx = 1 + amount * 0.5;
  out.sz = 1 + amount * 0.5;
}

const sound = (name: string, at = 0): EntranceBeat => ({ at, run: (host) => host.sound(name) });

/** The lid of a tossed pan comes down after the pan and spins itself flat, like a dropped coin. */
export const PAN_LID_LANDS = 0.62;
const PAN_LANDS = 0.46;
const MICROWAVE_LANDS = 0.5;
export const MICROWAVE_DOOR_OPENS = 0.62;
export const CART_STOPS = 0.85;
const CANNON_LANDS = 0.36;
export const CINEMA_TOP = 1.02;
const TRUCK_STOPS = 1.2;
const FACTORY_FLOORS = [0.13, 0.53, 0.93];
const FLOOR_SECONDS = 0.3;
const AIRSHIP_ARRIVES = 1.55;
const VOLCANO_BURSTS = 0.55;
const ORBITAL_DOCKS = 1.4;
export const ORBITAL_UNFOLD: [number, number] = [0.75, 1.4];
const TOASTER_LANDS = 0.42;
const MIXER_STOPS = 0.8;
const ORGAN_UP = 0.95;
const TRAIN_STOPS = 1.5;
const TYPHOON_FORMS = 1.1;

type LaterKind = 'toaster' | 'mixer' | 'organ' | 'train' | 'typhoon';

const FIRST_TEN: Record<Exclude<UnitKindName, LaterKind>, Entrance> = {
  pan: {
    seconds: 1.15,
    pose(t, out) {
      const k = Math.min(1, t / PAN_LANDS);
      out.x = -2.2 * (1 - k);
      out.y = 2.6 * (1 - k) + 1.6 * 4 * k * (1 - k);
      out.ry = (1 - easeOutCubic(k)) * Math.PI;
      out.rz = -0.9 * (1 - easeOutCubic(k));
      const since = after(t, PAN_LANDS);
      if (since > 0) {
        out.y += 0.16 * hop(since, 9, 6);
        squash(out, 0.2 * ring(since, 30, 14));
      }
    },
    beats: [sound('arrive-pan', PAN_LANDS)],
  },
  microwave: {
    seconds: 1.15,
    pose(t, out) {
      const k = Math.min(1, t / MICROWAVE_LANDS);
      out.y = 3.4 * (1 - k * k);
      out.ry = (1 - easeOutCubic(k)) * TAU * 0.75;
      out.rx = 0.18 * (1 - k);
      const since = after(t, MICROWAVE_LANDS);
      if (since > 0) squash(out, 0.14 * ring(since, 26, 11));
    },
    beats: [
      sound('arrive-microwave', MICROWAVE_LANDS),
      { at: MICROWAVE_LANDS, run: (host, p) => host.dust(p.x, p.y, p.z, 0.8 * p.s) },
    ],
  },
  cart: {
    seconds: 1.35,
    pose(t, out) {
      const k = easeOutCubic(t / CART_STOPS);
      out.x = -6 * (1 - k);
      // Pushed along on its two big wheels, then let down onto the caster.
      out.rz = 0.2 * (1 - k);
      const since = after(t, CART_STOPS);
      if (since > 0) out.rz = -0.1 * ring(since, 14, 5);
    },
    beats: [sound('arrive-cart', 0.05), { at: CART_STOPS, run: (host, p) => host.dust(p.x, p.y, p.z, 0.9 * p.s) }],
  },
  cannon: {
    seconds: 0.95,
    pose(t, out) {
      if (t < CANNON_LANDS) {
        out.y = 11 * (1 - (t / CANNON_LANDS) ** 2);
        return;
      }
      const since = t - CANNON_LANDS;
      out.y = 0.22 * hop(since, 10, 7);
      squash(out, 0.32 * ring(since, 28, 13));
    },
    beats: [
      sound('arrive-cannon', CANNON_LANDS),
      {
        at: CANNON_LANDS,
        run: (host, p) => {
          host.thump();
          host.dust(p.x, p.y, p.z, 1.5 * p.s);
          host.smoke(p.mx, p.my, p.mz, 0.8 * p.s);
        },
      },
    ],
  },
  cinema: {
    seconds: 1.45,
    pose(t, out) {
      // Up through the floor like a stage lift.
      out.y = -4.2 * (1 - easeOutBack(t / CINEMA_TOP, 0.9));
      const since = after(t, CINEMA_TOP);
      if (since > 0) squash(out, 0.05 * ring(since, 24, 9));
    },
    beats: [
      sound('arrive-cinema'),
      {
        at: CINEMA_TOP,
        run: (host, p) => {
          host.flash(p.mx, p.my + 1 * p.s, p.mz, 0.8 * p.s);
          host.sparkle(p.mx, p.my + 1 * p.s, p.mz, 0.5 * p.s);
        },
      },
    ],
  },
  truck: {
    seconds: 1.75,
    pose(t, out) {
      out.x = 10 * (1 - easeOutCubic(t / TRUCK_STOPS));
      const since = after(t, TRUCK_STOPS);
      // Brakes: the load keeps going for a moment and the back end dips.
      if (since > 0) out.rz = 0.05 * Math.exp(-since * 5) * Math.sin(since * 12);
    },
    beats: [
      sound('arrive-truck'),
      { at: TRUCK_STOPS, run: (host, p) => host.dust(p.x, p.y, p.z, 1 * p.s) },
    ],
  },
  factory: {
    seconds: 1.6,
    pose(t, out) {
      // Goes up one floor at a time, each with a little overshoot.
      let floors = 0;
      for (const start of FACTORY_FLOORS) floors += easeOutBack((t - start) / FLOOR_SECONDS, 2.2) * (t > start ? 1 : 0);
      const height = Math.max(0.02, floors / FACTORY_FLOORS.length);
      out.sy = height;
      out.sx = 0.94 + 0.06 * Math.min(1, height);
      out.sz = out.sx;
    },
    beats: [
      sound('arrive-factory'),
      ...FACTORY_FLOORS.map((at) => ({ at, run: (host: UnitHost, p: EntranceSpot) => host.dust(p.x, p.y, p.z, 1.3 * p.s) })),
      { at: 1.22, run: (host, p) => host.smoke(p.mx, p.my, p.mz, 1.2 * p.s) },
    ],
  },
  airship: {
    seconds: 1.95,
    pose(t, out, index) {
      const k = Math.min(1, t / AIRSHIP_ARRIVES);
      const e = easeOutCubic(k);
      const side = index % 2 === 0 ? 1 : -1;
      out.x = -30 * (1 - e);
      out.y = 7 * (1 - e);
      out.z = side * 9 * Math.sin(k * Math.PI) * (1 - k);
      // Banks through the turn and noses up as it slows.
      out.rx = -side * 0.35 * Math.sin(k * Math.PI);
      out.rz = 0.12 * (1 - e);
      const since = after(t, AIRSHIP_ARRIVES);
      if (since > 0) out.x += 0.5 * Math.exp(-since * 3) * Math.sin(since * 5) * Math.max(0, 1 - since / 0.4);
    },
    beats: [sound('arrive-airship')],
  },
  volcano: {
    seconds: 1.6,
    pose(t, out) {
      const burst = after(t, VOLCANO_BURSTS);
      const swelling = Math.min(1, t / VOLCANO_BURSTS);
      const height = burst > 0 ? 0.42 + 0.58 * easeOutBack(burst / 0.55, 1.8) : 0.08 + 0.34 * easeInCubic(swelling);
      out.sy = height;
      out.sx = 0.55 + 0.45 * Math.min(1, height);
      out.sz = out.sx;
      const shake = 0.07 * Math.max(0, 1 - burst / 0.9);
      out.x = Math.sin(t * 71) * shake;
      out.z = Math.cos(t * 83) * shake;
    },
    beats: [
      sound('arrive-volcano'),
      ...[0.2, 0.38].map((at) => ({ at, run: (host: UnitHost, p: EntranceSpot) => host.ember(p.x, p.y + 0.5 * p.s, p.z, 0.6 * p.s) })),
      {
        at: VOLCANO_BURSTS,
        run: (host, p) => {
          host.thump();
          host.flash(p.mx, p.my, p.mz, 1 * p.s);
          for (let i = 0; i < 3; i += 1) host.ember(p.mx, p.my, p.mz, 1.3 * p.s);
          host.dust(p.x, p.y, p.z, 2 * p.s);
          host.smoke(p.mx, p.my, p.mz, 1.5 * p.s);
        },
      },
    ],
  },
  orbital: {
    seconds: 1.8,
    pose(t, out) {
      const e = easeOutCubic(t / ORBITAL_DOCKS);
      out.y = 16 * (1 - e);
      out.ry = (1 - e) * TAU * 1.2;
      const since = after(t, ORBITAL_DOCKS);
      if (since > 0) out.y = -0.1 * ring(since, 16, 8) * (1 - Math.exp(-since * 40));
    },
    beats: [
      sound('arrive-orbital'),
      // Retro-rockets, firing harder as it nears its station.
      ...Array.from({ length: 9 }, (_, i) => ({
        at: 0.12 + i * 0.14,
        run: (host: UnitHost, p: EntranceSpot, st: UnitState) => {
          const height = 16 * (1 - easeOutCubic(st.age / ORBITAL_DOCKS)) * p.s;
          host.flash(p.x, p.y + height - 0.55 * p.s, p.z, 0.5 * p.s);
          host.smoke(p.x, p.y + height - 0.8 * p.s, p.z, 0.5 * p.s);
        },
      })),
      {
        at: ORBITAL_DOCKS,
        run: (host, p) => {
          host.flash(p.mx, p.my, p.mz, 0.9 * p.s);
          host.sparkle(p.mx, p.my, p.mz, 0.45 * p.s);
        },
      },
    ],
  },
};

// The later five ------------------------------------------------------------------------

const LATER_FIVE: Record<LaterKind, Entrance> = {
  toaster: {
    seconds: 1.25,
    pose(t, out) {
      // Dropped in end over end, then two springy bounces on its feet.
      const k = Math.min(1, t / TOASTER_LANDS);
      out.y = 3.2 * (1 - k * k);
      out.rx = (1 - k) * TAU * 0.5;
      const since = after(t, TOASTER_LANDS);
      if (since > 0) {
        out.y = 0.42 * hop(since, 7.5, 3.6);
        squash(out, 0.22 * ring(since, 24, 9));
      }
    },
    beats: [sound('arrive-toaster', TOASTER_LANDS), { at: TOASTER_LANDS, run: (host, p) => host.dust(p.x, p.y, p.z, 0.7 * p.s) }],
  },
  mixer: {
    seconds: 1.35,
    pose(t, out) {
      // Slid along the counter, leaning into the stop.
      const k = easeOutCubic(t / MIXER_STOPS);
      out.x = -4.5 * (1 - k);
      out.rz = 0.12 * (1 - k);
      const since = after(t, MIXER_STOPS);
      if (since > 0) out.rz = -0.07 * ring(since, 16, 6);
    },
    beats: [sound('arrive-mixer'), { at: MIXER_STOPS, run: (host, p) => host.dust(p.x, p.y, p.z, 0.8 * p.s) }],
  },
  organ: {
    seconds: 1.75,
    pose(t, out) {
      // Up from the orchestra pit on its lift; the pipes rise one by one after it (see the pose).
      out.y = -3.4 * (1 - easeOutBack(t / ORGAN_UP, 1.1));
      const since = after(t, ORGAN_UP);
      if (since > 0) squash(out, 0.05 * ring(since, 20, 8));
    },
    beats: [
      sound('arrive-organ'),
      { at: ORGAN_UP, run: (host, p) => host.dust(p.x, p.y, p.z, 1.1 * p.s) },
      { at: 1.5, run: (host, p) => host.sparkle(p.mx, p.my, p.mz, 0.6 * p.s) },
    ],
  },
  train: {
    seconds: 1.9,
    pose(t, out) {
      // Pulls in along the track and stops with a jolt that runs down the couplings.
      out.x = -9 * (1 - easeOutCubic(t / TRAIN_STOPS));
      const since = after(t, TRAIN_STOPS);
      if (since > 0) {
        out.x += 0.08 * ring(since, 14, 6);
        out.rz = 0.025 * ring(since, 14, 6);
      }
    },
    beats: [sound('arrive-train'), { at: TRAIN_STOPS, run: (host, p) => host.smoke(p.mx, p.my, p.mz, 0.9 * p.s) }],
  },
  typhoon: {
    seconds: 1.6,
    pose(t, out) {
      // Spun up from a little whirl on the water into the full storm.
      const k = Math.min(1, t / TYPHOON_FORMS);
      const size = 0.08 + 0.92 * easeOutBack(k, 1.4);
      out.sx = size;
      out.sz = size;
      out.sy = 0.3 + 0.7 * easeOutCubic(k);
      out.ry = (1 - easeOutCubic(k)) * TAU * 2;
    },
    beats: [sound('arrive-typhoon'), { at: TYPHOON_FORMS, run: (host, p) => host.flash(p.x, p.y + 1.3 * p.s, p.z, 1.2 * p.s) }],
  },
};

export const ENTRANCES: Record<UnitKindName, Entrance> = { ...FIRST_TEN, ...LATER_FIVE };

/** With reduced motion every machine simply settles into place. */
export const CALM_ENTRANCE: Entrance = {
  seconds: 0.25,
  pose(t, out) {
    const size = 0.92 + 0.08 * easeOutCubic(t / 0.25);
    out.sx = size;
    out.sy = size;
    out.sz = size;
  },
  beats: [],
};
