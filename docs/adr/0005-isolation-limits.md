# ADR 0005 — What v0.1 isolation does and does not provide

Status: superseded in part by ADR 0007 (OS sandbox) · spec §18, §20, §23, §42

Provided:
- Agents act only through governed tools. Policy is code (`@atlas/policy`), evaluated before execution, default-deny for unknown tools and capabilities; role text cannot grant rights.
- Writes are confined to a per-task git worktree outside the user's checkout; canonical path checks reject traversal, absolute paths, `.git`, and symlink escapes.
- Commands run from argument arrays (never a shell string), with an environment allowlist (provider keys and cloud credentials are not inherited), timeouts and process-group kill.
- Privileged commands (installs, network clients, deletes, git writes, shells, unknown programs) need a single-use, expiring operator approval.

**Not provided** (do not claim otherwise):
- OS-level isolation. An approved or safe-listed command (e.g. the project's own `npm test`) runs as the user and can read anything the user can, including files outside the worktree. Repository scripts are arbitrary code (§23). The manual's "malicious fixture cannot access a canary credential" acceptance test is therefore **not met** in v0.1; it requires a container/VM or platform sandbox (planned for M5).
- Network egress control for safe-listed commands.
- PTY terminals (pipes only; interactive programs are not supported yet).
