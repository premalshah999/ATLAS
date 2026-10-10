// Deterministic fake runtime (manual §44). It drives the same governed tools as a real model, from a script,
// so orchestration, policy and evidence paths are testable without model credentials.
import type { AgentEvent, AgentHandle, AgentInput, AgentRuntime, RuntimeHealth } from '@atlas/contracts';
import { EventQueue } from './queue';

export { EventQueue } from './queue';
export { sampleSlugifyScript, SAMPLE_FIX } from './scripts';

export type FakeStep =
  | { say: string }
  | { tool: string; args: Record<string, unknown> }
  /** The agent's own claim. It is recorded as a claim and never treated as evidence. */
  | { claim: string };

export interface FakeScript {
  name: string;
  matches(input: AgentInput): boolean | Promise<boolean>;
  steps(input: AgentInput): FakeStep[] | Promise<FakeStep[]>;
}

/** Default behavior for repositories without a matching script: a read-only survey. */
export const surveyScript: FakeScript = {
  name: 'survey',
  matches: () => true,
  steps: () => [
    { say: 'Fake runtime: surveying the repository. No model is connected, so no code changes will be proposed.' },
    { tool: 'git_status', args: {} },
    { tool: 'list_files', args: { path: '.' } },
    { claim: 'Survey complete. No changes made (fake runtime).' },
  ],
};

interface Run { queue: EventQueue<AgentEvent>; abort: AbortController; done: Promise<void> }

export class FakeRuntime implements AgentRuntime {
  readonly kind = 'fake' as const;
  private runs = new Map<string, Run>();
  private seq = 0;
  constructor(private readonly scripts: FakeScript[] = [], private readonly stepDelayMs = 0) {}

  async health(): Promise<RuntimeHealth> {
    return { ok: true, runtime: 'fake', version: 'fake-1', models: ['scripted'], detail: 'Deterministic scripted runtime. Output is sample behavior, not a model.' };
  }

  async start(input: AgentInput): Promise<AgentHandle> {
    const id = `fake-${++this.seq}`;
    const queue = new EventQueue<AgentEvent>();
    const abort = new AbortController();
    const onOuter = () => abort.abort();
    input.signal.addEventListener('abort', onOuter, { once: true });
    const done = this.drive(input, queue, abort.signal).finally(() => { input.signal.removeEventListener('abort', onOuter); queue.close(); });
    this.runs.set(id, { queue, abort, done });
    return { id, runtime: 'fake' };
  }

  private async drive(input: AgentInput, q: EventQueue<AgentEvent>, signal: AbortSignal) {
    let script = surveyScript;
    for (const s of this.scripts) if (await s.matches(input)) { script = s; break; }
    const steps = await script.steps(input);
    let calls = 0;
    let summary = '';
    for (const step of steps) {
      if (signal.aborted) { q.push({ type: 'error', kind: 'cancelled', message: 'Run cancelled' }); return; }
      if (this.stepDelayMs) await new Promise((r) => setTimeout(r, this.stepDelayMs));
      if ('say' in step) q.push({ type: 'message', text: step.say });
      else if ('claim' in step) summary = step.claim;
      else {
        if (++calls > input.budget.maxToolCalls) { q.push({ type: 'error', kind: 'budget_exceeded', message: `Tool-call budget of ${input.budget.maxToolCalls} exhausted` }); return; }
        const callId = `call-${calls}`;
        q.push({ type: 'tool_call', callId, tool: step.tool, args: step.args });
        const r = await input.tools.invoke(step.tool, step.args, signal);
        q.push({ type: 'tool_result', callId, tool: step.tool, ok: r.ok, summary: r.output.slice(0, 2000) });
        if (signal.aborted) { q.push({ type: 'error', kind: 'cancelled', message: 'Run cancelled' }); return; }
      }
    }
    q.push({ type: 'usage', inputTokens: 0, outputTokens: 0 });
    q.push({ type: 'completed', summary: summary || 'Script finished.' });
  }

  stream(handle: AgentHandle): AsyncIterable<AgentEvent> {
    const r = this.runs.get(handle.id);
    if (!r) throw new Error(`unknown handle ${handle.id}`);
    return r.queue;
  }

  async interrupt(handle: AgentHandle) { this.runs.get(handle.id)?.abort.abort(); }
  async resume(): Promise<void> { throw new Error('The fake runtime cannot resume; the scheduler starts a new attempt instead.'); }
  async dispose(handle: AgentHandle) {
    const r = this.runs.get(handle.id);
    if (!r) return;
    r.abort.abort();
    await r.done.catch(() => {});
    this.runs.delete(handle.id);
  }
  activeRuns() { return this.runs.size; }
}
