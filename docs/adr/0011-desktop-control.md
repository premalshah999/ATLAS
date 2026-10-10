# ADR 0011 — Desktop control on a disposable virtual display (M5)

Status: accepted · 2026-10-10 · spec §26–27, §21–23

## Decision
Desktop control is implemented only on a **virtual display that ATLAS creates for one attempt** (Xvfb on Linux). The operator's own desktop is never controlled, captured or listed; there is no code path that targets an existing display.

- **Engine** (`@atlas/desktop-control`): Xvfb (`-nolisten tcp -noreset`) on a free display number. Input goes through `xdotool`, screenshots through ImageMagick `import -window root`. Coordinates are bounds-checked, typed text is limited per action, and key names are restricted to a small character set.
- **Who may act:** only the `desktop_operator` role holds `desktop.input`; it has no shell, writes or deploys. Holding the capability is not enough. A session starts only when:
  1. the operator has turned on **Settings → Desktop control** (`desktop.enabled`, default off); and
  2. the operator approves a **single-use approval for that session**, which names the environment ("virtual display, not your desktop") and whether apps can be launched.

  Declining or letting it expire ends desktop use for the attempt.
- **Controller lease:** exactly one of `agent`, `operator` (takeover), `paused` or `stopped` holds the display. The allowed transitions are takeover, release, pause, resume and stop. Input is checked against the holder before each action, and again between chunks of a long action (typing goes out 16 characters at a time; a click re-checks after moving the pointer). So a pause or takeover stops input mid-action, with at most the in-flight chunk delivered. Actions are serialized per display, so agent and operator input never interleave. Read-only actions (screenshot, window list, wait) keep working while paused.
- **Launching apps** runs the program through the policy classifier (denied programs never start), then inside the OS sandbox: worktree read-only, no network, only this display's X socket bound. Without a sandbox nothing is launched, unless the operator allowed unsandboxed execution.
- **Evidence and audit:** every agent input and every explicit screenshot stores a PNG artifact and a `desktop.action` event (typed text is recorded by length only). Session start, every takeover/release/pause/resume/stop and the end are `desktop.session` events with the actor who caused them. Operator input during takeover is recorded as operator actions.
- **Lifetime:** the display and launched apps are torn down when the attempt ends, when the operator stops the session, or when the daemon stops.

## Alternatives considered
- *Controlling the real desktop with OS accessibility APIs* was rejected: it cannot be isolated from the operator's own windows and credentials, and the manual's safety bar for it (§27) cannot be met with tests.
- *A VNC server plus noVNC* for the live view was rejected: it adds a network listener. The UI polls `desktop.frame` (a PNG through the existing IPC) instead.

## Not provided
macOS and Windows have no virtual-display backend; `desktopSupport()` reports desktop control as unavailable there and the tool fails closed.
