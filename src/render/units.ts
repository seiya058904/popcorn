import * as THREE from 'three';
import { easeOutBack, easeOutCubic, Spring } from '../motion/ease.ts';
import type { Stage } from './core/stage.ts';
import { PartRig } from './geometry/rig.ts';
import { HIDDEN, putLocal, rosette, type UnitDef, type UnitHost, type UnitState } from './machines/common.ts';
import { CALM_ENTRANCE, ENTRANCES, type Entrance, type EntrancePose, type EntranceSpot } from './machines/entrances.ts';
import { HOME_MACHINES } from './machines/home.ts';
import { KITCHENWARE } from './machines/kitchenware.ts';
import { SHOWPIECES } from './machines/showpieces.ts';
import { SKY_MACHINES } from './machines/sky.ts';
import { TOWN_MACHINES } from './machines/town.ts';
import { signGeometry, signMaterial } from './materials/sign.ts';
import type { UnitKindName, UnitPath, UnitSlot } from './scenes/types.ts';

export type { UnitHost } from './machines/common.ts';
export { cannonCap, cannonDrum, cannonFrame } from './machines/home.ts';

export const UNIT_DEFS: Record<UnitKindName, UnitDef> = { ...HOME_MACHINES, ...TOWN_MACHINES, ...SKY_MACHINES, ...KITCHENWARE, ...SHOWPIECES };

const pos = new THREE.Vector3();
const quat = new THREE.Quaternion();
const turn = new THREE.Quaternion();
const lean = new THREE.Quaternion();
const euler = new THREE.Euler();
const scale = new THREE.Vector3();
const tangent = new THREE.Vector3();
const UP = new THREE.Vector3(0, 1, 0);
/** A machine goes under once the heap reaches this share of its height. */
const BURY_AT = 0.6;
/** When several are bought at once they arrive one after another. */
const ARRIVAL_STAGGER = 0.05;
/** The change of look at a milestone: a hop, a full turn and a pop, one copy after another. */
const MORPH_SECONDS = 1.05;
const MORPH_STAGGER = 0.07;
/** A poke squashes the machine, springs it up past its height and lets it settle. */
const POKE_STIFFNESS = 300;
/** The work cycle a poke sets off starts this long after, once the squash has wound it up. */
const POKE_FIRE_DELAY = 0.12;
const ray = new THREE.Ray();
const hit = new THREE.Vector3();

/** The track goes down piece by piece in this long. */
const TRACK_SECONDS = 1.7;
/** A train waits at its stop this long after arriving, then pulls away. */
const DEPART_AFTER = 2.6;
const DEPART_SECONDS = 3;

const frame: EntrancePose = { x: 0, y: 0, z: 0, rx: 0, ry: 0, rz: 0, sx: 1, sy: 1, sz: 1 };
const spot: EntranceSpot = { x: 0, y: 0, z: 0, mx: 0, my: 0, mz: 0, s: 1 };
const bounds = new THREE.Box3();
const sphere = new THREE.Sphere();
const corner = new THREE.Vector3();
const segment = new THREE.Matrix4();
const shift = new THREE.Matrix4();

const tierOf = (owned: number): number => (owned >= 100 ? 3 : owned >= 50 ? 2 : owned >= 25 ? 1 : 0);

/** The rails of a machine that rides a loop, laid piece by piece when the first one arrives. */
class Track {
  private readonly rig: PartRig;
  private readonly centers: THREE.Vector3[];
  /** -1 not laid, then 0..1 through the laying, starting at piece `start`. */
  lay = -1;
  private start = 0;

  /** Starts laying from the piece at this fraction of the way round the loop. */
  begin(fraction: number, animate: boolean): void {
    this.lay = animate ? 0 : 1;
    this.start = Math.floor(fraction * this.centers.length) % this.centers.length;
  }

  constructor(stage: Stage, parent: THREE.Object3D, pieces: THREE.BufferGeometry[]) {
    this.centers = pieces.map((geometry) => {
      geometry.computeBoundingBox();
      return geometry.boundingBox!.getCenter(new THREE.Vector3());
    });
    this.rig = new PartRig(stage, parent, pieces.map((geometry) => ({ geometry, ink: true, shadow: true })), 1);
    const box = new THREE.Box3();
    for (const geometry of pieces) box.union(geometry.boundingBox!);
    this.rig.setBounds(box.getBoundingSphere(new THREE.Sphere()));
  }

  update(dt: number, calm: boolean): void {
    if (this.lay < 0) {
      this.rig.commit(0);
      return;
    }
    this.lay = calm ? 1 : Math.min(1, this.lay + dt / TRACK_SECONDS);
    const count = this.centers.length;
    this.centers.forEach((center, piece) => {
      // Pieces go down in order around the loop, each springing into place.
      const order = ((piece - this.start + count) % count) / count;
      const local = THREE.MathUtils.clamp((this.lay * 1.3 - order) / 0.3, 0, 1);
      const size = local <= 0 ? 0 : easeOutBack(local, 2.2);
      segment.makeTranslation(center.x, center.y, center.z);
      segment.multiply(shift.makeScale(size, size, size));
      segment.multiply(shift.makeTranslation(-center.x, -center.y, -center.z));
      this.rig.setMatrix(0, piece, local <= 0 ? HIDDEN : segment);
    });
    this.rig.commit(1);
  }
}

/** All visible copies of one unit type in one scene, drawn as one part rig. */
export class UnitRig {
  private readonly def: UnitDef;
  private readonly entrance: Entrance;
  private readonly slots: UnitSlot[];
  private readonly host: UnitHost;
  private readonly rig: PartRig;
  private readonly signs: THREE.InstancedMesh[];
  private readonly states: UnitState[] = [];
  private readonly base = new THREE.Matrix4();
  private readonly height: number;
  private readonly lowest: number;
  private readonly reach: number;
  /** Half the widest extent of any part, for the box the camera tests against. */
  private readonly radius: number;
  /** Index of the silver rosette; the gold one follows it. -1 without one. */
  private readonly badgePart: number;
  private readonly path: UnitPath | null;
  private readonly track: Track | null;
  private travel = 0;
  private tier = 0;
  /** The copy under the pointer, or -1. */
  private hovered = -1;

  /** Builds the machine one part per step, so it can be made in the background. */
  static *create(stage: Stage, parent: THREE.Object3D, kind: UnitKindName, slots: UnitSlot[], host: UnitHost, path: UnitPath | null = null): Generator<void, UnitRig, void> {
    const geometries: THREE.BufferGeometry[] = [];
    for (const make of UNIT_DEFS[kind].parts) {
      geometries.push(make());
      yield;
    }
    return new UnitRig(stage, parent, kind, slots, host, geometries, path);
  }

  constructor(stage: Stage, parent: THREE.Object3D, kind: UnitKindName, slots: UnitSlot[], host: UnitHost, geometries?: THREE.BufferGeometry[], path: UnitPath | null = null) {
    this.def = UNIT_DEFS[kind];
    this.entrance = ENTRANCES[kind];
    this.path = path;
    // A machine on a path has one moving slot for every place on the loop.
    this.slots = path ? Array.from({ length: path.capacity }, () => ({ x: 0, y: 0, z: 0, rotation: 0, scale: path.scale, up: new THREE.Vector3(0, 1, 0) })) : slots;
    this.host = host;
    const shadowParts = this.def.shadowParts ?? this.def.parts.length;
    const inkParts = this.def.inkParts ?? 1;
    let height = 0;
    let lowest = 0;
    let reach = 0;
    let radius = 0;
    const parts = this.def.parts.map((make, index) => {
      const geometry = geometries?.[index] ?? make();
      geometry.computeBoundingBox();
      const box = geometry.boundingBox!;
      height = Math.max(height, box.max.y);
      lowest = Math.min(lowest, box.min.y);
      radius = Math.max(radius, box.max.length(), box.min.length());
      if (index === 0) reach = Math.max(-box.min.x, box.max.x, -box.min.z, box.max.z);
      return { geometry, ink: index < inkParts, shadow: index < shadowParts };
    });
    this.badgePart = this.def.badge ? parts.length : -1;
    if (this.def.badge) parts.push({ geometry: rosette(false), ink: true, shadow: false }, { geometry: rosette(true), ink: true, shadow: false });
    this.height = height;
    this.lowest = lowest;
    this.reach = reach;
    this.radius = radius;
    this.rig = new PartRig(stage, parent, parts, this.slots.length);
    this.track = path && this.def.track ? new Track(stage, parent, this.def.track(path)) : null;
    this.signs = (this.def.signs ?? []).map((sign) => {
      const mesh = new THREE.InstancedMesh(
        signGeometry(sign.width, sign.height, sign.matrix, sign.part ?? 0),
        signMaterial(sign.text, { aspect: sign.width / sign.height, ...sign.style }, this.rig.texture),
        this.slots.length,
      );
      mesh.frustumCulled = false;
      mesh.count = 0;
      parent.add(mesh);
      return mesh;
    });
    const tints = this.def.tints;
    if (tints) {
      const color = new THREE.Color();
      this.slots.forEach((_slot, index) => this.rig.setColor(index, color.set(tints[index % tints.length]!)));
    }
    if (path) this.followPath(0);
  }

  get visible(): number {
    return this.states.length;
  }

  /** The top and bottom of every machine on show, for framing the camera. */
  collectPoints(out: THREE.Vector3[]): void {
    this.states.forEach((st, index) => {
      if (st.sunk >= 1) return;
      const slot = this.slots[index]!;
      const s = slot.scale ?? 1;
      const reach = this.reach * s;
      // Its full width counts too, or a machine at the edge of the picture gets cut in half.
      for (const [dx, dz] of [[reach, 0], [-reach, 0], [0, reach], [0, -reach]] as const) {
        out.push(new THREE.Vector3(slot.x + dx, slot.y + this.height * s, slot.z + dz), new THREE.Vector3(slot.x + dx, slot.y + this.lowest * s, slot.z + dz));
      }
    });
  }

  /** Where the first copy stands and how big it is, for close inspection. */
  firstCopy(): { center: THREE.Vector3; size: number; rotation: number } | null {
    const slot = this.slots[0];
    if (!slot) return null;
    const s = slot.scale ?? 1;
    return {
      center: new THREE.Vector3(slot.x, slot.y + ((this.height + this.lowest) / 2) * s, slot.z),
      size: Math.max(this.height - this.lowest, this.reach * 2) * s,
      rotation: slot.rotation ?? 0,
    };
  }

  /** Machines of this kind on show, for sparkles and the like. */
  positions(): THREE.Vector3[] {
    return this.states.map((_st, index) => {
      const slot = this.slots[index]!;
      return new THREE.Vector3(slot.x, slot.y + this.height * (slot.scale ?? 1) * 0.7, slot.z);
    });
  }

  /** Has every machine fall into place again, one after another, on arrival in a scene. */
  dropIn(startDelay: number): void {
    this.states.forEach((st, index) => {
      st.age = -startDelay - index * 0.07;
      st.enter = 0;
      st.beat = 0;
    });
  }

  /** Nobody can read a machine's sign once its whole scene is shrinking away. */
  hideSigns(): void {
    for (const sign of this.signs) sign.visible = false;
  }

  /** Leaves one copy on show, so it can be inspected without its neighbors in the way. */
  keepOnlyFirst(): void {
    this.states.length = Math.min(this.states.length, 1);
  }

  hide(): void {
    this.rig.commit(0);
    for (const sign of this.signs) sign.count = 0;
    this.states.length = 0;
    if (this.track) this.track.lay = -1;
  }

  sync(owned: number, animate: boolean, delay = 0): void {
    const count = Math.min(owned, this.slots.length);
    const tier = tierOf(owned);
    // Crossing a milestone: every copy already standing changes its look, one after another.
    if (animate && tier > this.tier) this.states.forEach((st, index) => (st.morph = -delay - index * MORPH_STAGGER));
    this.tier = tier;
    let queued = 0;
    while (this.states.length < count) {
      const period = this.def.interval[1];
      this.states.push({
        age: animate ? -delay - queued * ARRIVAL_STAGGER : 10,
        enter: animate ? 0 : 1,
        beat: animate ? 0 : Number.POSITIVE_INFINITY,
        enterX: 0,
        timer: this.host.rng.range(0.3, period),
        period,
        hop: new Spring(0, 260, 11),
        shake: 0,
        kick: 0,
        spin: this.host.rng.range(0, 6),
        lidSpin: 0,
        sunk: -1,
        morph: 1,
        travel: 0,
        poke: new Spring(0, POKE_STIFFNESS, 9),
        hover: 0,
      });
      queued += 1;
    }
    this.states.length = Math.min(this.states.length, count);
    if (this.track) {
      if (count === 0) this.track.lay = -1;
      else if (this.track.lay < 0) {
        const length = this.path!.length;
        // From under the first car, so the rails run out ahead of it.
        this.track.begin((((this.travel % length) + length) % length) / length, animate);
      }
    }
  }

  /** Moves every slot of a path machine to its place along the loop, the first copy in front. */
  private followPath(dt: number): void {
    const path = this.path!;
    const leader = this.states[0];
    // Pulls away once the first one has arrived and had its moment, then keeps going.
    const going = leader ? THREE.MathUtils.smoothstep(leader.age, DEPART_AFTER, DEPART_AFTER + DEPART_SECONDS) : 0;
    this.travel += dt * path.speed * going;
    this.slots.forEach((slot, index) => {
      path.sample(this.travel - index * path.spacing, pos, tangent, slot.up!);
      slot.x = pos.x;
      slot.y = pos.y;
      slot.z = pos.z;
      // The machine's own +X runs along the loop.
      slot.rotation = Math.atan2(-tangent.z, tangent.x);
    });
  }

  /**
   * The copy a ray (in the scene's own space) passes through first, judged by a ball round each
   * standing copy, and how far along the ray it is.
   */
  pick(sceneRay: THREE.Ray): { copy: number; distance: number } | null {
    let best: { copy: number; distance: number } | null = null;
    this.states.forEach((st, copy) => {
      if (st.age < 0 || st.sunk >= 1) return;
      const slot = this.slots[copy]!;
      const s = slot.scale ?? 1;
      const center = hit.set(slot.x, slot.y + ((this.height + this.lowest) / 2) * s, slot.z);
      const radius = Math.max(this.height * 0.5, this.radius) * s * 0.85;
      ray.copy(sceneRay);
      if (ray.distanceSqToPoint(center) > radius * radius) return;
      const distance = ray.origin.distanceTo(center);
      if (!best || distance < best.distance) best = { copy, distance };
    });
    return best;
  }

  /** The player poked this copy: it squashes, springs back and does one more work cycle. */
  poke(copy: number): void {
    const st = this.states[copy];
    if (!st) return;
    st.poke.kick(-Math.sqrt(POKE_STIFFNESS));
    if (st.enter >= 1) st.timer = Math.min(st.timer, POKE_FIRE_DELAY);
  }

  setHover(copy: number): void {
    this.hovered = copy;
  }

  update(dt: number, time: number, tempo: number): void {
    const def = this.def;
    const rig = this.rig;
    if (this.path) this.followPath(dt);
    let copy = 0;
    const put = (part: number, matrix: THREE.Matrix4): void => rig.setMatrix(copy, part, matrix);
    const hideCopy = (): void => {
      for (let part = 0; part < rig.partCount; part += 1) rig.setMatrix(copy, part, HIDDEN);
    };
    const speed = 1 + this.tier * 0.35;
    const calm = this.host.calm;
    const entrance = calm ? CALM_ENTRANCE : this.entrance;
    let shown = 0;
    bounds.makeEmpty();
    this.states.forEach((st, index) => {
      copy = index;
      st.age += dt;
      const slot = this.slots[index]!;
      const s = slot.scale ?? 1;
      if (st.age < 0) {
        hideCopy();
        return;
      }
      // Half-buried machines leave odd scraps poking out, so the heap swallows them whole.
      const height = this.height * s;
      const line = slot.y + height * BURY_AT;
      const surface = this.host.heightAt(slot.x, slot.z);
      const under = surface > line || (st.sunk > 0.5 && surface > line - height * 0.08);
      st.sunk = st.sunk < 0 ? (under ? 1 : 0) : THREE.MathUtils.clamp(st.sunk + (under ? dt : -dt) * 2.4, 0, 1);
      if (st.sunk >= 1) {
        hideCopy();
        return;
      }
      st.timer -= dt * tempo * speed;
      st.spin += dt * (2.2 + tempo) * speed;
      if (this.path) st.travel = (this.travel - index * this.path.spacing) / s;
      const rotation = slot.rotation ?? 0;
      st.enter = Math.min(1, st.age / entrance.seconds);
      if (st.timer <= 0 && st.enter >= 1) {
        st.period = this.host.rng.range(def.interval[0], def.interval[1]);
        st.timer = st.period;
        st.shake = 1;
        st.hop.kick(1.9);
        // Muzzle position in world space, honoring the slot's turn and scale.
        const c = Math.cos(rotation);
        const sn = Math.sin(rotation);
        const [mx, my, mz] = def.muzzle;
        const x = slot.x + (mx * c + mz * sn) * s;
        const y = slot.y + my * s;
        const z = slot.z + (-mx * sn + mz * c) * s;
        def.fire?.(st, this.host, x, y, z, s);
        this.host.launch(x, y, z);
      }
      st.shake = Math.max(0, st.shake - dt * 3.2);
      st.kick = Math.max(0, st.kick - dt * 1.55);
      const hop = st.hop.update(dt);
      frame.x = frame.y = frame.z = frame.rx = frame.ry = frame.rz = 0;
      frame.sx = frame.sy = frame.sz = 1;
      if (st.enter < 1) entrance.pose(st.age, frame, index);
      st.enterX = frame.x;
      const c = Math.cos(rotation);
      const sn = Math.sin(rotation);
      if (st.beat < entrance.beats.length) {
        const [mx, my, mz] = def.muzzle;
        spot.x = slot.x;
        spot.y = slot.y;
        spot.z = slot.z;
        spot.mx = slot.x + (mx * c + mz * sn) * s;
        spot.my = slot.y + my * s;
        spot.mz = slot.z + (-mx * sn + mz * c) * s;
        spot.s = s;
        while (st.beat < entrance.beats.length && st.age >= entrance.beats[st.beat]!.at) {
          entrance.beats[st.beat]!.run(this.host, spot, st);
          st.beat += 1;
        }
      }
      if (st.morph < 1) {
        const before = st.morph;
        st.morph = Math.min(1, st.morph + dt / MORPH_SECONDS);
        // The moment it starts: a burst of sparkles where it stands.
        if (before < 0 && st.morph >= 0) this.host.sparkle(slot.x, slot.y + height * 0.75, slot.z, 0.7 * s);
        const m = Math.max(0, st.morph);
        if (!calm && m > 0 && m < 1) {
          const bump = Math.sin(m * Math.PI);
          frame.y += bump * 0.5;
          frame.ry += easeOutCubic(m) * Math.PI * 2;
          const pop = 1 + 0.16 * bump;
          frame.sx *= pop;
          frame.sy *= 1 + 0.22 * bump;
          frame.sz *= pop;
        }
      }
      // A poke: squashed down first, stretched up past its height, then a few settling wobbles.
      // The pointer resting on a machine lifts it a touch, ready to be poked.
      const poke = st.poke.update(dt) * (calm ? 0.5 : 1);
      st.hover += ((index === this.hovered ? 1 : 0) - st.hover) * (1 - Math.exp(-dt * 14));
      frame.y += st.hover * 0.06;
      frame.sy *= 1 + poke * 0.16 + st.hover * 0.035;
      frame.sx *= 1 - poke * 0.08 + st.hover * 0.02;
      frame.sz *= 1 - poke * 0.08 + st.hover * 0.02;
      const jitter = st.shake * 0.018 * s;
      pos.set(
        slot.x + (frame.x * c + frame.z * sn) * s + Math.sin(time * 61 + index) * jitter,
        slot.y + (frame.y + Math.max(0, hop) * 0.06) * s - st.sunk * st.sunk * height * 0.85,
        slot.z + (-frame.x * sn + frame.z * c) * s + Math.cos(time * 53 + index) * jitter,
      );
      const squash = 1 - hop * 0.05;
      quat.setFromEuler(euler.set(0, rotation, 0));
      // On curved ground the machine leans with the surface.
      if (slot.up) quat.premultiply(lean.setFromUnitVectors(UP, slot.up));
      quat.multiply(turn.setFromEuler(euler.set(frame.rx, frame.ry, frame.rz)));
      const shrink = s * (1 - st.sunk * 0.3);
      const wide = shrink * (1 + (1 - squash) * 0.5);
      scale.set(wide * frame.sx, shrink * squash * frame.sy, wide * frame.sz);
      this.base.compose(pos, quat, scale);
      def.pose(st, time, index, this.tier, this.base, put);
      if (this.badgePart >= 0) this.poseBadge(st, put);
      // Generous on purpose: lids fly and doors swing a little outside the model's own box.
      const r = this.radius * s * Math.max(1, frame.sx, frame.sy, frame.sz) * 1.35;
      bounds.expandByPoint(corner.copy(pos).addScalar(r)).expandByPoint(corner.copy(pos).addScalar(-r));
      shown += 1;
    });
    const count = shown > 0 ? this.states.length : 0;
    rig.commit(count);
    rig.setBounds(shown > 0 ? bounds.getBoundingSphere(sphere) : null);
    for (const sign of this.signs) {
      sign.count = count;
      sign.frustumCulled = shown > 0;
      if (shown > 0) (sign.boundingSphere ??= new THREE.Sphere()).copy(sphere);
    }
    this.track?.update(dt, calm);
  }

  /** Silver at 50, gold at 100; pinned on with a little spring as the look changes. */
  private poseBadge(st: UnitState, put: (part: number, matrix: THREE.Matrix4) => void): void {
    const badge = this.def.badge!;
    const silver = this.badgePart;
    const gold = silver + 1;
    const shownPart = this.tier >= 3 ? gold : this.tier === 2 ? silver : -1;
    const grow = st.morph >= 1 ? 1 : easeOutBack(THREE.MathUtils.clamp(st.morph * 1.6 - 0.25, 0, 1), 2.4);
    const [x, y, z] = badge.at;
    for (const part of [silver, gold]) {
      if (part !== shownPart || grow <= 0) put(part, HIDDEN);
      else putLocal(this.base, put, part, x, y, z, badge.rx ?? 0, badge.ry ?? 0, 0, badge.size * grow);
    }
  }
}
