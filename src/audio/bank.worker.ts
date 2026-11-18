import { LOAD_ORDER, SOUND_RECIPES } from './bank.ts';

/** Synthesizes the sound bank off the main thread and streams each sound back when ready. */
const scope = self as unknown as {
  postMessage(message: unknown, transfer: Transferable[]): void;
};

for (const name of LOAD_ORDER) {
  const samples = SOUND_RECIPES[name]!();
  // Music stems are cached by the generator, so send a copy and keep the cache intact.
  const copy = samples.slice();
  scope.postMessage({ name, samples: copy }, [copy.buffer]);
}
