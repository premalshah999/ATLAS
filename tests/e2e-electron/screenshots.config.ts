import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig } from '@playwright/test';

const here = path.dirname(fileURLToPath(import.meta.url));
export default defineConfig({ testDir: here, testMatch: 'screenshots.ts', workers: 1, reporter: [['list']], outputDir: '../../test-results/screenshots' });
