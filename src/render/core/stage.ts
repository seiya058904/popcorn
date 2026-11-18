import * as THREE from 'three';

export interface StageOptions {
  canvas: HTMLCanvasElement;
  /** Keeps the drawing buffer readable so captures can screenshot between frames. */
  capture: boolean;
}

export interface FrameStats {
  drawCalls: number;
  triangles: number;
}

/** Owns the WebGL renderer, the main camera and canvas sizing. */
export class Stage {
  readonly renderer: THREE.WebGLRenderer;
  readonly scene = new THREE.Scene();
  readonly camera = new THREE.PerspectiveCamera(32, 16 / 9, 0.1, 200);
  readonly stats: FrameStats = { drawCalls: 0, triangles: 0 };
  private readonly canvas: HTMLCanvasElement;
  private width = 0;
  private height = 0;

  constructor(options: StageOptions) {
    this.canvas = options.canvas;
    this.renderer = new THREE.WebGLRenderer({
      canvas: options.canvas,
      antialias: true,
      alpha: false,
      powerPreference: 'high-performance',
      preserveDrawingBuffer: options.capture,
    });
    this.renderer.info.autoReset = false;
    this.scene.background = new THREE.Color('#2a1420');
    this.camera.position.set(0, 2.5, 8);
    this.camera.lookAt(0, 0.5, 0);
    this.resize();
  }

  resize(): void {
    const width = Math.max(1, this.canvas.clientWidth);
    const height = Math.max(1, this.canvas.clientHeight);
    const ratio = Math.min(window.devicePixelRatio || 1, 2);
    if (width === this.width && height === this.height) return;
    this.width = width;
    this.height = height;
    this.renderer.setPixelRatio(ratio);
    this.renderer.setSize(width, height, false);
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
  }

  render(): void {
    this.resize();
    this.renderer.info.reset();
    this.renderer.render(this.scene, this.camera);
    this.stats.drawCalls = this.renderer.info.render.calls;
    this.stats.triangles = this.renderer.info.render.triangles;
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
