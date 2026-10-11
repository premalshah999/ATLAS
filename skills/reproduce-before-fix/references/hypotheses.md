# Discriminating experiments

| Suspected cause | Experiment that separates it from the others |
|---|---|
| Wrong input reaches the function | Log or assert the input at the boundary; compare with the caller's value |
| State left over from a previous call | Run the case alone, then after the suspected predecessor |
| Ordering / concurrency | Run with a fixed seed or serialized; compare |
| Environment (locale, timezone, path separators) | Pin the variable in the test and flip it |
| Dependency behavior changed | Read the lockfile diff; reproduce with the previous version pinned in a scratch dir |
| Off-by-one / boundary | Test n-1, n, n+1 around the boundary |

Record each experiment's command and result. An experiment that does not change your belief was not discriminating.
