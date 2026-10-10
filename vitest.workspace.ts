import { defineWorkspace } from 'vitest/config';

export default defineWorkspace([
  {
    test: {
      name: 'unit',
      include: ['packages/*/test/**/*.test.ts', 'apps/daemon/test/**/*.test.ts'],
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
]);
