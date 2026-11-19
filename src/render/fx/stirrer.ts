import * as THREE from 'three';
import type { Stage } from '../core/stage.ts';
import { addToy } from '../geometry/kit.ts';
import { at, Kit, M, P, rivets, rod, V } from '../machines/common.ts';

function baseGeometry(): THREE.BufferGeometry {
  const kit = new Kit();
  kit.add(P.puck(0.34, 0.3, 0.1, 20, 0.02), { ...M.iron, matrix: at(0, 0, 0) });
  rivets(kit, V(-0.24, 0.11, 0.1), V(0.24, 0.11, 0.1), 3, 0.022, M.steel);
  return kit.build();
}

/** One unit tall, so it can telescope by scaling. */
function shaftGeometry(): THREE.BufferGeometry {
  const kit = new Kit();
  kit.add(P.puck(0.09, 0.09, 1, 14, 0.001), { ...M.chrome });
  return kit.build();
}

function headGeometry(reach: number): THREE.BufferGeometry {
  const kit = new Kit();
  kit.add(P.box(0.34, 0.3, 0.3, 0.06, 2), { ...M.red, matrix: at(0, 0, 0) });
  kit.add(P.box(reach, 0.1, 0.13, 0.04, 2), { ...M.red, matrix: at(reach / 2, 0.06, 0) });
  kit.add(P.box(0.26, 0.26, 0.22, 0.05, 2), { ...M.red, matrix: at(reach, 0.04, 0) });
  kit.add(P.torus(0.13, 0.03, 6, 18), { ...M.brass, outline: 0.4, matrix: at(0, 0, 0.16) });
  return kit.build();
}

function paddleGeometry(depth: number, blades: number): THREE.BufferGeometry {
  const kit = new Kit();
  rod(kit, V(0, 0, 0), V(0, -depth, 0), 0.03, M.chrome);
  kit.add(P.torus(0.05, 0.018, 6, 12), { ...M.brass, outline: 0, matrix: at(0, -0.05, 0, [Math.PI / 2, 0, 0]) });
  for (let i = 0; i < blades; i += 1) {
    const a = (i / blades) * Math.PI * 2;
    kit.add(P.box(0.5, 0.2, 0.03, 0.012, 1), { ...M.steel, matrix: at(Math.cos(a) * 0.27, -depth + 0.08, -Math.sin(a) * 0.27, [0, a, 0.25]) });
  }
  return kit.build();
}

const SHAFT_START = 0.08;
const PADDLE_DEPTH = 1.15;
/** How deep into the heap the paddle stays once the arm is riding on top of it. */
const STIR_DEPTH = 0.75;

/** The automatic stirrer: appears with its upgrade, speeds up with each one, and climbs with the heap. */
export class Stirrer {
  private readonly group = new THREE.Group();
  private readonly shaft: THREE.Group;
  private readonly head: THREE.Group;
  private readonly paddle: THREE.Group;
  private readonly restHeight: number;
  private readonly scale: number;
  private height: number;
  private speed = 0;
  private angle = 0;
  private entrance = 1;

  constructor(stage: Stage, parent: THREE.Object3D, rimY: number, radius: number, k: number) {
    this.scale = k;
    const reach = (radius + 0.38 * k) / k;
    this.restHeight = (rimY + 0.72 * k) / k;
    this.height = this.restHeight;
    this.group.visible = false;
    this.group.scale.setScalar(k);
    // Stands behind and to one side, leaving the front of the vessel open to the camera.
    const yaw = 0.95;
    this.group.position.set(Math.sin(yaw) * -reach * k, 0, Math.cos(yaw) * -reach * k);
    // Local +X, the direction of the arm, points at the vessel.
    this.group.rotation.y = Math.atan2(-Math.cos(yaw), Math.sin(yaw));
    addToy(stage, this.group, baseGeometry());
    this.shaft = addToy(stage, this.group, shaftGeometry());
    this.shaft.position.y = SHAFT_START;
    this.head = addToy(stage, this.group, headGeometry(reach));
    this.paddle = addToy(stage, this.head, paddleGeometry(PADDLE_DEPTH, 3));
    this.paddle.position.set(reach, -0.08, 0);
    parent.add(this.group);
    this.place();
  }

  private place(): void {
    this.shaft.scale.y = this.height - SHAFT_START;
    this.head.position.y = this.height;
  }

  /** `power` is how many pops per second the machine makes. */
  setPower(power: number): void {
    if (power > 0 && !this.group.visible) {
      this.group.visible = true;
      this.entrance = 0;
    }
    this.speed = 3 + power * 1.4;
  }

  /** One pop made: the paddle gives a little dip. */
  kick(): void {
    this.paddle.scale.y = 1.12;
  }

  hide(): void {
    this.group.visible = false;
  }

  update(dt: number, heapTop: number): void {
    if (!this.group.visible) return;
    this.entrance = Math.min(1, this.entrance + dt * 2.2);
    const t = this.entrance;
    this.group.scale.setScalar(this.scale * t * (1 + Math.sin(t * Math.PI) * 0.14));
    // The arm climbs its column so the paddle keeps working in the top of the heap.
    const wanted = Math.max(this.restHeight, heapTop / this.scale + PADDLE_DEPTH - STIR_DEPTH);
    this.height += (wanted - this.height) * Math.min(1, dt * 3);
    this.place();
    this.angle += dt * this.speed;
    this.paddle.rotation.y = this.angle;
    this.paddle.scale.y += (1 - this.paddle.scale.y) * Math.min(1, dt * 12);
  }
}
