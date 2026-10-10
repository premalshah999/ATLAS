# ADR 0003 — Storage, events and recovery

Status: accepted · 2026-10-10 · spec §11–13, §38–40

- **SQLite via `node:sqlite`** (built into Node ≥ 22.5 and Electron 44's Node 24): WAL, foreign keys, forward-only migrations. No native module to rebuild for Electron. Large outputs (logs, patches, transcripts) are artifact files written to a temp name, fsynced, renamed, and checksummed (SHA-256); reads report tampering instead of returning bad data.
- **Append-only event log** with a per-mission monotonic `seq`. Every state transition emits an event in the same process; `replay()` reconstructs mission and task state and is checked against the database in tests. The renderer resumes with `events.since(lastSeq)`, so a restart never loses or duplicates history.
- **Redaction at write time**: event payloads and artifacts pass through `redact()` (known injected secrets + common token shapes) before they are stored.
- **Start intent before spawn**: an attempt row (`starting`) is written before a worktree or runtime exists.
- **Recovery** on daemon start: pending approvals expire (their waiters are gone); `starting`/`running` attempts become `lost`; their tasks restart as new attempts in fresh worktrees (resume vs restart: commands may not be idempotent, and a fresh worktree from the base commit cannot repeat side effects on the user's checkout); missions in `verifying` re-run read-only checks on the same commit.
