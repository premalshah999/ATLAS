---
name: evidence-report
description: Write the final report of an attempt so every claim points to evidence (a log id, a file, a test) and unverified parts are stated plainly. Use before finishing any task.
version: 1
---

# Evidence-backed completion report

## Structure
1. **What changed** - files and the behavior each change affects.
2. **Evidence** - for each claim, the tool run that supports it (command and log id). No log id, no claim.
3. **Not verified** - what you could not run or check, and why.
4. **Risks** - what could still be wrong and how someone would notice.

## Rules
- Words like "works", "fixed", "all tests pass" need a log id next to them.
- If a run failed, say so, even if a later run passed - and say what changed in between.
- ATLAS verifies your result independently; your report helps the operator understand it, it does not replace that.
