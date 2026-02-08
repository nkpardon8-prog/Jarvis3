# CHANGES.md — Running Context Log

This file is a living record of every change made to the Jarvis codebase. Agents MUST append to this file after every commit. Both contributors and their agents should read this before starting work to understand recent context.

---

## 2026-02-07 — Overhaul chat UX, skills UI, thinking indicator, and model selector

**Author:** Omid (via Claude Code)
**Commit:** d4a6308 — Overhaul chat UX, skills UI, thinking indicator, and model selector
**Branch:** main

**What changed:**
- **Chat UX/state flow**: Rewrote `useChat.ts` with ID-based message dedup (replacing fragile content-prefix fingerprinting), poll reconciliation that replaces local state when history diverges, and explicit `awaitingResponse` state that only clears on actual message arrival/abort/error (not on `chat:status idle`)
- **Thinking indicator**: Replaced bouncing dots with animated processing card — rotating status messages, dual spinning rings, shimmer sweep, elapsed timer, 80ms show delay, `prefers-reduced-motion` support
- **Skills UI**: Replaced toggle switch with red "Disable" button for active skills, removed "Missing requirements" expandable section, added URL-paste premade skill install flow (browse ClawHub externally → paste URL → guided install via chat agent)
- **Model selector**: "Change model" link on Home now navigates to Connections with `?focus=active-model`, auto-scrolls to Active Model section with cyan glow pulse animation. Fixed model dropdown transparency with solid `bg-hud-bg` background
- **Skills backend**: Normalized `GET /api/skills` to compute `status` field (active/inactive) and `counts` object. Added `POST /api/skills/resolve-url` for ClawHub URL→slug resolution. Added `POST /api/skills/:key/credentials` for secure credential storage via `config.patch`
- **Dashboard**: Added pre-computed `skillsCounts` to dashboard response for accurate widget display
- **Gateway**: Fixed event payload extraction in `connection.ts` when `event.payload` is empty. Added diagnostic logging to `socket/chat.ts`

**Why:**
- Chat responses weren't appearing live — `isThinking` was driven by socket status events that fired before the actual message arrived, and content-based dedup was silently dropping legitimate messages
- Skills UI showed inflated active counts and had no visibility into blocked/inactive state
- Model dropdown was see-through due to glass panel transparency layering
- Premade skill search was broken — replaced with deterministic URL-paste workflow

**Files touched:**
- `client/lib/hooks/useChat.ts` — full rewrite (dedup, polling, awaitingResponse)
- `client/components/chat/ChatContainer.tsx` — wire awaitingResponse
- `client/components/chat/ChatMessages.tsx` — replace isThinking with awaitingResponse
- `client/components/chat/ThinkingIndicator.tsx` — new animated indicator
- `client/app/globals.css` — thinking animations + focus-highlight animation
- `client/components/connections/ConnectionsPage.tsx` — scroll-to-focus + dropdown fix
- `client/components/home/ActiveModel.tsx` — link with focus query param
- `client/components/skills/InstalledSkillCard.tsx` — Disable button, remove missing reqs
- `client/components/skills/SkillsPage.tsx` — status filters, server counts
- `client/components/skills/PremadeSkillsBrowser.tsx` — new (URL-paste install)
- `client/components/ui/HudToggle.tsx` — new toggle component
- `client/lib/skill-prompts.ts` — new (auto-prompt helpers)
- `client/components/home/HomeDashboard.tsx` — updated props
- `client/components/home/SkillsSummary.tsx` — accurate counts
- `client/components/email/EmailPage.tsx` — minor updates
- `server/src/routes/skills.ts` — normalize response, credentials endpoint, resolve-url
- `server/src/routes/dashboard.ts` — skillsCounts in response
- `server/src/gateway/connection.ts` — event payload extraction fix
- `server/src/socket/chat.ts` — diagnostic logging

---

## 2026-02-07 — Git Collaboration Rules + Change Tracking

**Author:** Omid (via Claude Code)
**Commit:** 078765b — Add git collaboration rules and change tracking for 2-person workflow
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
