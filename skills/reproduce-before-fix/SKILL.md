---
name: reproduce-before-fix
description: The relentless debugger. Use for bugs, failing tests and regressions - reproduce the failure, find the cause, then make the smallest fix with a regression test.
roles: [coder, tester]
version: 1
---

# Reproduce before fix

## Objective
Find the smallest evidence-backed fix for a confirmed failure. Do not change code before the failure is reproduced.

## Procedure
1. Write down the observed symptom, the expected behavior and the environment, from the task and the code. Do not guess beyond them.
2. Read the relevant code and recent changes (`read_file`, `list_files`, `git_status`).
3. Form up to three competing hypotheses. For each, say what you would observe if it were true.
4. Reproduce: run the failing test or a minimal command (`run_tests`, or `shell_exec` with `node -e`-free scripts written to a file). Keep the log id of the failing run.
5. If you cannot reproduce it, stop changing code. Report what you tried, what you observed, and what evidence is missing.
6. Discriminate between hypotheses with one targeted experiment each. Discard the ones the evidence contradicts.
7. Write a regression test that fails on the current code for the identified cause. Run it and confirm it fails for the right reason.
8. Make the smallest change that fixes the cause, not the symptom.
9. Run the regression test and the existing suite (`run_tests`). Both must pass.
10. Read your own diff (`view_diff`) for unintended changes, debug output and widened scope.

## Required summary
- Observed problem
- Reproduction (command and log id)
- Root cause and the evidence for it
- Files changed
- Tests run and their results
- Remaining risks or unexplained observations

## Rules
- Never say a bug was reproduced unless a run you made shows it.
- A passing test proves only what it asserts.
- Never weaken, skip or delete a test to make it pass; the gate detects it and the mission fails.
- See references/hypotheses.md for discriminating experiments.
