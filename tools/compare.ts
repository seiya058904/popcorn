import { mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { chromium } from '@playwright/test';
import { argValue } from './lib/harness.ts';

/**
 * Usage: node tools/compare.ts --a=artifacts/shots-before --b=artifacts/shots [--only=a,b] [--limit=0.5]
 *
 * Compares same-named PNGs pixel by pixel. Reports the mean difference (0-255) and the share of
 * pixels that changed by more than 16 levels, and writes an amplified difference picture for each.
 * With --limit, fails when any picture's changed share exceeds that percentage.
 */
const dirA = argValue('a') ?? 'artifacts/shots-before';
const dirB = argValue('b') ?? 'artifacts/shots';
const only = argValue('only')?.split(',');
const limit = Number(argValue('limit') ?? Number.POSITIVE_INFINITY);
const outDir = 'artifacts/compare';
mkdirSync(outDir, { recursive: true });

const names = readdirSync(dirA)
  .filter((file) => file.endsWith('.png'))
  .map((file) => file.slice(0, -4))
  .filter((name) => !only || only.includes(name));

const browser = await chromium.launch();
const page = await browser.newPage();
let failed = false;
try {
  for (const name of names) {
    let b: Buffer;
    try {
      b = readFileSync(join(dirB, `${name}.png`));
    } catch {
      console.log(`${name.padEnd(28)} missing in ${dirB}`);
      continue;
    }
    const a = readFileSync(join(dirA, `${name}.png`));
    const result = await page.evaluate(
      async ({ first, second }) => {
        const load = async (base64: string): Promise<ImageData> => {
          const bitmap = await createImageBitmap(await (await fetch(`data:image/png;base64,${base64}`)).blob());
          const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
          const context = canvas.getContext('2d')!;
          context.drawImage(bitmap, 0, 0);
          return context.getImageData(0, 0, bitmap.width, bitmap.height);
        };
        const x = await load(first);
        const y = await load(second);
        if (x.width !== y.width || x.height !== y.height) return { error: `size ${x.width}x${x.height} vs ${y.width}x${y.height}` };
        const out = new ImageData(x.width, x.height);
        let sum = 0;
        let changed = 0;
        let max = 0;
        for (let i = 0; i < x.data.length; i += 4) {
          const d = Math.max(Math.abs(x.data[i]! - y.data[i]!), Math.abs(x.data[i + 1]! - y.data[i + 1]!), Math.abs(x.data[i + 2]! - y.data[i + 2]!));
          sum += d;
          if (d > 16) changed += 1;
          if (d > max) max = d;
          const v = Math.min(255, d * 6);
          out.data[i] = v;
          out.data[i + 1] = v * 0.4;
          out.data[i + 2] = 0;
          out.data[i + 3] = 255;
        }
        const canvas = new OffscreenCanvas(x.width, x.height);
        canvas.getContext('2d')!.putImageData(out, 0, 0);
        const blob = await canvas.convertToBlob({ type: 'image/png' });
        const bytes = new Uint8Array(await blob.arrayBuffer());
        let binary = '';
        for (const byte of bytes) binary += String.fromCharCode(byte);
        const pixels = x.width * x.height;
        return { mean: sum / pixels, changedPercent: (changed / pixels) * 100, max, diff: btoa(binary) };
      },
      { first: a.toString('base64'), second: b.toString('base64') },
    );
    if ('error' in result) {
      console.log(`${name.padEnd(28)} ${result.error}`);
      failed = true;
      continue;
    }
    writeFileSync(join(outDir, `${name}.png`), Buffer.from(result.diff!, 'base64'));
    const over = result.changedPercent! > limit;
    failed ||= over;
    console.log(`${name.padEnd(28)} mean ${result.mean!.toFixed(2).padStart(6)}  changed ${result.changedPercent!.toFixed(2).padStart(6)}%  max ${String(result.max).padStart(3)}${over ? '  OVER LIMIT' : ''}`);
  }
} finally {
  await browser.close();
}
if (failed) process.exit(1);
