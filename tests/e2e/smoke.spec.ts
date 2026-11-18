import { expect, test } from '@playwright/test';

test('boots with a live canvas and a clean console', async ({ page }) => {
  const problems: string[] = [];
  page.on('pageerror', (error) => problems.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error') problems.push(message.text());
  });
  await page.goto('/');
  await expect(page).toHaveTitle('砰！爆米花失控了');
  await page.waitForFunction(() => (window as unknown as { __pop?: unknown }).__pop !== undefined);
  await page.waitForFunction(
    () => (window as unknown as { __pop: { info(): { simSteps: number } } }).__pop.info().simSteps >= 5,
  );
  expect(problems).toEqual([]);
});
