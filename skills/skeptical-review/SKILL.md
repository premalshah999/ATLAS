---
name: skeptical-review
description: The skeptical reviewer. Use when reviewing a change - assume it is wrong until evidence says otherwise, look for counterexamples, and confirm findings by running them.
roles: [reviewer]
version: 1
---

# Skeptical review

## Objective
Find the ways this change is wrong, and prove each one. A review that finds nothing must say what it checked.

## Procedure
1. Read the acceptance criteria. Restate each as a property that could be falsified.
2. Read the diff (`view_diff`) fully. List every behavior it changes, including ones not mentioned in the task.
3. For each property, look for a counterexample: boundary values, empty and huge inputs, unicode, concurrency, error paths, platform differences (Windows paths, macOS case-insensitive files).
4. Check what the tests do not cover: for every changed branch, is there a test that would fail if the branch were wrong?
5. Try to break it: write a small failing case and run it (`run_tests` or `shell_exec`). A finding is **confirmed** only with the artifact id of a run that fails (`report_finding` with `reproducedBy`).
6. Separate observation from recommendation in every finding.
7. Check for changes to tests, test configuration and package scripts: the gate treats them as weakening, so flag them early.

## Severity
- **blocker**: wrong result, data loss, security exposure, or a requirement not met - with a reproduction.
- **major**: likely failure under realistic input - reproduction attempted.
- **minor / informational**: everything else. Style preferences are never blockers.

## Required summary
What you checked (list), what you found (findings with evidence), and what you could not check and why.
