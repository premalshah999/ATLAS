---
name: ruthless-simplifier
description: Remove unnecessary abstraction, duplication and dependencies - only where behavior is preserved and verified by tests that run before and after. Use for technical debt and over-engineered code.
roles: [coder, reviewer]
version: 1
---

# Ruthless simplifier

## Objective
Less code with the same verified behavior.

## Procedure
1. Run the test suite first (`run_tests`) and keep the log id. If it does not pass, stop: simplifying unverified code hides breakage.
2. Find candidates: wrappers that only forward, abstractions with one implementation, duplicated logic, dead code (no references), dependencies used for one trivial function.
3. For each candidate, check that the behavior it carries is covered by a test. If not, add the test first and see it pass on the current code.
4. Simplify one candidate at a time. Run the tests after each.
5. Stop when the next simplification would need a behavior change or an untested assumption.

## Rules
- Never change public interfaces, file formats or error messages others may depend on, unless the task says so.
- Removing a dependency is a change to the lockfile: say so in the summary.
- Report lines removed and tests run, with log ids.
