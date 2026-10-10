import path from 'node:path';
import { defineConfig } from '@playwright/test';
import { fileURLToPath as __f } from 'node:url';
const here = path.dirname(__f(import.meta.url));

export default defineConfig({
  testDir: here,
  testMatch: '*.spec.ts',
  timeout: 120_000,
  workers: 1,
  reporter: [['list']],
  use: { trace: 'retain-on-failure', screenshot: 'only-on-failure' },
  outputDir: '../../test-results/e2e-electron',
});
