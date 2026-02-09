# CHANGES.md — Running Context Log

This file is a living record of every change made to the Jarvis codebase. Agents MUST append to this file after every commit. Both contributors and their agents should read this before starting work to understand recent context.

---

## 2026-02-09 — Rate limits, contact cache, background auto-tag, AI classification overhaul

**Author:** Omid (via Claude Code)
**Commit:** feat: adjustable rate limits, local contact cache, background auto-tag, improved AI classification
**Branch:** oz/email-restructure-automation

**What changed:**
- **Adjustable rate limits** — Added `rateLimitPerMin` and `rateLimitPerHour` to AutomationSettings Prisma model (defaults: 20/min, 200/hour). New PATCH endpoint to update limits without re-entering API key. Collapsible "Rate Limits" UI in AutomationAICard on Connections page. Service reads limits from DB per-user. Clamped to sane bounds (1–100/min, 1–1000/hour).
- **Local contact cache for letter-by-letter search** — Replaced per-keystroke Gmail API search with an in-memory contact cache per user. Cache scans up to 500 recent messages (From/To/Cc headers) on first search, refreshes every 10 minutes. Each keystroke filters locally with prefix-priority sorting (local part prefix > name prefix > full email prefix > substring position). Minimum 1 character, 150ms debounce.
- **Background auto-tag with live progress** — Re-tag All now fires-and-forget: server responds immediately, runs in background. New `GET /auto-tag/status` poll endpoint returns `{ status, processed, total }`. UI polls every 3 seconds with a progress bar and percentage. Tags update in real time (invalidates email-tags query on every poll tick). Message: "You can close this page — tagging continues in the background."
- **Tags don't disappear during retag** — Replaced `deleteMany` + `create` with `upsert` so existing tags stay visible and update in-place as each email is reprocessed.
- **Auto-tag processes all emails** — `retagAllEmails` calls `automationExec` with `skipRateLimit: true` so background jobs aren't blocked by per-minute caps.
- **Improved AI classification** — Added system prompt support to all three providers (OpenAI, Anthropic, Google). Email classifier now gets a dedicated system prompt with role definition, rules, and full tag reference including descriptions/criteria. User prompt includes sender, subject, date, and content.
- **AI Help for tag classification** — Green "AI Help — Write Classification" button in tag create/edit form. Sends tag name + existing criteria to automation AI, shows suggestion with Use/Dismiss. Clears on form reset.

**Why:**
- Rate limits were hardcoded and couldn't be adjusted per user. Contact search relied on Gmail's word-based search which failed for partial/random letter queries. Auto-tag blocked the HTTP response for minutes and tags disappeared during the process. The classification prompt was minimal — no system prompt, no tag descriptions, no sender context.

**Files touched:**
- `server/prisma/schema.prisma` — Added `rateLimitPerMin`, `rateLimitPerHour` to AutomationSettings
- `server/src/services/automation.service.ts` — Per-user rate limiting from DB, `skipRateLimit` opt, system prompt support for all 3 providers
- `server/src/services/email-intelligence.service.ts` — System prompt with tag criteria, upsert instead of delete+create, `onProgress` callback, `skipRateLimit` for bulk jobs
- `server/src/routes/automation.ts` — PATCH /settings for rate limits, rate limit fields in GET/POST, 429 responses
- `server/src/routes/email.ts` — In-memory contact cache (500 msgs, 10min TTL), background auto-tag with job status tracking, GET /auto-tag/status poll endpoint
- `client/components/email/ComposePane.tsx` — 1-char min search, 150ms debounce
- `client/components/email/TagManager.tsx` — AI Help button (green), auto-tag polling with live progress bar, real-time tag invalidation
- `client/components/connections/AutomationAICard.tsx` — Collapsible rate limit controls with save

---

## 2026-02-09 — Eager email prefetch, infinite scroll, drafts, full-account contact search

**Author:** Omid (via Claude Code)
**Commit:** feat: eager email prefetch, infinite scroll, unified drafts, full-account contact search
**Branch:** oz/email-restructure-automation

**What changed:**
- **Eager email prefetch** — DashboardShell now prefetches email-status → settings + inbox (parallel) → email-tags on login using `setQueryData` to inject into React Query cache. Email tab renders instantly from cache instead of showing a loading spinner.
- **Date-range inbox pagination** — Server inbox endpoint now accepts `months` (1–12) and `before` (ISO date) query params. Gmail uses `after:EPOCH before:EPOCH` query operators; Outlook uses `$filter` with date range. Response includes `dateRange: { after, before }` for cursor-based pagination. Messages fetched in parallel batches of 20.
- **Infinite scroll** — EmailPage uses progressive loading schedule `[1, 2, 2, 2, 2, 2]` months. EmailList has IntersectionObserver on sentinel div that triggers `loadMore()` when the user scrolls to the bottom. Deduplicates by message ID when appending chunks.
- **Unified Draft model** — New Prisma `Draft` model with type (email/document), to, subject, body, context, provider fields. CRUD routes: `GET/POST/PATCH/DELETE /email/drafts` with userId scoping.
- **Save to Drafts buttons** — ComposePane (email compose) and ComposeTab (AI writing assistant) both have "Save Draft" buttons that save to the same unified drafts library. DraftsTab rewritten to display both types with filter dropdown.
- **Full-account contact search** — Rewrote contact search to use Gmail's `from:query OR to:query` full-account search instead of only searching cached loaded emails. Parallel metadata fetch in batches of 15.
- **Cache-first EmailPage** — Derives `initialMessages` from `inboxData?.messages` (works with both cache and fresh fetches). Loading spinner only shows when `inboxLoading && allMessages.length === 0`.

**Why:**
- Email tab was slow to load — users had to wait for API calls every time they navigated to it. Eager prefetch makes it instant. The previous approach only loaded ~50 emails with no date filtering. Progressive loading gives users access to their full inbox history. Drafts were scattered — unified model simplifies the UX. Contact search was limited to loaded emails — full-account search finds anyone you've ever emailed.

**Files touched:**
- `server/prisma/schema.prisma` — New `Draft` model with User relation
- `server/src/routes/email.ts` — Date-range inbox with `months`/`before` params, draft CRUD endpoints, full-account Gmail contact search, parallel metadata batching
- `client/components/layout/DashboardShell.tsx` — Eager prefetch pipeline (status → settings+inbox → tags) with `setQueryData`
- `client/components/email/EmailPage.tsx` — Progressive loading with `LOAD_SCHEDULE`, cache-first rendering, `nextBefore` cursor management
- `client/components/email/EmailList.tsx` — IntersectionObserver infinite scroll sentinel
- `client/components/email/ComposePane.tsx` — Save Draft button, debounced contact search
- `client/components/composer/ComposeTab.tsx` — Save Draft button for documents
- `client/components/composer/DraftsTab.tsx` — Rewritten for unified Draft model with email/document filter

---

## 2026-02-09 — Manual tagging, bulk AI re-tag, faster contacts, improved email rendering

**Author:** Omid (via Claude Code)
**Commit:** feat: manual email tagging, bulk AI re-tag, cached contact search, refined email rendering
**Branch:** oz/email-restructure-automation

**What changed:**
- **Manual tag assignment** — Each email in EmailList now shows a tag badge (click to change) or a small tag icon (click to assign). Dropdown shows all available tags with "Remove tag" option. Filter by tag uses tagId instead of tagName for correctness.
- **Bulk "Re-tag All" button** in TagManager — calls new `POST /auto-tag` endpoint which runs every recent email through the automation AI lane to assign tags. New `retagAllEmails()` function in email-intelligence service clears old records and re-processes all messages.
- **Separate tag data flow** — Removed fire-and-forget `processNewEmails()` call from inbox endpoint. Added `GET /email-tags?ids=...` for batch tag lookups and `POST /tag-email` for individual assignment/removal. EmailPage fetches tags separately via React Query.
- **Faster contact search** — 5-minute in-memory per-user contact cache built from recent 50 inbox/sent messages with parallel metadata fetching (batches of 10). Debounced input (300ms) in ComposePane. Min 1 char to search (was 2). Loading/empty states in dropdown.
- **Improved email body rendering** — HTML emails: kept `<style>` tags (were being stripped), strip dangerous CSS properties instead. Plain text emails: new `cleanPlainText()` strips tracking URLs, base64 noise, "view in browser" lines; `linkifyPlainText()` converts URLs into short clickable links with domain labels.
- **Prominent AI Help buttons** — Both ComposePane and ComposeTab now have a large full-width "AI Help" button above the action bar. ComposeTab context section is always visible (no toggle).
- **automation.service** — `automationExec()` now always returns a string (handles object/null responses from providers).
- **Inbox default** — Bumped default max from 20→50, cap from 50→100. Removed `withProcessed` query param.
- **TagManager always visible** — Replaced toggle button with smooth scroll-to via ref.

**Why:**
- Auto-tagging on every inbox fetch was wasteful and opaque. Manual tagging gives users control; bulk re-tag gives the AI-powered convenience on demand. Contact search was slow (per-keystroke Gmail API calls) — caching makes it instant. Email rendering needed polish for real-world marketing/transactional emails.

**Files touched:**
- `server/src/routes/email.ts` — New endpoints (tag-email, email-tags, auto-tag), removed processNewEmails from inbox, improved body extraction (prefer HTML), cached contact search
- `server/src/services/email-intelligence.service.ts` — New `retagAllEmails()` function
- `server/src/services/automation.service.ts` — Ensure string return type
- `client/components/email/EmailPage.tsx` — Separate email-tags query, pass emailTags/onTagEmail to EmailList, scroll-to TagManager
- `client/components/email/EmailList.tsx` — Tag badge per email, tag assignment dropdown, filter by tagId
- `client/components/email/EmailDetail.tsx` — `cleanPlainText()`, `linkifyPlainText()`, improved HTML sanitizer (keep styles, strip dangerous CSS)
- `client/components/email/ComposePane.tsx` — Debounced contact search, cached contacts, prominent AI Help button
- `client/components/email/TagManager.tsx` — "Re-tag All" button with status feedback
- `client/components/composer/ComposeTab.tsx` — Prominent AI Help button, always-visible context section
- `client/components/layout/DashboardShell.tsx` — Removed withProcessed from prefetch
- `client/app/globals.css` — Refined email HTML styles (preserve inline styles, button links, hr, h4-h6, background colors)

---

## 2026-02-09 — Fix deliver param, people search, email body rendering, rename People to Search

**Author:** Omid (via Claude Code)
**Commit:** fix: deliver boolean, Gmail-based people search, HTML email rendering, People→Search
**Branch:** oz/email-restructure-automation

**What changed:**
- **`deliver: "full"` → `deliver: true`** in all 4 agentExec helpers (composer, connections, integrations, calendar). Gateway protocol now requires boolean, not string. This was causing "invalid chat.send params: at /deliver: must be boolean" errors on all AI tools (composer, form builder, etc.).
- **People search now queries Gmail directly** instead of only the empty DraftReply table. Searches `from:<query> OR to:<query>` in Gmail, extracts contacts from headers, and builds interaction history from real email data. Falls back to DraftReply for additional matches.
- **Email body now renders HTML properly** using `dangerouslySetInnerHTML` with sanitization (strips scripts, event handlers, iframes, forms, javascript: URLs) instead of regex-based HTML stripping that mangled formatting. Added `.email-body-html` CSS styles for links, images, tables, blockquotes.
- **Renamed "People" tab to "Search"** in DocumentsPage sub-tabs.
- Added `googleapis` and `oauth.service` imports to composer routes for Gmail access.

**Why:**
- Gateway protocol change broke all AI tools. People search was useless without real email data. Email bodies were unreadable due to aggressive HTML stripping.

**Files touched:**
- `server/src/routes/composer.ts` — deliver fix + Gmail-based people search + imports
- `server/src/routes/connections.ts` — deliver fix
- `server/src/routes/calendar.ts` — deliver fix
- `server/src/routes/integrations.ts` — deliver fix
- `client/components/email/EmailDetail.tsx` — HTML rendering with sanitization
- `client/components/composer/DocumentsPage.tsx` — People→Search rename
- `client/app/globals.css` — email HTML body styles

---

## 2026-02-09 — Restructure Email + Documents with Automation AI Lane

**Author:** Omid (via Claude Code)
**Commit:** feat: split Email into dedicated tab, rename Composer to Documents, add Automation AI lane
**Branch:** oz/email-restructure-automation

**What changed:**

- **Prisma schema**: Added 3 new models — `AutomationSettings` (per-user encrypted API key for cheap LLM), `ProcessedEmail` (AI summaries + tag assignments, idempotent via `@@unique([userId, emailId])`), `EmailContent` (cached full email bodies). Added relations to `User` model.
- **`server/src/services/automation.service.ts`** (new): Direct HTTP calls to OpenAI, Anthropic, and Google AI APIs for automation workloads. `automationExec(userId, prompt)` decrypts per-user API key and routes to the correct provider. 30s timeout. Throws `AutomationNotConfiguredError` for graceful degradation.
- **`server/src/services/email-intelligence.service.ts`** (new): Fire-and-forget email processing pipeline. `processNewEmails()` filters to 30-day window, batches 10 unprocessed emails, generates AI summaries + tag assignments via automation lane, stores in `ProcessedEmail`. Idempotent — skips already-processed emails. Ensures "Miscellaneous" system tag exists.
- **`server/src/routes/automation.ts`** (new): CRUD for automation settings (`GET/POST/DELETE /api/automation/settings`), connection test (`POST /api/automation/test`), general-purpose AI assist (`POST /api/automation/assist`). API key encrypted via `crypto.service.ts`.
- **`server/src/routes/email.ts`**: Added `POST /send` (Gmail RFC 2822 + Microsoft Graph sendMail), `GET /message/:id` (full body fetch with `EmailContent` cache), `GET /search-contacts` (sent+received contact dedup from Gmail), `GET /processed` (processed email data by IDs). Inbox endpoint now triggers fire-and-forget intelligence pipeline and supports `?withProcessed=true` to return summaries/tags inline.
- **`server/src/routes/composer.ts`**: Added "Miscellaneous" to `SYSTEM_TAGS` for fallback classification.
- **`server/src/index.ts`**: Mounted `/api/automation` routes.
- **`client/components/layout/TabNavigation.tsx`**: Added Email tab (Mail icon), renamed Composer to Documents (FileText icon). Tab order: Home, Connections, Calendar, CRM, Email, Documents, Chat, Skills.
- **`client/app/dashboard/email/page.tsx`**: Changed from redirect to rendering `<EmailPage />`.
- **`client/app/dashboard/documents/page.tsx`** (new): Renders `<DocumentsPage />`.
- **`client/app/dashboard/composer/page.tsx`**: Changed to redirect to `/dashboard/documents`.
- **`client/components/email/EmailPage.tsx`**: Complete rewrite — split layout with email list (left) and compose/detail pane (right). Tag filter buttons, unread filter, compact provider indicator, collapsible tag manager. Triggers intelligence pipeline via `withProcessed=true`.
- **`client/components/email/EmailList.tsx`** (new): Scrollable email list with AI summaries, tag badges, unread dots, sender extraction, relative dates, filter support.
- **`client/components/email/EmailDetail.tsx`** (new): Full email body view fetched via `GET /message/:id`, reply button pre-fills compose pane, HTML stripping for display.
- **`client/components/email/ComposePane.tsx`** (new): Email compose with contact search autocomplete, send via `POST /send`, AI compose help via automation lane, suggestion accept/dismiss.
- **`client/components/composer/DocumentsPage.tsx`** (new): Composer without Inbox sub-tab, renamed to "Documents", defaults to Compose tab. 5 sub-tabs: Compose, Drafts, Invoices, PDFs, People.
- **`client/components/connections/AutomationAICard.tsx`** (new): Provider/model/API key config UI for automation lane. Supports OpenAI (gpt-4o-mini, gpt-4.1-mini, gpt-4.1-nano), Anthropic (claude-haiku-4-5, claude-3-5-haiku), Google (gemini-2.0-flash-lite, gemini-2.0-flash). Test connection, update, remove buttons.
- **`client/components/connections/ConnectionsPage.tsx`**: Added Automation AI section with Sparkles icon between Active Model and Provider API Keys.
- **`client/components/layout/DashboardShell.tsx`**: Added email inbox prefetch (2-min staleTime) so data is ready when navigating to Email tab.

**Why:**
- Email is the highest-value daily workflow for business owners — it deserves its own dedicated tab with a professional split layout, not a sub-tab inside Composer. The Automation AI lane enables cheap email intelligence (summaries, auto-tagging, compose help) without consuming expensive primary chat model tokens. Documents (renamed Composer) focuses on writing/document workflows without the Inbox sub-tab.

**Files touched:**
- `server/prisma/schema.prisma` — 3 new models + User relations
- `server/src/services/automation.service.ts` — New: direct LLM API calls
- `server/src/services/email-intelligence.service.ts` — New: email processing pipeline
- `server/src/routes/automation.ts` — New: automation settings + assist endpoints
- `server/src/routes/email.ts` — Send, full body, contacts, processed, intelligence trigger
- `server/src/routes/composer.ts` — Miscellaneous system tag
- `server/src/index.ts` — Mount automation routes
- `client/components/layout/TabNavigation.tsx` — Email + Documents tabs
- `client/components/layout/DashboardShell.tsx` — Inbox prefetch
- `client/app/dashboard/email/page.tsx` — Render EmailPage
- `client/app/dashboard/documents/page.tsx` — New: Documents route
- `client/app/dashboard/composer/page.tsx` — Redirect to documents
- `client/components/email/EmailPage.tsx` — Complete rewrite (split layout)
- `client/components/email/EmailList.tsx` — New: email list component
- `client/components/email/EmailDetail.tsx` — New: email detail component
- `client/components/email/ComposePane.tsx` — New: compose pane component
- `client/components/composer/DocumentsPage.tsx` — New: Documents page
- `client/components/connections/AutomationAICard.tsx` — New: automation config UI
- `client/components/connections/ConnectionsPage.tsx` — Automation AI section

---

## 2026-02-08 — Evolve Email into Composer: unified text/document agent area with 6 sub-tabs

**Author:** Omid (via Claude Code)
**Commit:** feat: evolve Email into Composer with Inbox, Drafts, Compose, Invoices, PDFs, People tabs
**Branch:** main

**What changed:**
- **Prisma schema**: Enhanced `EmailTag` with `isSystem`, `sortingIntent`, `autoDraft` fields. Added 5 new models: `DraftReply`, `UploadedFile`, `Invoice`, `PdfSession`, `PdfForm` — all user-scoped with cascade delete.
- **`server/src/routes/composer.ts`** (new): 20+ endpoints — system tag seeding, draft reply CRUD + AI generation, AI compose assist (rewrite/summarize/expand/tone/grammar), file upload with PDF text extraction via pdf-parse, invoice upload + AI structured extraction, PDF analyzer chat (session-based Q&A), AI form builder, people/relationship search with AI summary.
- **`server/src/index.ts`**: Mounted composer routes with multer middleware for file upload endpoints (`/upload`, `/invoices/upload`, `/pdf/analyze`).
- **`client/components/layout/TabNavigation.tsx`**: Renamed "Email" tab → "Composer" with `PenLine` icon.
- **`client/app/dashboard/composer/page.tsx`** (new): Composer page entry point.
- **`client/app/dashboard/email/page.tsx`**: Changed to redirect to `/dashboard/composer`.
- **`client/components/composer/ComposerPage.tsx`** (new): Main page with 6 sub-tab navigation (Inbox, Drafts, Compose, Invoices, PDFs, People), seeds system tags on first load.
- **`client/components/composer/InboxTab.tsx`** (new): Migrated inbox display from EmailPage (connection status, messages, auto-tag/auto-draft toggles, tag manager).
- **`client/components/composer/DraftsTab.tsx`** (new): Draft reply list with expand/collapse, inline edit, approve/discard actions, status filter.
- **`client/components/composer/ComposeTab.tsx`** (new): AI writing assistant with 6 AI actions, file attachment (drag & drop), context panel, word count.
- **`client/components/composer/InvoicesTab.tsx`** (new): Invoice analyzer with upload zone, AI extraction, line items table, status management, summary cards.
- **`client/components/composer/PdfsTab.tsx`** (new): PDF Analyzer (chat-style Q&A with session history) + Form Builder (AI-generated forms with visual preview).
- **`client/components/composer/PeopleTab.tsx`** (new): Relationship search with AI summary, interaction history, "Compose to" cross-tab navigation.
- **`client/lib/api.ts`**: Added `upload()` method for FormData requests.
- **Server dependencies**: Added `multer`, `@types/multer`, `pdf-parse@1.1.1`.

**Why:**
- The Email tab was a basic inbox viewer. Business owners need a unified surface for all text/document workflows — composing, analyzing, extracting intelligence from documents, and understanding relationships. Composer consolidates these into 6 purpose-built sub-tabs while preserving all existing email functionality in the Inbox sub-tab.

**Files touched:**
- `server/prisma/schema.prisma` — 5 new models + EmailTag enhancements
- `server/src/routes/composer.ts` — New: all Composer backend endpoints
- `server/src/index.ts` — Mount composer routes + multer
- `server/package.json`, `server/package-lock.json` — multer, pdf-parse deps
- `client/lib/api.ts` — upload() method
- `client/components/layout/TabNavigation.tsx` — Email → Composer rename
- `client/app/dashboard/composer/page.tsx` — New: page route
- `client/app/dashboard/email/page.tsx` — Redirect to /dashboard/composer
- `client/components/composer/ComposerPage.tsx` — New: main page + sub-tabs
- `client/components/composer/InboxTab.tsx` — New: migrated inbox
- `client/components/composer/DraftsTab.tsx` — New: draft replies
- `client/components/composer/ComposeTab.tsx` — New: AI writing assistant
- `client/components/composer/InvoicesTab.tsx` — New: invoice analyzer
- `client/components/composer/PdfsTab.tsx` — New: PDF analyzer + form builder
- `client/components/composer/PeopleTab.tsx` — New: people/relationship search

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
