import { copyFileSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import subsetFont from 'subset-font';

/**
 * Builds the shipped font subsets from the open-source packages.
 * Run `npm run fonts` after changing any on-screen text.
 */
const outDir = 'src/ui/fonts';
const source = 'node_modules/@fontsource/zcool-kuaile/files/zcool-kuaile-chinese-simplified-400-normal.woff2';

const walk = (dir: string): string[] =>
  readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    return statSync(path).isDirectory() ? (name === 'fonts' ? [] : walk(path)) : [path];
  });

export function collectText(): string {
  const files = [...walk('src/content'), ...walk('src/ui')].filter((file) => /\.(ts|css)$/.test(file));
  return [...files, 'index.html'].map((file) => readFileSync(file, 'utf8')).join('');
}

const chars = new Set<string>();
for (const char of collectText()) if (char.codePointAt(0)! > 0x2000) chars.add(char);
for (let code = 0x20; code < 0x7f; code += 1) chars.add(String.fromCharCode(code));
const charset = [...chars].sort().join('');

mkdirSync(outDir, { recursive: true });
const subset = await subsetFont(readFileSync(source), charset, { targetFormat: 'woff2' });
writeFileSync(join(outDir, 'kuaile.woff2'), subset);
writeFileSync(join(outDir, 'charset.txt'), charset);
for (const weight of [500, 700]) {
  copyFileSync(`node_modules/@fontsource/fredoka/files/fredoka-latin-${weight}-normal.woff2`, join(outDir, `fredoka-${weight}.woff2`));
}
console.log(`${chars.size} characters, subset ${(subset.length / 1024).toFixed(0)} KB`);
