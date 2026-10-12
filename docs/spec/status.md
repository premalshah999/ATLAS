# Implementation status — M0–M5

Report date 2026-10-12 for lint, typecheck, unit, integration and e2e; the eval, screenshot, Pi-version and package rows are carried over from the 2026-10-10 run. Platform tested: Linux x64 (Node 22.22, Electron 44.1.1, bubblewrap, Xvfb, Chromium from Playwright 1.56). A **met** below means a test ran and passed on that date. Nothing here relies on an agent's own report.

## Results of the last run

| Command | Result |
| --- | --- |
| `pnpm lint` | dependency graph acyclic (16 workspaces); ESLint 0 errors (13 react-hooks `exhaustive-deps` warnings in the renderer) |
| `pnpm typecheck` | every workspace, plus `tests/` and `evals/` |
| `pnpm test` | 240 passed, 7 skipped (28 files; skips are platform- or tool-gated) |
| `pnpm test:integration` | 113 passed, 1 skipped (17 files, real git repositories, real sandbox) |
| `pnpm eval` | 11 / 11 cases behaved as expected; false pass rate 1/7 (the deliberate `weak-tests` case) — [report](../eval/latest.md) |
| `xvfb-run -a pnpm test:e2e` | 17 / 17 passed (built Electron app; `team.spec.ts` runs two app instances) |
| `pnpm screenshots` | both capture runs passed; `docs/screenshots` regenerated |
| `pnpm pi:version` | installed Pi packages match pin 0.87.1, MIT |
| `pnpm package` | `apps/desktop/release/ATLAS-0.1.0.AppImage` (153 MB); launched under xvfb, daemon reached ready (schema v4) |

## Acceptance tests from the manual

| § | Acceptance test | Status | Evidence |
| --- | --- | --- | --- |
| 1 | Sample mission runs without the Pi CLI | **met** | `tests/e2e-electron/mission.spec.ts` |
| 2 | Who changed a file and why, from records | **met** | events carry actor/task/attempt; integration "sample mission" |
| 5 | Pi adapter replaceable by a fake | **met** | orchestration tests use the fake; same contract suite on both |
| 6 | Fresh clone installs, boots, runs baseline suite | **met** on Linux | CI workflow; local run above |
| 7 | Acyclic graph, typechecks per workspace | **met** | `scripts/check-deps.mjs`, `pnpm typecheck` |
| 8 | Third-party notices, pinned version script | **met** | `licenses/third-party/pi.md`, `licenses/third-party/pi-LICENSE.txt` (upstream MIT text), `pnpm pi:version` |
| 9–10 | Fake and Pi pass the same contract; no leaks | **met** | `packages/runtime-pi/test/contract.test.ts` |
| 11 | Migration and CRUD tests per entity | **met** | `packages/storage/test` (migrations v1–v4) |
| 12 | Invalid transitions rejected; replay reconstructs state | **met** | `core.test.ts`; replay checked after crash and in eval `crash-recovery` |
| 13 | Parallel non-conflicting, serial conflicting tasks | **met** | `m2.test.ts` "runs a DAG…", "serializes writers…" |
| 14 | Cyclic or invalid plan rejected before any tool action | **met** | `core.test.ts`; `m2.test.ts` "rejects an invalid model plan" |
| 15 | Role definition version visible in execution logs | **met** for logging | `attempt.started` records `roleVersion`; definitions are versioned in code, so a change ships as a new version |
| 16 | Runaway delegation stops at limits | **met** | `m2.test.ts` depth and token budget tests |
| 17 | Reviewer gets the diff plus relevant context | **met** | `m2.test.ts` "context bundles record their sources…" |
| 18 | Symlink traversal, dirty worktree, cleanup | **met** | `packages/workspace/test` |
| 19 | Inspect, reject, restore an unmerged change | **met** | inspect and reject (e2e, integration); `mission.restore` restores a rejected change exactly once and refuses a tampered ref (`tests/integration/mission.test.ts`) |
| 20 | Cancel leaves no orphaned child process | **met** | terminal tests, integration cancel, eval `long-running` |
| 21 | Denied tool call never reaches the executor | **met** | integration "governed tools" with spy executors |
| 22 | Allow, deny, prompt and expired-approval cases | **met** | policy unit tests; integration |
| 23 | Malicious fixture cannot reach a canary credential | **met** with bubblewrap | `sandbox.test.ts`, eval `prompt-injection`; macOS profile untested |
| 24 | Seeded secret absent from artifacts and exports | **met** | integration "seeded secrets", `archive.test.ts`, deploy secrets test |
| 25 | Sample app smoke suite headless, screenshots on failure | **met** | `browser.test.ts` |
| 26 | Pause desktop control; no further input emitted | **met** | `packages/desktop-control/test` (pointer position and input log, including mid-typing) |
| 27 | Correlate browser URL, deployment revision and commit | **met** in the record | staging checks and deployments carry URL, revision and commit; the Deploy tab shows them together. No dedicated test |
| 28 | Failing fixture fails the gate despite a success claim | **met** | integration "liar"; eval `false-claim` |
| 29 | Seeded bug reported with evidence; harmless change has no blocker | **met** | `m2.test.ts` finding tests |
| 30 | Staging deploy returns id, URL, revision, timestamp or failure | **met** | `deploy.test.ts` |
| 31 | Wrong deployed revision blocks completion | **met** | `deploy.test.ts`; eval `wrong-deploy-revision` |
| 32 | Deploy failure blocks and records rollback | **met** | `deploy.test.ts` (rollback with revision confirmation) |
| 34 | Plan a mission and see approvals before starting | **met** | e2e |
| 35 | Disconnect or restart the UI mid-mission and reconnect | **met** | e2e "UI reload and full app restart in the middle of a mission resume accurately" (`mission.spec.ts`); integration stops the daemon mid-command |
| 36 | Reject a patch without changing the checkout | **met** | e2e, integration |
| 37 | Inspect the exact failed browser step and screenshot | **met** | `browser.test.ts` (failed step screenshot); Browser tab in e2e |
| 38 | Replay matches persisted state after a crash | **met** | integration crash recovery |
| 39 | Backup/restore keeps evidence links | **met** | storage test; export/import round trip |
| 40 | Fault injection: stable state, no duplicate deployment | **met** | integration crash tests; `deploy.test.ts` "crash mid-deploy … never silently redeployed" |
| 41 | Stress test respects maximum workers, UI responsive | **met** | `m2.test.ts`: 12 parallel writers peak at exactly the cap of 3; `stress.spec.ts`: six concurrent missions all verify while renderer timer delay p95 stays under 250 ms and the palette opens under 1.5 s p95 (last run: 5 ms, 80 ms). The probe is calibrated against a deliberately blocked renderer |
| 42 | Untrusted text requesting credentials is refused | **met** | eval `prompt-injection` (network denied, path escape denied, canary unreadable) |
| 43 | Idle app makes no unexplained outbound requests | **met** | `apps/daemon/test/network-audit.test.ts`; e2e "network audit: the idle app makes no outbound requests" (`security.spec.ts`) |
| 45 | Each release generates an evaluation summary | **met** | `pnpm eval` → `docs/eval/latest.md` (traceable failures) |
| 50 | Contracts build, API tests pass | **met** | IPC validated by zod; e2e checks undeclared and malformed requests |
| E8 | Branded window; hardened renderer; undeclared IPC denied | **met** | `tests/e2e-electron/security.spec.ts` |
| E8 | Sample mission edits in isolation, runs tests, shows evidence | **met** | e2e |

## UI coverage (e2e, built app)
- **`capabilities.spec.ts`:**
  - Settings allowlist and roles;
  - a mission with a staging target and its approval, verified via `staging:revision`;
  - the Tasks graph, Browser steps and Deploy history;
  - a sandboxed operator terminal running `ls`;
  - audit export, then import into a second installation as a read-only archive;
  - a desktop session with approval and operator takeover, with the agent's next input refused and recorded.
- **`mission.spec.ts` and `security.spec.ts`:** the M1 flows, daemon crash and app restart, and the renderer hardening.
- **`stress.spec.ts`:** six concurrent missions while the renderer's timer delay and palette latency are measured (§41).

## Added after M5 (2026-10-12)
| Capability | Evidence |
| --- | --- |
| Every key-based Pi provider (34); default, strong and fast models per role tier; model per mission, recorded per attempt (ADR 0017) | `runtime-pi/test/providers.test.ts` (checked against Pi offline), `tests/integration/models.test.ts`, `models.spec.ts` |
| MCP servers: remote (streamable HTTP) and local (stdio in the OS sandbox) behind the governed `mcp_call`, approval by default (ADR 0018) | `packages/mcp/test/mcp.test.ts`, policy tests, `tests/integration/mcp.test.ts`, `mcp.spec.ts` |
| Skills authored, customized and turned off in ATLAS; skills from other tools untrusted until imported (ADR 0019) | `orchestrator/test/skills.test.ts`, `sync.spec.ts` |
| Skills and MCP servers synced to Claude Code, Codex and OpenCode with preview, ownership and conflicts; no secret values written (ADR 0019) | `packages/sync/test/sync.test.ts`, `sync.spec.ts` |
| Team spaces: people and their agents on one repository through a signed record in the repository's git remote (no server, no accounts); invitation codes, join requests, teams owning paths, board, shared missions with diff, reviews, teammate plan approval, agent runner (ADR 0021) | `packages/team/test/team.test.ts` (real git, three installations), `tests/integration/team.test.ts` (two full installations), `team.spec.ts` (two app instances) |
| Owner approval gates publishing: a change to a team's paths needs an approving review of that commit from the team (ADR 0021) | `team.test.ts` (unit and integration), `team.spec.ts` |
| Delivery pipeline per repository: pull request on acceptance, CI fix missions planned, approved, verified, accepted and pushed automatically within a round limit; never merges, never answers tool approvals, never approves high-risk plans (ADR 0022) | `tests/integration/pipeline.test.ts` |
| Security engineer: ATLAS's deterministic scan of every integrated change (secrets, injection-prone code, TLS, dependencies, install scripts, typosquats, CI workflows) blocks on confirmed high/medium results; a security engineer agent reviews each plan's change in parallel with the reviewer (ADR 0023) | `packages/security/test/scan.test.ts`, `tests/integration/security.test.ts` |
| Context continuity: Pi compacts long agent conversations (recorded as `context.compacted`); `mission_memory` returns ATLAS's exact records (writes, commands with exit codes, refusals, findings, the change); a deterministic code graph of the base commit is built in the background and queried with `code_graph`, worktree edits included (ADR 0024) | `packages/graph/test/graph.test.ts`, `packages/runtime-pi/test/compaction.test.ts` (real Pi, faux model), `tests/integration/context.test.ts` |
| Session hygiene: daemon log rotation; rotated logs, unused graph caches, finished conversations, deleted missions' worktrees and the database WAL cleared automatically (start, every 30 min) or from Settings; evidence never (ADR 0025) | `apps/daemon/test/hygiene.test.ts`, `maintenance.spec.ts` |

## Known gaps and risks
1. **Real-model path.** It is not exercised against a live provider in CI. The Pi adapter is contract-tested with Pi's faux provider. `ATLAS_EVAL_RUNTIME=pi pnpm eval` runs the corpus with a real model when a key is present; that has not been run for this report.
2. **Weak project tests produce false passes.** The `weak-tests` eval case shows that ATLAS cannot know an overfit change is wrong when the project's own checks pass it.
3. **Windows** runs agent and check commands as visible sandbox accounts that the operator sets up from Settings (ADR 0020, decided after ADR 0016). The operator terminal is a ConPTY hosted as the account.
   - **Evidence.** CI run 38221699664 (commit `138b846`) passed every step on Windows Server 2025, Ubuntu 24.04 and macOS 15: lint, typecheck, unit (including the PTY tests typing into PowerShell, plain and as the account), integration, eval, the full Electron e2e (including two-installation team spaces), and packaging.
   - **Without accounts, Windows commands fail closed.** An AppContainer cannot create the pipes Node uses for child stdio.
   - **macOS** runs the full unit, integration and e2e suites in CI, including the Seatbelt sandbox and XQuartz desktop control.
   - Neither platform's build is signed.
6. **Team spaces (ADR 0021).**
   - Signatures attribute entries. Access to the record is repository access.
   - Order uses each author's clock.
   - Owner approval is enforced on ATLAS's publish path, not on plain git pushes; protected branches on the forge cover that.
   - The record is not compacted.
4. **Pi resume** is supported for the Pi runtime (ADR 0014). Runtimes without it still restart a task as a new attempt in a fresh worktree.
5. **Pi telemetry** is disabled in the adapter (`enableInstallTelemetry: false`, `PI_TELEMETRY=0`). Re-check on every Pi upgrade.
