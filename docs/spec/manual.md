# ATLAS — Product & Engineering Implementation Manual

**Edition:** 1.1 (Electron-first) · 10 October 2026
**Scope:** 50 implementation specification sheets; desktop-first; local-first; powered by a forkable/embeddable Pi runtime.
**Audience:** Codex implementation agent and human technical reviewer.

> Guiding rule: an agent claim is not evidence. Privileged operations must be controlled by code, with approvals and verifiable results.

## Start here: instructions to Codex

Read this manual, create an implementation plan, and implement milestone M0 then M1 before expanding scope. Verify current Pi API and license against the pinned commit. Keep the runtime behind an interface; never wire mission logic directly to SDK internals. Report actual tested outcomes only.

## Sources and upstream verification

- Pi project and SDK documentation: https://pi.dev/docs/latest/sdk
- Pi extensions documentation: https://pi.dev/docs/latest/extensions
- Pi source: https://github.com/badlogic/pi-mono
- Pin the exact upstream commit and check package names/exports and license when starting. API package naming may have changed across revisions.

## Table of contents

01. Mission and product charter
02. Product principles and non-goals
03. Personas and core jobs
04. Release scope and staged delivery
05. System context and boundaries
06. Technology decisions
07. Monorepo layout
08. Pi upstream strategy and licensing
09. Agent runtime contract
10. Pi adapter implementation
11. Mission domain model
12. State machines and invariants
13. Orchestration scheduler
14. Planning and task decomposition
15. Agent roles and definitions
16. Agent delegation and subagent budgets
17. Context packaging and memory
18. Filesystem and repository manager
19. Change management and checkpoints
20. Terminal executor
21. Tool registry and structured actions
22. Permissions, approvals and policies
23. Sandboxing and trust levels
24. Secrets and credential handling
25. Browser automation service
26. Desktop automation service
27. Desktop-to-terminal interoperability
28. Build, test and static validation
29. AI code review and finding verification
30. Deployment integration contract
31. Staging verification protocol
32. Release gates and rollback
33. UI information architecture
34. Mission creation and planning UI
35. Live execution and intervention UI
36. Diff and review UI
37. Verification and deployment UI
38. Event stream and audit trail
39. Database and artifact storage
40. Failure handling and recovery
41. Concurrency and resource governance
42. Security threats and mitigations
43. Privacy, networking and telemetry
44. Testing pyramid and contract suites
45. Evaluation framework and reliability goals
46. Developer experience and local commands
47. Implementation milestones and work packets
48. Codex operating instructions
49. Launch acceptance and handoff
50. Appendix: schemas, APIs and definition of done

---


## 01. Mission and product charter

**Requirement.** Define ATLAS as a local-first autonomous software engineering workspace that coordinates AI workers, real terminal and GUI tools, code changes, staging deployment, and evidence-driven verification. It must be a product with its own identity and executable control plane, not a themed Pi terminal.

**Design and implementation.** The user opens a repository, describes an outcome, reviews a plan, watches execution, approves sensitive operations, and receives a final evidence bundle. Agent messages alone never constitute completion.

**Constraints and exclusions.** Do not implement billing, accounts, team administration, a hosted marketplace, or autonomous production releases in the first release.

**Acceptance test.** A user can run the complete sample mission without using Pi CLI directly.

**Engineering checklist:**
- Implement as a vertical slice: define contracts, ship the smallest working implementation, add a negative test, connect telemetry, and verify end-to-end behavior.
- Preserve deterministic boundaries. The orchestration service decides scheduling, authorization and completion; model output supplies proposals and explanations, never privileged decisions.
- When there is ambiguity, record an architecture decision with alternatives, trade-offs and the chosen default. Do not make silent assumptions about user permissions.
- Every user-visible pass condition must refer to a real process exit, test assertion, deployment record, screenshot, or authenticated operator decision.
- Build degradation explicitly: missing model access, unconfigured deploy provider, unsupported native desktop and incomplete checks should yield informative states rather than fabricated success.


## 02. Product principles and non-goals

**Requirement.** Prioritize observability, recoverability, explainable changes, and least privilege over maximum agent autonomy. Treat AI output as an untrusted proposal. Use deterministic software for policy, environment ownership, deploy authorization, and release gates.

**Design and implementation.** Every significant action must have actor, task, workspace, timestamp, inputs (redacted), outcome, and reference to relevant artifacts. Human interventions must be first-class events.

**Constraints and exclusions.** No silently applied production changes, no shared writable directories among independent workers, no secret-bearing trace exports, no unbounded recursive delegation.

**Acceptance test.** The operator can determine who changed a file and why from application records.

**Engineering checklist:**
- Implement as a vertical slice: define contracts, ship the smallest working implementation, add a negative test, connect telemetry, and verify end-to-end behavior.
- Preserve deterministic boundaries. The orchestration service decides scheduling, authorization and completion; model output supplies proposals and explanations, never privileged decisions.
- When there is ambiguity, record an architecture decision with alternatives, trade-offs and the chosen default. Do not make silent assumptions about user permissions.
- Every user-visible pass condition must refer to a real process exit, test assertion, deployment record, screenshot, or authenticated operator decision.
- Build degradation explicitly: missing model access, unconfigured deploy provider, unsupported native desktop and incomplete checks should yield informative states rather than fabricated success.


## 03. Personas and core jobs

**Requirement.** Primary persona: an individual engineer or technical builder using macOS, Windows, or Linux; early supported-platform scope may be one OS. Secondary persona: reviewer supervising complex changes.

**Design and implementation.** Jobs: implement feature; investigate bug; refactor module; upgrade dependency; review change; validate release on staging. Each uses a common mission lifecycle with configurable checks.

**Constraints and exclusions.** Avoid designing around nontechnical end users in v0.1; they need additional guardrails, templates, and support.

**Acceptance test.** Each core job can be expressed as a mission and produce a verifiable result.

**Engineering checklist:**
- Implement as a vertical slice: define contracts, ship the smallest working implementation, add a negative test, connect telemetry, and verify end-to-end behavior.
- Preserve deterministic boundaries. The orchestration service decides scheduling, authorization and completion; model output supplies proposals and explanations, never privileged decisions.
- When there is ambiguity, record an architecture decision with alternatives, trade-offs and the chosen default. Do not make silent assumptions about user permissions.
- Every user-visible pass condition must refer to a real process exit, test assertion, deployment record, screenshot, or authenticated operator decision.
- Build degradation explicitly: missing model access, unconfigured deploy provider, unsupported native desktop and incomplete checks should yield informative states rather than fabricated success.


## 04. Release scope and staged delivery

**Requirement.** Phase 0 proves Pi embedding and one shell-backed task. Phase 1 supports a single isolated coder, Git diff and tests. Phase 2 adds orchestrator and reviewer. Phase 3 adds browser QA and staging verification. Phase 4 adds desktop automation and reliability.

**Design and implementation.** Treat phase gates as independently shippable milestones. Defer broad operating-system support and cloud scale until reliability is measurable.

**Constraints and exclusions.** Do not scaffold every aspirational service before the first vertical slice.

**Acceptance test.** At each phase the previous end-to-end smoke test remains green.

**Engineering checklist:**
- Implement as a vertical slice: define contracts, ship the smallest working implementation, add a negative test, connect telemetry, and verify end-to-end behavior.
- Preserve deterministic boundaries. The orchestration service decides scheduling, authorization and completion; model output supplies proposals and explanations, never privileged decisions.
- When there is ambiguity, record an architecture decision with alternatives, trade-offs and the chosen default. Do not make silent assumptions about user permissions.
- Every user-visible pass condition must refer to a real process exit, test assertion, deployment record, screenshot, or authenticated operator decision.
- Build degradation explicitly: missing model access, unconfigured deploy provider, unsupported native desktop and incomplete checks should yield informative states rather than fabricated success.


## 05. System context and boundaries

**Requirement.** The desktop shell interacts with a local control-plane process. The control plane schedules missions, manages workspaces, and calls an AgentRuntime interface implemented first by Pi. Executors own shells, browsers, and desktops. Verification owns release decisions.

**Design and implementation.** Boundary diagram: UI -> local API -> orchestration -> runtime adapter -> policy-mediated tools -> isolated workspace. A local durable database stores task and event metadata; artifact storage holds logs, screenshots, diffs, test reports.

**Constraints and exclusions.** Pi must not receive unrestricted direct access to privileged deployment credentials.

**Acceptance test.** Replacing the Pi adapter with a test fake leaves orchestration tests intact.

**Engineering checklist:**
- Implement as a vertical slice: define contracts, ship the smallest working implementation, add a negative test, connect telemetry, and verify end-to-end behavior.
- Preserve deterministic boundaries. The orchestration service decides scheduling, authorization and completion; model output supplies proposals and explanations, never privileged decisions.
- When there is ambiguity, record an architecture decision with alternatives, trade-offs and the chosen default. Do not make silent assumptions about user permissions.
- Every user-visible pass condition must refer to a real process exit, test assertion, deployment record, screenshot, or authenticated operator decision.
- Build degradation explicitly: missing model access, unconfigured deploy provider, unsupported native desktop and incomplete checks should yield informative states rather than fabricated success.


## 06. Technology decisions

**Requirement.** Electron is the required desktop shell (not Tauri). Use TypeScript end-to-end, Electron main + sandboxed React/Vite renderer + narrow typed preload bridge, SQLite for local durability, and Playwright for browser QA. Run Pi and untrusted execution in supervised utility/child processes outside the renderer.

**Design and implementation.** Electron is the architectural choice. Use a package workspace, strict TS, schema validation, structured logging, migration tooling, durable job state and process supervision. Configure contextIsolation=true, nodeIntegration=false, sandbox=true on renderer WebContents; expose allowlisted IPC methods via contextBridge, validate requests and sender origin, and enforce capabilities in main/daemon.

**Constraints and exclusions.** Avoid premature Kubernetes, Redis, cloud queues, and microservices in the local-first version.

**Acceptance test.** Fresh clone installs, boots, and runs the baseline verification suite.

**Engineering checklist:**
- Implement as a vertical slice: define contracts, ship the smallest working implementation, add a negative test, connect telemetry, and verify end-to-end behavior.
- Preserve deterministic boundaries. The orchestration service decides scheduling, authorization and completion; model output supplies proposals and explanations, never privileged decisions.
- When there is ambiguity, record an architecture decision with alternatives, trade-offs and the chosen default. Do not make silent assumptions about user permissions.
- Every user-visible pass condition must refer to a real process exit, test assertion, deployment record, screenshot, or authenticated operator decision.
- Build degradation explicitly: missing model access, unconfigured deploy provider, unsupported native desktop and incomplete checks should yield informative states rather than fabricated success.


## 07. Monorepo layout

**Requirement.** Create apps/desktop/electron-main, apps/desktop/preload, and apps/desktop/renderer as distinct build targets; apps/daemon for control plane; packages/contracts for schemas; packages/runtime-pi for Pi adapter; packages/orchestrator, workspace, policy, terminal, browser, desktop-control, verification, deploy, events, storage, and ui.

**Design and implementation.** Add docs/adr, docs/spec, tests/integration, tests/e2e, fixtures, scripts, and licenses/third-party. Ensure package dependency direction points toward contracts, never from contracts toward applications.

**Constraints and exclusions.** No agent package may import UI modules. Avoid circular dependencies.

**Acceptance test.** Dependency graph is acyclic and CI enforces typechecks for each workspace.

**Engineering checklist:**
- Implement as a vertical slice: define contracts, ship the smallest working implementation, add a negative test, connect telemetry, and verify end-to-end behavior.
- Preserve deterministic boundaries. The orchestration service decides scheduling, authorization and completion; model output supplies proposals and explanations, never privileged decisions.
- When there is ambiguity, record an architecture decision with alternatives, trade-offs and the chosen default. Do not make silent assumptions about user permissions.
- Every user-visible pass condition must refer to a real process exit, test assertion, deployment record, screenshot, or authenticated operator decision.
- Build degradation explicitly: missing model access, unconfigured deploy provider, unsupported native desktop and incomplete checks should yield informative states rather than fabricated success.


## 08. Pi upstream strategy and licensing

**Requirement.** Pin an upstream Pi source revision or package version and document precise provenance. Prefer embedding through the published SDK behind an adapter; fork only when required by demonstrable missing extension points. Keep upstream changes small and reviewable.

**Design and implementation.** Track MIT notice and third-party attribution; verify the exact repository revision and package export names at implementation time. Pi docs currently describe SDK sessions, extensions, tools, and RPC as integration paths.

**Constraints and exclusions.** Do not assume a GitHub fork or copied package has identical current APIs. Do not imply Pi trademarks are owned by ATLAS.

**Acceptance test.** Third-party notices are present and a repeatable script reports the pinned upstream version.

**Engineering checklist:**
- Implement as a vertical slice: define contracts, ship the smallest working implementation, add a negative test, connect telemetry, and verify end-to-end behavior.
- Preserve deterministic boundaries. The orchestration service decides scheduling, authorization and completion; model output supplies proposals and explanations, never privileged decisions.
- When there is ambiguity, record an architecture decision with alternatives, trade-offs and the chosen default. Do not make silent assumptions about user permissions.
- Every user-visible pass condition must refer to a real process exit, test assertion, deployment record, screenshot, or authenticated operator decision.
- Build degradation explicitly: missing model access, unconfigured deploy provider, unsupported native desktop and incomplete checks should yield informative states rather than fabricated success.


## 09. Agent runtime contract

**Requirement.** Define AgentRuntime.start(input): Promise<AgentHandle>; stream(handle): AsyncIterable<AgentEvent>; interrupt(handle); resume(handle, checkpoint); dispose(handle). Normalize tool requests, model output, usage, completion, and errors.

**Design and implementation.** An AgentInput includes missionId, taskId, workspaceId, roleId, permittedTools, contextRefs, executionBudget, and cancellation token. Adapter owns converting these into Pi SDK calls.

**Constraints and exclusions.** Keep SDK-specific objects out of public product contracts.

**Acceptance test.** A fake runtime and Pi implementation both pass the same contract tests.

**Engineering checklist:**
- Implement as a vertical slice: define contracts, ship the smallest working implementation, add a negative test, connect telemetry, and verify end-to-end behavior.
- Preserve deterministic boundaries. The orchestration service decides scheduling, authorization and completion; model output supplies proposals and explanations, never privileged decisions.
- When there is ambiguity, record an architecture decision with alternatives, trade-offs and the chosen default. Do not make silent assumptions about user permissions.
- Every user-visible pass condition must refer to a real process exit, test assertion, deployment record, screenshot, or authenticated operator decision.
- Build degradation explicitly: missing model access, unconfigured deploy provider, unsupported native desktop and incomplete checks should yield informative states rather than fabricated success.


## 10. Pi adapter implementation

**Requirement.** Use the documented Pi SDK session factory for model-backed sessions, explicitly selecting working directory and resource loader. Subscribe to session events and map into ATLAS events; close sessions on task completion or cancellation. Support an in-memory session mode for tests.

**Design and implementation.** Implement adapter healthcheck, model availability preflight, structured error taxonomy, token accounting, and pinned SDK smoke test. Treat sample code as conceptual unless validated against installed typings.

**Constraints and exclusions.** Do not invoke undocumented Pi internals solely to save development time.

**Acceptance test.** A simulated mission can start, stream, cancel, and dispose a Pi session without leaked processes.

**Engineering checklist:**
- Implement as a vertical slice: define contracts, ship the smallest working implementation, add a negative test, connect telemetry, and verify end-to-end behavior.
- Preserve deterministic boundaries. The orchestration service decides scheduling, authorization and completion; model output supplies proposals and explanations, never privileged decisions.
- When there is ambiguity, record an architecture decision with alternatives, trade-offs and the chosen default. Do not make silent assumptions about user permissions.
- Every user-visible pass condition must refer to a real process exit, test assertion, deployment record, screenshot, or authenticated operator decision.
- Build degradation explicitly: missing model access, unconfigured deploy provider, unsupported native desktop and incomplete checks should yield informative states rather than fabricated success.


## 11. Mission domain model

**Requirement.** Mission is the user-level objective. Task is the smallest schedulable unit. Attempt is a concrete execution of a task. Artifact is immutable output. Approval is a gated human decision. Environment is the scope within which tools operate.

**Design and implementation.** Mission fields: id, title, goal, repoId, baseCommit, state, createdAt, updatedAt, policyId, planVersion. Task fields: id, missionId, dependencies, agentRole, status, retries, resultRef.

**Constraints and exclusions.** Separate task outcomes from model-provided summaries.

**Acceptance test.** Database schema migration and CRUD contract tests cover each entity.

**Engineering checklist:**
- Implement as a vertical slice: define contracts, ship the smallest working implementation, add a negative test, connect telemetry, and verify end-to-end behavior.
- Preserve deterministic boundaries. The orchestration service decides scheduling, authorization and completion; model output supplies proposals and explanations, never privileged decisions.
- When there is ambiguity, record an architecture decision with alternatives, trade-offs and the chosen default. Do not make silent assumptions about user permissions.
- Every user-visible pass condition must refer to a real process exit, test assertion, deployment record, screenshot, or authenticated operator decision.
- Build degradation explicitly: missing model access, unconfigured deploy provider, unsupported native desktop and incomplete checks should yield informative states rather than fabricated success.


## 12. State machines and invariants

**Requirement.** Mission states: draft, planning, awaiting_approval, running, verifying, completed, failed, cancelled. Task states: queued, blocked, ready, running, reviewing, done, failed, cancelled. State changes are validated server-side.

**Design and implementation.** Every transition emits a persisted event with monotonically increasing sequence per mission. Completed tasks cannot mutate artifacts; retries create new attempts. An interrupted worker must reconcile to an explicit state.

**Constraints and exclusions.** Never infer state from the final line of a transcript.

**Acceptance test.** Invalid transitions are rejected and replay reconstructs current state.

**Engineering checklist:**
- Implement as a vertical slice: define contracts, ship the smallest working implementation, add a negative test, connect telemetry, and verify end-to-end behavior.
- Preserve deterministic boundaries. The orchestration service decides scheduling, authorization and completion; model output supplies proposals and explanations, never privileged decisions.
- When there is ambiguity, record an architecture decision with alternatives, trade-offs and the chosen default. Do not make silent assumptions about user permissions.
- Every user-visible pass condition must refer to a real process exit, test assertion, deployment record, screenshot, or authenticated operator decision.
- Build degradation explicitly: missing model access, unconfigured deploy provider, unsupported native desktop and incomplete checks should yield informative states rather than fabricated success.


## 13. Orchestration scheduler

**Requirement.** Use a DAG scheduler with bounded concurrency, retry policy, per-task time budget, and workspace leases. Ready tasks have satisfied dependencies. Reviewer and verifier may be separate postconditions rather than sibling coding tasks.

**Design and implementation.** Scheduler persists start intent before spawning workers; on restart it reconciles lost processes and resumes/requeues safely. Cancellation propagates from mission to task to agent to process tree.

**Constraints and exclusions.** Do not execute more than one writer in the same checkout.

**Acceptance test.** Integration tests demonstrate parallel nonconflicting tasks and serial conflicting tasks.

**Engineering checklist:**
- Implement as a vertical slice: define contracts, ship the smallest working implementation, add a negative test, connect telemetry, and verify end-to-end behavior.
- Preserve deterministic boundaries. The orchestration service decides scheduling, authorization and completion; model output supplies proposals and explanations, never privileged decisions.
- When there is ambiguity, record an architecture decision with alternatives, trade-offs and the chosen default. Do not make silent assumptions about user permissions.
- Every user-visible pass condition must refer to a real process exit, test assertion, deployment record, screenshot, or authenticated operator decision.
- Build degradation explicitly: missing model access, unconfigured deploy provider, unsupported native desktop and incomplete checks should yield informative states rather than fabricated success.


## 14. Planning and task decomposition

**Requirement.** The planner converts a mission into a structured plan containing tasks, dependencies, acceptance criteria, required tools, estimated risk, and verification strategy. Display plan for approval when policy requires it.

**Design and implementation.** Run plan validation: task IDs unique, DAG acyclic, scope explicit, rollback plan present for high-risk operations. Record plan revisions instead of overwriting plan history.

**Constraints and exclusions.** Do not treat hallucinated files or deployment targets as ground truth.

**Acceptance test.** A deliberately cyclic plan is rejected before any tool action.

**Engineering checklist:**
- Implement as a vertical slice: define contracts, ship the smallest working implementation, add a negative test, connect telemetry, and verify end-to-end behavior.
- Preserve deterministic boundaries. The orchestration service decides scheduling, authorization and completion; model output supplies proposals and explanations, never privileged decisions.
- When there is ambiguity, record an architecture decision with alternatives, trade-offs and the chosen default. Do not make silent assumptions about user permissions.
- Every user-visible pass condition must refer to a real process exit, test assertion, deployment record, screenshot, or authenticated operator decision.
- Build degradation explicitly: missing model access, unconfigured deploy provider, unsupported native desktop and incomplete checks should yield informative states rather than fabricated success.


## 15. Agent roles and definitions

**Requirement.** Create first-party roles: orchestrator, coder, reviewer, tester, browser QA, desktop operator, deployment verifier. Each role has instruction text, allowed capabilities, model preference, input/output schema, resource budget, and review policy.

**Design and implementation.** Store role definitions as versioned YAML or JSON plus Markdown system prompts. Surface them in Agent Studio later; load all roles through a validated registry. Roles describe intended behavior but are not security boundaries.

**Constraints and exclusions.** Avoid creating role sprawl and overlapping responsibilities.

**Acceptance test.** Changing role definition creates a version visible in execution logs.

**Engineering checklist:**
- Implement as a vertical slice: define contracts, ship the smallest working implementation, add a negative test, connect telemetry, and verify end-to-end behavior.
- Preserve deterministic boundaries. The orchestration service decides scheduling, authorization and completion; model output supplies proposals and explanations, never privileged decisions.
- When there is ambiguity, record an architecture decision with alternatives, trade-offs and the chosen default. Do not make silent assumptions about user permissions.
- Every user-visible pass condition must refer to a real process exit, test assertion, deployment record, screenshot, or authenticated operator decision.
- Build degradation explicitly: missing model access, unconfigured deploy provider, unsupported native desktop and incomplete checks should yield informative states rather than fabricated success.


## 16. Agent delegation and subagent budgets

**Requirement.** The orchestrator may spawn subagents only through a scheduler tool that checks quotas, dependency state, and permissions. Require parentTaskId, reason, target role, deliverable schema, and explicit workspace lease.

**Design and implementation.** Enforce max depth, max concurrent agents, total tokens, wall-clock caps, and tool-call limits. Child results return via structured artifacts rather than raw shared conversation history.

**Constraints and exclusions.** No unlimited self-spawning loops or opaque work passed without bounded scope.

**Acceptance test.** A runaway delegation test stops at configured limits and reports why.

**Engineering checklist:**
- Implement as a vertical slice: define contracts, ship the smallest working implementation, add a negative test, connect telemetry, and verify end-to-end behavior.
- Preserve deterministic boundaries. The orchestration service decides scheduling, authorization and completion; model output supplies proposals and explanations, never privileged decisions.
- When there is ambiguity, record an architecture decision with alternatives, trade-offs and the chosen default. Do not make silent assumptions about user permissions.
- Every user-visible pass condition must refer to a real process exit, test assertion, deployment record, screenshot, or authenticated operator decision.
- Build degradation explicitly: missing model access, unconfigured deploy provider, unsupported native desktop and incomplete checks should yield informative states rather than fabricated success.


## 17. Context packaging and memory

**Requirement.** Build context bundles from repository map, selected files, Git diff, task description, acceptance criteria, recent relevant decisions, and policy constraints. Record sources and versions.

**Design and implementation.** Store stable project facts as files in an application-managed knowledge area. Ephemeral chat transcript stays distinct from confirmed facts. Compress older context with explicit traceability.

**Constraints and exclusions.** Never let arbitrary retrieved documents override policy or tool permissions.

**Acceptance test.** Reviewer receives the diff plus relevant context without reading entire project by default.

**Engineering checklist:**
- Implement as a vertical slice: define contracts, ship the smallest working implementation, add a negative test, connect telemetry, and verify end-to-end behavior.
- Preserve deterministic boundaries. The orchestration service decides scheduling, authorization and completion; model output supplies proposals and explanations, never privileged decisions.
- When there is ambiguity, record an architecture decision with alternatives, trade-offs and the chosen default. Do not make silent assumptions about user permissions.
- Every user-visible pass condition must refer to a real process exit, test assertion, deployment record, screenshot, or authenticated operator decision.
- Build degradation explicitly: missing model access, unconfigured deploy provider, unsupported native desktop and incomplete checks should yield informative states rather than fabricated success.


## 18. Filesystem and repository manager

**Requirement.** Workspace service opens local directories, identifies repository root and clean/dirty status, snapshots base commit, and creates per-task worktrees. Track worktree owner and cleanup eligibility.

**Design and implementation.** Use canonical path checks for all file operations; disallow symlink escape from approved roots. Make deletion and destructive cleanup require policy authorization.

**Constraints and exclusions.** Never overwrite uncommitted user changes without explicit approval and checkpoint.

**Acceptance test.** Workspace tests cover symlink traversal, dirty worktree and cleanup recovery.

**Engineering checklist:**
- Implement as a vertical slice: define contracts, ship the smallest working implementation, add a negative test, connect telemetry, and verify end-to-end behavior.
- Preserve deterministic boundaries. The orchestration service decides scheduling, authorization and completion; model output supplies proposals and explanations, never privileged decisions.
- When there is ambiguity, record an architecture decision with alternatives, trade-offs and the chosen default. Do not make silent assumptions about user permissions.
- Every user-visible pass condition must refer to a real process exit, test assertion, deployment record, screenshot, or authenticated operator decision.
- Build degradation explicitly: missing model access, unconfigured deploy provider, unsupported native desktop and incomplete checks should yield informative states rather than fabricated success.


## 19. Change management and checkpoints

**Requirement.** Every coding task produces a branch/worktree diff. Capture patch, affected files, test output, and checkpoint ID. Merge through controlled integration step after conflict checks, review, and required verification.

**Design and implementation.** Support undo by reverting a known checkpoint or restoring an isolated worktree; warn if downstream changes depend on it. User-edit conflicts must be surfaced.

**Constraints and exclusions.** Avoid direct auto-commit to main during normal missions.

**Acceptance test.** User can inspect, reject and restore a prior unmerged change safely.

**Engineering checklist:**
- Implement as a vertical slice: define contracts, ship the smallest working implementation, add a negative test, connect telemetry, and verify end-to-end behavior.
- Preserve deterministic boundaries. The orchestration service decides scheduling, authorization and completion; model output supplies proposals and explanations, never privileged decisions.
- When there is ambiguity, record an architecture decision with alternatives, trade-offs and the chosen default. Do not make silent assumptions about user permissions.
- Every user-visible pass condition must refer to a real process exit, test assertion, deployment record, screenshot, or authenticated operator decision.
- Build degradation explicitly: missing model access, unconfigured deploy provider, unsupported native desktop and incomplete checks should yield informative states rather than fabricated success.


## 20. Terminal executor

**Requirement.** Implement terminal sessions using pseudoterminal support where available, with stdout/stderr streaming, command exit codes, working-directory bindings, environment allowlists, process-tree cancellation, and resource limits.

**Design and implementation.** Separate interactive session UI from privileged executor backend. Log command starts and exits with redacted arguments; require approval for risk-classified commands. Use safe argument arrays rather than building shell strings when possible.

**Constraints and exclusions.** No direct shell invocation from UI renderer process.

**Acceptance test.** Long-running command can be cancelled and leaves no orphaned child process.

**Engineering checklist:**
- Implement as a vertical slice: define contracts, ship the smallest working implementation, add a negative test, connect telemetry, and verify end-to-end behavior.
- Preserve deterministic boundaries. The orchestration service decides scheduling, authorization and completion; model output supplies proposals and explanations, never privileged decisions.
- When there is ambiguity, record an architecture decision with alternatives, trade-offs and the chosen default. Do not make silent assumptions about user permissions.
- Every user-visible pass condition must refer to a real process exit, test assertion, deployment record, screenshot, or authenticated operator decision.
- Build degradation explicitly: missing model access, unconfigured deploy provider, unsupported native desktop and incomplete checks should yield informative states rather than fabricated success.


## 21. Tool registry and structured actions

**Requirement.** Register tools with name, JSON schema, capability tags, risk level, audit mapper and implementation. Tools: read_file, apply_patch, shell_exec, git_status, browser_action, desktop_action, run_tests, staging_deploy, inspect_logs.

**Design and implementation.** Policy engine evaluates each proposed tool call before execution, independent of prompt instructions. Return normalized tool result with success flag, artifact refs, exit code and error classification.

**Constraints and exclusions.** Avoid unlimited generic execute-anything tools in sensitive contexts.

**Acceptance test.** A denied tool call never reaches the underlying executor.

**Engineering checklist:**
- Implement as a vertical slice: define contracts, ship the smallest working implementation, add a negative test, connect telemetry, and verify end-to-end behavior.
- Preserve deterministic boundaries. The orchestration service decides scheduling, authorization and completion; model output supplies proposals and explanations, never privileged decisions.
- When there is ambiguity, record an architecture decision with alternatives, trade-offs and the chosen default. Do not make silent assumptions about user permissions.
- Every user-visible pass condition must refer to a real process exit, test assertion, deployment record, screenshot, or authenticated operator decision.
- Build degradation explicitly: missing model access, unconfigured deploy provider, unsupported native desktop and incomplete checks should yield informative states rather than fabricated success.


## 22. Permissions, approvals and policies

**Requirement.** Introduce capabilities: fs.read, fs.write, shell.safe, shell.privileged, browser.navigate, desktop.input, deploy.staging, deploy.production, secrets.use. Assign capabilities per agent role and mission.

**Design and implementation.** Approval object captures requested action, diff/target, scope, expiry, approving operator, and result. Approval is single-use for high-risk actions. Default to deny for unknown capabilities.

**Constraints and exclusions.** Markdown role files cannot elevate rights or bypass approvals.

**Acceptance test.** Policy test suite exercises allow, deny, prompt and expired-approval cases.

**Engineering checklist:**
- Implement as a vertical slice: define contracts, ship the smallest working implementation, add a negative test, connect telemetry, and verify end-to-end behavior.
- Preserve deterministic boundaries. The orchestration service decides scheduling, authorization and completion; model output supplies proposals and explanations, never privileged decisions.
- When there is ambiguity, record an architecture decision with alternatives, trade-offs and the chosen default. Do not make silent assumptions about user permissions.
- Every user-visible pass condition must refer to a real process exit, test assertion, deployment record, screenshot, or authenticated operator decision.
- Build degradation explicitly: missing model access, unconfigured deploy provider, unsupported native desktop and incomplete checks should yield informative states rather than fabricated success.


## 23. Sandboxing and trust levels

**Requirement.** Use at least three environments: read-only analysis, isolated write-capable development, and controlled deployment. Agents run as unprivileged processes or VM/container identities with minimal mounts and network egress.

**Design and implementation.** Prefer platform-native sandboxing or disposable VM workers when robust isolation is needed. Treat untrusted repo scripts and installed packages as arbitrary code. Credentials are injected only to the narrow executor that requires them.

**Constraints and exclusions.** Do not equate a prompt guardrail or filesystem prefix check with full OS isolation.

**Acceptance test.** A malicious test fixture cannot access a canary credential or protected path.

**Engineering checklist:**
- Implement as a vertical slice: define contracts, ship the smallest working implementation, add a negative test, connect telemetry, and verify end-to-end behavior.
- Preserve deterministic boundaries. The orchestration service decides scheduling, authorization and completion; model output supplies proposals and explanations, never privileged decisions.
- When there is ambiguity, record an architecture decision with alternatives, trade-offs and the chosen default. Do not make silent assumptions about user permissions.
- Every user-visible pass condition must refer to a real process exit, test assertion, deployment record, screenshot, or authenticated operator decision.
- Build degradation explicitly: missing model access, unconfigured deploy provider, unsupported native desktop and incomplete checks should yield informative states rather than fabricated success.


## 24. Secrets and credential handling

**Requirement.** Secrets belong in OS keychain or an encrypted local store with access policy. Executors receive scoped, short-lived credentials where supported. Redact common secret patterns and known injected values in logs.

**Design and implementation.** User can revoke provider and deployment credentials. Never store full keys in mission transcripts, screenshots when avoidable, or export bundles. Record secret-use metadata without recording secret values.

**Constraints and exclusions.** Do not send deployment secrets to a model prompt.

**Acceptance test.** Automated tests seed a fake secret and verify it is absent from artifacts and exports.

**Engineering checklist:**
- Implement as a vertical slice: define contracts, ship the smallest working implementation, add a negative test, connect telemetry, and verify end-to-end behavior.
- Preserve deterministic boundaries. The orchestration service decides scheduling, authorization and completion; model output supplies proposals and explanations, never privileged decisions.
- When there is ambiguity, record an architecture decision with alternatives, trade-offs and the chosen default. Do not make silent assumptions about user permissions.
- Every user-visible pass condition must refer to a real process exit, test assertion, deployment record, screenshot, or authenticated operator decision.
- Build degradation explicitly: missing model access, unconfigured deploy provider, unsupported native desktop and incomplete checks should yield informative states rather than fabricated success.


## 25. Browser automation service

**Requirement.** Implement browser environments with Playwright contexts owned by tasks. Support navigation, element action, assertions, screenshots, console errors, network failures, and trace capture.

**Design and implementation.** Store browser steps as structured operations with selectors and expected outcomes. Allow read-only investigation separately from state-changing flows. Prevent browser context cross-contamination between projects.

**Constraints and exclusions.** Avoid using desktop pixel clicking for routine web testing when DOM automation is available.

**Acceptance test.** A sample app smoke suite runs headlessly and produces screenshots on failure.

**Engineering checklist:**
- Implement as a vertical slice: define contracts, ship the smallest working implementation, add a negative test, connect telemetry, and verify end-to-end behavior.
- Preserve deterministic boundaries. The orchestration service decides scheduling, authorization and completion; model output supplies proposals and explanations, never privileged decisions.
- When there is ambiguity, record an architecture decision with alternatives, trade-offs and the chosen default. Do not make silent assumptions about user permissions.
- Every user-visible pass condition must refer to a real process exit, test assertion, deployment record, screenshot, or authenticated operator decision.
- Build degradation explicitly: missing model access, unconfigured deploy provider, unsupported native desktop and incomplete checks should yield informative states rather than fabricated success.


## 26. Desktop automation service

**Requirement.** Desktop controller provides screenshot, click, type, scroll, keyboard, window list, focus, and wait-for-state. Use OS-specific adapters and exclusive ownership lease per desktop session.

**Design and implementation.** Display a prominent live control indicator; provide immediate user takeover and stop. Require explicit consent before accessing the real personal desktop. Prefer disposable virtual desktops for untrusted applications.

**Constraints and exclusions.** No background keylogging, covert screenshots, or operation outside approved session.

**Acceptance test.** An operator can pause desktop control and confirm no further input is emitted.

**Engineering checklist:**
- Implement as a vertical slice: define contracts, ship the smallest working implementation, add a negative test, connect telemetry, and verify end-to-end behavior.
- Preserve deterministic boundaries. The orchestration service decides scheduling, authorization and completion; model output supplies proposals and explanations, never privileged decisions.
- When there is ambiguity, record an architecture decision with alternatives, trade-offs and the chosen default. Do not make silent assumptions about user permissions.
- Every user-visible pass condition must refer to a real process exit, test assertion, deployment record, screenshot, or authenticated operator decision.
- Build degradation explicitly: missing model access, unconfigured deploy provider, unsupported native desktop and incomplete checks should yield informative states rather than fabricated success.


## 27. Desktop-to-terminal interoperability

**Requirement.** Agents may coordinate UI and CLI steps through one task, but the orchestrator must serialize writes to shared applications and repository workspaces. UI controller actions produce screenshot/evidence references; shell actions produce process results.

**Design and implementation.** Use an environment snapshot identity tying desktop, shell, browser, and repo to the same target machine or VM. Show this identity in the dashboard to avoid accidental target confusion.

**Constraints and exclusions.** Never assume a desktop screenshot proves the command executed in the intended environment.

**Acceptance test.** QA can correlate browser URL, deployment revision and workspace commit.

**Engineering checklist:**
- Implement as a vertical slice: define contracts, ship the smallest working implementation, add a negative test, connect telemetry, and verify end-to-end behavior.
- Preserve deterministic boundaries. The orchestration service decides scheduling, authorization and completion; model output supplies proposals and explanations, never privileged decisions.
- When there is ambiguity, record an architecture decision with alternatives, trade-offs and the chosen default. Do not make silent assumptions about user permissions.
- Every user-visible pass condition must refer to a real process exit, test assertion, deployment record, screenshot, or authenticated operator decision.
- Build degradation explicitly: missing model access, unconfigured deploy provider, unsupported native desktop and incomplete checks should yield informative states rather than fabricated success.


## 28. Build, test and static validation

**Requirement.** Verification engine discovers project scripts and supports configurable recipes. Each recipe defines cwd, command, timeout, expected files, and pass criteria. Standard checks: formatting, lint, typecheck, unit tests, integration tests, build.

**Design and implementation.** Require checks to run against an identified commit and isolated workspace. Capture stdout/stderr, return codes and structured JUnit/coverage when available. Unknown checks should report not-configured, not pass.

**Constraints and exclusions.** A model saying tests passed is never accepted without tool evidence.

**Acceptance test.** Failing fixture fails the gate even when an agent summary claims success.

**Engineering checklist:**
- Implement as a vertical slice: define contracts, ship the smallest working implementation, add a negative test, connect telemetry, and verify end-to-end behavior.
- Preserve deterministic boundaries. The orchestration service decides scheduling, authorization and completion; model output supplies proposals and explanations, never privileged decisions.
- When there is ambiguity, record an architecture decision with alternatives, trade-offs and the chosen default. Do not make silent assumptions about user permissions.
- Every user-visible pass condition must refer to a real process exit, test assertion, deployment record, screenshot, or authenticated operator decision.
- Build degradation explicitly: missing model access, unconfigured deploy provider, unsupported native desktop and incomplete checks should yield informative states rather than fabricated success.


## 29. AI code review and finding verification

**Requirement.** Reviewer consumes code diff, acceptance criteria and test context. Findings are structured by file, line/range, severity, evidence, reproduction and confidence. Separate observation from recommended fix.

**Design and implementation.** Deduplicate findings and attempt targeted reproduction when feasible. Do not block release on unsupported low-confidence commentary; distinguish confirmed, suspected and informational issues.

**Constraints and exclusions.** Never rely on voting across identical models as proof of a bug.

**Acceptance test.** Seeded bug is reported with linked evidence and harmless change does not generate a blocker.

**Engineering checklist:**
- Implement as a vertical slice: define contracts, ship the smallest working implementation, add a negative test, connect telemetry, and verify end-to-end behavior.
- Preserve deterministic boundaries. The orchestration service decides scheduling, authorization and completion; model output supplies proposals and explanations, never privileged decisions.
- When there is ambiguity, record an architecture decision with alternatives, trade-offs and the chosen default. Do not make silent assumptions about user permissions.
- Every user-visible pass condition must refer to a real process exit, test assertion, deployment record, screenshot, or authenticated operator decision.
- Build degradation explicitly: missing model access, unconfigured deploy provider, unsupported native desktop and incomplete checks should yield informative states rather than fabricated success.


## 30. Deployment integration contract

**Requirement.** Introduce DeploymentProvider with discoverTarget, preflight, deployStaging, status, getLogs, rollback, and artifactLinks. First implementation targets one platform chosen for the sample app.

**Design and implementation.** Require target allowlist, immutable revision, branch/commit identity, scoped credentials and human approval according to policy. The deploy controller is distinct from model-driven shell access.

**Constraints and exclusions.** Production deploy method exists only as restricted future integration; no default production capability.

**Acceptance test.** Staging deploy returns deployment ID, URL, revision and timestamp or explicit failure.

**Engineering checklist:**
- Implement as a vertical slice: define contracts, ship the smallest working implementation, add a negative test, connect telemetry, and verify end-to-end behavior.
- Preserve deterministic boundaries. The orchestration service decides scheduling, authorization and completion; model output supplies proposals and explanations, never privileged decisions.
- When there is ambiguity, record an architecture decision with alternatives, trade-offs and the chosen default. Do not make silent assumptions about user permissions.
- Every user-visible pass condition must refer to a real process exit, test assertion, deployment record, screenshot, or authenticated operator decision.
- Build degradation explicitly: missing model access, unconfigured deploy provider, unsupported native desktop and incomplete checks should yield informative states rather than fabricated success.


## 31. Staging verification protocol

**Requirement.** Successful deployment triggers verification independent of deploy API success. Gate checks exact commit/version, app readiness, essential API routes, browser happy path, relevant logs, and configurable latency/error thresholds.

**Design and implementation.** Emit signed or hashed manifest of evidence references and measured outcomes. Treat unknown version, unavailable endpoint, or absent required evidence as inconclusive/fail-closed.

**Constraints and exclusions.** Never mark verified simply because a URL loads or HTTP 200 is returned.

**Acceptance test.** Deliberately wrong deployed revision blocks completion.

**Engineering checklist:**
- Implement as a vertical slice: define contracts, ship the smallest working implementation, add a negative test, connect telemetry, and verify end-to-end behavior.
- Preserve deterministic boundaries. The orchestration service decides scheduling, authorization and completion; model output supplies proposals and explanations, never privileged decisions.
- When there is ambiguity, record an architecture decision with alternatives, trade-offs and the chosen default. Do not make silent assumptions about user permissions.
- Every user-visible pass condition must refer to a real process exit, test assertion, deployment record, screenshot, or authenticated operator decision.
- Build degradation explicitly: missing model access, unconfigured deploy provider, unsupported native desktop and incomplete checks should yield informative states rather than fabricated success.


## 32. Release gates and rollback

**Requirement.** Define release policy as required checks combined with explicit approvals. Checks output pass, fail, skipped-with-reason or inconclusive. Only pass satisfies required gate.

**Design and implementation.** Rollback uses known deployment IDs and provider-specific operations; report it as an attempted action with verified outcome, not a guaranteed fix. Preserve forensic logs and artifacts after failure.

**Constraints and exclusions.** No model-only assertion can override a failed hard gate.

**Acceptance test.** Test deploy failure triggers blocked state and records rollback opportunity.

**Engineering checklist:**
- Implement as a vertical slice: define contracts, ship the smallest working implementation, add a negative test, connect telemetry, and verify end-to-end behavior.
- Preserve deterministic boundaries. The orchestration service decides scheduling, authorization and completion; model output supplies proposals and explanations, never privileged decisions.
- When there is ambiguity, record an architecture decision with alternatives, trade-offs and the chosen default. Do not make silent assumptions about user permissions.
- Every user-visible pass condition must refer to a real process exit, test assertion, deployment record, screenshot, or authenticated operator decision.
- Build degradation explicitly: missing model access, unconfigured deploy provider, unsupported native desktop and incomplete checks should yield informative states rather than fabricated success.


## 33. UI information architecture

**Requirement.** Primary areas: Home/Projects, Mission Detail, Agent Graph, Workspace Changes, Terminal, Browser/Desktop, Verification, Deployments, History, Settings. Maintain navigation from mission to each artifact in at most two actions.

**Design and implementation.** Display clear difference between proposed, running, passed, failed and awaiting approval. Use consistent icons but never rely on color alone. Design keyboard support and accessible focus.

**Constraints and exclusions.** Do not make a chat transcript the sole interface for execution status.

**Acceptance test.** Usability test finds a failed check and its evidence within two clicks.

**Engineering checklist:**
- Implement as a vertical slice: define contracts, ship the smallest working implementation, add a negative test, connect telemetry, and verify end-to-end behavior.
- Preserve deterministic boundaries. The orchestration service decides scheduling, authorization and completion; model output supplies proposals and explanations, never privileged decisions.
- When there is ambiguity, record an architecture decision with alternatives, trade-offs and the chosen default. Do not make silent assumptions about user permissions.
- Every user-visible pass condition must refer to a real process exit, test assertion, deployment record, screenshot, or authenticated operator decision.
- Build degradation explicitly: missing model access, unconfigured deploy provider, unsupported native desktop and incomplete checks should yield informative states rather than fabricated success.


## 34. Mission creation and planning UI

**Requirement.** Mission composer accepts repository, natural-language objective, optional constraints, target environment and approval mode. Display preflight warnings for dirty Git, absent tests, unknown deployment target and missing credentials.

**Design and implementation.** Plan view shows task DAG, assigned roles, acceptance criteria, estimated tool scope and checkpoints. User can edit task plan before execution and approve scoped changes.

**Constraints and exclusions.** Never begin privileged operations just because mission text requested them.

**Acceptance test.** New user can plan a mission and understand required approvals before starting.

**Engineering checklist:**
- Implement as a vertical slice: define contracts, ship the smallest working implementation, add a negative test, connect telemetry, and verify end-to-end behavior.
- Preserve deterministic boundaries. The orchestration service decides scheduling, authorization and completion; model output supplies proposals and explanations, never privileged decisions.
- When there is ambiguity, record an architecture decision with alternatives, trade-offs and the chosen default. Do not make silent assumptions about user permissions.
- Every user-visible pass condition must refer to a real process exit, test assertion, deployment record, screenshot, or authenticated operator decision.
- Build degradation explicitly: missing model access, unconfigured deploy provider, unsupported native desktop and incomplete checks should yield informative states rather than fabricated success.


## 35. Live execution and intervention UI

**Requirement.** Agent cards show state, role, current task, runtime, duration, model, token spend, active executor, and last action. Terminal/browser panes stream data while persisting canonical events.

**Design and implementation.** Controls: pause, resume, cancel, request explanation, approve/deny, and take over desktop. Show actionable errors and retry eligibility. UI reconnects without losing mission history.

**Constraints and exclusions.** Do not promise pause if underlying executor can only cancel; expose actual semantics.

**Acceptance test.** Disconnect/restart UI during a mission and reconnect to accurate state.

**Engineering checklist:**
- Implement as a vertical slice: define contracts, ship the smallest working implementation, add a negative test, connect telemetry, and verify end-to-end behavior.
- Preserve deterministic boundaries. The orchestration service decides scheduling, authorization and completion; model output supplies proposals and explanations, never privileged decisions.
- When there is ambiguity, record an architecture decision with alternatives, trade-offs and the chosen default. Do not make silent assumptions about user permissions.
- Every user-visible pass condition must refer to a real process exit, test assertion, deployment record, screenshot, or authenticated operator decision.
- Build degradation explicitly: missing model access, unconfigured deploy provider, unsupported native desktop and incomplete checks should yield informative states rather than fabricated success.


## 36. Diff and review UI

**Requirement.** Provide file tree with additions/deletions, unified and side-by-side diffs, reviewer findings, test links, and approval buttons. Show base/head commit and risk flags.

**Design and implementation.** Allow user comments mapped to task revisions. Only integration controller merges validated task output. Large or binary files need safe fallback.

**Constraints and exclusions.** Avoid showing untrusted generated Markdown as executable HTML.

**Acceptance test.** User can reject a patch without changing the original checkout.

**Engineering checklist:**
- Implement as a vertical slice: define contracts, ship the smallest working implementation, add a negative test, connect telemetry, and verify end-to-end behavior.
- Preserve deterministic boundaries. The orchestration service decides scheduling, authorization and completion; model output supplies proposals and explanations, never privileged decisions.
- When there is ambiguity, record an architecture decision with alternatives, trade-offs and the chosen default. Do not make silent assumptions about user permissions.
- Every user-visible pass condition must refer to a real process exit, test assertion, deployment record, screenshot, or authenticated operator decision.
- Build degradation explicitly: missing model access, unconfigured deploy provider, unsupported native desktop and incomplete checks should yield informative states rather than fabricated success.


## 37. Verification and deployment UI

**Requirement.** One release report shows build, test, review, staging deploy, browser QA, API checks and log checks with evidence links. Display environment, deployed URL, commit SHA and time.

**Design and implementation.** Red/yellow/green status must be explained in words. Include warnings, skipped tests, inconclusive signals, and explicit human approvals. Artifact download redacts credentials.

**Constraints and exclusions.** Do not collapse missing checks into successful overall score.

**Acceptance test.** Operator can inspect exact failed browser step and attached screenshot.

**Engineering checklist:**
- Implement as a vertical slice: define contracts, ship the smallest working implementation, add a negative test, connect telemetry, and verify end-to-end behavior.
- Preserve deterministic boundaries. The orchestration service decides scheduling, authorization and completion; model output supplies proposals and explanations, never privileged decisions.
- When there is ambiguity, record an architecture decision with alternatives, trade-offs and the chosen default. Do not make silent assumptions about user permissions.
- Every user-visible pass condition must refer to a real process exit, test assertion, deployment record, screenshot, or authenticated operator decision.
- Build degradation explicitly: missing model access, unconfigured deploy provider, unsupported native desktop and incomplete checks should yield informative states rather than fabricated success.


## 38. Event stream and audit trail

**Requirement.** All domain actions produce typed events with missionId, taskId, attemptId, actor, timestamp, eventType, sequence, redacted payload and artifact links. Events are append-only except explicit retention/compaction jobs.

**Design and implementation.** UI reads materialized state; debugging uses event replay. Keep operational logs separate from user-visible audit records. Provide JSONL export with sensitive-field redaction.

**Constraints and exclusions.** No sensitive keys in event payloads; never depend on UI local state as source of truth.

**Acceptance test.** Replay from events matches persisted mission state after crash simulation.

**Engineering checklist:**
- Implement as a vertical slice: define contracts, ship the smallest working implementation, add a negative test, connect telemetry, and verify end-to-end behavior.
- Preserve deterministic boundaries. The orchestration service decides scheduling, authorization and completion; model output supplies proposals and explanations, never privileged decisions.
- When there is ambiguity, record an architecture decision with alternatives, trade-offs and the chosen default. Do not make silent assumptions about user permissions.
- Every user-visible pass condition must refer to a real process exit, test assertion, deployment record, screenshot, or authenticated operator decision.
- Build degradation explicitly: missing model access, unconfigured deploy provider, unsupported native desktop and incomplete checks should yield informative states rather than fabricated success.


## 39. Database and artifact storage

**Requirement.** Use SQLite in local-first release with WAL, migrations, foreign keys, and indexed mission/task relations. Save large transcripts, traces, screenshots, patch bundles and test outputs as files addressed by opaque artifact IDs.

**Design and implementation.** Implement atomic write then rename for artifact integrity, checksums, retention policies, and export/import format versioning. Handle disk-full and corrupt artifact gracefully.

**Constraints and exclusions.** Do not store screenshots or huge logs as unbounded database blobs.

**Acceptance test.** Backup/restore test recreates mission with intact evidence links.

**Engineering checklist:**
- Implement as a vertical slice: define contracts, ship the smallest working implementation, add a negative test, connect telemetry, and verify end-to-end behavior.
- Preserve deterministic boundaries. The orchestration service decides scheduling, authorization and completion; model output supplies proposals and explanations, never privileged decisions.
- When there is ambiguity, record an architecture decision with alternatives, trade-offs and the chosen default. Do not make silent assumptions about user permissions.
- Every user-visible pass condition must refer to a real process exit, test assertion, deployment record, screenshot, or authenticated operator decision.
- Build degradation explicitly: missing model access, unconfigured deploy provider, unsupported native desktop and incomplete checks should yield informative states rather than fabricated success.


## 40. Failure handling and recovery

**Requirement.** Classify errors: model auth, model rate limit, tool timeout, process crash, policy deny, workspace conflict, test fail, deployment fail, network unavailable, stale session. Retry only explicitly retryable categories with bounded backoff.

**Design and implementation.** After daemon restart, reconcile process/session IDs, workspace leases, and pending approvals. Distinguish resuming from restarting because commands may be non-idempotent.

**Constraints and exclusions.** Never automatically repeat a potentially destructive command without idempotency checks.

**Acceptance test.** Fault injection during a task yields stable final state and no duplicate deployment.

**Engineering checklist:**
- Implement as a vertical slice: define contracts, ship the smallest working implementation, add a negative test, connect telemetry, and verify end-to-end behavior.
- Preserve deterministic boundaries. The orchestration service decides scheduling, authorization and completion; model output supplies proposals and explanations, never privileged decisions.
- When there is ambiguity, record an architecture decision with alternatives, trade-offs and the chosen default. Do not make silent assumptions about user permissions.
- Every user-visible pass condition must refer to a real process exit, test assertion, deployment record, screenshot, or authenticated operator decision.
- Build degradation explicitly: missing model access, unconfigured deploy provider, unsupported native desktop and incomplete checks should yield informative states rather than fabricated success.


## 41. Concurrency and resource governance

**Requirement.** Implement budgets per mission and task: agent count, tool calls, tokens, wall time, CPU/memory/disk where supported, and outbound network policy. Use scheduler admission control and workspace lease locks.

**Design and implementation.** Report consumed budgets in mission UI. Queue work when resource limits are reached. Cap transcript/context growth and enforce artifact retention.

**Constraints and exclusions.** No speculative infinite agent swarms.

**Acceptance test.** Stress test respects maximum workers and keeps UI responsive.

**Engineering checklist:**
- Implement as a vertical slice: define contracts, ship the smallest working implementation, add a negative test, connect telemetry, and verify end-to-end behavior.
- Preserve deterministic boundaries. The orchestration service decides scheduling, authorization and completion; model output supplies proposals and explanations, never privileged decisions.
- When there is ambiguity, record an architecture decision with alternatives, trade-offs and the chosen default. Do not make silent assumptions about user permissions.
- Every user-visible pass condition must refer to a real process exit, test assertion, deployment record, screenshot, or authenticated operator decision.
- Build degradation explicitly: missing model access, unconfigured deploy provider, unsupported native desktop and incomplete checks should yield informative states rather than fabricated success.


## 42. Security threats and mitigations

**Requirement.** Threat model: malicious repository instructions, prompt injection in README/webpages, package install scripts, sandbox escape, secret exfiltration, cross-workspace reads, arbitrary deploy targets, compromised extension, and UI IPC exploitation.

**Design and implementation.** Mitigations include capability-based tool gate, OS isolation, extension review, target allowlists, short-lived secrets, redaction, renderer hardening, and security event audit. Write threat tests for each trust boundary.

**Constraints and exclusions.** Do not treat prompt filtering as adequate isolation.

**Acceptance test.** Untrusted text attempting to request credentials is refused by the executor policy.

**Engineering checklist:**
- Implement as a vertical slice: define contracts, ship the smallest working implementation, add a negative test, connect telemetry, and verify end-to-end behavior.
- Preserve deterministic boundaries. The orchestration service decides scheduling, authorization and completion; model output supplies proposals and explanations, never privileged decisions.
- When there is ambiguity, record an architecture decision with alternatives, trade-offs and the chosen default. Do not make silent assumptions about user permissions.
- Every user-visible pass condition must refer to a real process exit, test assertion, deployment record, screenshot, or authenticated operator decision.
- Build degradation explicitly: missing model access, unconfigured deploy provider, unsupported native desktop and incomplete checks should yield informative states rather than fabricated success.


## 43. Privacy, networking and telemetry

**Requirement.** Local-first default: repositories and execution artifacts stay on device except content sent to configured model providers and authorized deployment targets. List outbound network surfaces and make them inspectable.

**Design and implementation.** Provide clear provider configuration, opt-in diagnostics, export and delete functionality. Log model request metadata rather than raw secret-bearing payloads by default.

**Constraints and exclusions.** No hidden analytics or automatic project uploads.

**Acceptance test.** A network audit of an idle app shows no unexplained outbound requests.

**Engineering checklist:**
- Implement as a vertical slice: define contracts, ship the smallest working implementation, add a negative test, connect telemetry, and verify end-to-end behavior.
- Preserve deterministic boundaries. The orchestration service decides scheduling, authorization and completion; model output supplies proposals and explanations, never privileged decisions.
- When there is ambiguity, record an architecture decision with alternatives, trade-offs and the chosen default. Do not make silent assumptions about user permissions.
- Every user-visible pass condition must refer to a real process exit, test assertion, deployment record, screenshot, or authenticated operator decision.
- Build degradation explicitly: missing model access, unconfigured deploy provider, unsupported native desktop and incomplete checks should yield informative states rather than fabricated success.


## 44. Testing pyramid and contract suites

**Requirement.** Unit-test policy, state machines, scheduler, plan validator, path checks, and gate aggregation. Contract-test the Pi adapter and each executor. Integration-test worktrees, daemon and artifacts. E2E-test desktop mission and sample staging workflow.

**Design and implementation.** Use fake model and fake deployment provider to make most CI deterministic. Mark live model and external staging suites opt-in with budgeted runs.

**Constraints and exclusions.** Avoid relying on flaky live models for every PR check.

**Acceptance test.** CI can reproduce core end-to-end task without external model credentials.

**Engineering checklist:**
- Implement as a vertical slice: define contracts, ship the smallest working implementation, add a negative test, connect telemetry, and verify end-to-end behavior.
- Preserve deterministic boundaries. The orchestration service decides scheduling, authorization and completion; model output supplies proposals and explanations, never privileged decisions.
- When there is ambiguity, record an architecture decision with alternatives, trade-offs and the chosen default. Do not make silent assumptions about user permissions.
- Every user-visible pass condition must refer to a real process exit, test assertion, deployment record, screenshot, or authenticated operator decision.
- Build degradation explicitly: missing model access, unconfigured deploy provider, unsupported native desktop and incomplete checks should yield informative states rather than fabricated success.


## 45. Evaluation framework and reliability goals

**Requirement.** Create golden mission corpus: trivial file edit, multi-file feature, failing tests, prompt injection, merge conflict, long-running process, UI regression, wrong deployment revision. Score task success, false pass rate, recovery, runtime, and resource use.

**Design and implementation.** Baseline before optimizing prompts or adding agents. Report confidence intervals for small samples; regression checks must compare matched tasks and model settings.

**Constraints and exclusions.** Do not claim better than Codex/Claude from unrepresentative demos.

**Acceptance test.** Each release generates evaluation summary with traceable failures.

**Engineering checklist:**
- Implement as a vertical slice: define contracts, ship the smallest working implementation, add a negative test, connect telemetry, and verify end-to-end behavior.
- Preserve deterministic boundaries. The orchestration service decides scheduling, authorization and completion; model output supplies proposals and explanations, never privileged decisions.
- When there is ambiguity, record an architecture decision with alternatives, trade-offs and the chosen default. Do not make silent assumptions about user permissions.
- Every user-visible pass condition must refer to a real process exit, test assertion, deployment record, screenshot, or authenticated operator decision.
- Build degradation explicitly: missing model access, unconfigured deploy provider, unsupported native desktop and incomplete checks should yield informative states rather than fabricated success.


## 46. Developer experience and local commands

**Requirement.** Provide make/dev or pnpm dev, pnpm typecheck, pnpm lint, pnpm test, pnpm test:integration, pnpm test:e2e and pnpm package. Include preflight script for OS dependencies, model credentials and sandbox availability.

**Design and implementation.** Add seed sample project and deterministic fake runtime. CLI command atlas doctor checks installed requirements without exposing secrets. Document supported OS matrix explicitly.

**Constraints and exclusions.** No undocumented manual setup required for the sample workflow.

**Acceptance test.** Fresh checkout runs demo mission according to README.

**Engineering checklist:**
- Implement as a vertical slice: define contracts, ship the smallest working implementation, add a negative test, connect telemetry, and verify end-to-end behavior.
- Preserve deterministic boundaries. The orchestration service decides scheduling, authorization and completion; model output supplies proposals and explanations, never privileged decisions.
- When there is ambiguity, record an architecture decision with alternatives, trade-offs and the chosen default. Do not make silent assumptions about user permissions.
- Every user-visible pass condition must refer to a real process exit, test assertion, deployment record, screenshot, or authenticated operator decision.
- Build degradation explicitly: missing model access, unconfigured deploy provider, unsupported native desktop and incomplete checks should yield informative states rather than fabricated success.


## 47. Implementation milestones and work packets

**Requirement.** M0 repository/types/database/UI shell; M1 Pi adapter+single agent+tools; M2 scheduler/worktrees/reviewer; M3 browser QA+verification; M4 staging deploy+release gate; M5 desktop control+hardening. Each work packet has owner, dependencies, tests and demo.

**Design and implementation.** Implement vertical slices: working execution path before general agent studio, cloud execution or elaborate diagram editor. Maintain decision log and weekly risk list.

**Constraints and exclusions.** Do not start M5 while M1 tool policy and cancellation are untested.

**Acceptance test.** Each milestone ends with recorded functional demonstration and green gates.

**Engineering checklist:**
- Implement as a vertical slice: define contracts, ship the smallest working implementation, add a negative test, connect telemetry, and verify end-to-end behavior.
- Preserve deterministic boundaries. The orchestration service decides scheduling, authorization and completion; model output supplies proposals and explanations, never privileged decisions.
- When there is ambiguity, record an architecture decision with alternatives, trade-offs and the chosen default. Do not make silent assumptions about user permissions.
- Every user-visible pass condition must refer to a real process exit, test assertion, deployment record, screenshot, or authenticated operator decision.
- Build degradation explicitly: missing model access, unconfigured deploy provider, unsupported native desktop and incomplete checks should yield informative states rather than fabricated success.


## 48. Codex operating instructions

**Requirement.** Codex must read AGENTS.md, this manual, current milestone and relevant ADRs before editing. First inspect repository and plan a small implementation slice. Make only scoped changes, add tests, run them, and report evidence.

**Design and implementation.** If SDK signatures differ from examples, inspect installed TypeScript typings and official upstream docs; document deviations. Keep commits reviewable. Never fabricate test results, screenshots, or deployment status.

**Constraints and exclusions.** Do not silently rewrite architecture or install privileged dependencies.

**Acceptance test.** Codex implementation report lists files changed, commands run, results and unresolved risks.

**Engineering checklist:**
- Implement as a vertical slice: define contracts, ship the smallest working implementation, add a negative test, connect telemetry, and verify end-to-end behavior.
- Preserve deterministic boundaries. The orchestration service decides scheduling, authorization and completion; model output supplies proposals and explanations, never privileged decisions.
- When there is ambiguity, record an architecture decision with alternatives, trade-offs and the chosen default. Do not make silent assumptions about user permissions.
- Every user-visible pass condition must refer to a real process exit, test assertion, deployment record, screenshot, or authenticated operator decision.
- Build degradation explicitly: missing model access, unconfigured deploy provider, unsupported native desktop and incomplete checks should yield informative states rather than fabricated success.


## 49. Launch acceptance and handoff

**Requirement.** v0.1 demonstration: import a sample repo; describe a change; approve plan; agent edits in isolated worktree; reviewer inspects diff; tests run; browser QA checks local app; dashboard shows evidence; user accepts or rejects; app survives restart.

**Design and implementation.** v0.2 adds authorized staging deploy with revision match; v0.3 adds isolated desktop GUI control. Release notes include known gaps, security assumptions and provenance of Pi dependency.

**Constraints and exclusions.** Do not call product production-ready without evaluated isolation, recovery and security testing.

**Acceptance test.** A second engineer completes demonstration from clean machine using only docs.

**Engineering checklist:**
- Implement as a vertical slice: define contracts, ship the smallest working implementation, add a negative test, connect telemetry, and verify end-to-end behavior.
- Preserve deterministic boundaries. The orchestration service decides scheduling, authorization and completion; model output supplies proposals and explanations, never privileged decisions.
- When there is ambiguity, record an architecture decision with alternatives, trade-offs and the chosen default. Do not make silent assumptions about user permissions.
- Every user-visible pass condition must refer to a real process exit, test assertion, deployment record, screenshot, or authenticated operator decision.
- Build degradation explicitly: missing model access, unconfigured deploy provider, unsupported native desktop and incomplete checks should yield informative states rather than fabricated success.


## 50. Appendix: schemas, APIs and definition of done

**Requirement.** Canonical APIs: POST /missions, GET /missions/:id, POST /missions/:id/plan, POST /missions/:id/start, POST /tasks/:id/cancel, POST /approvals/:id/decision, GET /missions/:id/events, GET /artifacts/:id. Validate payloads via shared schemas.

**Design and implementation.** Definition of done for each feature: typed contract, policy enforcement, structured logs, unit and integration tests, UI affordance, docs, error handling, accessibility check where applicable. Document API version and migration policy.

**Constraints and exclusions.** Never expose unauthenticated privileged IPC to other local processes.

**Acceptance test.** Contracts build, API tests pass, and implementation links to specific specification page.

**Engineering checklist:**
- Implement as a vertical slice: define contracts, ship the smallest working implementation, add a negative test, connect telemetry, and verify end-to-end behavior.
- Preserve deterministic boundaries. The orchestration service decides scheduling, authorization and completion; model output supplies proposals and explanations, never privileged decisions.
- When there is ambiguity, record an architecture decision with alternatives, trade-offs and the chosen default. Do not make silent assumptions about user permissions.
- Every user-visible pass condition must refer to a real process exit, test assertion, deployment record, screenshot, or authenticated operator decision.
- Build degradation explicitly: missing model access, unconfigured deploy provider, unsupported native desktop and incomplete checks should yield informative states rather than fabricated success.


---

## Codex kickoff prompt (copy into Codex)

```text
You are implementing ATLAS, a desktop-first autonomous software engineering workspace built around an embedded Pi agent runtime.
Read ATLAS_50_Page_Implementation_Manual.md in full, then inspect the current repository.
Do not implement billing, multi-tenant cloud hosting, or autonomous production deployment.
First produce a short technical plan, proposed monorepo tree, milestones M0/M1, and risk register.
Then implement the smallest verified vertical slice: workspace selection -> mission -> Pi runtime task -> governed shell action -> artifact/event -> UI result.
Use strict types, deterministic tests, capability enforcement, and checkpointed workspaces.
Pin and verify the actual upstream Pi SDK API, version, origin, and license instead of guessing.
Do not claim any tests or deployments passed without actual evidence.
At the end, report files changed, commands executed, tests run, remaining risks, and next milestone.
```

## Definition of ready

- A supported local OS and desktop shell have been selected.
- Pi upstream source, commit, package exports, and license have been verified.
- A sample repository and sample application can run locally.
- Explicit requirements for privileged actions and deployment targets are recorded.
- CI can run tests without paid model access using the fake runtime.


---

# Electron Architecture Addendum — Mandatory for ATLAS v0.1

This addendum overrides any earlier desktop-framework choice. Electron is required. The 50 numbered sections remain the functional specification; these extra requirements make the process boundary explicit.

## E1. Electron application processes

- **Main process:** window lifecycle, secure OS dialogs, lifecycle supervision, external link allowlists, update lifecycle (later), and IPC routing. It must not execute model-proposed shell text directly.
- **Preload:** narrowly typed `window.atlas` API using `contextBridge`. No generic `ipcRenderer`, `exec`, `fs`, or arbitrary channel passthrough.
- **Renderer:** React + Vite + TypeScript. Renderer has no Node.js integration, cannot directly open files or launch processes, and only consumes typed application commands/events.
- **Daemon / agent workers:** separate supervised Node processes for mission orchestration, Pi adapter, terminal sessions, worktrees, tool policy, browser workers and SQLite persistence. Restart and recover deterministically.
- **Sandboxed execution:** repository scripts and untrusted commands execute in an isolated workspace with explicit directory mounts, timeouts, resource budgets, and restricted credentials. Electron renderer sandbox alone is NOT a security sandbox for agent commands.

## E2. Electron mandatory security defaults

- `webPreferences: { nodeIntegration: false, contextIsolation: true, sandbox: true, preload: <absolute path> }`.
- No remote web pages with privileged preload. Restrict navigation, new windows, and `shell.openExternal` to an allowlist. Configure a restrictive Content Security Policy and validate every IPC payload (e.g., Zod).
- Use explicit IPC channel constants and typed request/response schemas. Verify the sending frame origin. Do not expose credentials, shell arguments, or raw system APIs to the renderer.
- Persist secrets through an OS-appropriate credential mechanism; never put secrets in renderer storage or task logs.
- OS-level desktop automation is an explicit opt-in feature with visible session ownership, scoped permissions and revocation. No hidden remote control.

## E3. Updated workspace layout

```text
atlas/
  apps/desktop/
    electron-main/    # window, privileged routing, lifecycle
    preload/          # typed, allowlisted window.atlas bridge
    renderer/         # React UI, no Node integration
  apps/daemon/        # orchestration and worker supervision
  packages/contracts/ # shared IPC/domain schemas and event types
  packages/runtime-pi/
  packages/orchestrator/
  packages/policy/
  packages/workspace/
  packages/terminal/
  packages/browser/
  packages/desktop-control/
  packages/verification/
  packages/deploy/
  packages/storage/
  tests/e2e-electron/
  docs/adr/
```

## E4. Execution and IPC contract

Renderer sends intent (`mission.create`, `mission.pause`, `approval.respond`, `workspace.open`); main/daemon performs authorization and state changes. Worker events are pushed via an authenticated, ordered and resumable event stream. Long-running work must not block Electron's main thread. File paths are normalized, workspace-scoped and independently authorized at the backend.

## E5. Product UX

Default views: Projects, Mission Control, Agents, Terminal, Browser/Desktop Session, Changes, Verification and Settings. Show exact running process, tool intent, target environment and required approval. Users can pause/cancel tasks, inspect changes, revoke desktop control, and resume after application restart.

## E6. Packaging and supported OS

Use Electron Forge or electron-builder (choose one and record ADR), signed/notarized builds when relevant, and reproducible installer artifacts. Start with ONE fully tested OS, then support other platforms explicitly. Keep app binary updates separate from Pi/agent runtime upgrades. Pin dependency versions and audit distribution notices. No billing or hosted accounts.

## E7. Codex implementation sequence

1. Bootstrap Electron main, preload, React renderer and `apps/daemon`; create typed shared contracts.
2. Demonstrate secure IPC round-trip, app restart and daemon recovery.
3. Embed Pi in worker process; stream one supervised terminal-backed agent session.
4. Add workspace Git worktree isolation, diff viewer, test runner and approval policy.
5. Add agents/subagents, live event timelines and browser QA.
6. Add staging deployment with evidence-based release gate.
7. Add opt-in native desktop control and OS-specific acceptance tests.

## E8. Electron acceptance criteria

- Fresh install boots a branded ATLAS window without Pi CLI appearing as the primary UI.
- Renderer cannot use Node's `fs`/`child_process`, nor invoke undeclared IPC channels.
- Malformed, unauthorized and cross-workspace IPC requests are denied and logged.
- Main thread remains responsive while a task runs or a worker crashes.
- Cancel terminates process trees; forced app exit allows safe recovery on restart.
- A sample mission edits code in an isolated workspace, runs tests, shows a diff and returns evidence.
- No production deployment, billing or unrestricted desktop automation in v0.1.
