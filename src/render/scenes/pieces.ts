import * as THREE from 'three';
import { clamp01, easeOutBack } from '../../motion/ease.ts';
import { globals } from '../core/globals.ts';
import type { Stage } from '../core/stage.ts';
import { SpriteKind } from '../fx/sprites.ts';
import { ToyRig } from '../geometry/rig.ts';
import { at, Kit, M, P, paint, type Paint } from '../machines/common.ts';
import type { SceneContext } from './types.ts';

/** Seconds a bought decoration takes to pop into place. */
const POP_SECONDS = 0.75;
const sparkle = new THREE.Color(2.4, 2, 1.1);
const dust = new THREE.Color('#d9c8b2');
const v = new THREE.Vector3();

interface Decoration {
  holder: THREE.Object3D;
  rest: THREE.Vector3;
  size: number;
  shown: boolean;
  /** Seconds into the pop; at POP_SECONDS or more it is in place. */
  t: number;
  burst: boolean;
}

/**
 * Everything in a scene that comes, goes or moves but is not a machine: decorations the player
 * buys, toy figures, props with a job to do. It is all one rig, so it costs one draw per pass
 * however much of it there is; pieces that are not on show collapse to nothing.
 */
export class SetPieces {
  private readonly rig = new ToyRig();
  private readonly root: THREE.Object3D;
  private readonly decorations = new Map<string, Decoration>();

  constructor(root: THREE.Object3D) {
    this.root = root;
  }

  /** Adds a piece and returns the object that moves it; `parent` defaults to the scene. */
  part(geometry: THREE.BufferGeometry, parent: THREE.Object3D = this.root, options: { ink?: boolean; shadow?: boolean } = {}): THREE.Group {
    return this.rig.part(parent, geometry, options);
  }

  /** A group to hang pieces on, so they move together. */
  group(parent: THREE.Object3D = this.root, x = 0, y = 0, z = 0): THREE.Group {
    const group = new THREE.Group();
    group.position.set(x, y, z);
    parent.add(group);
    return group;
  }

  /** `holder` is what upgrade `id` buys: hidden until owned, then it pops in. `size` scales the sparkle. */
  decoration(id: string, holder: THREE.Object3D, size: number): void {
    holder.visible = false;
    this.decorations.set(id, { holder, rest: holder.scale.clone(), size, shown: false, t: POP_SECONDS, burst: false });
  }

  owns(id: string): boolean {
    return this.decorations.get(id)?.shown ?? false;
  }

  /** Must come last, after every piece has been added. */
  build(stage: Stage): void {
    this.rig.build(stage, this.root, globals.uTime);
  }

  /** Shows the decorations that are owned. With `animate`, a new one pops in with sparkles. */
  sync(owned: readonly string[], animate: boolean): void {
    for (const [id, item] of this.decorations) {
      const has = owned.includes(id);
      if (has === item.shown) continue;
      item.shown = has;
      item.holder.visible = has;
      item.t = has && animate ? 0 : POP_SECONDS;
      item.burst = has && animate;
      item.holder.scale.copy(item.rest);
      if (item.t === 0) item.holder.scale.multiplyScalar(0.001);
    }
  }

  /** Runs the pop of anything just bought. */
  update(dt: number, ctx: SceneContext): void {
    for (const item of this.decorations.values()) {
      if (!item.shown || item.t >= POP_SECONDS) continue;
      if (item.burst) {
        item.burst = false;
        this.root.worldToLocal(item.holder.getWorldPosition(v));
        this.celebrate(ctx, v, item.size);
      }
      item.t += dt;
      const grow = Math.max(0.001, easeOutBack(clamp01(item.t / POP_SECONDS), 2.2));
      item.holder.scale.copy(item.rest).multiplyScalar(grow);
    }
  }

  private celebrate(ctx: SceneContext, at: THREE.Vector3, size: number): void {
    const r = ctx.rng;
    ctx.sprites.spawn({ x: at.x, y: at.y, z: at.z, sizeStart: 0.3 * size, sizeEnd: 2.2 * size, life: 0.55, color: sparkle, alpha: 0.8, additive: 1, kind: SpriteKind.Ring });
    for (let i = 0; i < 9; i += 1) {
      const a = r.range(0, 6.28);
      ctx.sprites.spawn({ x: at.x, y: at.y, z: at.z, vx: Math.cos(a) * 2 * size, vy: r.range(1, 3) * size, vz: Math.sin(a) * 2 * size, gravity: 4 * size, sizeStart: 0.26 * size, sizeEnd: 0.03 * size, life: r.range(0.5, 0.9), color: sparkle, alpha: 1, additive: 1, kind: SpriteKind.Star, spin: r.range(-4, 4) });
    }
    for (let i = 0; i < 6; i += 1) {
      const a = (i / 6) * 6.28;
      ctx.sprites.spawn({ x: at.x, y: at.y, z: at.z, vx: Math.cos(a) * 1.6 * size, vy: 0.2 * size, vz: Math.sin(a) * 1.6 * size, drag: 3, sizeStart: 0.25 * size, sizeEnd: 0.8 * size, life: 0.6, color: dust, alpha: 0.3, kind: SpriteKind.Puff, spin: r.range(-1, 1) });
    }
  }
}

// Toy figures -------------------------------------------------------------------------------

export interface FigureLook {
  skin: string;
  shirt: string;
  pants: string;
  hair?: string;
  /** What they wear on their head, if anything but hair. */
  hat?: 'chef' | 'cap' | 'helmet' | 'pillbox';
  hatColor?: string;
}

/** A jointed toy figure, one unit tall, standing at its origin and facing +Z. */
export interface Figure {
  root: THREE.Group;
  head: THREE.Group;
  armL: THREE.Group;
  armR: THREE.Group;
}

const NECK = 0.62;
const SHOULDER: [number, number] = [0.175, 0.56];

/** Each builder adds its piece to `kit`, placed by `m`, so the pieces can also share one mesh. */
/** Segment count scaled for a crowd, which never needs the close-up roundness. */
const seg = (n: number, q: number): number => Math.max(5, Math.round(n * q));

function figureBody(look: FigureLook, kit = new Kit(), m = new THREE.Matrix4(), tinted = false, q = 1): Kit {
  const put = (local: THREE.Matrix4): THREE.Matrix4 => m.clone().multiply(local);
  const pants = { color: look.pants, gloss: 0.5, coat: 0.3, soft: 0.4, fixedColor: true };
  // A crowd tints its shirts per copy; a single figure keeps the color it was given.
  const shirt = { color: look.shirt, gloss: 0.6, coat: 0.35, soft: 0.4, fixedColor: !tinted };
  for (const side of [-1, 1]) {
    kit.add(P.capsule(0.062, 0.15, seg(4, q), seg(10, q)), { ...pants, matrix: put(at(side * 0.07, 0.15, 0)) });
    kit.add(P.sphere(0.07, seg(12, q), seg(8, q)), { color: '#2b2230', gloss: 0.7, fixedColor: true, matrix: put(at(side * 0.07, 0.035, 0.025, [0, 0, 0], [1, 0.62, 1.4])) });
  }
  kit.add(P.lathe([[0, 0.23], [0.15, 0.24], [0.172, 0.36], [0.158, 0.51], [0.11, 0.6], [0, 0.625]], seg(20, q), 0.04, q < 1 ? 2 : 3), { ...shirt, matrix: m });
  kit.add(P.torus(0.165, 0.017, 6, 22), { color: '#3a2a24', gloss: 0.6, outline: 0, fixedColor: true, matrix: put(at(0, 0.33, 0, [Math.PI / 2, 0, 0])) });
  for (const y of [0.43, 0.5]) kit.add(P.sphere(0.017, 6, 4), { ...M.brass, outline: 0, matrix: put(at(0, y, 0.158)) });
  return kit;
}

function figureHead(look: FigureLook, kit = new Kit(), m = new THREE.Matrix4(), q = 1): Kit {
  // The neck sits at the origin.
  const put = (local: THREE.Matrix4): THREE.Matrix4 => m.clone().multiply(local);
  const skin = { color: look.skin, gloss: 0.35, soft: 0.9, fixedColor: true };
  kit.add(P.capsule(0.05, 0.03, 3, 8), { ...skin, outline: 0, matrix: put(at(0, 0.02, 0)) });
  kit.add(P.sphere(0.17, seg(20, q), seg(14, q)), { ...skin, matrix: put(at(0, 0.17, 0)) });
  for (const side of [-1, 1]) {
    kit.add(P.sphere(0.022, 8, 6), { color: '#241a1e', gloss: 0.9, outline: 0, fixedColor: true, matrix: put(at(side * 0.062, 0.2, 0.152)) });
    kit.add(P.sphere(0.03, 8, 6), { color: '#ff9c9c', gloss: 0.2, outline: 0, fixedColor: true, matrix: put(at(side * 0.1, 0.135, 0.132, [0, 0, 0], [1, 0.7, 0.4])) });
  }
  kit.add(P.torus(0.045, 0.01, 4, 10, Math.PI), { color: '#5a2a2a', outline: 0, fixedColor: true, matrix: put(at(0, 0.125, 0.158, [0.25, 0, Math.PI])) });
  const hat = { color: look.hatColor ?? '#ffffff', gloss: 0.5, fixedColor: true };
  if (look.hair && look.hat !== 'helmet') kit.add(P.sphere(0.18, seg(16, q), seg(10, q)), { color: look.hair, gloss: 0.45, fixedColor: true, matrix: put(at(0, 0.26, -0.02, [0, 0, 0], [1.02, 0.62, 1.02])) });
  switch (look.hat) {
    case 'chef':
      kit.add(P.puck(0.14, 0.15, 0.14, 18, 0.02), { ...hat, pattern: 5.3, matrix: put(at(0, 0.3, -0.01)) });
      for (let i = 0; i < 4; i += 1) {
        const a = (i / 4) * Math.PI * 2;
        kit.add(P.sphere(0.1, 12, 8), { ...hat, pattern: 5.3, matrix: put(at(Math.cos(a) * 0.06, 0.48, Math.sin(a) * 0.06 - 0.01)) });
      }
      break;
    case 'cap':
      kit.add(P.sphere(0.176, 16, 10), { ...hat, matrix: put(at(0, 0.25, -0.01, [0, 0, 0], [1.03, 0.66, 1.03])) });
      kit.add(P.puck(0.12, 0.12, 0.02, 16, 0.01), { ...hat, matrix: put(at(0, 0.27, 0.14, [0.25, 0, 0], [1, 1, 0.9])) });
      break;
    case 'pillbox':
      kit.add(P.puck(0.11, 0.1, 0.08, 18, 0.02), { ...hat, matrix: put(at(0.02, 0.31, -0.02, [0, 0, -0.12])) });
      kit.add(P.torus(0.105, 0.012, 5, 18), { ...M.brass, outline: 0, matrix: put(at(0.02, 0.325, -0.02, [Math.PI / 2, 0, -0.12])) });
      break;
    case 'helmet':
      kit.add(P.sphere(0.235, 22, 16), { color: '#f4f6fa', gloss: 0.8, coat: 0.5, fixedColor: true, matrix: put(at(0, 0.18, 0)) });
      kit.add(P.sphere(0.19, 20, 14), { color: '#e3a23a', gloss: 0.98, metal: 0.9, outline: 0, fixedColor: true, matrix: put(at(0, 0.18, 0.07, [0, 0, 0], [1, 0.82, 0.9])) });
      break;
    default:
      break;
  }
  return kit;
}

function figureArm(look: FigureLook, kit = new Kit(), m = new THREE.Matrix4(), tinted = false, q = 1): Kit {
  // Hangs from the shoulder at the origin.
  const put = (local: THREE.Matrix4): THREE.Matrix4 => m.clone().multiply(local);
  kit.add(P.capsule(0.05, 0.16, seg(4, q), seg(10, q)), { color: look.shirt, gloss: 0.6, coat: 0.35, fixedColor: !tinted, matrix: put(at(0, -0.12, 0)) });
  kit.add(P.sphere(0.055, seg(10, q), seg(8, q)), { color: look.hat === 'helmet' ? '#f4f6fa' : look.skin, gloss: 0.35, fixedColor: true, matrix: put(at(0, -0.26, 0)) });
  return kit;
}

/** Builds a figure out of four pieces: body, head and two arms, each free to move. */
export function toyFigure(pieces: SetPieces, parent: THREE.Object3D, look: FigureLook): Figure {
  const root = pieces.group(parent);
  pieces.part(figureBody(look).build(), root);
  const head = pieces.group(root, 0, NECK, 0);
  pieces.part(figureHead(look).build(), head);
  const armL = pieces.group(root, -SHOULDER[0], SHOULDER[1], 0);
  const armR = pieces.group(root, SHOULDER[0], SHOULDER[1], 0);
  pieces.part(figureArm(look).build(), armL);
  pieces.part(figureArm(look).build(), armR);
  armL.rotation.z = -0.12;
  armR.rotation.z = 0.12;
  return { root, head, armL, armR };
}

/**
 * The same figure as one mesh, standing at ease, for crowds drawn as instances. Its shirt takes
 * the per-copy color, so one geometry dresses a whole street.
 */
export function figureGeometry(look: FigureLook): THREE.BufferGeometry {
  const kit = new Kit();
  const q = 0.55;
  figureBody(look, kit, new THREE.Matrix4(), true, q);
  figureHead(look, kit, at(0, NECK, 0), q);
  figureArm(look, kit, at(-SHOULDER[0], SHOULDER[1], 0, [0, 0, -0.14]), true, q);
  figureArm(look, kit, at(SHOULDER[0], SHOULDER[1], 0, [0, 0, 0.14]), true, q);
  return kit.build();
}

// Neon --------------------------------------------------------------------------------------

/**
 * The strokes of 「砰」 in a box about 1.8 wide and 1.2 tall, centered on the origin. The stone
 * radical is drawn narrow and close to 平, so the two read as one character.
 */
const POP_STROKES: Array<Array<[number, number]>> = [
  // 石
  [[-0.84, 0.46], [-0.4, 0.46]],
  [[-0.58, 0.46], [-0.66, 0.18], [-0.88, -0.18]],
  [[-0.68, 0.02], [-0.68, -0.54]],
  [[-0.68, 0.02], [-0.38, 0.02]],
  [[-0.38, 0.02], [-0.38, -0.54]],
  [[-0.68, -0.48], [-0.38, -0.48]],
  // 平
  [[-0.2, 0.5], [0.8, 0.5]],
  [[-0.02, 0.36], [0.06, 0.18]],
  [[0.58, 0.36], [0.5, 0.18]],
  [[-0.26, 0.03], [0.86, 0.03]],
  [[0.3, 0.5], [0.3, -0.62]],
];

export const NEON_PINK = { color: '#ff5fa8', gloss: 0.6, emissive: 1, outline: 0, neon: true, fixedColor: true } satisfies Paint;

/**
 * A neon 「砰」 on its backing board, facing +Z, placed by `place`. `tube` should carry a light
 * group so the sign can be switched on.
 */
export function neonPop(kit: Kit, place: THREE.Matrix4, tube: Paint, board = true): void {
  const local = (m: THREE.Matrix4): THREE.Matrix4 => place.clone().multiply(m);
  for (const stroke of POP_STROKES) {
    const points = stroke.map(([x, y]) => new THREE.Vector3(x, y, 0));
    kit.add(P.tube(points, 0.045, stroke.length > 2 ? 10 : 1, 8), { ...tube, matrix: place });
    for (const end of [points[0]!, points[points.length - 1]!]) kit.add(P.sphere(0.045, 8, 6), { ...tube, matrix: local(at(end.x, end.y, 0)) });
  }
  if (!board) return;
  kit.add(P.box(2.2, 1.55, 0.07, 0.06, 2), { color: '#1f1628', gloss: 0.55, coat: 0.3, fixedColor: true, matrix: local(at(0, -0.04, -0.11)) });
  kit.add(P.box(2.3, 1.65, 0.04, 0.05, 2), { ...paint(M.chrome, {}), outline: 0.5, matrix: local(at(0, -0.04, -0.15)) });
  for (const [x, y] of [[-0.96, 0.6], [0.96, 0.6], [-0.96, -0.68], [0.96, -0.68]] as const) {
    kit.add(P.puck(0.04, 0.04, 0.09, 8, 0.01), { ...M.steel, outline: 0, matrix: local(at(x, y, -0.08, [Math.PI / 2, 0, 0])) });
  }
}
