import * as THREE from 'three';
import { setKitDetail } from '../geometry/kit.ts';
import { glassUniforms } from '../materials/toy.ts';
import { GLASS_LAYER, globals } from './globals.ts';
import { PostPipeline } from './pipeline.ts';
import { QUALITY, type QualitySettings, type QualityTier } from './quality.ts';
import { ShadowPass } from './shadow.ts';

export interface StageOptions {
  canvas: HTMLCanvasElement;
  /** Keeps the drawing buffer readable so captures can screenshot between frames. */
  capture: boolean;
  quality?: QualityTier;
}

/** One piece of glass, in its simple form and in the two parts of the refracting form. */
export interface GlassPiece {
  simple: THREE.Mesh;
  body: THREE.Mesh;
  surface: THREE.Mesh;
  /** Part of a scene seen from far away, where refraction would cost draws and show nothing. */
  distant?: boolean;
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
  private readonly glass: GlassPiece[] = [];

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
    this.camera.layers.enable(GLASS_LAYER);
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
    this.renderScene();
    this.post.finish(this.camera, time, this.outputWidth, this.outputHeight);
    this.stats.drawCalls = this.renderer.info.render.calls;
    this.stats.triangles = this.renderer.info.render.triangles;
  }

  addGlass(piece: GlassPiece): void {
    piece.body.layers.set(GLASS_LAYER);
    piece.surface.layers.set(GLASS_LAYER);
    this.glass.push(piece);
  }

  /** Everything under `root` has become scenery in the distance. */
  setGlassDistant(root: THREE.Object3D): void {
    for (const piece of this.glass) {
      let node: THREE.Object3D | null = piece.simple;
      while (node && node !== root) node = node.parent;
      if (node === root) piece.distant = true;
    }
  }

  private glassInView(): boolean {
    for (const { simple, distant } of this.glass) {
      if (distant) continue;
      if ((simple as THREE.InstancedMesh).isInstancedMesh && (simple as THREE.InstancedMesh).count === 0) continue;
      let node: THREE.Object3D | null = simple.parent;
      while (node && node.visible && node !== this.scene) node = node.parent;
      if (node === this.scene) return true;
    }
    return false;
  }

  private showGlass(simple: boolean, refracting: boolean): void {
    for (const piece of this.glass) {
      piece.simple.visible = simple || piece.distant === true;
      piece.body.visible = refracting && piece.distant !== true;
      piece.surface.visible = refracting && piece.distant !== true;
    }
  }

  /**
   * With refraction on, the picture is drawn in two steps. Everything but glass goes first and
   * is resolved into the scene texture; glass then reads that texture while drawing into the
   * multisampled buffer, which is a separate surface and keeps its depth from the first step.
   * Glass depth stays out of the resolved depth, so the later effects still see the real scene.
   */
  private renderScene(): void {
    const { renderer, camera, scene } = this;
    const target = this.post.sceneTarget;
    renderer.setRenderTarget(target);
    renderer.clear(true, true, false);
    const refract = this.quality.refraction && target.samples > 0 && this.glassInView();
    this.showGlass(!refract, refract);
    if (!refract) {
      renderer.render(scene, camera);
      return;
    }
    camera.layers.set(0);
    renderer.render(scene, camera);
    glassUniforms.tSceneColor.value = target.texture;
    glassUniforms.tSceneDepth.value = target.depthTexture;
    glassUniforms.uSceneSize.value.set(target.width, target.height);
    glassUniforms.uNearFar.value.set(camera.near, camera.far);
    glassUniforms.uViewProjection.value.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
    glassUniforms.uDispersion.value = this.quality.dispersion ? 1 : 0;
    const post = this.post.params;
    glassUniforms.uFocus.value.set(post.focusDistance, post.focusRange);
    glassUniforms.uBlurPx.value = this.quality.depthOfField ? post.maxBlurPx * (target.height / 1080) : 0;
    camera.layers.set(GLASS_LAYER);
    renderer.autoClear = false;
    target.resolveDepthBuffer = false;
    renderer.render(scene, camera);
    target.resolveDepthBuffer = true;
    renderer.autoClear = true;
    camera.layers.enable(0);
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
    // Every form of the glass gets compiled, whichever one this machine ends up using.
    this.showGlass(true, true);
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
