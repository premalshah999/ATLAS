import { run, sanitizedEnv } from '@atlas/terminal';

export interface GitResult { code: number | null; out: string }

/** Run git with an argument array and a sanitized environment. Never interpolates a shell string. */
export async function git(cwd: string, args: string[], timeoutMs = 30_000, extraEnv: Record<string, string> = {}): Promise<GitResult> {
  const r = await run({
    // Repository config is untrusted: never run its hooks, fsmonitor or external diff/filter programs from ATLAS's own git calls.
    command: 'git', args: ['-c', 'core.hooksPath=/dev/null', '-c', 'core.fsmonitor=false', '-c', 'diff.external=', '-c', 'protocol.file.allow=user', ...args], cwd, timeoutMs,
    env: sanitizedEnv({ GIT_TERMINAL_PROMPT: '0', GIT_CONFIG_NOSYSTEM: '1', GIT_AUTHOR_NAME: 'ATLAS', GIT_AUTHOR_EMAIL: 'atlas@localhost', GIT_COMMITTER_NAME: 'ATLAS', GIT_COMMITTER_EMAIL: 'atlas@localhost', ...extraEnv }),
    maxOutput: 8 * 1024 * 1024,
  });
  return { code: r.exitCode, out: r.output.trimEnd() };
}

export async function gitOk(cwd: string, args: string[]): Promise<string> {
  const r = await git(cwd, args);
  if (r.code !== 0) throw new Error(`git ${args[0]} failed: ${r.out.slice(0, 400)}`);
  return r.out;
}
