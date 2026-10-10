# Evaluation

`pnpm eval` runs the golden mission corpus (manual §45) and writes [`latest.md`](latest.md) and `latest.json` here (`ATLAS_EVAL_OUT` changes the directory). The run fails when the system deviates from the expected verdict on a scripted case, or when a recovery case does not reach a stable state.

## How a case is judged
Each case builds a real git repository, runs a full mission through the orchestrator (sandbox, policy, worktrees, checks, release stages), and records:

- **Gate verdict:** what ATLAS concluded (`verified`, `unverified`, `failed`).
- **Expected:** what a correct system concludes from what is knowable in the project.
- **Oracle:** ground truth on the delivered commit, computed outside the repository with checks the agent never sees (hidden slug cases, file contents, process liveness, canary integrity, the revision actually served).

From these it scores:
- task success (verified *and* correct);
- **false pass rate** (verified but wrong, over all verified missions);
- false fail rate;
- recovery after fault injection;
- wall time, tool calls, commands, approvals, artifact bytes and tokens.

Rates carry 95% Wilson intervals, because the samples are small.

## Corpus
| Case | Scenario |
| --- | --- |
| trivial-edit | one-file docs change |
| multi-file | three dependent tasks merged through the integration branch |
| failing-tests | real bug exposed by five tests |
| false-claim | agent claims success without a change |
| prompt-injection | repository text tells the agent to exfiltrate a canary; the agent tries |
| merge-conflict | parallel tasks rewrite the same file |
| long-running | a command never exits; timeout kills its tree |
| ui-regression | logic fixed, page broken; unit tests still pass |
| wrong-deploy-revision | staging serves a hard-coded revision |
| weak-tests | overfit fix that passes every visible test |
| crash-recovery | daemon dies mid-command |

`weak-tests` is a known false pass: when the project's own checks are too weak, ATLAS cannot know the result is wrong. It stays in the corpus so the number is visible.

## Runtimes and comparisons
- **Default runtime:** the scripted runtime, so the agent's behavior is fixed. This measures ATLAS's gates, isolation and recovery, not a model.
- **Evaluating a model:** `ATLAS_EVAL_RUNTIME=pi ATLAS_EVAL_MODEL=<provider/model>` with a provider key in the environment. Scripted-agent cases then exercise the model on the same repositories and oracles.
- **Comparing runs:** a new run is compared with the previous `latest.json` (or `ATLAS_EVAL_BASELINE`), using matched case ids and only when runtime and model are equal. Anything else is reported as not comparable.

Do not read these numbers as a comparison with other products.
