import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { expect, test, type Locator, type Page } from '@playwright/test';

const files = (dir: string): string[] =>
  readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    return statSync(path).isDirectory() ? files(path) : [path];
  });

/** A real mouse press at the element's center; several controls here never stop animating. */
const press = async (page: Page, target: Locator): Promise<void> => {
  await expect(target).toBeVisible();
  const box = (await target.boundingBox())!;
  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
};

test('the release build carries no debug tools and stays within budget', () => {
  const all = files('dist');
  const scripts = all.filter((file) => file.endsWith('.js'));
  for (const file of scripts) {
    const text = readFileSync(file, 'utf8');
    expect(text, file).not.toContain('动效调参');
    expect(text, file).not.toContain('__pop');
  }
  const total = all.reduce((sum, file) => sum + statSync(file).size, 0);
  console.log(`release size: ${(total / 1048576).toFixed(2)} MB in ${all.length} files`);
  expect(total).toBeLessThan(8 * 1048576);
});

test('a player can start, pop, buy, and come back to the same game', async ({ page }) => {
  const problems: string[] = [];
  page.on('pageerror', (error) => problems.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error') problems.push(message.text());
  });
  page.on('requestfailed', (request) => problems.push(`failed: ${request.url()}`));

  await page.goto('/');
  await expect(page.locator('.title-logo')).toBeVisible();
  expect(await page.evaluate(() => '__pop' in window)).toBe(false);
  await press(page, page.locator('[data-action="start"]'));
  await expect(page.locator('.title')).toHaveCount(0);

  for (let i = 0; i < 16; i += 1) await page.mouse.click(420, 400);
  const unit = page.locator('[data-unit="0"]');
  await expect(unit).toHaveClass(/is-ready/);
  await press(page, unit);
  await expect(unit.locator('.ticket-owned')).toHaveText('1');

  await page.keyboard.press('Escape');
  await expect(page.locator('.dialog.menu h2')).toHaveText('暂停一下');
  await press(page, page.locator('.menu-list .btn', { hasText: '继续' }));
  await page.waitForTimeout(300);

  await page.reload();
  await expect(page.locator('[data-action="start"]')).toHaveText('继续这一锅');
  await press(page, page.locator('[data-action="start"]'));
  await expect(page.locator('[data-unit="0"] .ticket-owned')).toHaveText('1');
  expect(problems).toEqual([]);
});
