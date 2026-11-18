import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { ACHIEVEMENTS } from '../../src/content/achievements.ts';
import { FLAVORS } from '../../src/content/flavors.ts';
import { CREDITS, NEWS_LINES } from '../../src/content/news.ts';
import { PRODUCERS } from '../../src/content/producers.ts';
import { STAGES } from '../../src/content/stages.ts';
import { UPGRADES } from '../../src/content/upgrades.ts';

const walk = (dir: string): string[] =>
  readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    return statSync(path).isDirectory() ? (name === 'fonts' ? [] : walk(path)) : [path];
  });

const allCopy = (): string[] => [
  ...PRODUCERS.flatMap((item) => [item.name, item.blurb]),
  ...FLAVORS.flatMap((item) => [item.name, item.blurb]),
  ...STAGES.flatMap((item) => [item.name, item.rewardText, item.breakLine]),
  ...UPGRADES.flatMap((item) => [item.name, item.blurb]),
  ...ACHIEVEMENTS.flatMap((item) => [item.name, item.blurb]),
  ...Object.values(NEWS_LINES).flat(),
  ...CREDITS.flat(),
];

describe('game copy', () => {
  it('has no empty or placeholder text', () => {
    for (const line of allCopy()) {
      expect(line.trim().length, line).toBeGreaterThan(0);
      expect(line).not.toMatch(/TODO|TBD|FIXME|占位|待定|xxx|lorem/i);
    }
  });

  it('does not repeat a joke word for word', () => {
    const blurbs = [...PRODUCERS, ...FLAVORS, ...UPGRADES, ...ACHIEVEMENTS].map((item) => item.blurb);
    const lines = [...blurbs, ...Object.values(NEWS_LINES).flat()];
    expect(new Set(lines).size).toBe(lines.length);
  });

  it('can draw every character it shows with the bundled font', () => {
    const charset = new Set(readFileSync('src/ui/fonts/charset.txt', 'utf8'));
    const files = [...walk('src/content'), ...walk('src/ui')].filter((file) => /\.(ts|css)$/.test(file));
    const missing = new Set<string>();
    for (const file of files) {
      for (const char of readFileSync(file, 'utf8')) {
        if (char.codePointAt(0)! > 0x2000 && !charset.has(char)) missing.add(char);
      }
    }
    expect([...missing].join('')).toBe('');
  });
});
