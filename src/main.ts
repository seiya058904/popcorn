import { Game } from './game.ts';
import type { QualityTier } from './render/core/quality.ts';

async function boot(): Promise<void> {
  const canvas = document.querySelector<HTMLCanvasElement>('#stage');
  const uiRoot = document.querySelector<HTMLElement>('#ui');
  if (!canvas || !uiRoot) throw new Error('Missing page roots');
  const params = new URLSearchParams(location.search);
  const capture = __QA__ && params.has('capture');
  const quality = __QA__ ? ((params.get('quality') as QualityTier | null) ?? undefined) : undefined;
  const game = new Game({ canvas, uiRoot, capture, quality });
  window.addEventListener('resize', () => game.stage.resize());
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
