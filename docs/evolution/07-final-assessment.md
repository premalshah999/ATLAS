# 07 — Final assessment

ATLAS was evolved, not rewritten. Its identity is preserved: the Electron + React + TypeScript app, the daemon architecture, and Pi as the core runtime behind `AgentRuntime` (pinned 0.87.1; now loaded on first use). Every change is an incremental, revertible commit on `claude/gifted-volta-j4hvy4`. Each was verified by tests, and the larger slices were reviewed by an independent agent that had no write access. Detail: [04 implementation log](04-implementation-log.md), [05 test evidence](05-test-evidence.md), [06 security review](06-security-review.md).

## What changed, in one table

| Area | Before (baseline, probed) | After (tested) |
|---|---|---|
| Can the agent fake "Verified"? | Yes. Rewriting the test script gave "Verified" | No for the 7 tested vectors. The definition comes from the base; changed tests run the base suite; any override is hash-bound and never counts as evidence |
| Approval bypass via safe programs | 8 argument forms ran programs without approval | Privileged, including option abbreviations (found by the final audit) and path-qualified programs |
| Unsandboxed mode | Project code ran as the user without consent | Agent commands, release checks and app starts each ask; a denial means nothing runs |
| Processes after a daemon crash | Unsandboxed commands orphaned forever | Journal + identity-checked reaper; group survivors found; one daemon per data directory; Windows helper now watches the daemon (test added; result pending on the Windows CI job) |
| Cancel during sandbox setup | Hung under load (118 of 150) | 0 of 150; Linux CI green since the fix |
| Uncommitted work at cleanup | Destroyed by `worktree remove --force` | Preserved in refs, or the worktree is kept with a recorded reason; the user's own worktrees are untouched |
| Stalled agents | Looked healthy until the wall-clock budget | "No signal" after 120 s (not raised for approvals, running commands or working subtasks) |
| Disk and worktree growth | Unbounded | Free-space floor and per-mission cap, with typed reasons |
| Operator terminal | Died with its tab | Lives in the daemon; reattach with full history; resize (Linux, macOS) |
| UI truth | Long missions lost their tail; "Unverified" shown as "Completed" | Full history; verdict persisted and shown |
| Evidence export | Tampered artifacts re-hashed and imported as intact | Refused on import (tamper-evidence; not authenticity, see open risks) |
| Daemon idle memory | 180–181 MB | 134–135 MB (two runs each) |
| macOS | Every mission failed under Seatbelt | **CI fully green**, including Electron e2e and packaging |
| Windows | Broken | **Still not working end to end.** Sandboxed Node runs; the npm shim is denied inside the AppContainer; diagnosis continues |

## Scorecard against the backlog

| ID | Status | Evidence |
|---|---|---|
| P0-1, P0-2 | done | unit + integration + e2e |
| P0-3 | done, reviewed, audited (auditor could not break it) | 11 integration cases incl. 6 bypasses |
| P0-4 | done, reviewed (Linux, macOS) | orphans + reap tests; Windows parent watch: test added, CI result pending |
| P0-5 macOS | done | CI run 38107974496, all steps |
| P0-6 Windows | **open** | see [05](05-test-evidence.md) |
| P1-1 … P1-6 | done, reviewed, findings fixed | [04](04-implementation-log.md) |
| P2-1 | done | metrics, two runs |
| P2-2, P2-4, P3-* | not attempted | — |

## What this does not prove

- **No comparison with the reference products is claimed.** We did not run a fair, reproducible benchmark of ATLAS against agent-orchestrator, limboo or Claude-Multiplex. [01](01-competitor-matrix.md) compares designs from source reading only.
- **The scripted runtime drove every mission in these tests.** The Pi adapter is covered by its contract suite, but no live-model mission was run in this evolution, because no credentials were used.
- **The 1/7 false-pass case in the eval is real:** weak new tests on new code pass. The gate cannot judge test quality.
- **Exports are not signed.** A forger who recomputes the hashes is not detected.
- **Windows users get a fail-closed product today, not a working one.**

## Recommended next steps, in order

1. **Windows AppContainer toolchain access.** Finish the diagnosis the CI bisection has started (the toolchain capability ACL is not in effect). Then grant only the directories of the programs actually used, not every `PATH` entry.
2. **Signed exports.** A per-installation key plus an explicit import trust prompt.
3. **Dev-tool upgrades.** vitest ≥ 4.1.11 and electron-builder ≥ 26.15, as a separate change (see [06](06-security-review.md)).
4. **ESLint `react-hooks` rule.** It would have caught the one regression this evolution shipped locally and then fixed.
5. **Live-model reality run.** A Pi mission against a real provider in a disposable environment, with credentials the operator supplies.
