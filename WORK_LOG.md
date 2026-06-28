# WORK_LOG.md — [submodule-name]
<!-- PARSER: kingdom-vault-ingest -->
<!-- Last updated by: [Warden] -->

---

## Protocol Rules

> These rules are enforced by the `ingest-work-logs.ts` parser. Non-compliant files are silently skipped.

1. **One entry per work session, newest first** — prepend each new entry above the previous.
2. **Status emoji is mandatory** — the parser extracts it from the `**Status:**` line. Use exactly one of:
   - 🟢 `Stable` — system is healthy, no active work needed
   - 🟡 `In Progress` — active work underway this session
   - 🔴 `Blocked` — work cannot proceed, a blocker must be cleared
   - ⚫ `Inactive` — submodule is dormant, no current task
3. **The `<!-- PARSER: kingdom-vault-ingest -->` marker must be present** on line 3 or the file is ignored entirely.
4. **Wardens write an entry at the end of every session** that touches this submodule — no session leaves without a log.
5. **Keep entries under 100 words total** — the Firestore `lastOutput` field truncates at 500 chars.
6. **Date header format is strict:** `## YYYY-MM-DD` — the parser uses this as `logDate`.
7. **Active task format:** `TASK-[N] — [title]` — the number is used for cross-referencing.

---

## 2026-05-29

- **Status:** 🟡 In Progress
- **Active task:** TASK-017 — Kingdom Vault auth + live deployment
- **Warden:** Melody + Cerulia
- **Output:** Vault live at vault.ptolemy.live. Auth switched to popup (resolves redirect loop). Email Kingdom Status section deployed. Morning brief emails restored.
- **Next:** Verify auth works for Ryan, seed Firestore participants, wire real Firestore hooks to UI
- **Blockers:** `gcloud auth application-default login` needed to enable server-side Firestore scripts
