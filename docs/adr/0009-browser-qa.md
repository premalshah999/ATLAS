# ADR 0009 — Browser QA and application checks (M3)

Status: accepted · 2026-10-10 · spec §25, §27, §28, §37

- **Engine:** `playwright-core` (pinned 1.56.1) driving Chromium. Browsers are not bundled: ATLAS uses `ATLAS_CHROMIUM_PATH`, Playwright's installed build, or a system Chrome/Chromium. With none, browser checks are recorded as *inconclusive* (which fails a required gate), never skipped silently.
- **Configuration:** `atlas.config.json` in the repository (schema in `@atlas/contracts`): app start command and readiness path, API checks (status, body, latency), browser flows of structured steps (goto, click, fill, press, expectText/NoText/Url/Visible, screenshot, wait), extra check recipes. It is repository content and therefore untrusted: every command runs in the OS sandbox and the plan lists what will run.
- **App under test** runs in the sandbox **with network shared**, because the browser outside the sandbox must reach it (bubblewrap cannot expose a port from an unshared network namespace without privileges). Its filesystem isolation is unchanged; preflight states this explicitly.
- **Isolation:** one fresh, non-persistent browser context per flow or per agent attempt (no shared cookies/storage across projects or tasks); service workers and downloads blocked; top-level navigation outside the app's origin is aborted and recorded.
- **Evidence:** per flow a check with step results, a screenshot on failure (and on `screenshot` steps), a Playwright trace (zip artifact), console/page errors, failed requests and HTTP ≥400 responses. `failOnConsoleErrors` (default true) adds a required console check.
- **Agent use:** `browser_action` for the `browser_qa` (and `deployment_verifier`) role; the app is started from the task's worktree on first use and torn down with the attempt.
