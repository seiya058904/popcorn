import { Game } from './game.ts';

async function boot(): Promise<void> {
  const canvas = document.querySelector<HTMLCanvasElement>('#stage');
  if (!canvas) throw new Error('Missing #stage canvas');
  const params = new URLSearchParams(location.search);
  const capture = __QA__ && params.has('capture');
  const game = new Game({ canvas, capture });
  window.addEventListener('resize', () => game.stage.resize());
  if (__QA__) {
    const { installDebug } = await import('./debug/index.ts');
    installDebug(game);
  }
  game.start();
}

void boot();
