# ATLAS

Mission control for autonomous software engineering. You give ATLAS a goal; a team of agents carries it out in isolated git worktrees; the interface shows, with evidence, what actually works.

ATLAS is an Electron desktop app built with React, TypeScript and Vite. The interface follows the ATLAS design system (`design/`).

## Getting started

```bash
npm install
npm run dev        # Vite dev server + Electron window with hot reload
npm run dev:web    # renderer only, in a browser at http://localhost:5173 (sample data)
npm run build      # typecheck, build the renderer to dist/, compile electron/ to dist-electron/
npm start          # run the built app
npm run dist       # package installers into release/ with electron-builder
```

Requires Node 20 or later.

## Layout

```
electron/            main process and preload: privileged work behind IPC
  main.ts            window, native title bar, folder picker, git status
  preload.ts         window.atlas bridge (the renderer's only way out)
src/renderer/
  main.tsx           entry point
  shell/             title bar, rail, inspector, status bar, drawers
  screens/           Welcome, Home, Workspaces, Mission creation, Mission Control,
                     Agent detail, Task graph, Terminal, Review, Browser & desktop,
                     Deployments, Agent Studio, Settings, Report, Activity
  ui/                primitives and domain components (graph, timeline, diff, terminal, approvals…)
  lib/               store, runtime bridge, workspace actions, icons
  data/              typed contracts (types.ts) and the sample mission (sample.ts)
  styles/            tokens.css (from design/tokens.json) and component styles
design/              design tokens and the design-system brand book
```

## What is real and what is sample

- **Real:** the desktop shell (native window controls, title bar drag region), opening a local repository (⌘O / *Open repository…*) and reading its branch, HEAD, changed files and upstream ahead/behind through the main process.
- **Sample:** missions, agents, terminals, approvals, reviews and deployments come from `src/renderer/data/sample.ts`. Every such surface is labelled as sample data in the UI; that is a rule of the design system, not a placeholder.

The renderer never runs commands. New capabilities (agent runtime, PTY terminals, model providers) belong in `electron/main.ts` behind an `ipcMain.handle` channel, exposed through `electron/preload.ts`, and consumed through `src/renderer/lib/runtime.ts`. Runtime adapters produce the shapes in `src/renderer/data/types.ts`.

## Keyboard

| Keys | Action |
| --- | --- |
| ⌘/Ctrl K | Command palette |
| ⌘/Ctrl O | Open repository |
| ⌘/Ctrl 1–5 | Home, Missions, Agents, Reviews, Deployments |
| ⌘/Ctrl J | Activity drawer |
| ⌘/Ctrl \\ | Sidebar |
| ⌘/Ctrl ⌥ I | Inspector |
| ⌘/Ctrl , | Settings |
| Ctrl \` | Terminal |
