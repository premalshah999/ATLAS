# 05 — Test evidence

Every number below comes from a process exit or a test assertion, and each one names the run that produced it. Local runs used the Linux development container (bubblewrap sandbox, Node 22). CI runs are GitHub Actions on `claude/gifted-volta-j4hvy4`.

## Local suite (Linux, after the latest slice, commit `2a538b8`)

| Command | Result |
|---|---|
| `pnpm typecheck` | exit 0 |
| `pnpm lint` | exit 0: dependency graph has 13 workspaces and is acyclic, ESLint clean |
| `pnpm test` (unit) | 164 passed, 2 skipped (platform-gated) |
| `pnpm test:integration` | 73 passed |
| `pnpm eval` | 11 of 11 cases behaved as expected; false passes 1/7 (the deliberate `weak-tests` case, unchanged from baseline) |
| `pnpm test:e2e` (Electron, xvfb) | 9 passed (run after `e24b0d2`) |

**Growth since baseline.** Unit tests went from 83 to 164, and integration tests from 44 to 73. The new tests are negative or adversarial cases for the slices in [04](04-implementation-log.md).

## CI by platform

| Run | Commit | Linux | macOS | Windows |
|---|---|---|---|---|
| 38087511279 | 0ba91ff (baseline fixes) | integration ✗ (crash-recovery timeout) | unit, integration, eval, e2e ✗ | unit, integration, eval, e2e ✗ |
| 38102776208 | fd796ff | integration ✗ (timeout) | **unit ✓ integration ✓ eval ✓**; e2e ✗ (PTY: tcgetattr) | ✗ (realpath EPERM in AppContainer) |
| 38104874121 | b8ec01c | integration ✗ (cancel test timeout) | unit, integration, eval ✓; e2e ✗ (openpty denied) | ✗ (npm.cmd "Access is denied.") |
| **38106986371** | **29b9a42** | **all steps ✓** (lint, typecheck, unit, integration, eval, e2e, package) | unit, integration, eval ✓; e2e ✗ (openpty, fixed in 6317668) | ✗ |
| **38107974496** | **6317668** | **all steps ✓** | **all steps ✓** (lint, typecheck, unit, integration, eval, Electron e2e, package) | unit, integration, eval ✗ |

**What the CI history shows**
- **Linux flake.** Before `29b9a42`, Linux integration timed out intermittently (3 of 6 runs) on tests that cancel a sandboxed command. The root cause was reproduced locally: under 4 busy cores, 118 of 150 early cancels hung. After the fix, 0 of 150 hung under the same load, and the first CI run with the fix is fully green.
- **macOS.** Fully green in CI as of `6317668`. That covers Seatbelt sandbox tests, missions, the gate, eval, the Electron e2e (including the operator terminal) and packaging. It took three CI-diagnosed fixes: the profile scope, the PTY stdin, and the PTY device for operator terminals.
- **Windows.** It is **not** working. Sandboxed Node runs: the trivial, canary, write-isolation and network tests pass inside the AppContainer as of b8ec01c. The npm shim does not, so every mission's `npm test` is denied and missions end "Blocked: tests failed". Bisection is in 6317668.

## Probes and fault injection

| Fault | How it was injected | Observed | Evidence |
|---|---|---|---|
| Agent rewrites its own test script | Fake agent writes `scripts.test = node -e "process.exit(0)"` | Before: "Verified". After: failed with a named reason | `mission.test.ts` › verification cannot be redefined |
| Six review bypasses (A–F, J) | Gutted test, `.skip`, rename, tracked `node_modules`, lockfile swap, fan-out runner | All caught | same block |
| Hard daemon crash mid-command (unsandboxed) | Child orchestrator SIGKILLed | Before: command orphaned to PID 1. After: reaped on next start | `orphans.test.ts` |
| Leader dies first, server keeps running | `sh -c 'sleep … & …'` | The group member is reaped; a bystander group is untouched | `orphans.test.ts` |
| PID reuse | Journal row with a mismatched identity | Not killed | `orphans.test.ts` |
| Second app instance | Lock held by a live process | Second daemon refuses; nothing reaped | `apps/daemon/test/reap.test.ts` |
| Cancel during sandbox setup | Abort 0–9 ms after spawn, 30× | Never hangs; nothing left with the marker | `packages/terminal/test/sandbox.test.ts` |
| Dirty worktree at reject | File written then reject | Kept under `refs/atlas/preserved/…/uncommitted` | `mission.test.ts` › nothing in a worktree is destroyed |
| Snapshot impossible | `GIT~1/` path, nested `git init` | Worktree and branch retained, reason recorded | `workspace.test.ts` |
| User's other worktree missing | Moved before retire | Still listed (no global prune) | `workspace.test.ts` |
| Disk nearly full | Injected `diskFree` = 200 MiB | Task fails with `resource_limit` | `mission.test.ts` › resource guards |
| Silent agent | Fake runtime waits | One `attempt.stalled`; attempt not killed; not raised during approvals or silent commands | `mission.test.ts` › stall watchdog |
| Unsandboxed, operator denies | `ATLAS_SANDBOX=none` + deny | No process starts; checks inconclusive | `sandbox.test.ts` (integration) |
| Model connection drop | Runtime throws (typed / untyped) | Typed network error → fresh attempt, verified; untyped → failed with reason, no blind retry | `faults.test.ts` |
| Agent command killed externally | SIGKILL of the command's group | Non-zero exit recorded; never verified | `faults.test.ts` |
| User commits during the mission | Commit + dirty file in the user's checkout | Untouched; result based on the approved base | `faults.test.ts` |
| Evidence altered on disk | Overwrite a check log | Read reports not intact. **Before the fix the export re-hashed it and another install imported it as intact**; now the import is refused and flipping the flag breaks the trailer | `faults.test.ts` |
| Terminal tab switch | e2e: type, switch tab, return | Shell state and history intact | `capabilities.spec.ts` |

## Metrics (Linux, `pnpm metrics`, same harness as the baseline)

| Metric | Baseline | Now | Note |
|---|---|---|---|
| Plan latency | 387 ms | 358 ms | one run each; within noise |
| Approve → first agent | 624 ms | 620 ms | |
| Approve → verified | 7.5 s | 7.5 s | |
| Peak memory during a mission | 817 MB | 829 MB | |
| Daemon crash → ready | 1990 ms | 1996 ms | |
| Terminal echo (median of 5) | 182 ms | 92 ms and 160 ms in two runs | within run-to-run variance; **no improvement claimed** |

No performance improvement is claimed. The slices targeted correctness, safety and recovery.
