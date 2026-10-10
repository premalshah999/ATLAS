# ADR 0002 — Pi upstream, pin and integration path

Status: accepted · 2026-10-10 · spec §8–10

## Findings (verified 2026-10-10)

- The Pi SDK now publishes as `@earendil-works/pi-coding-agent` (repository `github.com/earendil-works/pi`). The `@mariozechner/pi-*` packages referenced by the manual's sources stopped at 0.73.1 (May 2026).
- License: MIT (declared in `package.json`; the npm tarball ships no LICENSE file — see `licenses/third-party/pi.md`).
- Pinned version: **0.87.1**, upstream `gitHead f07218c4d4bbc12bef056a7058c3dd49dfe41abe`, the newest release at least two weeks old. `pnpm pi:version` checks the installed packages against the pin.
- Integration path: the documented SDK (`createAgentSession`), not a fork and not Pi internals.

## How the adapter uses Pi

- `tools: [ATLAS tool names]` + `customTools`: Pi's built-in `read/bash/edit/write` are never enabled. The adapter refuses to run if any other tool becomes active. Each custom tool's `execute` calls ATLAS's `ToolGate`, so policy and approvals apply to every call.
- A custom `ResourceLoader` returns no extensions, skills, prompt templates or AGENTS files. Repository text therefore cannot reconfigure the agent (prompt-injection surface, §42). The system prompt is the ATLAS role definition.
- `SessionManager.inMemory`, `SettingsManager.inMemory` with compaction off, `enableInstallTelemetry: false`, `enableAnalytics: false`; the daemon also sets `PI_TELEMETRY=0` (§43).
- `ModelRuntime` uses an ATLAS-owned `agentDir`, never `~/.pi`. Provider keys are injected with `setRuntimeApiKey` from the OS credential store or the launching environment.
- Contract tests run the real SDK against Pi's scripted `faux` provider (`createFauxCore` + `registerProvider`), so CI needs no credentials.

## Consequences

- Pi sessions are not resumable across a daemon restart in v0.1; the scheduler starts a new attempt in a fresh worktree instead (`resume()` throws, by contract).
- When upgrading Pi: bump the pin in `packages/runtime-pi`, `apps/desktop`, `scripts/pi-version.mjs`, run the contract suite, and record the new gitHead.
