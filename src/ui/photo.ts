import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import type { PostParams } from '../render/core/pipeline.ts';
import { el, setClass } from './dom.ts';
import { feedback } from './feedback.ts';
import { motionPrefs } from './motion.ts';
import { pressable } from './press.ts';
import { Segmented } from './segmented.ts';

export interface PhotoHost {
  readonly canvas: HTMLCanvasElement;
  readonly camera: THREE.PerspectiveCamera;
  readonly post: PostParams;
  /** Whether photo mode may open now: playing, with nothing else on screen. */
  canEnter(): boolean;
  /** Freezes the economy and hands the camera over; says where it was looking and from how far. */
  begin(): { target: THREE.Vector3; distance: number };
  /** Gives the camera back, to glide home from where photo mode left it. */
  end(position: THREE.Vector3, target: THREE.Vector3): void;
  /** Keep the scene moving while the economy is frozen, or hold it still. */
  setAnimate(on: boolean): void;
  /** How far away the thing under this point on screen is; null over nothing in particular. */
  distanceAt(clientX: number, clientY: number): number | null;
  /** Shifts the picture sideways, as the game does to keep clear of the shop. */
  setViewShift(shift: number): void;
  viewShift(): number;
  /** Renders the picture now, without the interface, as a PNG. */
  snapshot(): Promise<Blob | null>;
  /** popcorn-<scene>-<date>.png */
  fileName(): string;
  shutterSound(): void;
}

const SCENE_FILES = ['stove', 'kitchen', 'cinema', 'town', 'earth'];

/** popcorn-<scene>-<yyyymmdd>-<hhmmss>.png, in local time. */
export function photoFileName(stage: number, at: Date): string {
  const two = (n: number): string => String(n).padStart(2, '0');
  const day = `${at.getFullYear()}${two(at.getMonth() + 1)}${two(at.getDate())}`;
  const time = `${two(at.getHours())}${two(at.getMinutes())}${two(at.getSeconds())}`;
  return `popcorn-${SCENE_FILES[Math.max(0, Math.min(stage, SCENE_FILES.length - 1))]}-${day}-${time}.png`;
}

/** Warm, cool and black and white, applied over the scene's own grading. */
const FILTERS = ['原片', '暖', '冷', '黑白'];
const EXPOSURE_STOPS = 1.5;

interface SavedLook {
  exposure: number;
  saturation: number;
  contrast: number;
  shadowTint: THREE.Color;
  highlightTint: THREE.Color;
  focusDistance: number;
  focusRange: number;
  tilt: THREE.Vector3;
}

/**
 * Photo mode: the economy stops, the interface steps aside for one glass toolbar, and the camera is
 * the player's to turn, zoom and pan within the scene. A tap focuses on what is under it; the shutter
 * saves the picture as a PNG.
 */
export class PhotoMode {
  private readonly root: HTMLElement;
  private readonly host: PhotoHost;
  private readonly bar: HTMLElement;
  private readonly flash: HTMLElement;
  private readonly filters: Segmented;
  private readonly tiltButton: HTMLButtonElement;
  private readonly motionButton: HTMLButtonElement;
  private readonly exposureInput: HTMLInputElement;
  private controls: OrbitControls | null = null;
  private saved: SavedLook | null = null;
  private home = new THREE.Vector3();
  private reach = 1;
  private filter = 0;
  private stops = 0;
  private tilt = false;
  private animate = false;
  private hidden = false;
  private shooting = false;
  private down: { x: number; y: number } | null = null;
  private lastUpdate = 0;
  active = false;

  constructor(root: HTMLElement, host: PhotoHost) {
    this.root = root;
    this.host = host;
    this.flash = el('div', 'photo-flash', root);
    this.bar = el('div', 'photo-bar glass', root);
    this.bar.setAttribute('role', 'toolbar');
    this.bar.setAttribute('aria-label', '拍照模式');

    const exit = el('button', 'photo-tool photo-exit', this.bar, '退出');
    exit.dataset.action = 'photo-exit';
    pressable(exit, { scale: 0.94, action: () => this.exit() });

    this.filters = new Segmented(this.bar, 'is-small photo-filters', FILTERS, (index) => {
      this.filter = index;
      this.applyLook();
    });

    const exposure = el('label', 'photo-exposure', this.bar);
    el('span', '', exposure, '曝光');
    this.exposureInput = el('input', 'photo-slider', exposure);
    this.exposureInput.type = 'range';
    this.exposureInput.min = '-100';
    this.exposureInput.max = '100';
    this.exposureInput.value = '0';
    this.exposureInput.setAttribute('aria-label', '曝光');
    this.exposureInput.addEventListener('input', () => {
      this.stops = (Number(this.exposureInput.value) / 100) * EXPOSURE_STOPS;
      this.applyLook();
    });

    this.tiltButton = el('button', 'photo-tool', this.bar, '移轴');
    this.tiltButton.dataset.action = 'photo-tilt';
    pressable(this.tiltButton, {
      scale: 0.94,
      action: () => {
        this.tilt = !this.tilt;
        feedback.toggle(this.tilt);
        this.applyLook();
      },
    });

    this.motionButton = el('button', 'photo-tool', this.bar, '画面：定格');
    this.motionButton.dataset.action = 'photo-motion';
    pressable(this.motionButton, {
      scale: 0.94,
      action: () => {
        this.animate = !this.animate;
        feedback.toggle(this.animate);
        this.host.setAnimate(this.animate);
        this.syncButtons();
      },
    });

    const shutter = el('button', 'photo-shutter', this.bar);
    shutter.dataset.action = 'photo-shoot';
    shutter.setAttribute('aria-label', '拍照');
    pressable(shutter, { scale: 0.9, action: () => void this.shoot() });

    el('div', 'photo-hint', root, '拖动环绕 · 滚轮缩放 · 右键或 Shift 拖动平移 · 点一下对焦 · H 隐藏工具栏 · Esc 退出');

    // Ahead of the menus and the cannon gauge, so their keys do nothing while the camera is ours.
    window.addEventListener('keydown', (event) => this.onKey(event), { capture: true });
    host.canvas.addEventListener('pointerdown', (event) => {
      if (this.active && event.button === 0) this.down = { x: event.clientX, y: event.clientY };
    });
    host.canvas.addEventListener('pointerup', (event) => {
      const down = this.down;
      this.down = null;
      // A tap, not a drag: focus on what is under it.
      if (!this.active || !down || Math.hypot(event.clientX - down.x, event.clientY - down.y) > 6) return;
      const distance = this.host.distanceAt(event.clientX, event.clientY);
      if (distance === null) return;
      this.host.post.focusDistance = distance;
      feedback.select();
      this.showFocus(event.clientX, event.clientY);
    });
  }

  enter(): void {
    if (this.active || !this.host.canEnter()) return;
    this.active = true;
    const { target, distance } = this.host.begin();
    const p = this.host.post;
    this.saved = {
      exposure: p.exposure,
      saturation: p.saturation,
      contrast: p.contrast,
      shadowTint: p.shadowTint.clone(),
      highlightTint: p.highlightTint.clone(),
      focusDistance: p.focusDistance,
      focusRange: p.focusRange,
      tilt: p.tilt.clone(),
    };
    this.tilt = this.saved.tilt.x > 0.05;
    this.filter = 0;
    this.stops = 0;
    this.animate = false;
    this.hidden = false;
    this.filters.select(0, false);
    this.exposureInput.value = '0';
    this.home.copy(target);
    this.reach = distance;

    const controls = new OrbitControls(this.host.camera, this.host.canvas);
    controls.target.copy(target);
    // Without reduced motion the camera coasts to a stop; with it, it stops where it is let go.
    controls.enableDamping = !motionPrefs.reduced;
    controls.dampingFactor = 0.09;
    controls.screenSpacePanning = true;
    // Slower than the default turn, for framing a picture rather than spinning the scene.
    controls.rotateSpeed = 0.55;
    controls.minDistance = distance * 0.25;
    controls.maxDistance = distance * 1.6;
    // Never under the floor, never straight down.
    controls.minPolarAngle = 0.12;
    controls.maxPolarAngle = Math.PI * 0.48;
    controls.addEventListener('change', () => this.keepInScene());
    controls.update();
    this.controls = controls;
    this.lastUpdate = performance.now();

    setClass(this.root, 'is-photo', true);
    this.syncButtons();
    feedback.open();
    this.applyLook();
  }

  exit(): void {
    if (!this.active) return;
    this.active = false;
    const controls = this.controls!;
    this.restoreLook();
    this.host.end(this.host.camera.position.clone(), controls.target.clone());
    controls.dispose();
    this.controls = null;
    setClass(this.root, 'is-photo', false);
    setClass(this.root, 'is-photo-bare', false);
    feedback.close();
  }

  toggle(): void {
    if (this.active) this.exit();
    else this.enter();
  }

  /** Every frame while open: the camera's own easing, and the picture centered again. */
  update(): void {
    if (!this.active || !this.controls) return;
    const now = performance.now();
    const dt = Math.min(0.1, (now - this.lastUpdate) / 1000);
    this.lastUpdate = now;
    this.controls.update();
    const camera = this.host.camera;
    camera.near = Math.max(0.05, camera.position.distanceTo(this.controls.target) * 0.03);
    // The shop is gone, so the picture no longer needs to sit off to one side.
    const shift = this.host.viewShift();
    this.host.setViewShift(Math.abs(shift) < 1e-3 ? 0 : shift * Math.exp(-dt * 6));
    camera.updateProjectionMatrix();
  }

  private keepInScene(): void {
    const controls = this.controls;
    if (!controls) return;
    // Panning stays within reach of where the shot was aimed, and never sinks below it.
    const offset = controls.target.clone().sub(this.home);
    const limit = this.reach * 0.6;
    if (offset.length() > limit) {
      const back = offset.setLength(limit).add(this.home).sub(controls.target);
      controls.target.add(back);
      this.host.camera.position.add(back);
    }
    const low = this.home.y - this.reach * 0.1;
    if (controls.target.y < low) {
      const rise = low - controls.target.y;
      controls.target.y += rise;
      this.host.camera.position.y += rise;
    }
  }

  private applyLook(): void {
    const base = this.saved;
    if (!base) return;
    const p = this.host.post;
    p.exposure = base.exposure * Math.pow(2, this.stops);
    p.saturation = base.saturation;
    p.contrast = base.contrast;
    p.shadowTint.copy(base.shadowTint);
    p.highlightTint.copy(base.highlightTint);
    switch (this.filter) {
      case 1:
        p.highlightTint.multiply(new THREE.Color(1.07, 1.0, 0.86));
        p.shadowTint.multiply(new THREE.Color(1.04, 0.98, 0.9));
        p.saturation *= 1.05;
        break;
      case 2:
        p.highlightTint.multiply(new THREE.Color(0.9, 0.98, 1.08));
        p.shadowTint.multiply(new THREE.Color(0.88, 0.96, 1.1));
        p.saturation *= 0.95;
        break;
      case 3:
        // Black and white on a faintly warm paper, a touch more contrast.
        p.saturation = 0;
        p.highlightTint.setRGB(1.03, 1.0, 0.95);
        p.shadowTint.setRGB(1.0, 0.98, 0.96);
        p.contrast *= 1.08;
        break;
    }
    // The miniature look: a narrow band in focus, everything above and below it soft.
    if (this.tilt) p.tilt.set(Math.max(0.85, base.tilt.x), 0.5, 0.16);
    else p.tilt.set(0, base.tilt.y, base.tilt.z);
    setClass(this.tiltButton, 'is-on', this.tilt);
    this.tiltButton.setAttribute('aria-pressed', String(this.tilt));
  }

  private restoreLook(): void {
    const base = this.saved;
    if (!base) return;
    const p = this.host.post;
    p.exposure = base.exposure;
    p.saturation = base.saturation;
    p.contrast = base.contrast;
    p.shadowTint.copy(base.shadowTint);
    p.highlightTint.copy(base.highlightTint);
    p.focusDistance = base.focusDistance;
    p.focusRange = base.focusRange;
    p.tilt.copy(base.tilt);
    this.saved = null;
  }

  private syncButtons(): void {
    this.motionButton.textContent = this.animate ? '画面：播放' : '画面：定格';
    this.motionButton.setAttribute('aria-pressed', String(this.animate));
    setClass(this.motionButton, 'is-on', this.animate);
  }

  private async shoot(): Promise<void> {
    if (!this.active || this.shooting) return;
    this.shooting = true;
    try {
      const blob = await this.host.snapshot();
      this.host.shutterSound();
      this.flash.getAnimations().forEach((animation) => animation.cancel());
      this.flash.animate([{ opacity: motionPrefs.reduced ? 0.35 : 0.85 }, { opacity: 0 }], { duration: motionPrefs.reduced ? 220 : 420, easing: 'ease-out' });
      if (!blob) return;
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = this.host.fileName();
      link.click();
      window.setTimeout(() => URL.revokeObjectURL(url), 10000);
    } finally {
      this.shooting = false;
    }
  }

  private showFocus(x: number, y: number): void {
    const ring = el('div', 'photo-focus', this.root);
    ring.style.transform = `translate(${x}px, ${y}px) translate(-50%, -50%)`;
    const animation = ring.animate(
      motionPrefs.reduced
        ? [{ opacity: 1 }, { opacity: 0 }]
        : [
            { opacity: 0, transform: `${ring.style.transform} scale(1.4)` },
            { opacity: 1, transform: `${ring.style.transform} scale(1)`, offset: 0.25 },
            { opacity: 0, transform: `${ring.style.transform} scale(1)` },
          ],
      { duration: 700, easing: 'ease-out' },
    );
    void animation.finished.then(() => ring.remove(), () => ring.remove());
  }

  private onKey(event: KeyboardEvent): void {
    const target = event.target as HTMLElement | null;
    if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA') && (target as HTMLInputElement).type !== 'range') return;
    if (event.key === 'p' || event.key === 'P') {
      if (event.repeat || event.ctrlKey || event.metaKey || event.altKey) return;
      if (!this.active && !this.host.canEnter()) return;
      event.preventDefault();
      event.stopImmediatePropagation();
      this.toggle();
      return;
    }
    if (!this.active) return;
    // While the camera is ours, no other key reaches the game: Esc does not open the pause menu,
    // Space does not charge the cannon.
    event.stopImmediatePropagation();
    if (event.key === 'Escape') {
      event.preventDefault();
      this.exit();
    } else if ((event.key === 'h' || event.key === 'H') && !event.repeat) {
      event.preventDefault();
      this.hidden = !this.hidden;
      setClass(this.root, 'is-photo-bare', this.hidden);
    }
  }
}
