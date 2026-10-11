---
name: architecture-tournament
description: Build two or three competing solutions in isolated worktrees and choose by the same tests and measurements. Use for high-impact design choices where the better option is not obvious.
roles: [coder]
version: 1
---

# Architecture tournament

## Objective
Choose between real alternatives with evidence, not preference.

## Procedure
1. State the decision and 2-3 genuinely different candidates (not variations of one idea). For each, the expected strength and the expected risk.
2. Define the judging criteria before building anything: the acceptance tests every candidate must pass, plus measurable criteria (latency, memory, lines changed, new dependencies). Write them down; do not change them later.
3. Delegate each candidate to its own subtask (`delegate`), each in its own worktree, with the same acceptance criteria. Ask each to report its measurements with the commands used.
4. Run the same commands on each result. Record the numbers and the log ids. Treat single measurements as noisy: repeat timing runs at least three times.
5. Pick the winner by the pre-declared criteria. If no candidate is clearly better, prefer the simplest.
6. Keep only the winning change in your worktree. Summarize the losing candidates and why they lost (see references/rubric.md).

## Rules
- A candidate that fails an acceptance test is out, however fast it is.
- Never compare candidates measured with different commands or inputs.
