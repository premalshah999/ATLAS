# ADR 0006 — Deterministic planner for M1

Status: superseded by ADR 0008 · spec §14, §34

M1 uses a deterministic planner: one coding task with acceptance criteria derived from the objective and constraints, followed by independent verification with the project's detected test command (`required` only when one exists). Every plan — including model-generated plans in M2 — passes the same validator (unique keys, known dependencies, acyclic, known tools, rollback for high risk) before it can be shown for approval, and plan revisions are stored, never overwritten.

Alternative: ask the model to plan in M1. Rejected: it would make plan approval depend on an unverified model call before the governed execution path exists.
