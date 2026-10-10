// Plan validation (manual §14). A plan must be valid before any tool action can happen.
import { Plan, ToolName, type Mission } from '@atlas/contracts';

export interface PlanIssue { code: string; message: string }

export function validatePlan(input: unknown): { ok: true; plan: Plan } | { ok: false; issues: PlanIssue[] } {
  const parsed = Plan.safeParse(input);
  if (!parsed.success) return { ok: false, issues: parsed.error.issues.map((i) => ({ code: 'schema', message: `${i.path.join('.')}: ${i.message}` })) };
  const plan = parsed.data;
  const issues: PlanIssue[] = [];
  const keys = new Set<string>();
  for (const t of plan.tasks) {
    if (keys.has(t.key)) issues.push({ code: 'duplicate_task', message: `Task key "${t.key}" is used twice` });
    keys.add(t.key);
  }
  for (const t of plan.tasks) {
    for (const d of t.dependsOn) if (!keys.has(d)) issues.push({ code: 'unknown_dependency', message: `${t.key} depends on unknown task "${d}"` });
    for (const tool of t.tools) if (!ToolName.safeParse(tool).success) issues.push({ code: 'unknown_tool', message: `${t.key} requires unknown tool "${tool}"` });
    if (t.risk === 'high' && !t.rollback) issues.push({ code: 'missing_rollback', message: `${t.key} is high risk and has no rollback plan` });
  }
  const cycle = findCycle(plan.tasks.map((t) => ({ key: t.key, deps: t.dependsOn })));
  if (cycle) issues.push({ code: 'cycle', message: `Dependency cycle: ${cycle.join(' → ')}` });
  return issues.length ? { ok: false, issues } : { ok: true, plan };
}

export function findCycle(nodes: { key: string; deps: string[] }[]): string[] | null {
  const deps = new Map(nodes.map((n) => [n.key, n.deps]));
  const state = new Map<string, 1 | 2>();
  const stack: string[] = [];
  const visit = (k: string): string[] | null => {
    if (state.get(k) === 2) return null;
    if (state.get(k) === 1) return [...stack.slice(stack.indexOf(k)), k];
    state.set(k, 1); stack.push(k);
    for (const d of deps.get(k) ?? []) { if (!deps.has(d)) continue; const c = visit(d); if (c) return c; }
    stack.pop(); state.set(k, 2);
    return null;
  };
  for (const n of nodes) { const c = visit(n.key); if (c) return c; }
  return null;
}

/**
 * Deterministic v0.1 planner: one isolated coding task followed by independent verification.
 * Model-generated plans arrive in M2 and must pass the same validator.
 */
export function defaultPlan(m: Pick<Mission, 'goal' | 'constraints' | 'approvalMode'>, version: number, hasTests: boolean): Plan {
  const readOnly = m.approvalMode === 'plan_only';
  return {
    version,
    summary: readOnly ? 'Investigate the repository and report findings without changing files.' : 'Implement the objective in an isolated worktree, then verify it independently.',
    scope: 'Files inside an isolated git worktree created from the current HEAD. The user checkout is not modified.',
    tasks: [{
      key: 'implement',
      title: readOnly ? 'Investigate and report' : 'Implement the objective',
      role: 'coder',
      dependsOn: [],
      acceptance: [
        m.goal.split('\n')[0].slice(0, 200),
        ...(m.constraints.trim() ? [`Respect constraints: ${m.constraints.trim().slice(0, 200)}`] : []),
        hasTests ? 'Project test command exits 0 on the checkpointed commit' : 'No test command detected — result will be reported as unverified',
      ],
      tools: readOnly ? ['read_file', 'list_files', 'git_status', 'run_tests'] : ['read_file', 'list_files', 'write_file', 'shell_exec', 'git_status', 'run_tests'],
      risk: 'low',
    }],
    verification: [{ name: 'tests', required: hasTests }],
  };
}
