// Captures README screenshots from the real built app driving a real sample mission.
// Run with `pnpm screenshots` (Linux: xvfb). Nothing here is mocked: every screen shows live daemon state.
import { test, expect, type Page } from '@playwright/test';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { sampleRepo } from '../helpers';
import { launch } from './app';

const here = path.dirname(fileURLToPath(import.meta.url));
const out = (name: string) => path.resolve(here, '../../docs/screenshots', `${name}.png`);
const shot = async (page: Page, name: string) => {
  await page.mouse.move(1435, 600); // park the pointer on empty canvas so no tooltip or hover state leaks in
  await page.waitForTimeout(500);
  await page.screenshot({ path: out(name) });
};
const top = (page: Page) => page.evaluate(() => document.querySelectorAll('.lv-scroll').forEach((el) => el.scrollTo(0, 0)));

test('capture README screenshots', async () => {
  test.setTimeout(240_000);
  const repo = sampleRepo();
  const { app, page } = await launch({ openDir: repo });
  try {
    await app.evaluate(({ BrowserWindow }) => { const w = BrowserWindow.getAllWindows()[0]; w.setContentSize(1440, 900); w.center(); });
    await page.waitForTimeout(500);
    await shot(page, '01-projects-empty');

    await page.getByRole('button', { name: 'Open repository' }).first().click();
    await expect(page.getByTestId('workspace-card')).toContainText('sample-app');
    await page.locator('.at-toast, [class*="toast"]').first().waitFor({ state: 'detached', timeout: 10_000 }).catch(() => {});
    await shot(page, '02-projects');

    // Mission 1: ask for every write, to show the approval card.
    await page.getByRole('button', { name: 'New mission' }).first().click();
    await page.getByTestId('mission-title').fill('Fix slug generation for post titles');
    await page.getByTestId('mission-goal').fill('slugify() should lowercase, drop punctuation and collapse separators so the tests in test/slugify.test.js pass.');
    await page.locator('textarea').nth(1).fill('Do not change the public function signature.');
    await page.getByRole('radio', { name: 'Ask for every write' }).click();
    await expect(page.getByTestId('preflight')).toHaveAttribute('data-ready', 'true');
    await top(page);
    await shot(page, '03-new-mission');

    await page.getByTestId('plan-mission').click();
    await expect(page.getByTestId('plan')).toContainText('Acceptance criteria');
    await shot(page, '04-plan-review');

    await page.getByTestId('approve-plan').click();
    const card = page.getByTestId('approval').first();
    await expect(card).toContainText('src/slugify.js', { timeout: 30_000 });
    await shot(page, '05-approval');

    await card.getByTestId('approve').click();
    await expect(page.getByTestId('mission')).toHaveAttribute('data-state', 'completed', { timeout: 60_000 });
    await page.getByRole('tab', { name: /Activity/ }).click();
    await shot(page, '06-activity');
    await page.getByRole('button', { name: /^Policy & approvals/ }).click();
    await shot(page, '06b-activity-filtered');
    await page.getByRole('button', { name: /^All/ }).click();

    await page.getByRole('tab', { name: /Changes/ }).click();
    await expect(page.getByTestId('changes')).toContainText('.toLowerCase()');
    await shot(page, '07-changes');

    await page.getByRole('tab', { name: /Evidence/ }).click();
    await page.getByRole('button', { name: 'View log' }).first().click();
    await shot(page, '08-evidence');

    await page.keyboard.press('Control+k');
    await page.keyboard.type('mis');
    await shot(page, '09a-command-palette');
    await page.keyboard.press('Escape');

    await page.getByRole('button', { name: 'Settings' }).click();
    await expect(page.getByTestId('runtime-fake')).toBeVisible();
    await shot(page, '09-settings');

    await page.getByRole('button', { name: 'Design preview' }).click();
    await page.waitForTimeout(800);
    await shot(page, '10-design-preview');
  } finally { await app.close(); }
});
