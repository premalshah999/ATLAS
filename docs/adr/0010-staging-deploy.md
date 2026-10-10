# ADR 0010 — Staging deployment, verification and rollback (M4)

Status: accepted · 2026-10-10 · spec §30–32, §24, §40

## Decision
Deployment is a **deterministic release stage**, not an agent capability: no agent role holds `deploy.staging` (agents get only `inspect_logs`). The stage runs after build/test, review and application checks, only for missions whose operator chose a target environment.

- **Providers** (`DeploymentProvider` in `@atlas/deploy`):
  - `local` — the integrated commit is exported (`git archive`) to an ATLAS-managed release directory and started in the OS sandbox on a free port with `ATLAS_REVISION` set. Live local deployments are restarted when the daemon restarts.
  - `command` — the project's deploy CLI runs in the sandbox (network granted) inside the release directory; the target's secrets are injected only into this process (and its logs/rollback commands); the URL and external id are parsed from its output.
  - No production provider exists. `deploy.production` is denied for everyone.
- **Gates before deploying:** target defined in `atlas.config.json`; target on the operator's allowlist (Settings); a single-use operator approval per deployment. The deployment row is written (`deploying`) before the provider is called.
- **Staging verification** is independent of the provider's success: exact revision from `versionPath` (non-commit values are *unknown version* → inconclusive), readiness, synthetic traffic (error rate, p95 latency thresholds), the project's API checks and browser flows against the deployed URL, and an error-pattern scan of the logs. The results and their evidence are written to a manifest whose SHA-256 is recorded in the event log. The deployment is marked verified only if every required staging check passed.
- **Rollback:** on failed verification (setting `deploy.autoRollback`, default on) ATLAS rolls back to the last verified deployment of that target and re-reads the live revision; the result is recorded as an attempted action with its verified outcome. Operators can roll back to any earlier deployment.
- **Crash safety:** an interrupted deployment becomes `unknown` on restart and is never retried automatically; re-running the stage for the same commit reports it as inconclusive instead of deploying again.
- **Secrets:** stored per target with Electron `safeStorage` in main; only names reach the renderer; values reach the daemon at spawn/update, are registered with the redactor and are never written to events or artifacts.

## Not provided
Hosted-platform providers (Vercel, Fly, etc.) are reachable through the `command` provider with the platform's CLI; no platform-specific API client is bundled.
