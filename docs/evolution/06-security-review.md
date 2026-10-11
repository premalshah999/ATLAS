# 06 — Security review

Scope: the changes made during this evolution, and the trust boundaries they touch. Method: threat-driven probes, then an independent adversarial review per slice. Three reviewer subagents ran with no write access; their findings and our responses are in [04](04-implementation-log.md). Everything marked "verified" names a test.

## Trust boundaries

| Boundary | Control | Verified by |
|---|---|---|
| Agent → host | Every command goes through ToolGate → policy → executor, inside an OS sandbox (bwrap / Seatbelt / AppContainer) | `sandbox.test.ts` (unit + integration): canary credential, writes outside root, network off |
| Agent → verdict | The verification definition comes from the approved base. Modified tests run the base suite. Approval is hash-bound and is never evidence | `mission.test.ts` › verification cannot be redefined (incl. 6 review bypasses) |
| Agent → approvals | Argument-level classification. Path-qualified programs are never safe. Unsandboxed project code always asks | policy unit tables; `sandbox.test.ts` (integration) approve/deny |
| Renderer → daemon | Frozen 6-key bridge; zod-validated IPC; sender check | `security.spec.ts` (e2e) |
| Evidence at rest → another installation | SHA-256 per artifact, trailer hash over the export; artifacts that fail their checksum are refused on import. **Tamper-evidence only, not authenticity:** the hashes are unkeyed, so someone who controls the export file can rewrite it and recompute every hash (final audit, reproduced). Verifying who produced an export needs signing with a key the importer trusts, which is not built | `archive.test.ts`, `faults.test.ts` |
| Daemon restart → leftover processes | Process journal with OS identity; reaper runs only when the identity matches; single daemon per data directory | `orphans.test.ts`, `reap.test.ts` |
| Mission cleanup → user's data | Preserve before remove; retain what cannot be preserved; never prune the user's worktrees | `workspace.test.ts`, `mission.test.ts` |

## Findings fixed in this evolution (security-relevant)

| # | Severity | Finding | Fix |
|---|---|---|---|
| S1 | High | **The agent could redefine its own verification**: rewrite a test script or config, gut or skip tests, track `node_modules/.bin/node`, or swap the package manager. The result was "Verified" with no approval | P0-3 |
| S2 | High | **Safe-listed programs ran other programs.** Examples: `git -c`, `find -exec`, `rg --pre`, `sort --compress-program`, `npm exec`, `node --require`. The final audit also reproduced unambiguous **abbreviations** of these options (`sort --compress-p=`, `git grep --open-files=`) | P1-1; any long option that is a prefix of a dangerous name is privileged |
| S3 | High | **Unsandboxed mode ran project code with no consent**, through agent commands, release checks, the original-suite run, and browser app starts | P1-2 and its review fix (`unsandboxed_run` consent per context) |
| S4 | High | **Path-qualified programs were classified by basename.** `tools\ls.cmd` and `script/test` ran agent-written code as "safe" | Paths are never safe-listed |
| S5 | Medium | Package-manager "read-only" subcommands load project code (yarnPath, plugins, `.pnpmfile.cjs`) | All package-manager subcommands count as project code |
| S6 | High | **Integrity laundering.** Evidence tampered on disk was re-hashed on export and imported elsewhere as intact | Import refuses records whose checksum failed before export (Phase 8) |
| S7 | Medium | macOS Seatbelt allowed reads and writes anywhere in `$TMPDIR` (other missions, canaries) | Deny-by-location profile; private scratch per command |
| S8 | Medium | A second app instance would reap the first instance's live processes | Data-directory lock and Electron single-instance lock |
| S9 | Medium | `git worktree prune` on the user's repository dropped the metadata of their own worktrees | Only ATLAS's own admin entry is removed |

## Open risks (not fixed; stated plainly)

| Risk | Severity | Why it is open | Mitigation today |
|---|---|---|---|
| **Windows sandbox not working end to end.** The npm shim is denied inside the AppContainer, so missions on Windows cannot verify | High (functional) | Diagnosis in progress on CI | Fails closed: checks report a failure, never a pass |
| Windows: a sandboxed child outlives a daemon crash (the helper does not watch its parent); unsandboxed Windows commands have no Job Object | Medium | Not yet implemented | Kill-on-close job while the helper lives |
| macOS operator terminal can open `/dev/ttys*` (needed for the PTY) | Low | Seatbelt cannot express "only the pty I allocated" | Only for operator-driven terminal sessions; agent commands cannot |
| Desktop app launch checks only that a command is classifiable, not the per-command ask (review P1 finding 10) | Low | Covered by a session-level approval that states "unsandboxed" | Session approval |
| Exports are not signed (see trust boundaries): a forged export with recomputed hashes imports as intact | Medium | Needs a key-trust design (whose key, how distributed) | Treat imported archives as read-only records of a claim, not as proof |
| Ignored files (e.g. `.env`) are not in preserve snapshots | Low | Snapshotting ignored files would capture `node_modules` and secrets | Documented |
| Redaction runs per output chunk; a secret split across chunks can pass | Low | Pre-existing | Env allowlist keeps credentials out of the sandbox in the first place |
| A brand-new weak test on new code cannot be told apart from a good one | Inherent | The eval keeps a deliberate `weak-tests` case: false passes 1/7 | Review stage; shown as a limitation in the eval report |

## Dependency audit (run 2026-10-11, this container)

- `pnpm audit --prod` (what ships in the app): **no known vulnerabilities**.
- `pnpm audit` (including dev and build tools): **30 advisories** (1 low, 11 moderate, 13 high, 5 critical). All of them are in development or packaging tools, none of which ship:

| Packages | Notes |
|---|---|
| `vitest` 2.1.8, `tinypool`, `@vitest/mocker` | The RCE and file-read paths need the Vitest UI/API server, which this repo never starts (`vitest run` only) |
| `vite` 5.4.21, `esbuild` | Dev-server issues; the renderer is a static build |
| `electron-builder` 25.1.8 → `tar`, `app-builder-lib`, `builder-util-runtime` | Packaging only. The `electron-updater` advisories do not apply: the app has no auto-updater |
| `typescript-eslint` → `braces`, `eslint` → `@eslint/plugin-kit` | Lint-time ReDoS |

**Recommendation (not done here):** upgrade vitest to ≥ 4.1.11 and electron-builder to ≥ 26.15 as a separate, reviewed change. Both are major upgrades with config and lockfile churn, so they should not ride along with unrelated slices.

## Reference-repository handling

The three competitor repositories were read as source only, at pinned commits, in subagents:
- no install;
- no execution of their scripts;
- no credentials passed.

No code was copied. The concepts adopted (journal with identity, preserve before remove, attach after subscribe, hash-bound acknowledgment) were implemented independently, and attribution is in [01](01-competitor-matrix.md) and in code comments where a concept is used.
