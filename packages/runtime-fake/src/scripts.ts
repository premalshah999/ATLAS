// Scripted behavior for the bundled sample project (fixtures/sample-app). Sample output, not a model.
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import type { FakeScript } from './index';

export const SAMPLE_FIX = `// Fixed by the ATLAS sample script.
export function slugify(title) {
  return title
    .normalize('NFKD')
    .toLowerCase()
    .replace(/[\\u2019'.]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}
`;

export const sampleSlugifyScript: FakeScript = {
  name: 'sample-slugify',
  matches: (input) => {
    const f = path.join(input.cwd, 'src', 'slugify.js');
    return existsSync(f) && readFileSync(f, 'utf8').includes('ATLAS-SAMPLE');
  },
  steps: (input) => input.permittedTools.includes('write_file')
    ? [
        { say: 'Reading the slug helper and its tests before changing anything.' },
        { tool: 'read_file', args: { path: 'src/slugify.js' } },
        { tool: 'read_file', args: { path: 'test/slugify.test.js' } },
        { tool: 'run_tests', args: {} },
        { say: 'All five tests fail: case, punctuation and repeated separators are not handled. Rewriting slugify to normalize, lowercase and collapse non-alphanumerics.' },
        { tool: 'write_file', args: { path: 'src/slugify.js', content: SAMPLE_FIX } },
        { tool: 'run_tests', args: {} },
        { claim: 'Rewrote slugify() to normalize, lowercase, strip apostrophes and collapse separators. Tests pass locally.' },
      ]
    : [
        { tool: 'read_file', args: { path: 'src/slugify.js' } },
        { tool: 'run_tests', args: {} },
        { claim: 'Plan-only: slugify() ignores case, punctuation and repeated separators. Recommended fix: normalize, lowercase, collapse non-alphanumerics.' },
      ],
};
