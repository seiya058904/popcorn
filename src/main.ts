import { Game } from './game.ts';
import type { QualityTier } from './render/core/quality.ts';

/** How long to wait for the browser to give the graphics context back before reloading anyway. */
const CONTEXT_RESTORE_WAIT_MS = 4000;

function showUnsupported(root: HTMLElement): void {
  const box = document.createElement('div');
  box.className = 'unsupported';
  const title = document.createElement('h1');
  title.textContent = '这口锅点不着火';
  const text = document.createElement('p');
  text.textContent = '游戏需要 WebGL 2。请使用最新版 Chrome、Edge 或 Firefox，并打开硬件加速。';
  box.append(title, text);
  root.replaceChildren(box);
}

async function boot(): Promise<void> {
  const canvas = document.querySelector<HTMLCanvasElement>('#stage');
  const uiRoot = document.querySelector<HTMLElement>('#ui');
  if (!canvas || !uiRoot) throw new Error('Missing page roots');
  const params = new URLSearchParams(location.search);
  const capture = __QA__ && params.has('capture');
  const quality = __QA__ ? ((params.get('quality') as QualityTier | null) ?? undefined) : undefined;
  let game: Game;
  try {
    game = new Game({ canvas, uiRoot, capture, quality });
  } catch (error) {
    console.warn('Could not start the renderer', error);
    showUnsupported(uiRoot);
    return;
  }
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
  if (__QA__) {
    const { installDebug } = await import('./debug/index.ts');
    installDebug(game);
  }
  game.start();
  // Automated sessions go straight into play.
  const skipTitle = __QA__ && (capture || params.has('play')) && !params.has('title');
  if (skipTitle) game.startImmediately();
  else await game.showTitle();
}

void boot();
