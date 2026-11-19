import * as THREE from 'three';
import { setKitDetail } from '../geometry/kit.ts';
import { globals } from './globals.ts';
import { PostPipeline } from './pipeline.ts';
import { QUALITY, type QualitySettings, type QualityTier } from './quality.ts';
import { ShadowPass } from './shadow.ts';

export interface StageOptions {
  canvas: HTMLCanvasElement;
  /** Keeps the drawing buffer readable so captures can screenshot between frames. */
  capture: boolean;
  quality?: QualityTier;
}

export interface FrameStats {
  drawCalls: number;
  triangles: number;
}

/** Owns the WebGL renderer, the main camera, the shadow pass and the post pipeline. */
export class Stage {
  readonly renderer: THREE.WebGLRenderer;
  readonly scene = new THREE.Scene();
  readonly camera = new THREE.PerspectiveCamera(26, 16 / 9, 0.5, 120);
  readonly shadow = new ShadowPass();
  readonly post: PostPipeline;
  readonly stats: FrameStats = { drawCalls: 0, triangles: 0 };
  quality: QualitySettings;
  /** Horizontal principal-point shift as a fraction of width: keeps the action clear of the shop. */
  viewShiftX = 0;
  private readonly canvas: HTMLCanvasElement;
  private width = 0;
  private height = 0;
  private appliedShift = Number.NaN;
  /** Same pixel format as the scene target, so warmed-up shaders are the ones really used. */
  private readonly preloadTarget = new THREE.WebGLRenderTarget(4, 4, { type: THREE.HalfFloatType });

  constructor(options: StageOptions) {
    this.canvas = options.canvas;
    this.quality = QUALITY[options.quality ?? 'ultra'];
    setKitDetail(this.quality.detail);
    this.renderer = new THREE.WebGLRenderer({
      canvas: options.canvas,
      antialias: false,
      alpha: false,
      depth: false,
      stencil: false,
      powerPreference: 'high-performance',
      preserveDrawingBuffer: options.capture,
    });
    this.renderer.info.autoReset = false;
    this.renderer.autoClear = true;
    this.renderer.setClearColor('#120a12', 1);
    this.post = new PostPipeline(this.renderer, this.quality);
    this.shadow.setSize(this.quality.shadowSize);
    this.resize();
  }

  setQuality(tier: QualityTier): void {
    this.quality = QUALITY[tier];
    setKitDetail(this.quality.detail);
    this.post.setQuality(this.quality);
    this.shadow.setSize(this.quality.shadowSize);
    this.width = 0;
    this.resize();
  }

  /** Pixel size of the final output. */
  get outputWidth(): number {
    return this.renderer.domElement.width;
  }

  get outputHeight(): number {
    return this.renderer.domElement.height;
  }

  resize(): void {
    const width = Math.max(1, this.canvas.clientWidth);
    const height = Math.max(1, this.canvas.clientHeight);
    if (width === this.width && height === this.height && this.appliedShift === this.viewShiftX) return;
    this.width = width;
    this.height = height;
    this.appliedShift = this.viewShiftX;
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    this.renderer.setSize(width, height, false);
    this.camera.aspect = width / height;
    this.camera.setViewOffset(width, height, width * this.viewShiftX, 0, width, height);
    this.camera.updateProjectionMatrix();
    this.post.resize(this.outputWidth, this.outputHeight);
    globals.uResolution.value.set(this.outputWidth, this.outputHeight);
    globals.uOutlinePx.value = Math.max(0.9, this.outputHeight / 640);
  }

  setTime(time: number): void {
    globals.uTime.value = time;
  }

  render(time: number): void {
    this.resize();
    this.setTime(time);
    this.renderer.info.reset();
    this.camera.updateMatrixWorld();
    this.shadow.render(this.renderer, this.scene);
    this.renderer.setRenderTarget(this.post.sceneTarget);
    this.renderer.clear(true, true, false);
    this.renderer.render(this.scene, this.camera);
    this.post.finish(this.camera, time, this.outputWidth, this.outputHeight);
    this.stats.drawCalls = this.renderer.info.render.calls;
    this.stats.triangles = this.renderer.info.render.triangles;
  }

  /**
   * Draws a tree once off-screen, so its shaders and buffers are on the GPU before they are
   * needed. The shadow map it overwrites is redrawn at the start of every frame.
   */
  preload(root: THREE.Object3D): void {
    const culled: THREE.Object3D[] = [];
    root.traverse((node) => {
      if (node.frustumCulled) {
        node.frustumCulled = false;
        culled.push(node);
      }
    });
    this.camera.updateMatrixWorld();
    this.shadow.render(this.renderer, root);
    this.renderer.setRenderTarget(this.preloadTarget);
    this.renderer.render(root, this.camera);
    this.renderer.setRenderTarget(null);
    for (const node of culled) node.frustumCulled = true;
  }

  gpuName(): string {
    const gl = this.renderer.getContext();
    const ext = gl.getExtension('WEBGL_debug_renderer_info');
    return ext ? String(gl.getParameter(ext.UNMASKED_RENDERER_WEBGL)) : 'unknown';
  }

  dispose(): void {
    this.renderer.dispose();
  }
}
