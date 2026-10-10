# ADR 0008 — Planning, DAG execution, integration, review and delegation (M2)

Status: accepted · 2026-10-10 · spec §13–17, §19, §29, §38–41 · supersedes ADR 0006

## Planning
The runtime proposes a plan (`AgentRuntime.plan`, a tool-less Pi session returning JSON). The proposal is untrusted: `validatePlan` checks schema, unique keys, known dependencies, acyclicity, known tools, **tools allowed for the task's role**, rollback notes for high risk and the mission's task budget. An invalid plan gets one repair round with the validator's issues; if it is still invalid the rejection is recorded and the deterministic plan (implement → review) is offered instead. Nothing executes before the operator approves.

## Scheduling
A DAG scheduler with admission control by the mission budget (`maxConcurrentAgents`, subagents included). Each task runs in its own worktree **started from its dependencies' checkpoints** (merged when there are several; a conflict fails the task explicitly). Writers that declare overlapping `files` and have no ordering between them are serialized at approval time, so two writers never edit the same paths in parallel.

## Integration
After all top-level tasks finish, a dedicated integration worktree on `atlas/<mission>/integration` merges every writer's checkpoint in topological order. Conflicts fail the mission with the files listed; nothing is auto-resolved. All checks and later stages run on the integration commit; accepting keeps exactly that branch.

## Review
Reviewers record findings with `report_finding` (file, line range, severity, observation, evidence, recommendation, confidence). Findings are deduplicated by fingerprint. A finding is **confirmed only if it references the artifact of a failing command ATLAS itself ran in that review**; otherwise it is stored as suspected with the downgrade noted. Open confirmed high/medium findings fail the `review` gate; suspected and informational ones never block. A passing review is a gate, never evidence: it cannot by itself make a result verified. Operators can accept/dismiss/mark findings fixed and re-run the gate without repeating agent work.

## Delegation
`delegate` (capability `agent.delegate`, coder/orchestrator only) checkpoints the parent's work, runs a child task from that commit in its own worktree, and merges the child's checkpoint back into the parent, returning a structured result artifact. Limits: depth (`maxDelegationDepth`; agents at the limit are not offered the tool), task count, concurrent agents and remaining tokens. After a daemon restart, subtasks of lost parents are cancelled; the restarted parent delegates again if it needs to.

## Budgets and context
Per-mission budget (agents, tasks, depth, tokens, wall clock) is enforced by the governor and reported in the mission snapshot. Each attempt gets a context bundle (objective, constraints, task, plan, operator-maintained project facts, recent decisions, repository map, and for reviewers the diff), stored as an artifact with source hashes and referenced by the attempt.

## Audit export, deletion, retention
JSONL export with format version, re-redaction and a SHA-256 trailer over all records; import verifies the trailer and every artifact checksum and restores the mission read-only. Deletion removes worktrees, task branches, artifact files and rows (an accepted integration branch belongs to the operator and is kept). Optional retention purges decided missions after N days.

## Operator terminal
Interactive PTY via the system `script` utility inside the sandbox (no native module per Electron ABI). If an agent holds the worktree lease the operator session is read-only; sessions and their transcripts are audit events. Window resizing after opening is not propagated (fixed size per session).
