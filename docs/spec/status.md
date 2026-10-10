# Implementation status — v0.1 (M0 + M1)

Report date 2026-10-10. Platform tested: Linux x64 (Node 22.22, Electron 44.1.1). Everything marked **met** below has a test that ran and passed on that date. Nothing here relies on an agent's own report.

## Results of the last run

| Command | Result |
| --- | --- |
| `pnpm lint` | dependency graph acyclic (10 workspaces); ESLint clean |
| `pnpm typecheck` | all workspaces pass |
| `pnpm test` | 42 / 42 passed |
| `pnpm test:integration` | 10 / 10 passed |
| `xvfb-run -a pnpm test:e2e` | 5 / 5 passed (built Electron app) |
| `pnpm pi:version` | installed Pi packages match pin 0.87.1, MIT |
| `pnpm package` | `apps/desktop/release/ATLAS-0.1.0.AppImage` (151 MB); launched under xvfb, daemon reached ready |

## Acceptance tests from the manual

| § | Acceptance test | Status | Evidence |
| --- | --- | --- | --- |
| 1 | Sample mission runs without the Pi CLI | **met** (scripted runtime) | `tests/e2e-electron/mission.spec.ts` |
| 2 | Who changed a file and why, from records | **met** | events carry actor/task/attempt; integration "sample mission" asserts the `write_file` call's actor |
| 5 | Pi adapter replaceable by a fake; orchestration tests intact | **met** | orchestration tests use the fake runtime; same contract suite runs on both |
| 6 | Fresh clone installs, boots, runs baseline suite | **met** on Linux | CI workflow; local run above |
| 7 | Acyclic graph, typechecks per workspace | **met** | `scripts/check-deps.mjs`, `pnpm typecheck` |
| 8 | Third-party notices, pinned version script | **partly** | `licenses/third-party/pi.md`, `pnpm pi:version`; upstream LICENSE text still to be copied (npm tarball ships none) |
| 9 | Fake and Pi pass the same contract tests | **met** | `packages/runtime-pi/test/contract.test.ts` (real SDK + Pi's faux provider) |
| 10 | Start, stream, cancel, dispose a Pi session without leaks | **met** | same suite, `activeRuns() === 0` after dispose |
| 11 | Migration and CRUD tests per entity | **met** for M1 entities | `packages/storage/test` |
| 12 | Invalid transitions rejected; replay reconstructs state | **met** | `packages/orchestrator/test/core.test.ts`; replay checked after missions and after crash |
| 13 | Parallel non-conflicting, serial conflicting tasks | **not yet** (M2) | scheduler has bounded concurrency and leases; multi-task plans arrive with the M2 planner |
| 14 | Cyclic plan rejected before any tool action | **met** | `core.test.ts` |
| 16 | Runaway delegation stops at limits | **not yet** (M2) | per-attempt tool-call, token and wall-clock budgets are enforced; no subagents yet |
| 18 | Symlink traversal, dirty worktree, cleanup | **met** | `packages/workspace/test` |
| 19 | Inspect, reject, restore an unmerged change | **met** (inspect, reject) | e2e + integration "reject"; restoring a rejected change is not offered |
| 20 | Cancel leaves no orphaned child process | **met** | terminal test (grandchild), integration cancel test |
| 21 | Denied tool call never reaches the executor | **met** | integration "governed tools" with spy executors |
| 22 | Allow, deny, prompt and expired-approval cases | **met** | policy unit tests + integration (deny, approve once, expire) |
| 23 | Malicious fixture cannot reach a canary credential | **not met** | no OS sandbox in v0.1 — see ADR 0005 |
| 24 | Seeded secret absent from artifacts and exports | **met** for events and artifacts | integration "seeded secrets"; JSONL export not built yet |
| 28 | Failing fixture fails the gate despite a success claim | **met** | integration "liar" script |
| 34 | Plan a mission and see required approvals before starting | **met** | plan review screen; e2e |
| 35 | Disconnect or restart the UI mid-mission and reconnect accurately | **partly** | e2e kills the daemon and restarts the app *after* a mission and checks the view resyncs; integration stops the daemon *mid-command* and recovers. A UI restart in the middle of a running mission is not yet tested end to end |
| 38 | Replay matches persisted state after a crash | **met** | integration crash-recovery test |
| 39 | Backup/restore keeps evidence links | **met** | storage test |
| 40 | Fault injection yields a stable final state | **partly** | integration stops the daemon during a running command (no state cleanup) and recovery completes the mission in a new attempt; no deployments exist yet to check for duplicates |
| 50 | Contracts build, API tests pass | **met** | IPC validated by zod; e2e checks undeclared/malformed requests |
| E8 | Branded window; renderer has no fs/child_process; undeclared IPC denied | **met** | `tests/e2e-electron/security.spec.ts` |
| E8 | Main stays responsive while tasks run or a worker crashes | **met** in practice | execution lives in the daemon; e2e crashes it while the UI keeps working |
| E8 | Sample mission edits code in isolation, runs tests, shows diff and evidence | **met** | e2e |

Not started (later milestones): browser QA (§25), desktop control (§26–27), AI review (§29), deployment and release gates (§30–32), evaluation corpus (§45), JSONL export (§38).

## Known gaps and risks

1. **No OS-level isolation** (ADR 0005). Highest-priority risk before untrusted repositories.
2. **Real-model path not exercised against a live provider in CI.** The Pi adapter is contract-tested with Pi's faux provider; a run against a real model needs a key and is opt-in.
3. **Pipes, not PTYs.** Interactive programs are not supported in agent commands.
4. **Single-task plans** from a deterministic planner (ADR 0006). Model planning comes in M2 and must pass the same validator.
5. **Pi resume** is not supported; recovery restarts tasks as new attempts in fresh worktrees.
6. **macOS and Windows** build but are untested and unsigned.
7. **Pi telemetry** is disabled in the adapter (`enableInstallTelemetry: false`, `PI_TELEMETRY=0`). Re-check on every Pi upgrade.

## Next milestone (M2)

Model-generated plans through `validatePlan`; reviewer role consuming the patch plus context; multi-task DAGs with parallel worktrees and a controlled integration merge; delegation budgets; JSONL audit export; PTY-backed terminals.
