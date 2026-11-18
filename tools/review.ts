import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { argValue } from './lib/harness.ts';

/**
 * Builds the three-way picture review from the execution plan: full image, grayscale, thumbnail.
 * Usage: node tools/review.ts --only=a,b   (reads artifacts/shots/<name>.png)
 */
const names = (argValue('only') ?? 'm1-late,m4-kitchen-full,m5-cinema-full,m5-town-full,m5-earth-full').split(',');
const outDir = join('artifacts', 'review');
mkdirSync(outDir, { recursive: true });

for (const name of names) {
  const input = join('artifacts', 'shots', `${name}.png`);
  if (!existsSync(input)) {
    console.error(`missing ${input}`);
    process.exitCode = 1;
    continue;
  }
  const output = join(outDir, `${name}.png`);
  const filter = [
    '[0:v]split=3[a][b][c]',
    '[a]scale=960:-2[full]',
    '[b]scale=960:-2,format=gray,format=rgb24[gray]',
    // The thumbnail is shrunk hard, then shown large without smoothing: silhouettes must survive it.
    '[c]scale=160:-2,scale=960:-2:flags=neighbor[thumb]',
    '[full][gray][thumb]hstack=inputs=3[out]',
  ].join(';');
  execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-i', input, '-filter_complex', filter, '-map', '[out]', '-frames:v', '1', '-update', '1', output]);
  console.log(output);
}
