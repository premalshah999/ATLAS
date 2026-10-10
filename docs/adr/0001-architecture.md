# ADR 0001 — Process architecture and package layout

Status: accepted · 2026-10-10 · spec §5–7, E1, E3

## Decision

Four processes:

1. **Electron main** — windows, OS dialogs, daemon supervision, IPC routing. Validates the sender frame and the payload (zod) of every request, then forwards the intent. It never runs commands.
2. **Preload** — exposes a frozen `window.atlas` with `invoke(method, params)`, `onEvent`, `onStatus`. `invoke` accepts only the methods declared in `@atlas/contracts` (`METHODS`); one IPC channel carries them, so undeclared channels have no handler.
3. **Renderer** — React + Vite, `sandbox: true`, `contextIsolation: true`, `nodeIntegration: false`, restrictive CSP. Reads materialized state from the daemon; never the source of truth.
4. **Daemon** — an Electron `utilityProcess` (a plain Node child in tests) that owns SQLite, the orchestrator, the runtimes and every executor. It re-validates every request. Main restarts it with backoff; on start it reconciles state (ADR 0003).

Packages are TypeScript sources consumed directly by Vite, Vitest and esbuild (no per-package build step). Dependency direction points at `@atlas/contracts`; `scripts/check-deps.mjs` fails CI on cycles or on packages importing UI/Electron.

## Deferred packages

The manual lists `browser`, `desktop-control`, `verification`, `deploy`, `events`, `ui` packages. M0/M1 does not scaffold them (§4: no aspirational services before the first vertical slice). Events live in `contracts` (types) and `storage` (log); verification recipes and the gate live in `orchestrator` until M3 needs a separate package.

## Alternatives

- Daemon as a separate long-lived OS service: survives app exit, but adds install/IPC-auth complexity. Rejected for v0.1.
- Running orchestration in main: simpler, but blocks the main thread and widens main's privileges (E4). Rejected.
