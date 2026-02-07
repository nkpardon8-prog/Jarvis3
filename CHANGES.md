# CHANGES.md — Running Context Log

This file is a living record of every change made to the Jarvis codebase. Agents MUST append to this file after every commit. Both contributors and their agents should read this before starting work to understand recent context.

---

## 2026-02-07 — Git Collaboration Rules + Change Tracking

**Author:** Omid (via Claude Code)
**Commit:** (pending)
**Branch:** main

**What changed:**
- Added `## Git Collaboration Rules (MANDATORY)` section to `CLAUDE.md` covering pull-before-work, feature branching, no force push, PR-only merges, conflict resolution, and session start checklist
- Created `CHANGES.md` (this file) as a running context log for all future changes
- Added `## Change Tracking (MANDATORY)` section to `CLAUDE.md` requiring agents to update this file after every commit

**Why:**
- Two contributors working simultaneously need guardrails to prevent overwrites
- Agents need a single place to read recent change context without digging through git log

**Files touched:**
- `CLAUDE.md` — added collaboration rules + change tracking rules
- `CHANGES.md` — created
