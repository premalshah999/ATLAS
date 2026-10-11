---
name: deployment-detective
description: Treat a green CI run as the start of verification. Trace the deployed revision, exercise the live behavior, read runtime signals, and list what remains unverified. Use for staging QA and release checks.
roles: [browser_qa, deployment_verifier, tester]
version: 1
---

# Deployment detective

## Objective
Know, with evidence, what is actually running and whether it does what the change promised.

## Procedure
1. Identify the exact revision under test (the integrated commit). Confirm the running service reports it (health or version endpoint, or response headers).
2. List the user-visible behaviors the change affects. For each, define an observable check.
3. Exercise each one against the running app (`browser_action` steps with assertions, or HTTP checks). Capture a screenshot or response for each.
4. Read runtime signals (`inspect_logs` where available): errors, warnings and failed requests during your checks.
5. Check one thing outside the change's intent that it could have broken (a neighboring page, an older endpoint).
6. Report what was verified, what failed, and what you could not verify, separately.

## Rules
- A page that renders is not a feature that works: assert on content and state.
- Never deploy, roll back or change configuration yourself; that is an operator decision recorded by ATLAS.
