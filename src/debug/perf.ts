import type { Game } from '../game.ts';

const WINDOW = 120;

interface ChromeMemory {
  memory?: { usedJSHeapSize: number };
}

/** F3: frame timing, draw calls, triangles and JS heap. */
export class PerfOverlay {
  private readonly root = document.createElement('pre');
  private readonly samples = new Float32Array(WINDOW);
  private cursor = 0;
  private filled = 0;
  private visible = false;
  private readonly game: Game;

  constructor(game: Game) {
    this.game = game;
    this.root.dataset.debug = 'perf';
    this.root.style.cssText =
      'position:fixed;left:12px;bottom:12px;margin:0;padding:8px 10px;border-radius:8px;' +
      'background:rgba(20,12,18,.85);color:#b8ffd9;font:12px/1.4 ui-monospace,monospace;' +
      'pointer-events:none;z-index:1000;display:none';
    document.body.append(this.root);
  }

  toggle(): void {
    this.visible = !this.visible;
    this.root.style.display = this.visible ? 'block' : 'none';
  }

  update(deltaSeconds: number): void {
    this.samples[this.cursor] = deltaSeconds * 1000;
    this.cursor = (this.cursor + 1) % WINDOW;
    this.filled = Math.min(this.filled + 1, WINDOW);
    if (!this.visible || this.cursor % 10 !== 0) return;
    const sorted = Array.from(this.samples.subarray(0, this.filled)).sort((a, b) => a - b);
    const mean = sorted.reduce((sum, value) => sum + value, 0) / Math.max(1, sorted.length);
    const p99 = sorted[Math.floor(sorted.length * 0.99)] ?? 0;
    const { drawCalls, triangles } = this.game.stage.stats;
    const heap = (performance as unknown as ChromeMemory).memory?.usedJSHeapSize ?? 0;
    this.root.textContent = [
      `FPS   ${(1000 / Math.max(mean, 0.001)).toFixed(1)}`,
      `帧时  ${mean.toFixed(2)} ms  p99 ${p99.toFixed(2)} ms`,
      `绘制  ${drawCalls}`,
      `三角  ${triangles.toLocaleString('en-US')}`,
      `堆    ${(heap / 1048576).toFixed(1)} MB`,
    ].join('\n');
  }
}
