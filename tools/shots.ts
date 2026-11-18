import { createHash } from 'node:crypto';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Page } from '@playwright/test';
import { argValue, hasFlag, startHarness } from './lib/harness.ts';
import { shotPresets, type ShotPreset } from './shot-presets.ts';

/**
 * Usage: npm run shots -- [--only=a,b] [--out=dir] [--verify]
 * --verify renders every preset twice in fresh pages and fails on any byte difference.
 */
const outDir = argValue('out') ?? 'artifacts/shots';
const only = argValue('only')?.split(',');
const verify = hasFlag('verify');
const presets = only ? shotPresets.filter((preset) => only.includes(preset.name)) : shotPresets;

async function capture(page: Page, preset: ShotPreset): Promise<Buffer> {
  await preset.run(page);
  return page.screenshot({ type: 'png' });
}

const sha = (data: Buffer): string => createHash('sha256').update(data).digest('hex').slice(0, 16);

mkdirSync(outDir, { recursive: true });
const harness = await startHarness();
let failures = 0;
try {
  for (const preset of presets) {
    const size = preset.size ?? { width: 1280, height: 720 };
    const query = `capture=1${preset.query ? `&${preset.query}` : ''}`;
    const page = await harness.open(query, size);
    const first = await capture(page, preset);
    await page.close();
    writeFileSync(join(outDir, `${preset.name}.png`), first);
    let status = sha(first);
    if (verify) {
      const again = await harness.open(query, size);
      const second = await capture(again, preset);
      await again.close();
      const same = first.equals(second);
      status += same ? '  identical' : `  DIFFERENT (${sha(second)})`;
      if (!same) failures += 1;
    }
    console.log(`${preset.name.padEnd(28)} ${status}`);
  }
} finally {
  await harness.close();
}
if (failures > 0) {
  console.error(`${failures} shot(s) were not reproducible`);
  process.exit(1);
}
