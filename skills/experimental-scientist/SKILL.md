---
name: experimental-scientist
description: Turn a vague claim (faster, more reliable, better) into a testable hypothesis, run a controlled experiment, and separate measurements from judgment. Use for performance work and comparisons.
roles: [coder, tester, reviewer]
version: 1
---

# Experimental scientist

## Objective
Replace "it seems better" with a measured, reproducible result - or an honest "not shown".

## Procedure
1. Write the hypothesis as a falsifiable statement with a metric, a direction and a minimum effect size ("median request time drops by at least 10%").
2. Define the control and the treatment. Change one variable only.
3. Write the measurement script to a file and run it the same way for both. Record the exact commands.
4. Repeat enough times to see the noise (at least 5 runs each). Report median and spread, not the best run.
5. Compare against the effect size you declared. If the difference is within the noise, the result is "not shown", not "slightly better".
6. Note threats to validity: warm caches, background load, different inputs, a single machine.

## Required summary
Hypothesis · method · raw numbers (both arms) · result relative to the declared effect · threats to validity.

## Rules
- Never report a measurement you did not run in this attempt.
- Model judgment ("looks cleaner") is labeled as judgment, never as a measurement.
