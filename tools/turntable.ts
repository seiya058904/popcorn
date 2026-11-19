import { execFileSync } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { argValue, startHarness } from './lib/harness.ts';
import { qa, totalAt } from './shot-presets.ts';

/**
 * Close-up review of every machine: one copy, four sides, on a sheet per machine.
 * Usage: node tools/turntable.ts [--only=pan,cart] [--owned=26]
 * --owned sets how many are bought, which decides the milestone trim on show.
 */
const MACHINES = [
  ['pan', 0, 0],
  ['microwave', 1, 0],
  ['cart', 2, 1],
  ['cannon', 3, 1],
  ['cinema', 4, 2],
  ['truck', 5, 2],
  ['factory', 6, 3],
  ['airship', 7, 3],
  ['volcano', 8, 4],
  ['orbital', 9, 4],
] as const;

const only = argValue('only')?.split(',');
const owned = Number(argValue('owned') ?? 26);
const outDir = join('artifacts', 'turntable');
mkdirSync(outDir, { recursive: true });

const harness = await startHarness();
try {
  for (const [kind, unit, stage] of MACHINES) {
    if (only && !only.includes(kind)) continue;
    const page = await harness.open('capture=1', { width: 800, height: 600 });
    await page.addStyleTag({ content: 'body > *:not(canvas), #ui { visibility: hidden !important; } canvas { visibility: visible !important; }' });
    await qa(
      page,
      (api, value: { stage: number; unit: number; owned: number; total: number }) => {
        api.set({ stage: value.stage, totalEarned: value.total, popcorn: 1e24 });
        api.advance(0.2);
        api.buy(value.unit, value.owned);
        api.set({ popcorn: 0 });
        api.advance(1.6);
      },
      { stage, unit, owned, total: totalAt(stage, 0.02) },
    );
    const files: string[] = [];
    for (let side = 0; side < 4; side += 1) {
      await qa(
        page,
        (api, value: { kind: string; side: number }) => {
          api.viewMachine(value.kind, 0.7 + (value.side * Math.PI) / 2);
          api.advance(1 / 60);
        },
        { kind, side },
      );
      const file = join(outDir, `${kind}-${side}.png`);
      await page.screenshot({ path: file, animations: 'disabled' });
      files.push(file);
    }
    const sheet = join(outDir, `${kind}.png`);
    execFileSync('ffmpeg', ['-y', '-loglevel', 'error', ...files.flatMap((file) => ['-i', file]), '-filter_complex', 'xstack=inputs=4:layout=0_0|w0_0|0_h0|w0_h0', '-frames:v', '1', '-update', '1', sheet]);
    console.log(sheet);
    await page.close();
  }
} finally {
  await harness.close();
}
