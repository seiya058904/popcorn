import { Game } from './game.ts';
import type { QualityTier } from './render/core/quality.ts';
import { needsHandheldNotice, showHandheldNotice } from './ui/handheld.ts';

/** How long to wait for the browser to give the graphics context back before reloading anyway. */
const CONTEXT_RESTORE_WAIT_MS = 4000;
/** Matches the fade in index.html. */
const BOOT_FADE_MS = 380;

declare global {
  interface Window {
    __booted?: boolean;
    __bootFail?: (title: string, note: string, retry?: boolean) => void;
  }
}

const bootScreen = document.querySelector<HTMLElement>('#boot');

function bootProgress(fraction: number, note?: string): void {
  if (!bootScreen) return;
  bootScreen.style.setProperty('--progress', String(fraction));
  const line = bootScreen.querySelector('.boot-note');
  if (note && line) line.textContent = note;
}

/** Fades the loading screen away; at once when nothing should be animated. */
function finishBoot(instant: boolean): void {
  window.__booted = true;
  if (!bootScreen) return;
  if (instant) {
    bootScreen.remove();
    return;
  }
  bootScreen.classList.add('is-done');
  window.setTimeout(() => bootScreen.remove(), BOOT_FADE_MS + 60);
}

const nextFrame = (): Promise<void> => new Promise((resolve) => requestAnimationFrame(() => resolve()));

async function boot(): Promise<void> {
  const canvas = document.querySelector<HTMLCanvasElement>('#stage');
  const uiRoot = document.querySelector<HTMLElement>('#ui');
  if (!canvas || !uiRoot) throw new Error('Missing page roots');
  const params = new URLSearchParams(location.search);
  const capture = __QA__ && params.has('capture');
  const quality = __QA__ ? ((params.get('quality') as QualityTier | null) ?? undefined) : undefined;
  performance.mark('boot:script');
  bootProgress(0.3);
  let game: Game;
  try {
    game = new Game({ canvas, uiRoot, capture, quality });
  } catch (error) {
    console.warn('Could not start the renderer', error);
    window.__bootFail?.('这口锅点不着火', '游戏需要 WebGL 2。请使用最新版 Chrome、Edge 或 Firefox，并打开硬件加速。', false);
    return;
  }
  performance.mark('boot:renderer');
  bootProgress(0.5, '把玉米倒进锅里…');
  window.addEventListener('resize', () => game.stage.resize());
  // Every GPU resource here is generated, so a clean reload is the reliable way back.
  canvas.addEventListener('webglcontextlost', (event) => {
    event.preventDefault();
    game.stop();
    void game.saves.save();
    setTimeout(() => location.reload(), CONTEXT_RESTORE_WAIT_MS);
  });
  canvas.addEventListener('webglcontextrestored', () => location.reload());
  await game.init();
  bootProgress(0.85, '摆好设备…');
  if (__QA__) {
    const { installDebug } = await import('./debug/index.ts');
    installDebug(game);
  }
  game.start();
  // Automated sessions go straight into play.
  const skipTitle = __QA__ && (capture || params.has('play')) && !params.has('title');
  // The title goes up under the loading screen, which then fades to reveal it.
  const title = skipTitle ? null : game.showTitle();
  bootProgress(1);
  await nextFrame();
  performance.mark('boot:first-frame');
  finishBoot(skipTitle);
  if (!skipTitle && needsHandheldNotice()) await showHandheldNotice(uiRoot);
  if (title) await title;
  else game.startImmediately();
}

void boot();
