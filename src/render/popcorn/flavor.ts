import * as THREE from 'three';
import { FLAVORS, PLAIN_FLAVOR, type FlavorDef, type FlavorEffect } from '../../content/flavors.ts';
import { clamp01, easeInOutCubic, easeOutCubic, lerp } from '../../motion/ease.ts';
import type { Rng } from '../../motion/rng.ts';
import type { Stage } from '../core/stage.ts';
import { SpriteKind, type Sprites } from '../fx/sprites.ts';
import { addToy, at, Kit, P } from '../geometry/kit.ts';
import { popcornUniforms as U } from '../materials/popcorn.ts';

const EFFECT_CODE: Record<FlavorEffect, number> = { none: 0, salt: 1, rainbow: 2, stars: 3, gold: 4, mystery: 5 };

const ENTER = 0.26;
const SHAKE = 0.5;
const LEAVE = 0.24;
const SPREAD_SECONDS = 1.05;

function bottleGeometry(): THREE.BufferGeometry {
  const kit = new Kit();
  kit.add(
    P.lathe(
      [
        [0, 0],
        [0.3, 0],
        [0.33, 0.06],
        [0.33, 0.56],
        [0.17, 0.74],
        [0.17, 0.86],
        [0, 0.86],
      ],
      28,
      0.05,
    ),
    { color: '#ffffff', gloss: 0.85 },
  );
  kit.add(P.puck(0.2, 0.19, 0.16, 24, 0.03), { color: '#c7d3df', gloss: 1, matrix: at(0, 0.84, 0) });
  for (let i = 0; i < 5; i += 1) {
    const a = (i / 5) * Math.PI * 2;
    kit.add(P.sphere(0.022, 6, 5), { color: '#2a2933', outline: 0, matrix: at(Math.cos(a) * 0.1, 1.0, Math.sin(a) * 0.1) });
  }
  return kit.build();
}

export function applyFlavorInstant(flavor: FlavorDef): void {
  U.uPopCream.value.set(flavor.cream);
  U.uPopShade.value.set(flavor.shade);
  U.uPopDeep.value.set(flavor.deep);
  U.uPopHull.value.set(flavor.hull);
  U.uPopSheen.value = flavor.sheen;
  U.uEffect.value.set(EFFECT_CODE[flavor.effect], EFFECT_CODE[flavor.effect]);
  U.uWave.value.z = -1;
}

const flavorOf = (owned: number): FlavorDef => (owned <= 0 ? PLAIN_FLAVOR : FLAVORS[Math.min(owned, FLAVORS.length) - 1]!);

/** Seasoning bottle flies in, shakes over the heap, and the new color spreads from the landing point. */
export class FlavorShow {
  private readonly bottle: THREE.Group;
  private readonly tint: THREE.Mesh[];
  private readonly sprites: Sprites;
  private readonly rng: Rng;
  private readonly spreadRadius: number;
  private readonly home = new THREE.Vector3();
  private readonly color = new THREE.Color();
  private readonly dust = new THREE.Color();
  private readonly queue: number[] = [];
  private t = -1;
  private spreadT = -1;
  private sprinkleTimer = 0;
  private center = new THREE.Vector2();

  constructor(stage: Stage, parent: THREE.Object3D, sprites: Sprites, rng: Rng, spreadRadius: number) {
    this.sprites = sprites;
    this.rng = rng;
    this.spreadRadius = spreadRadius;
    this.bottle = addToy(stage, parent, bottleGeometry());
    this.bottle.visible = false;
    this.tint = this.bottle.children as THREE.Mesh[];
  }

  get busy(): boolean {
    return this.t >= 0 || this.spreadT >= 0;
  }

  /** Plays the show for one purchased flavor; rapid purchases queue up. */
  play(flavor: number): void {
    this.queue.push(flavor);
    if (this.t < 0 && this.spreadT < 0) this.startNext();
  }

  private startNext(): void {
    const next = this.queue.shift();
    if (next === undefined) return;
    const def = FLAVORS[next]!;
    this.t = 0;
    this.color.set(def.bottle);
    this.dust.set(def.shade).lerp(new THREE.Color(1, 1, 1), 0.15);
    U.uCreamB.value.set(def.cream);
    U.uShadeB.value.set(def.shade);
    U.uDeepB.value.set(def.deep);
    U.uHullB.value.set(def.hull);
    U.uSheenB.value = def.sheen;
    U.uEffect.value.y = EFFECT_CODE[def.effect];
    this.bottle.visible = true;
    // Each mesh gets its own copy of the paint so the bottle can wear the flavor's color.
    for (const mesh of this.tint) mesh.userData.flavor = next;
    this.bottleTint();
  }

  private bottleTint(): void {
    const body = this.tint[0]!;
    const geometry = body.geometry;
    const colors = geometry.getAttribute('color') as THREE.BufferAttribute;
    const positions = geometry.getAttribute('position') as THREE.BufferAttribute;
    for (let i = 0; i < colors.count; i += 1) {
      const y = positions.getY(i);
      const painted = y < 0.8;
      colors.setXYZ(i, painted ? this.color.r : 0.55, painted ? this.color.g : 0.6, painted ? this.color.b : 0.66);
    }
    colors.needsUpdate = true;
  }

  update(dt: number, targetX: number, targetY: number, targetZ: number): void {
    if (this.t >= 0) this.updateBottle(dt, targetX, targetY, targetZ);
    if (this.spreadT >= 0) {
      this.spreadT += dt;
      const u = clamp01(this.spreadT / SPREAD_SECONDS);
      U.uWave.value.set(this.center.x, this.center.y, lerp(0, this.spreadRadius, easeInOutCubic(u)));
      if (u >= 1) {
        this.spreadT = -1;
        U.uPopCream.value.copy(U.uCreamB.value);
        U.uPopShade.value.copy(U.uShadeB.value);
        U.uPopDeep.value.copy(U.uDeepB.value);
        U.uPopHull.value.copy(U.uHullB.value);
        U.uPopSheen.value = U.uSheenB.value;
        U.uEffect.value.x = U.uEffect.value.y;
        U.uWave.value.z = -1;
        if (this.t < 0) this.startNext();
      }
    }
  }

  private updateBottle(dt: number, x: number, y: number, z: number): void {
    this.t += dt;
    const t = this.t;
    // Off to the side and low enough to stay clear of the counter at the top of the screen.
    const hover = this.home.set(x + 1.25, y + 0.85, z + 0.5);
    const b = this.bottle;
    if (t < ENTER) {
      const u = easeOutCubic(t / ENTER);
      b.position.set(lerp(hover.x + 3.4, hover.x, u), lerp(hover.y + 2.6, hover.y, u), hover.z);
      b.rotation.set(0, 0, lerp(-1.2, Math.PI * 0.82, u));
    } else if (t < ENTER + SHAKE) {
      const phase = (t - ENTER) / SHAKE;
      b.position.copy(hover);
      b.position.y += Math.sin(phase * Math.PI * 7) * 0.12;
      b.rotation.set(0, 0, Math.PI * 0.82 + Math.sin(phase * Math.PI * 7) * 0.14);
      this.sprinkle(dt, hover);
      if (this.spreadT < 0 && phase > 0.12) {
        this.spreadT = 0;
        this.center.set(x, z);
      }
    } else if (t < ENTER + SHAKE + LEAVE) {
      const u = (t - ENTER - SHAKE) / LEAVE;
      const e = u * u;
      b.position.set(lerp(hover.x, hover.x - 3.6, e), lerp(hover.y, hover.y + 3, e), hover.z);
      b.rotation.set(0, 0, lerp(Math.PI * 0.82, Math.PI * 1.5, e));
    } else {
      b.visible = false;
      this.t = -1;
      if (this.spreadT < 0) this.startNext();
    }
  }

  private sprinkle(dt: number, from: THREE.Vector3): void {
    this.sprinkleTimer -= dt;
    while (this.sprinkleTimer <= 0) {
      this.sprinkleTimer += 0.012;
      const r = this.rng;
      this.sprites.spawn({
        x: from.x + r.range(-0.12, 0.12) - 0.3,
        y: from.y - 0.42,
        z: from.z + r.range(-0.12, 0.12),
        vx: r.range(-0.7, 0.7),
        vy: r.range(-2.2, -1),
        vz: r.range(-0.7, 0.7),
        gravity: 9,
        sizeStart: r.range(0.018, 0.034),
        sizeEnd: 0.012,
        life: r.range(0.26, 0.42),
        color: this.dust,
        alpha: 1,
        kind: SpriteKind.Drop,
      });
    }
  }

  /** Instantly matches a loaded save. */
  sync(flavors: number): void {
    this.queue.length = 0;
    this.t = -1;
    this.spreadT = -1;
    this.bottle.visible = false;
    applyFlavorInstant(flavorOf(flavors));
  }
}
