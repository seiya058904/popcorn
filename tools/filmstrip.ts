import { execFileSync } from 'node:child_process';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { argValue, startHarness } from './lib/harness.ts';
import { filmScenarios } from './film-scenarios.ts';

/**
 * Usage: node tools/filmstrip.ts --scenario=click [--columns=8]
 * Steps the game frame by frame and tiles the frames into one contact sheet, for inspecting motion.
 */
const name = argValue('scenario') ?? 'click';
const scenario = filmScenarios[name];
if (!scenario) throw new Error(`Unknown scenario ${name}; known: ${Object.keys(filmScenarios).join(', ')}`);
const columns = Number(argValue('columns') ?? scenario.columns ?? 8);
const dir = join('artifacts', 'film', name);
rmSync(dir, { recursive: true, force: true });
mkdirSync(dir, { recursive: true });

const harness = await startHarness();
try {
  const page = await harness.open(`capture=1${scenario.query ? `&${scenario.query}` : ''}`, scenario.size ?? { width: 1280, height: 720 });
  await scenario.setup(page);
  for (let frame = 0; frame < scenario.frames; frame += 1) {
    await scenario.beforeFrame?.(page, frame);
    await scenario.step(page, frame);
    const png = await page.screenshot({ type: 'png', clip: scenario.clip });
    writeFileSync(join(dir, `f${String(frame).padStart(4, '0')}.png`), png);
  }
} finally {
  await harness.close();
}

const rows = Math.ceil(scenario.frames / columns);
const sheet = join('artifacts', 'film', `${name}.png`);
execFileSync('ffmpeg', [
  '-y',
  '-loglevel',
  'error',
  '-framerate',
  '60',
  '-i',
  join(dir, 'f%04d.png'),
  '-frames:v',
  '1',
  '-update',
  '1',
  '-vf',
  `tile=${columns}x${rows}:padding=3:color=0x202020`,
  sheet,
]);
console.log(`${sheet}: ${scenario.frames} frames`);
