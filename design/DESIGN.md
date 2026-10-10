ATLAS is a mission-control environment for autonomous software engineering: an Electron desktop app where a person gives a goal, a team of agents executes it in isolated worktrees, and the interface proves — with evidence — what actually works. One principle governs every screen: **extreme complexity beneath an exceptionally controlled interface.** Idle, ATLAS is calm and nearly monochrome. Working, it comes alive only where work is happening. With six agents running, the person still feels in control.

There is no logo yet. Set the name in `Inter Display` 600, tracked `0.42em` uppercase at small sizes (the wordmark), preceded by a 7px `accent` square. Never draw a mark.

## Content fundamentals

**Voice.** Precise, calm, technically literal. Say what happened, to what, and with what evidence: “Regression test passed · refresh-reuse.spec · 1.8s”, not “Great news! Tests look good.” No exclamation marks, no emoji, no anthropomorphic filler (“I’m thinking…”).

**Casing.** Sentence case for everything a person reads: buttons (“Approve once”), titles (“Refactor authentication & ship to staging”), menu items. Uppercase only for section labels (`label` style), which name the data beneath them: “CONTEXT USAGE”, “NEEDS YOU”. IDs stay as written: `MSN-0142`, `T12`, `SEC-2`, `CP-9`, `a41f9c2`.

**Agents are named by function.** “Backend Engineer”, “Security Engineer”, “Atlas Orchestrator” — never personas, first names or characters. Their marks are two letters of that function (`BE`, `SE`, `OR`). The person is “You”.

**Address.** ATLAS speaks about agents in the third person and to the person as “you”: “Backend Engineer wants to run a database migration.” Agents speak in the first person only inside their own thread: “I’ll request approval instead.”

**Honesty rules — never break these.**
- A deploy command that exited 0 is not proof the app works. Say what was verified (“6 of 6 user flows and 18 of 18 API checks passed against the deployed URL”) and list what was **not verified**.
- Mocked, replayed or illustrative content carries a `SampleTag`: “sample output · not a live process”, “Sample replay · not a live session”.
- Show decision summaries and tool traces, never fabricated private reasoning. Label it: “Decision summaries and tool traces — not private model reasoning.”
- Approval prompts always state **who** (agent), **what** (the exact command, path or host), **where** (environment), **what it touches** (resources), **for how long** (once / 30 min / this mission) and **why approval is required**. Never “Allow access?”.
- Consequences are explicit: “Restoring a checkpoint won’t undo this. Database rows written by the migration stay.”

**Numbers.** Tabular figures for anything that updates. Units always: `412 ms`, `118k / 200k tokens`, `$3.18`, `1m 12s`. Times as `09:42:11` in mono. Diff stats as `+142 −38` with a true minus.

## Visual foundations

### Color

ATLAS is predominantly near-black until something deserves attention.

- **Grounds, deepest to highest:** `bg-void` (title bar, rail, status bar, terminal and code wells) → `bg-canvas` (every working panel) → `bg-surface` (objects: graph nodes, cards, popovers) → `bg-surface-2` (selected rows, segmented wells) → `bg-surface-3` (hover/pressed) → `bg-overlay` (palette, dialogs, menus).
- **Lines:** `line-hair` for every panel boundary and control border; `line-soft` inside a panel; `line-strong` for hover and the splitter while dragging. Separate with hairlines, not shadows or gaps.
- **Text:** `ink` primary, `ink-muted` secondary, `ink-subtle` metadata and labels. `ink-faint` is for non-text marks only (disabled glyphs, grid dots, connectors) — it fails 4.5:1.
- **Accent** `accent` (spectral periwinkle) is rare and means *selection, focus, the one primary action, live hand-offs*. At most one filled accent control per view. `accent-hi` for accent text and focus rings, `accent-lo` for pressed fills, `accent-wash` for selected rows, `accent-line` for selected borders. Text on an accent fill is `on-accent`.
- **Signals carry a glyph or a word, never color alone.** `success` (emerald) only for **verified** outcomes — a passing test, a healthy check — never “command finished”. `warning` (amber) for blocked, waiting on a person, degraded. `danger` (coral) for genuine failure. Each has a `-wash` for row backgrounds. Done-but-unverified work is neutral (`ink-muted` dot).
- **Human** (`human`, warm bone) marks what a person owns or controls: your terminal sessions, your comments, Take over, the takeover banner. It distinguishes human from agent without a second saturated hue.
- Code uses `syn-*`; diffs use `diff-add`/`diff-del` (+ `-strong` for gutter and intra-line); terminals map ANSI to `term-*`.
- No gradients except the 1px amber top hairline on an elevated-risk approval. No glow. No per-agent colors.

### Type

Inter for the interface, Inter Display for mission headings, DejaVu Sans Mono for code and terminals (Geist / Geist Mono are drop-in alternatives with identical sizes).

- `display-xl` (40/44) appears once: first launch. `display` (22/28) is a mission or report title — never inside a panel. `heading` (15/20) names an object: an agent, a dialog, a page.
- `body` (13/20) is the default; `body-strong` for row subjects; `small` (12/18) for secondary lines; `caption` (11/16) for chips and counts; `body-lg` (14/22) for the composer and objectives.
- `label` (10.5/14, 600, +0.07em, uppercase, `ink-subtle`) heads every panel and section. A label names the data below it or it’s cut.
- `code` (12/19) for code, diffs and terminals; `mono-sm` (11/16) for times, hashes and paths inline; `mono-label` for IDs used as labels.
- Hierarchy comes from weight, tracking and spacing — not size. The working interface has no heading above 22px.

### Spacing, size & density

A 4px grid: `space-4` is the unit; `space-8` between related controls; `space-12` horizontal padding of rows and panel heads; `space-16` inside the inspector and dialogs; `space-20` canvas gutters; `space-24` between groups. Built for eight hours a day at 1440 × 900: controls are `size-control` 28px (compact `size-control-sm` 22px), every panel head is `size-panel-header` 36px, list rows 28–36px.

Shell: `size-titlebar` 40, `size-rail` 52 (expands to `size-sidebar` 232), `size-inspector` 320, `size-statusbar` 26.

### Surfaces, borders, radii, shadows

Dark matte surfaces with deliberate boundaries. Radii are minimal and fixed by role: `radius-xs` 2 (badges, marks, chips), `radius-sm` 4 (buttons, inputs, nodes), `radius-md` 6 (cards, popovers, toasts), `radius-lg` 8 (palette and dialogs only). Never round a panel.

Shadows are calibrated, not decorative: `shadow-raise` is a lit top edge for buttons and nodes; `shadow-pop` lifts menus, tooltips and toasts; `shadow-overlay` lifts the palette and dialogs above a 56% scrim. No backdrop blur and no glassmorphism.

### Motion

Motion communicates state; if it means nothing, remove it.

- Durations: 120ms small control feedback; 160ms hovers, tabs, chips; 220ms panels, drawers, sidebar, inspector; 280ms overlays entering. Exits are faster (160ms, ease-in).
- Easing: `cubic-bezier(.2,0,0,1)` standard; `cubic-bezier(.16,1,.3,1)` for entrances; overlays enter on a tuned spring (one ~4% overshoot) via `linear()`.
- What moves: the three-bar activity meter while an agent executes; packets along a graph edge only for a hand-off running now; new timeline events sliding 6px in; a single emerald flash on a verified milestone; the agent cursor gliding between targets. Pausing freezes all of it.
- What never moves: idle agents, background gradients, bouncing, spinning loaders over whole panels, parallax.
- `prefers-reduced-motion` (or Settings → Reduce motion, `data-motion="reduced"`) sets every duration to 0 and freezes meters and edge packets in a static state.

### States

Hover lifts a surface one step (`bg-surface` → `bg-surface-2`) or a border to `line-strong`. Pressed translates 0.5px. Selected uses `accent-wash` plus a 2px `accent` bar on the leading edge (rows, rail) or `accent-line` border with a 3px halo (nodes). Focus is a solid 1px `accent-hi` ring with 1px offset — ≥3:1 on every surface. Disabled is 45% opacity and no pointer events.

### Layout

The shell: integrated title bar (native window controls at left on macOS, right on Windows/Linux; workspace, branch, active mission with task meter, command palette trigger, environment, model, inspector toggle, notifications, Pause all, Stop) → slender rail (Home, Workspaces, Missions, Agents, Reviews, Deployments, Activity · Terminal, Browser & desktop · Settings) that expands into a contextual sidebar → adaptive canvas → collapsible context inspector → status bar (runtime, sample-data flag, agent summary that opens the activity drawer, checkpoint, tokens, spend, elapsed).

Design at 1440 × 900. Below 1300px wide the inspector overlays instead of docking and starts closed; below 1320 the title bar drops the owner and model chips, below 1180 the branch chip; canvases under 1060px drop mission stats and narrow side panels. The layout holds to 1024 × 680. Split sizes persist per workspace.

## Iconography

Lucide, used selectively, at 14px (12 in chips, 16 in the rail) with a 1.75 stroke, colored by the text token they sit beside. Icons label actions and event kinds; they never decorate headings or replace words for consequential actions. No emoji anywhere. Agent identity is typographic (RoleMark), not an icon.

## Components

Primitives: `Button`, `IconButton`, `Kbd`, `Badge` (+ `SampleTag`), `Status`, `RoleMark`, `Tabs`, `Seg`, `Input`, `Select`, `Menu`, `Toggle`, `Check`, `Meter`, `ContextMeter`, `Tip`, `PanelHead`, `Section`, `KV`, `Split`, `EmptyState`, `Skeleton`, error and callout classes.

Domain components: `AgentNode` and `AgentGraph` (workforce), `TaskGraph` (task lanes, pan/zoom, critical path), `Timeline`, `Pipeline` and `VerificationRow`, `ApprovalCard` and `ApprovalDialog`, `CodeBlock`, `DiffView`, `TerminalView` and `TermTabs`, `Composer`, `CommandPalette`, `Toasts`.

`Atlas.renderApp(el, init)` mounts the full interactive prototype; `init` sets the starting screen and overlays (`{ screen: 'mission', palette: true }`). Every screen card in this system is that prototype.

## Screens

Welcome / first launch · Workspace home · Mission creation · **Mission Control** · Agent detail · Multi-agent task graph · Terminal workspace · Code review · Browser & desktop control (and takeover) · Deployment verification studio · Agent Studio · Settings & models · Mission completion report — plus command palette, approval dialog, failure recovery, notifications, agent activity drawer, checkpoint history and the expanded sidebar.

## Implementation

Target stack: Electron + React + TypeScript + Vite. Build visual components against typed contracts (`Agent`, `Task`, `TimelineEvent`, `Approval`, `TerminalSession`, `PipelineStage`, `ReviewFinding`) and keep privileged execution in the main process behind IPC; the renderer never runs commands. Render terminals with xterm.js themed from `term-*` and `bg-void`; code inspection with Monaco themed from `syn-*` and `diff-*`; tokens map 1:1 to CSS custom properties (Tailwind can consume them as theme colors). Drive motion from the durations above. Until real services exist, mock adapters must label their output as sample data.
