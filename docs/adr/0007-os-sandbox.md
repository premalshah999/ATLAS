# ADR 0007 — OS sandbox for untrusted commands

Status: accepted · 2026-10-10 · spec §20, §23, §42 · supersedes the "not provided" list in ADR 0005

## Decision

Every command that comes from a repository or an agent runs inside an OS sandbox: agent `shell_exec` and `run_tests`, verification checks, the app under test and local staging deployments. ATLAS's own trusted operations (git plumbing with hooks/fsmonitor disabled, artifact I/O) run outside it.

- **Linux: bubblewrap.** New user, mount, PID, IPC, UTS and network namespaces (`--unshare-all`), `--die-with-parent`, `--new-session`. The filesystem is empty except: read-only system directories and the toolchains on `PATH`; a tmpfs `/tmp` and `/home` with a fresh `HOME=/home/atlas-sandbox`; the task worktree (read-write, or read-only in read-only missions); the worktree's git admin directory (read-write) and the shared object store (read-only). The user's real home, other projects, SSH keys and cloud credentials are not mounted. `prlimit` caps CPU time, file size and open files when present.
- **Network** is off (`--unshare-net`). A command that policy marks as network-using (package managers, curl, git fetch/push) gets `--share-net` only after its single-use approval; only then are proxy variables and CA bundle paths forwarded.
- **macOS: `sandbox-exec`** profile denying writes outside the worktree and temp dir, reads under `$HOME` except the worktree and toolchains, and network unless granted. Implemented but **untested in CI**.
- **No sandbox available** (Windows, Linux without bwrap or with user namespaces blocked): fail closed. Preflight blocks the mission, tool commands return `sandbox_unavailable`, and checks are recorded as *inconclusive*, so the gate fails. The operator can explicitly allow unsandboxed execution in Settings (two-step confirmation, persisted, logged, shown as a warning in preflight).

Cancellation kills the bwrap process; the PID namespace takes every process inside with it (tested).

## Tests

`packages/terminal/test/sandbox.test.ts`: canary credentials in the real home and elsewhere unreadable, environment credentials not inherited, writes outside the worktree blocked, no network, host processes invisible, a real `npm test` passes through, cancellation leaves nothing running, fail-closed when disabled. `tests/integration/sandbox.test.ts`: the same guarantees inside missions, plus approved network egress actually working through a proxy.

## Alternatives

- Containers (Docker/Podman): stronger and cross-platform, but require a daemon and an image matching the project's toolchain. Planned as an optional executor for untrusted repositories.
- Firecracker/VMs: strongest; out of scope for a local desktop app today.
