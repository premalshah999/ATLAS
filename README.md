# ATLAS

Local-first mission control for autonomous software engineering. You open a repository and describe an outcome. ATLAS proposes a plan for you to approve, runs an agent in an isolated git worktree through policy-governed tools, verifies the result independently, and shows you the evidence. You accept or reject the change. Your checkout is never edited.

> An agent claim is not evidence. ATLAS marks work verified only on a real process exit, test assertion or operator decision.

This is **v0.1, milestones M0 + M1** of the [implementation manual](docs/spec/manual.md). See [what works and what doesn't yet](docs/spec/status.md).

## Quick start

```bash
corepack enable          # pnpm 10
pnpm install
pnpm doctor              # checks Node ≥ 22.19, git, Electron, credentials (values never printed)
pnpm seed:sample         # creates ~/atlas-sample-app: a small project with a real bug and real tests
pnpm dev                 # launches the desktop app
```

In the app: **Open repository** → choose `~/atlas-sample-app` → **New mission** → describe the fix → **Plan mission** → review the plan → **Approve plan and start**. Watch the agent read the code, run the failing tests, edit `src/slugify.js` in its own worktree and re-run them. ATLAS then runs the tests itself on the checkpointed commit and shows **Verified: tests passed**, the diff and the logs. **Accept changes** keeps the branch `atlas/<mission>/implement-1` in your repository for you to merge. **Reject changes** removes it.

The sample mission uses the **scripted runtime**, which needs no model or credentials. Its tool calls, commands and checks are real; only the decisions are scripted, and the UI labels it. To run a real model, add a provider key in **Settings** (Anthropic, OpenAI or Google; stored with the OS credential store) and choose **Pi** when creating a mission.

## What a mission does

1. **Preflight** warns about uncommitted changes, missing test commands, missing credentials and the absence of a deploy target.
2. **Plan**: a validated plan (tasks, acceptance criteria, tools, verification). Nothing runs until you approve it.
3. **Execute**: the agent works in `<data>/worktrees/<mission>/<task>` on a new branch from your HEAD. Every tool call passes the policy engine:
   - reads, edits inside the worktree and safe commands (`npm test`, `git status`, …) run directly;
   - installs, network clients, deletes, git writes, shells and unknown programs wait for a **single-use approval** that states who, what, where, what it touches, for how long and why;
   - `sudo`, path escapes, `.git` writes, deploys, credentials and desktop control are denied.
4. **Verify**: ATLAS detects the project's checks (`test`, `typecheck`, `lint` scripts), runs them on the checkpointed commit, and the release gate reports *verified*, *unverified* (no checks) or *failed*. Only a pass satisfies a required check.
5. **Decide**: accept (branch kept) or reject (worktree and branch removed).

Every step is an append-only event with actor, task, attempt and time. The timeline, process output, diff and check logs all come from that record. Closing the app, crashing the daemon or restarting resumes from it.

## Commands

| | |
| --- | --- |
| `pnpm dev` | Electron + Vite with live reload |
| `pnpm build` | renderer (Vite) + main, preload and daemon (esbuild) |
| `pnpm typecheck` / `pnpm lint` | strict TS per workspace; ESLint + dependency-graph check |
| `pnpm test` | unit tests — policy, state machines, plan validation, gate, storage, paths, executor, Pi contract |
| `pnpm test:integration` | full missions against temp git repos (approvals, denial, redaction, cancel, crash recovery) |
| `pnpm test:e2e` | Playwright drives the built Electron app (Linux: `xvfb-run -a pnpm test:e2e`) |
| `pnpm package` | electron-builder; Linux is the tested target |
| `pnpm pi:version` | verifies the pinned Pi SDK (0.87.1, MIT) |

No test needs network access or model credentials. Pi's contract tests run the real SDK against its scripted provider.

## Architecture

```
renderer (React, sandboxed) ──intent──▶ preload (frozen window.atlas) ──▶ main (validates sender + zod schema)
                                                                              │
                                              ordered events ◀── daemon (utility process) ◀┘
                                                                 ├─ storage: SQLite (WAL) + checksummed artifacts
                                                                 ├─ orchestrator: plan → schedule → ToolGate → verify → gate
                                                                 ├─ policy: capabilities, approvals (default deny)
                                                                 ├─ workspace: worktrees, path checks, checkpoints
                                                                 ├─ terminal: argv executor, env allowlist, tree kill
                                                                 └─ runtimes: scripted · Pi SDK (behind AgentRuntime)
```

[AGENTS.md](AGENTS.md) maps the code. Decisions are in [docs/adr](docs/adr); the visual language is in [docs/design](docs/design/DESIGN.md). The design-system prototype is still in the app under **Design preview** (rail, palette icon) and is labeled as sample data.

## Security model in one paragraph

The renderer has no Node access and can only send declared, schema-validated intents. Main checks that they come from its own window. The daemon re-validates them and owns all execution. Agents never get a shell: they get six governed tools, policy is code evaluated before every call, and denied calls never reach an executor. Commands are argument arrays with a scrubbed environment, so provider keys and cloud credentials are not inherited. Secrets are redacted from events, logs and artifacts. **v0.1 does not provide OS-level sandboxing**: an approved or safe-listed command such as the project's own test script runs as you. See [ADR 0005](docs/adr/0005-isolation-limits.md).

## Platform

Linux x64 is the tested platform; CI runs the Electron e2e suite there. macOS and Windows builds are configured but untested and unsigned. Requires Node ≥ 22.19 and git.
