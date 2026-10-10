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
    if (input.roleId !== 'coder') return false;
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

/** Marker in a mission objective that selects the scripted desktop sample. */
export const DESKTOP_SAMPLE_MARKER = '[desktop sample]';

/**
 * Scripted planner for the samples: plans a desktop operator task for the desktop sample and declines
 * otherwise (the orchestrator then uses its deterministic plan).
 */
export function samplePlanner(req: { objective: string; verification: { name: string; required: boolean }[] }): unknown {
  if (!req.objective.includes(DESKTOP_SAMPLE_MARKER)) return null;
  return {
    summary: 'Scripted desktop sample: a desktop operator works on an isolated virtual display.',
    scope: 'A new virtual display; no files change.',
    tasks: [{ key: 'desktop', title: 'Operate the virtual desktop', role: 'desktop_operator', dependsOn: [], acceptance: ['The desktop session is recorded with screenshots'], tools: ['desktop_action', 'read_file'], risk: 'elevated' }],
    verification: req.verification,
  };
}

/** Desktop operator sample: looks, clicks, pauses long enough for an operator to take over, types. */
export const sampleDesktopScript: FakeScript = {
  name: 'sample-desktop',
  matches: (input) => input.roleId === 'desktop_operator',
  steps: () => [
    { say: 'Taking a screenshot of the virtual display before acting.' },
    { tool: 'desktop_action', args: { action: 'screenshot' } },
    { tool: 'desktop_action', args: { action: 'launch', app: 'xmessage', args: ['-center', '-title', 'ATLAS desktop sample', 'Hello from an app running in the ATLAS sandbox on a virtual display.'] } },
    { tool: 'desktop_action', args: { action: 'waitFor', windowTitle: 'ATLAS desktop sample', timeoutMs: 10000 } },
    { tool: 'desktop_action', args: { action: 'windows' } },
    { tool: 'desktop_action', args: { action: 'click', x: 640, y: 400 } },
    { wait: 8000 },
    { tool: 'desktop_action', args: { action: 'type', text: 'hello from the agent' } },
    { tool: 'desktop_action', args: { action: 'screenshot' } },
    { claim: 'Operated the virtual desktop (scripted sample).' },
  ],
};
