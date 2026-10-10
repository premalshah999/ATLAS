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

test('capture M2–M5 screenshots', async () => {
  test.setTimeout(300_000);
  const repo = sampleRepo();
  const { app, page } = await launch({ openDir: repo });
  try {
    await app.evaluate(({ BrowserWindow }) => { const w = BrowserWindow.getAllWindows()[0]; w.setContentSize(1440, 900); w.center(); });
    await page.getByRole('button', { name: 'Open repository' }).first().click();
    await expect(page.getByTestId('workspace-card')).toContainText('sample-app');
    await page.locator('.at-toast, [class*="toast"]').first().waitFor({ state: 'detached', timeout: 10_000 }).catch(() => {});

    await page.getByRole('button', { name: 'Settings' }).click();
    await page.getByTestId('allow-target').fill('local-staging');
    await page.getByRole('button', { name: 'Allow target' }).click();
    const desk = page.getByTestId('desktop-settings');
    await expect(desk).not.toContainText('Checking');
    const desktopOk = !(await desk.innerText()).includes('Unavailable');
    if (desktopOk) await desk.getByRole('switch').click();
    await page.getByTestId('desktop-settings').scrollIntoViewIfNeeded();
    await shot(page, '11-settings-desktop-deploy');
    await page.getByTestId('roles').scrollIntoViewIfNeeded();
    await shot(page, '12-agent-roles');

    await page.getByRole('button', { name: 'New mission' }).first().click();
    await page.getByTestId('mission-title').fill('Fix slugify and ship it to staging');
    await page.getByTestId('mission-goal').fill('Fix slugify so the tests pass, then deploy to staging and verify it there.');
    await page.getByRole('radio', { name: /local-staging · staging/ }).click();
    await page.getByRole('button', { name: 'Change' }).click();
    await expect(page.getByTestId('preflight')).toHaveAttribute('data-ready', 'true');
    await page.getByTestId('budget-fields').scrollIntoViewIfNeeded();
    await shot(page, '13-composer-target-budget');
    await page.getByTestId('plan-mission').click();
    await page.getByTestId('approve-plan').click();
    const card = page.getByTestId('approval').first();
    await expect(card).toContainText('local-staging', { timeout: 90_000 });
    await shot(page, '14-deploy-approval');
    await card.getByTestId('approve').click();
    await expect(page.getByTestId('mission')).toHaveAttribute('data-state', 'completed', { timeout: 120_000 });

    await page.getByRole('tab', { name: /Tasks/ }).click();
    await shot(page, '15-task-graph');
    await page.getByRole('tab', { name: /Browser/ }).click();
    await page.getByRole('button', { name: 'Screenshot' }).last().click();
    await page.locator('img.lv-shot').waitFor();
    await shot(page, '16-browser-qa');
    await page.getByRole('tab', { name: /Deploy/ }).click();
    await expect(page.getByTestId('deployment-row').first()).toBeVisible();
    await shot(page, '17-staging-deploy');
    await page.getByRole('tab', { name: /Review/ }).click();
    await shot(page, '18-review');
    await page.getByRole('tab', { name: /Terminal/ }).click();
    await page.getByTestId('open-terminal').click();
    await page.locator('.lv-term').click();
    await page.keyboard.type('git log --oneline -3 && ls\n');
    await expect(page.locator('.lv-term')).toContainText('package.json', { timeout: 15_000 });
    await shot(page, '19-operator-terminal');

    if (desktopOk) {
      await page.getByRole('button', { name: 'New mission' }).first().click();
      await page.getByTestId('mission-title').fill('Desktop sample');
      await page.getByTestId('mission-goal').fill('[desktop sample] Operate the virtual desktop.');
      await expect(page.getByTestId('preflight')).toHaveAttribute('data-ready', 'true');
      await page.getByTestId('plan-mission').click();
      await page.getByTestId('approve-plan').click();
      const dc = page.getByTestId('approval').first();
      await expect(dc).toContainText('virtual desktop', { timeout: 30_000 });
      await shot(page, '20-desktop-approval');
      await dc.getByTestId('approve').click();
      await page.getByRole('tab', { name: /Desktop/ }).click();
      await expect(page.getByTestId('desktop-controller')).toHaveAttribute('data-controller', 'agent', { timeout: 15_000 });
      // Let the agent launch its app and click before taking over.
      await expect(page.getByTestId('desktop')).toContainText(/[2-9] inputs so far/, { timeout: 20_000 });
      await page.waitForTimeout(1500);
      await shot(page, '21a-desktop-agent');
      await page.getByTestId('desktop-takeover').click();
      await expect(page.getByTestId('desktop-controller')).toHaveAttribute('data-controller', 'operator');
      await page.waitForTimeout(1500);
      await shot(page, '21-desktop-takeover');
      await expect(page.getByTestId('mission')).toHaveAttribute('data-state', /completed|failed/, { timeout: 60_000 });
      await page.getByRole('tab', { name: /Activity/ }).click();
      await shot(page, '22-desktop-audit');
    }
  } finally { await app.close(); }
});
