import * as THREE from 'three';
import { easeOutCubic, Spring } from '../motion/ease.ts';
import type { Stage } from './core/stage.ts';
import { addToyInstances, type ToyInstances } from './geometry/kit.ts';
import { HIDDEN, type UnitDef, type UnitHost, type UnitState } from './machines/common.ts';
import { HOME_MACHINES } from './machines/home.ts';
import { SKY_MACHINES } from './machines/sky.ts';
import { TOWN_MACHINES } from './machines/town.ts';
import { signGeometry, signMaterial } from './materials/sign.ts';
import type { UnitKindName, UnitSlot } from './scenes/types.ts';

export type { UnitHost } from './machines/common.ts';
export { cannonCap, cannonDrum, cannonFrame } from './machines/home.ts';

export const UNIT_DEFS: Record<UnitKindName, UnitDef> = { ...HOME_MACHINES, ...TOWN_MACHINES, ...SKY_MACHINES };

const pos = new THREE.Vector3();
const quat = new THREE.Quaternion();
const euler = new THREE.Euler();
const scale = new THREE.Vector3();
/** A machine goes under once the heap reaches this share of its height. */
const BURY_AT = 0.6;

interface SignInstances {
  mesh: THREE.InstancedMesh;
  part: number;
}

/** All visible copies of one unit type in one scene. */
export class UnitRig {
  private readonly def: UnitDef;
  private readonly slots: UnitSlot[];
  private readonly host: UnitHost;
  private readonly parts: ToyInstances[];
  private readonly signs: SignInstances[];
  private readonly cursors: number[];
  private readonly states: UnitState[] = [];
  private readonly base = new THREE.Matrix4();
  private readonly height: number;
  private readonly lowest: number;
  private readonly reach: number;
  private tier = 0;

  constructor(stage: Stage, parent: THREE.Object3D, kind: UnitKindName, slots: UnitSlot[], host: UnitHost) {
    this.def = UNIT_DEFS[kind];
    this.slots = slots;
    this.host = host;
    const shadowParts = this.def.shadowParts ?? this.def.parts.length;
    let height = 0;
    let lowest = 0;
    let reach = 0;
    this.parts = this.def.parts.map((make, index) => {
      const geometry = make();
      geometry.computeBoundingBox();
      const box = geometry.boundingBox!;
      height = Math.max(height, box.max.y);
      lowest = Math.min(lowest, box.min.y);
      if (index === 0) reach = Math.max(-box.min.x, box.max.x, -box.min.z, box.max.z);
      return addToyInstances(stage, parent, geometry, slots.length, index < shadowParts);
    });
    this.height = height;
    this.lowest = lowest;
    this.reach = reach;
    this.signs = (this.def.signs ?? []).map((sign) => {
      const part = sign.part ?? 0;
      const mesh = new THREE.InstancedMesh(
        signGeometry(sign.width, sign.height, sign.matrix),
        signMaterial(sign.text, { aspect: sign.width / sign.height, ...sign.style }),
        slots.length,
      );
      mesh.instanceMatrix = this.parts[part]!.body.instanceMatrix;
      mesh.frustumCulled = false;
      mesh.count = 0;
      parent.add(mesh);
      return { mesh, part };
    });
    this.cursors = this.parts.map(() => 0);
    const tints = this.def.tints;
    if (tints) {
      const color = new THREE.Color();
      for (const part of this.parts) {
        slots.forEach((_slot, index) => {
          color.set(tints[index % tints.length]!);
          part.body.setColorAt(index, color);
        });
        part.ink.instanceColor = part.body.instanceColor;
      }
    }
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
      out.push(new THREE.Vector3(slot.x, slot.y + this.height * s, slot.z), new THREE.Vector3(slot.x, slot.y + this.lowest * s, slot.z));
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
    });
  }

  /** Leaves one copy on show, so it can be inspected without its neighbors in the way. */
  keepOnlyFirst(): void {
    this.states.length = Math.min(this.states.length, 1);
  }

  hide(): void {
    for (const part of this.parts) part.commit(0);
    for (const sign of this.signs) sign.mesh.count = 0;
    this.states.length = 0;
  }

  sync(owned: number, animate: boolean, delay = 0): void {
    const count = Math.min(owned, this.slots.length);
    this.tier = owned >= 100 ? 3 : owned >= 50 ? 2 : owned >= 25 ? 1 : 0;
    while (this.states.length < count) {
      const period = this.def.interval[1];
      this.states.push({
        age: animate ? -delay : 10,
        timer: this.host.rng.range(0.3, period),
        period,
        hop: new Spring(0, 260, 11),
        shake: 0,
        kick: 0,
        spin: this.host.rng.range(0, 6),
        lidSpin: 0,
        sunk: -1,
      });
    }
    this.states.length = Math.min(this.states.length, count);
  }

  update(dt: number, time: number, tempo: number): void {
    const def = this.def;
    this.cursors.fill(0);
    const put = (part: number, matrix: THREE.Matrix4): void => {
      this.parts[part]!.setMatrixAt(this.cursors[part]!, matrix);
      this.cursors[part]! += 1;
    };
    const speed = 1 + this.tier * 0.35;
    this.states.forEach((st, index) => {
      st.age += dt;
      const slot = this.slots[index]!;
      const s = slot.scale ?? 1;
      if (st.age < 0) {
        for (let part = 0; part < this.parts.length; part += 1) put(part, HIDDEN);
        return;
      }
      // Half-buried machines leave odd scraps poking out, so the heap swallows them whole.
      const height = this.height * s;
      const line = slot.y + height * BURY_AT;
      const surface = this.host.heightAt(slot.x, slot.z);
      const under = surface > line || (st.sunk > 0.5 && surface > line - height * 0.08);
      st.sunk = st.sunk < 0 ? (under ? 1 : 0) : THREE.MathUtils.clamp(st.sunk + (under ? dt : -dt) * 2.4, 0, 1);
      if (st.sunk >= 1) {
        for (let part = 0; part < this.parts.length; part += 1) put(part, HIDDEN);
        return;
      }
      st.timer -= dt * tempo * speed;
      st.spin += dt * (2.2 + tempo) * speed;
      const rotation = slot.rotation ?? 0;
      if (st.timer <= 0 && st.age > 0.7) {
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
      const drop = 1 - easeOutCubic(st.age / 0.42);
      const landing = st.age < 0.75 ? Math.exp(-(st.age - 0.42) * 12) * Math.sin(Math.max(0, st.age - 0.42) * 38) * 0.2 : 0;
      const jitter = st.shake * 0.018 * s;
      pos.set(
        slot.x + Math.sin(time * 61 + index) * jitter,
        slot.y + (drop * drop * def.dropHeight + Math.max(0, hop) * 0.06) * s - st.sunk * st.sunk * height * 0.85,
        slot.z + Math.cos(time * 53 + index) * jitter,
      );
      const squash = 1 + landing - hop * 0.05;
      euler.set(0, rotation, 0);
      quat.setFromEuler(euler);
      const shrink = s * (1 - st.sunk * 0.3);
      scale.set(shrink * (1 + (1 - squash) * 0.5), shrink * squash, shrink * (1 + (1 - squash) * 0.5));
      this.base.compose(pos, quat, scale);
      def.pose(st, time, index, this.tier, this.base, put);
    });
    this.parts.forEach((part, index) => part.commit(this.cursors[index]!));
    for (const sign of this.signs) sign.mesh.count = this.cursors[sign.part]!;
  }
}
