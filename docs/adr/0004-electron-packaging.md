# ADR 0004 — Electron version, build and packaging

Status: accepted · 2026-10-10 · spec §6, E2, E6

- **Electron 44.1.1** (Node 24, Chromium 152). Supported line; ships `node:sqlite` in the utility process.
- **Build**: Vite for the renderer; esbuild bundles main (CJS), preload (CJS, sandbox-compatible) and the daemon (ESM). Pi stays external in `node_modules` because it loads WASM and provider assets at runtime.
- **Packaging: electron-builder** (rather than Electron Forge) for its single-config AppImage/NSIS/DMG targets. pnpm uses `node-linker=hoisted` so builder can collect production dependencies.
- **Supported OS for v0.1: Linux x64** is the one fully tested platform (CI runs e2e under `xvfb`). macOS and Windows build but are untested; signing and notarization are not configured.
- `app.enableSandbox()` is on unless `--no-sandbox` is passed explicitly (needed only for root CI containers). Renderer `sandbox: true` is set regardless.
