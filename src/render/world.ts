import * as THREE from 'three';
import type { EventBus } from '../events/bus.ts';
import type { GameEvents } from '../events/game-events.ts';
import { clamp01, easeOutCubic, Spring } from '../motion/ease.ts';
import { Rng } from '../motion/rng.ts';
import type { Simulation } from '../sim/simulation.ts';
import { applyLightRig, globals } from './core/globals.ts';
import type { Stage } from './core/stage.ts';
import { Flames } from './fx/flames.ts';
import { SpriteKind, Sprites } from './fx/sprites.ts';
import { PieceBatches } from './popcorn/batches.ts';
import { PopDirector } from './popcorn/director.ts';
import { Pile } from './popcorn/pile.ts';
import {
  BURNERS,
  buildStoveScene,
  PAN_SLOTS,
  POT,
  stoveCamera,
  stoveLight,
  stovePile,
  type StoveScene,
} from './scenes/stove.ts';

export interface WorldHooks {
  onBurst(screenX: number, screenY: number, combo: number, gain: number, manual: boolean): void;
  onLand(gain: number): void;
}

interface PanState {
  age: number;
  timer: number;
  hop: Spring;
  lidHop: number;
  lidSpin: number;
  shake: number;
}

const STAGE_ONE_GOAL = 1000;
const steam = new THREE.Color(0.9, 0.88, 0.86);
const m = new THREE.Matrix4();
const q = new THREE.Quaternion();
const e = new THREE.Euler();
const v = new THREE.Vector3();
const s = new THREE.Vector3(1, 1, 1);
const ndc = new THREE.Vector2();
const focus = new THREE.Vector3();
const potCenter = new THREE.Vector3(0, 1, 0);
const smoothstep = (x: number, a: number, b: number): number => {
  const t = clamp01((x - a) / (b - a));
  return t * t * (3 - 2 * t);
};

export class World {
  readonly root = new THREE.Group();
  readonly pile: Pile;
  readonly director: PopDirector;
  readonly scene: StoveScene;
  readonly sprites: Sprites;
  /** Manual gains still in the air; the counter catches up as they land. */
  pendingGain = 0;
  private readonly stage: Stage;
  private readonly sim: Simulation;
  private readonly hooks: WorldHooks;
  private readonly flames: Flames;
  private readonly rng = new Rng(77);
  private readonly raycaster = new THREE.Raycaster();
  private readonly pans: PanState[] = [];
  private readonly potKick = new Spring(0, 420, 15);
  private readonly lidRattle = new Spring(0, 620, 17);
  private level = 0;
  private time = 0;
  private steamTimer = 0;
  private cameraLocked = false;

  constructor(stage: Stage, sim: Simulation, bus: EventBus<GameEvents>, hooks: WorldHooks) {
    this.stage = stage;
    this.sim = sim;
    this.hooks = hooks;
    stage.scene.add(this.root);
    applyLightRig(stoveLight);
    stage.shadow.setFrustum({ x: 0, y: 0.8, z: -0.3 }, 8.2);
    this.applyCamera();

    this.scene = buildStoveScene(stage, this.root);
    this.pile = new Pile(stage, this.root, stovePile);
    this.pile.setLevel(0);
    this.pile.update(0);
    this.sprites = new Sprites(this.root);
    this.flames = new Flames(this.root, BURNERS);
    this.flames.setLit(1);
    const batches = new PieceBatches(stage, this.root);

    this.director = new PopDirector(
      this.pile,
      batches,
      this.sprites,
      this.rng,
      {
        onSquash: () => this.potKick.kick(-0.16),
        onBurst: (position, combo, gain, manual) => {
          if (manual) {
            this.potKick.kick(-0.3);
            this.lidRattle.kick(1.6);
          }
          v.copy(position).project(this.stage.camera);
          this.hooks.onBurst(
            (v.x * 0.5 + 0.5) * this.stage.renderer.domElement.clientWidth,
            (0.5 - v.y * 0.5) * this.stage.renderer.domElement.clientHeight,
            combo,
            gain,
            manual,
          );
        },
        onLand: (_position, gain) => {
          this.pendingGain = Math.max(0, this.pendingGain - gain);
          this.hooks.onLand(gain);
        },
      },
      POT.innerR * 0.72,
    );

    bus.on('producer_purchased', ({ producer, owned }) => {
      if (producer === 0) this.syncPans(owned, true);
    });
  }

  private applyCamera(): void {
    if (this.cameraLocked) return;
    const { camera, post } = this.stage;
    const t = smoothstep(this.level, 0.3, 0.92);
    const near = 1 - (1 - stoveCamera.closeDistance) * (1 - t);
    focus.lerpVectors(stoveCamera.closeTarget, stoveCamera.target, t);
    camera.position.copy(stoveCamera.position).sub(stoveCamera.target).multiplyScalar(near).add(focus);
    camera.fov = stoveCamera.fov;
    camera.lookAt(focus);
    this.stage.viewShiftX = stoveCamera.shiftX;
    camera.updateProjectionMatrix();
    post.params.focusDistance = camera.position.distanceTo(potCenter);
    post.params.focusRange = stoveCamera.focusRange * near;
    post.params.aoRadius = 0.42;
  }

  /** Called directly from the input handler, so the response is in the very next frame. */
  click(clientX: number, clientY: number): void {
    const { count, gainEach } = this.sim.click();
    const canvas = this.stage.renderer.domElement;
    ndc.set((clientX / canvas.clientWidth) * 2 - 1, 1 - (clientY / canvas.clientHeight) * 2);
    this.raycaster.setFromCamera(ndc, this.stage.camera);
    this.pendingGain += count * gainEach;
    this.director.click(this.raycaster.ray, count, gainEach);
  }

  private syncPans(owned: number, animate: boolean): void {
    const visible = Math.min(owned, PAN_SLOTS.length);
    while (this.pans.length < visible) {
      this.pans.push({
        age: animate ? 0 : 10,
        timer: this.rng.range(0.4, 2),
        hop: new Spring(0, 260, 11),
        lidHop: 0,
        lidSpin: 0,
        shake: 0,
      });
    }
    this.flames.setLit(1 + this.pans.length);
  }

  update(deltaSeconds: number): void {
    const dt = deltaSeconds;
    this.time += dt;
    const shown = Math.max(0, this.sim.state.totalEarned - this.pendingGain);
    const target = clamp01(Math.log1p(shown) / Math.log1p(STAGE_ONE_GOAL));
    this.level += (target - this.level) * (1 - Math.exp(-dt * 7));
    this.pile.setLevel(this.level);
    this.applyCamera();

    this.syncPans(this.sim.state.owned[0]!, false);
    this.director.update(dt);
    this.updatePot(dt);
    this.updatePans(dt);
    this.updateMoon();
    this.updateSteam(dt);
    this.pile.update(dt);
    this.sprites.flush();
  }

  private updatePot(dt: number): void {
    const kick = this.potKick.update(dt);
    const pot = this.scene.pot;
    pot.scale.set(1 - kick * 0.018, 1 + kick * 0.03, 1 - kick * 0.018);

    const rattle = this.lidRattle.update(dt);
    const lid = this.scene.lid;
    const rest = this.scene.lidRest;
    e.set(0, 0, rattle * 0.016);
    q.setFromEuler(e);
    lid.quaternion.copy(rest.quaternion).multiply(q);
    lid.position.copy(rest.position);
    lid.position.y += Math.abs(rattle) * 0.008;
  }

  private updatePans(dt: number): void {
    const { body, lid } = this.scene.pans;
    this.pans.forEach((pan, index) => {
      pan.age += dt;
      pan.timer -= dt;
      const slot = PAN_SLOTS[index]!;
      if (pan.timer <= 0 && pan.age > 0.7) {
        pan.timer = this.rng.range(2.2, 4.2);
        pan.shake = 1;
        pan.hop.kick(1.9);
        const gag = this.rng.next() < 0.3;
        pan.lidHop = gag ? 1 : 0.36;
        pan.lidSpin = gag ? this.rng.range(4, 7) * this.rng.sign() : 0;
        this.director.launch(slot[0], slot[1] + 0.72, slot[2], 0);
      }
      pan.shake = Math.max(0, pan.shake - dt * 3.2);
      const hop = pan.hop.update(dt);
      const drop = 1 - easeOutCubic(pan.age / 0.42);
      const landing = pan.age < 0.75 ? Math.exp(-(pan.age - 0.42) * 12) * Math.sin(Math.max(0, pan.age - 0.42) * 38) * 0.2 : 0;
      const jitter = pan.shake * 0.018;
      v.set(
        slot[0] + Math.sin(this.time * 61 + index) * jitter,
        slot[1] + drop * drop * 4.5 + Math.max(0, hop) * 0.06,
        slot[2] + Math.cos(this.time * 53 + index) * jitter,
      );
      const squash = 1 + landing - hop * 0.05;
      s.set(1 + (1 - squash) * 0.5, squash, 1 + (1 - squash) * 0.5);
      e.set(0, index * 1.7 + 0.5, 0);
      q.setFromEuler(e);
      m.compose(v, q, s);
      body.setMatrixAt(index, m);

      pan.lidHop = Math.max(0, pan.lidHop - dt * 1.55);
      const arc = 4 * pan.lidHop * (1 - pan.lidHop);
      v.y += 0.64 * squash + arc * (pan.lidSpin !== 0 ? 1.15 : 0.16);
      e.set(arc * 0.32, this.time * 0.1 + index, pan.lidSpin * arc * 0.3);
      q.setFromEuler(e);
      m.compose(v, q, s.set(1, 1, 1));
      lid.setMatrixAt(index, m);
    });
    body.commit(this.pans.length);
    lid.commit(this.pans.length);
  }

  private updateMoon(): void {
    const { moon, moonHome } = this.scene;
    const t = this.time % 11;
    const tremble = t > 9.8 ? Math.sin((t - 9.8) * Math.PI / 1.2) : 0;
    moon.position.copy(moonHome);
    moon.position.x += Math.sin(this.time * 47) * 0.012 * tremble;
    moon.position.y += Math.cos(this.time * 41) * 0.009 * tremble;
  }

  private updateSteam(dt: number): void {
    this.steamTimer -= dt;
    if (this.steamTimer > 0) return;
    this.steamTimer = 0.2;
    const r = this.rng;
    const a = r.range(0, 6.28);
    const radius = r.range(0.2, 0.9);
    this.sprites.spawn({
      x: Math.cos(a) * radius,
      y: Math.max(this.pile.heightAt(0, 0), POT.rimY - 0.15),
      z: Math.sin(a) * radius,
      vx: r.range(-0.08, 0.08),
      vy: r.range(0.42, 0.7),
      vz: r.range(-0.05, 0.05),
      drag: 0.25,
      sizeStart: r.range(0.16, 0.24),
      sizeEnd: r.range(0.55, 0.85),
      life: r.range(1.7, 2.5),
      color: steam,
      alpha: 0.07,
      kind: SpriteKind.Puff,
      spin: r.range(-0.4, 0.4),
    });
  }

  /** QA camera override for close inspection. */
  viewFrom(position: THREE.Vector3Tuple, target: THREE.Vector3Tuple, fov: number): void {
    this.cameraLocked = true;
    const { camera, post } = this.stage;
    camera.position.set(...position);
    camera.fov = fov;
    camera.lookAt(...target);
    this.stage.viewShiftX = 0;
    camera.updateProjectionMatrix();
    post.params.focusDistance = camera.position.distanceTo(v.set(...target));
    post.params.focusRange = 1.4;
  }

  /** QA view for judging a single flake at hero size. */
  showcase(): void {
    this.cameraLocked = true;
    const camera = this.stage.camera;
    const center = new THREE.Vector3(0, 3.1, 0.5);
    for (let i = 0; i < 6; i += 1) {
      const x = -1.04 + (i % 3) * 1.04;
      const y = center.y + (i < 3 ? 0.5 : -0.5);
      q.setFromEuler(e.set(i * 1.3 + 0.4, i * 2.1 + 0.8, i * 0.7));
      this.director.display(i, x, y, center.z, 0.46, 1, q);
    }
    camera.position.set(0, 3.3, 5.5);
    camera.fov = 26;
    camera.lookAt(center);
    this.stage.viewShiftX = 0;
    camera.updateProjectionMatrix();
    this.stage.post.params.focusDistance = 5;
    this.stage.post.params.focusRange = 2;
    globals.uOutlineRefDist.value = 10;
  }
}
