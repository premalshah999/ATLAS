// Runtime contract suite (manual §9–10): the fake runtime and the real Pi SDK adapter pass the same tests.
// Pi runs with its scripted "faux" provider, so no credentials or network are needed.
import { describe, expect, it } from 'vitest';
import { createFauxCore, fauxAssistantMessage, fauxText, fauxToolCall } from '@earendil-works/pi-ai';
import type { AgentEvent, AgentInput, AgentRuntime, ToolInvoker, ToolResult } from '@atlas/contracts';
import { FakeRuntime, type FakeScript } from '@atlas/runtime-fake';
import { PiRuntime } from '../src';
import { tmpDir } from '../../../tests/helpers';

interface Harness { runtime: AgentRuntime; active(): number }
type Scenario = 'list' | 'block';

function piHarness(scenario: Scenario): Harness {
  const faux = createFauxCore({ provider: 'atlas-faux' });
  const fm = faux.getModel();
  faux.setResponses(scenario === 'list'
    ? [fauxAssistantMessage([fauxText('Listing files.'), fauxToolCall('list_files', { path: '.' })], { stopReason: 'toolUse' }), fauxAssistantMessage('Found two files.')]
    : [fauxAssistantMessage([fauxToolCall('run_tests', {})], { stopReason: 'toolUse' }), fauxAssistantMessage('unreachable')]);
  const runtime = new PiRuntime({
    agentDir: tmpDir('atlas-pi-'),
    model: `atlas-faux/${fm.id}`,
    configure: (rt) => rt.registerProvider('atlas-faux', {
      name: 'Faux', baseUrl: 'http://faux.invalid', apiKey: 'test-only', api: faux.api, streamSimple: faux.streamSimple as any,
      models: [{ id: fm.id, name: 'Faux', reasoning: false, input: ['text'], cost: fm.cost, contextWindow: 100_000, maxTokens: 4096 }],
    }),
  });
  return { runtime, active: () => runtime.activeRuns() };
}

function fakeHarness(scenario: Scenario): Harness {
  const script: FakeScript = { name: 't', matches: () => true, steps: () => scenario === 'list'
    ? [{ say: 'Listing files.' }, { tool: 'list_files', args: { path: '.' } }, { claim: 'Found two files.' }]
    : [{ tool: 'run_tests', args: {} }, { claim: 'unreachable' }] };
  const runtime = new FakeRuntime([script]);
  return { runtime, active: () => runtime.activeRuns() };
}

function invoker(calls: string[]): ToolInvoker {
  return {
    specs: [
      { name: 'list_files', description: 'List files', parameters: { type: 'object', properties: { path: { type: 'string' } }, required: ['path'] } },
      { name: 'run_tests', description: 'Run tests', parameters: { type: 'object', properties: {} } },
    ],
    async invoke(name, _args, signal): Promise<ToolResult> {
      calls.push(name);
      if (name === 'run_tests') {
        // Blocks until cancelled, like a long-running process.
        await new Promise<void>((resolve) => { if (signal.aborted) resolve(); signal.addEventListener('abort', () => resolve(), { once: true }); });
        return { ok: false, output: 'cancelled', exitCode: null, artifactIds: [], error: 'cancelled' };
      }
      return { ok: true, output: 'a.txt\nb.txt', exitCode: null, artifactIds: [], error: null };
    },
  };
}

function input(tools: ToolInvoker, signal: AbortSignal): AgentInput {
  return {
    missionId: 'msn_aaaaaaaa', taskId: 'tsk_aaaaaaaa', attemptId: 'att_aaaaaaaa', workspaceId: 'ws_aaaaaaaa', roleId: 'coder', cwd: tmpDir(),
    instructions: 'Test agent.', prompt: 'List the files.', permittedTools: ['list_files', 'run_tests'], contextRefs: [],
    budget: { maxToolCalls: 10, maxTokens: 100_000, wallClockMs: 30_000 }, tools, signal,
  };
}

async function collect(rt: AgentRuntime, h: Awaited<ReturnType<AgentRuntime['start']>>, onEvent?: (e: AgentEvent) => void) {
  const out: AgentEvent[] = [];
  for await (const e of rt.stream(h)) { out.push(e); onEvent?.(e); }
  return out;
}

for (const [name, make] of [['fake', fakeHarness], ['pi', piHarness]] as const) {
  describe(`AgentRuntime contract: ${name}`, () => {
    it('reports health', async () => {
      const h = await make('list').runtime.health();
      expect(h.ok).toBe(true);
      expect(h.runtime).toBe(name);
    });

    it('starts, streams governed tool calls, completes and disposes without leaks', async () => {
      const { runtime, active } = make('list');
      const calls: string[] = [];
      const handle = await runtime.start(input(invoker(calls), new AbortController().signal));
      const events = await collect(runtime, handle);
      const types = events.map((e) => e.type);
      expect(types).toContain('tool_call');
      expect(types).toContain('tool_result');
      expect(types.at(-1)).toBe('completed');
      expect(events.find((e) => e.type === 'tool_call')).toMatchObject({ tool: 'list_files' });
      expect(calls).toEqual(['list_files']);
      await runtime.dispose(handle);
      expect(active()).toBe(0);
    });

    it('cancels a blocked run through the input signal and ends the stream', async () => {
      const { runtime, active } = make('block');
      const calls: string[] = [];
      const ac = new AbortController();
      const handle = await runtime.start(input(invoker(calls), ac.signal));
      const events = await collect(runtime, handle, (e) => { if (e.type === 'tool_call') setTimeout(() => ac.abort(), 50); });
      expect(events.at(-1)).toMatchObject({ type: 'error', kind: 'cancelled' });
      await runtime.dispose(handle);
      expect(active()).toBe(0);
    });
  });
}

describe('Pi adapter isolation', () => {
  it('fails health when no model has credentials', async () => {
    const rt = new PiRuntime({ agentDir: tmpDir('atlas-pi-'), model: 'anthropic/definitely-not-a-model' });
    const h = await rt.health();
    expect(h.ok).toBe(false);
  });
});
