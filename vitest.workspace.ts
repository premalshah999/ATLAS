import { defineWorkspace } from 'vitest/config';

export default defineWorkspace([
  {
    test: {
      name: 'unit',
      include: ['packages/*/test/**/*.test.ts', 'apps/daemon/test/**/*.test.ts', 'apps/desktop/renderer/src/**/*.test.ts', 'evals/**/*.test.ts'],
      exclude: ['**/*.int.test.ts'],
      environment: 'node',
      testTimeout: 20_000,
    },
  },
  {
    test: {
      name: 'integration',
      include: ['packages/*/test/**/*.int.test.ts', 'tests/integration/**/*.test.ts'],
      environment: 'node',
      testTimeout: 60_000,
      pool: 'forks',
    },
  },
  {
    test: {
      name: 'eval',
      include: ['evals/**/*.eval.ts'],
      environment: 'node',
      testTimeout: 30 * 60_000,
      pool: 'forks',
    },
  },
  {
    test: {
      // Real model calls (needs a provider key in the environment; skipped otherwise). Never part of CI.
      name: 'live',
      include: ['tests/live/**/*.live.test.ts'],
      environment: 'node',
      testTimeout: 20 * 60_000,
      pool: 'forks',
    },
  },
]);
