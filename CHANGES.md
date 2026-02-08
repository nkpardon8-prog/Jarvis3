# CHANGES.md — Running Context Log

This file is a living record of every change made to the Jarvis codebase. Agents MUST append to this file after every commit. Both contributors and their agents should read this before starting work to understand recent context.

---

## 2026-02-07 — Fix effectivePayload merge losing message content from gateway events

**Author:** Omid (via Claude Code)
**Commit:** Fix effectivePayload merge losing message content from gateway events
**Branch:** main

**What changed:**
- **Root cause fix in `connection.ts`**: Changed `effectivePayload` construction from either/or logic (`event.payload` OR root-level fields) to always-merge logic (`{ ...rootFields, ...event.payload }`). Gateway was putting framing fields (state, runId, sessionKey) in `event.payload` and message content at the event root level — the old logic chose `event.payload` (since it had keys) and discarded root-level content entirely.
- **Diagnostic logging in `chat.ts`**: Added raw payload dump on empty final messages, payload key logging on chat/agent events, to trace content location in future issues.

**Why:**
- Server logs showed `[Chat] Final message: (empty)` on every response. The `state=final` and `runId` were reaching the handler correctly, but `extractMessageText` found nothing because the actual message content (likely `message.content` at event root) was discarded by the `effectivePayload` branch logic. The fix ensures both sources are always merged.

**Files touched:**
- `server/src/gateway/connection.ts` — effectivePayload always-merge fix
- `server/src/socket/chat.ts` — diagnostic logging for payload shape debugging

---

## 2026-02-07 — Fix chat regression: harden content extraction, reconciliation, and recovery

**Author:** Omid (via Claude Code)
**Commit:** Fix chat regression: harden content extraction, reconciliation, and recovery
**Branch:** main

**What changed:**
- **Server `extractText`**: Broadened from `type === "text"` only to accept `output_text`, `markdown`, `code`, `result` block types, plus any block with a `text` or `value` string field
- **Server `extractMessageText`**: Added fallback checks for `output`, `delta`, and raw `message` object extraction
- **Server system event handling**: Added `gateway.onEvent("system", ...)` to detect GatewayRestart events and clear stale `activeRuns` + emit idle status so clients recover
- **Server reconnect cleanup**: Added `gateway.on("connected", ...)` to clear `activeRuns` Set when gateway reconnects (stale run IDs from before restart would block the RPC fallback path)
- **Client `extractTextContent`**: Broadened to match server — accepts any block with `text` or `value`, plus `value` and `delta` on objects
- **Client `normalizeHistory`**: Added `tool_use` and `tool_result` role filtering
- **Client poll reconciliation**: Changed from assistant-count-only gating to ID-based comparison (`hasNewMessages = normalized.some(m => !localIds.has(m.id))`) plus assistant count as secondary signal
- **Client safety timeout**: Added 30-second safety timer on every send. If still awaiting after timeout, forces immediate history sync. Cleared on response/abort/error.

**Why:**
- Assistant responses were appearing in OpenClaw but not rendering in Jarvis. Root causes: (1) content extraction missed non-`text` block types from gateway, (2) poll reconciliation only triggered on assistant count deltas — if counts matched but IDs differed (e.g., after gateway restart), no reconciliation occurred, (3) `activeRuns` Set retained stale IDs after gateway restart, blocking the RPC fallback path, (4) no recovery mechanism when events were lost during GatewayRestart.

**Files touched:**
- `server/src/socket/chat.ts` — broadened extractText/extractMessageText, added system event handler, added reconnect cleanup
- `client/lib/hooks/useChat.ts` — broadened extractTextContent, ID-based poll reconciliation, safety timeout, tool role filtering

---

## 2026-02-08 — Update CLAUDE.md for per-user OAuth architecture

**Author:** Omid (via Claude Code)
**Commit:** Update CLAUDE.md to reflect per-user OAuth, Drive API, encrypted credentials
**Branch:** oz/per-user-oauth

**What changed:**
- Updated Core Architecture Principle to clarify gateway vs local DB split (AI ops → gateway, user data → Prisma)
- Updated architecture tree: added `drive.ts` route, `crypto.service.ts` in services
- Replaced "OAuth hydration" references with per-user OAuth credential resolution
- Updated credential storage docs: OAuth credentials now per-user in Prisma (encrypted), not gateway config
- Removed `config.jarvis.oauth.<provider>` from gateway namespace conventions
- Added `OAuthCredential` to Database models section
- Rewrote OAuth Flow section for per-user model with credential resolution precedence and disconnect vs remove
- Added `/api/drive` to API Route Map
- Updated Environment Variables: added `OAUTH_CREDENTIALS_ENCRYPTION_KEY` and `OAUTH_BASE_URL`, marked legacy OAuth env vars as deprecated
- Updated Gotchas: per-user OAuth, encrypted secrets, legacy plaintext token handling, OAuth callback URL

**Why:**
- CLAUDE.md must stay in sync with architectural changes so future agents understand the current credential model

**Files touched:**
- `CLAUDE.md`

---

## 2026-02-08 — Harden per-user OAuth: prod exit, legacy token compat, UX fix

**Author:** Omid (via Claude Code)
**Commit:** Harden per-user OAuth: prod exit, legacy plaintext token fallback, remove-creds UX
**Branch:** oz/per-user-oauth

**What changed:**
- `index.ts`: `process.exit(1)` when `OAUTH_CREDENTIALS_ENCRYPTION_KEY` is missing in production (was logging "FATAL" but continuing)
- `oauth.service.ts`: wrapped `decrypt()` calls in `refreshGoogleToken` and `refreshMicrosoftToken` with try/catch — if token is legacy plaintext, uses it as-is and re-encrypts on the next successful refresh
- `OAuthAccountCard.tsx`: added "Remove Credentials" (trash icon button) in the configured-but-disconnected state, so users can fully reconfigure without connecting first

**Why:**
- Logging "FATAL" without exiting is misleading — server would start and then crash on first OAuth operation
- Pre-existing plaintext refresh tokens would crash `decrypt()` and break token refresh for anyone upgrading
- Users in "configured but disconnected" state had no way to remove credentials without connecting first

**Files touched:**
- `server/src/index.ts` — added `process.exit(1)` for missing encryption key in production
- `server/src/services/oauth.service.ts` — added try/catch around `decrypt()` in both refresh functions
- `client/components/connections/OAuthAccountCard.tsx` — added remove-credentials button in disconnected state

---

## 2026-02-08 — Per-user Google OAuth + Google Drive/Docs surface

**Author:** Omid (via Claude Code)
**Commit:** Per-user OAuth credentials, encrypted storage, Drive/Docs API, auth hardening
**Branch:** oz/per-user-oauth

**What changed:**
- Added `OAuthCredential` Prisma model with `@@unique([userId, provider])` for per-user OAuth client credential storage (clientSecret encrypted via AES-256-GCM)
- Created `server/src/services/crypto.service.ts` — AES-256-GCM encrypt/decrypt using dedicated `OAUTH_CREDENTIALS_ENCRYPTION_KEY` env var (falls back to JWT_SECRET derivation in dev with warning)
- Removed hardcoded fallback user from `authMiddleware` — now returns proper 401 instead of auto-assigning a fake user
- Refactored `oauth.service.ts` with per-user credential resolution: DB credentials → legacy env var fallback (deprecated). All Google/Microsoft functions now async-resolve per-user credentials.
- Added `getGoogleApiClient(userId)` — returns configured OAuth2 client with valid access token, used by email/calendar/drive routes
- Encrypted refresh tokens: all `OAuthToken.refreshToken` values now stored encrypted, decrypted on read
- Added proper Google token revocation via `https://oauth2.googleapis.com/revoke` endpoint before DB deletion
- Added `storeUserOAuthCredentials()`, `deleteUserOAuthCredentials()` for per-user credential CRUD
- Replaced gateway `patchConfig()` in OAuth routes with Prisma DB storage — OAuth credentials no longer stored in gateway config
- Added `?deleteCredentials=true` query param to `POST /disconnect/:provider` for full credential removal
- Updated `email.ts` and `calendar.ts` to use `getGoogleApiClient(userId)` instead of `new google.auth.OAuth2(config.googleClientId, ...)`
- Created `server/src/routes/drive.ts` with 3 endpoints: `GET /api/drive/files` (list/filter), `GET /api/drive/search` (full-text), `GET /api/drive/docs/:docId` (read Google Doc content)
- Added `oauthBaseUrl` and `oauthEncryptionKey` to `server/src/config.ts`
- Removed OAuth hydration from gateway `connected` handler in `index.ts`; added startup validation warnings
- Updated `OAuthAccountCard.tsx` with "Remove Credentials" button alongside "Disconnect" — disconnect keeps credentials for easy reconnect, remove deletes everything

**Why:**
- OAuth credentials were stored globally in the gateway config — all users shared one OAuth app, breaking multi-user isolation. Per-user DB storage with encryption fixes this.
- The hardcoded fallback user in auth middleware was a security hole that bypassed authentication entirely.
- Refresh tokens were stored in plaintext in the database.
- Google Drive/Docs scopes were requested but no API endpoints existed to use them.
- `revokeToken()` just deleted from DB without calling Google's actual revocation endpoint.

**Files touched:**
- `server/prisma/schema.prisma` — added `OAuthCredential` model + relation on `User`
- `server/src/services/crypto.service.ts` — **new** — AES-256-GCM encrypt/decrypt
- `server/src/middleware/auth.ts` — removed hardcoded fallback user, returns 401
- `server/src/services/oauth.service.ts` — major refactor: per-user credential resolution, encrypted tokens, Google revocation, `getGoogleApiClient()`
- `server/src/routes/oauth.ts` — replaced gateway patchConfig with Prisma storage, added `deleteCredentials` param
- `server/src/routes/email.ts` — uses `getGoogleApiClient(userId)` instead of global config
- `server/src/routes/calendar.ts` — uses `getGoogleApiClient(userId)` instead of global config
- `server/src/routes/drive.ts` — **new** — Google Drive file list/search + Google Docs read
- `server/src/config.ts` — added `oauthBaseUrl`, `oauthEncryptionKey`
- `server/src/index.ts` — mounted drive routes, removed OAuth hydration, added startup checks
- `client/components/connections/OAuthAccountCard.tsx` — added "Remove Credentials" button

---

## 2026-02-07 — Add stage-based progress messages to chat thinking indicator

**Author:** Omid (via Claude Code)
**Commit:** Add stage-based progress messages to chat thinking indicator
**Branch:** main

**What changed:**
- Added `ActionContext` type and `consumeActionContext()` to `skill-prompts.ts` — stores/retrieves action context alongside auto-prompt in sessionStorage
- Updated all `storeAutoPrompt` callers to pass action context: `"add-premade-skill"`, `"enable-inactive-skill"`, `"build-custom-skill"` (InstalledSkillCard, PremadeSkillsBrowser, SkillsPage)
- `useChat.ts`: consumes action context on auto-prompt, exposes `actionContext` state, clears it in `markResponseReceived()`
- Wired `actionContext` through ChatContainer → ChatMessages → ThinkingIndicator
- Rewrote ThinkingIndicator: replaced 1.5s rotating generic messages with 8-second stage-based progress messages keyed by `actionContext` (6 context types with 7-14 stages each). Holds final message on long waits. Uses `animKey` for smooth fade+slide transitions on stage change.
- Added `thinking-stage-fade` CSS animation (0.5s ease-out fade+translateY) with `prefers-reduced-motion` support

**Why:**
- Long-running operations (30s–2min) like skill installs had generic "Checking context" / "Composing answer" messages that didn't reflect what was actually happening. Stage-based messages make the wait feel trustworthy and informative.

**Files touched:**
- `client/lib/skill-prompts.ts` — added `ActionContext` type, `consumeActionContext()`, updated `storeAutoPrompt` signature
- `client/lib/hooks/useChat.ts` — added `actionContext` state, consume/expose/clear
- `client/components/chat/ThinkingIndicator.tsx` — rewritten with stage-based messages
- `client/components/chat/ChatContainer.tsx` — pass `actionContext` through
- `client/components/chat/ChatMessages.tsx` — accept and forward `actionContext` prop
- `client/components/skills/InstalledSkillCard.tsx` — pass `"enable-inactive-skill"` context
- `client/components/skills/PremadeSkillsBrowser.tsx` — pass `"build-custom-skill"` and `"add-premade-skill"` contexts
- `client/components/skills/SkillsPage.tsx` — pass `"build-custom-skill"` context
- `client/app/globals.css` — added `thinking-stage-fade` animation

---

## 2026-02-07 — Strengthen CLAUDE.md commit and change-tracking rules

**Author:** Omid (via Claude Code)
**Commit:** Strengthen CLAUDE.md commit and change-tracking rules
**Branch:** main

**What changed:**
- Rewrote the "Committing" section in CLAUDE.md to enforce a strict 5-step sequence where updating and staging `CHANGES.md` is step 3 — before `git commit` runs, not after
- Upgraded "Change Tracking" heading from `(MANDATORY)` to `(MANDATORY — ZERO TOLERANCE)` with a pre-commit checklist (checkbox format) that agents must verify before every commit
- Changed rule #2 from "append an entry after every commit" to "write the entry BEFORE running `git commit` and stage it with the other files"
- Added step 5 to Session Start Checklist: "Read `CHANGES.md`" before writing any code
- Added critical warning: forgetting CHANGES.md is an error that must be fixed immediately

**Why:**
- The previous wording said "append after every commit" which allowed agents to forget — the entry was a follow-up rather than part of the commit itself. This caused a missed CHANGES.md entry in commit d4a6308. The new wording makes it impossible to skip because the entry must be staged before `git commit` runs.

**Files touched:**
- `CLAUDE.md` — rewrote Committing section, Change Tracking section, Session Start Checklist
- `CHANGES.md` — this entry

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
