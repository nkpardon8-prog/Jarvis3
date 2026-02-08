# CLAUDE.md — Jarvis Project Agent Memory

## What is this project?

Jarvis is an Iron Man-inspired web dashboard that serves as a visual control surface over a locally-running **OpenClaw** AI assistant. It provides a sci-fi HUD interface for chatting with AI, managing email, calendar, CRM, skills, and connections to external services.

## Core Architecture Principle

**AI operations route through the OpenClaw Gateway; user-specific data lives in the local Prisma DB.** The Jarvis UI is designed to be portable — it can connect to any OpenClaw instance. There are ZERO direct filesystem reads/writes in any route file. AI chat, skill management, and provider config go through gateway methods (`config.get`, `config.patch`, `chat.send`). Per-user data (OAuth credentials, tokens, todos, settings) is stored in the local Prisma/SQLite DB with userId scoping.

The only "local" config is the gateway URL + auth token (which defines WHERE to connect), set via environment variables or the Gateway Card UI.

## Architecture

```
jarvis/
├── server/          Express 5 + TypeScript backend (port 3001)
│   ├── src/
│   │   ├── index.ts           Entry point, route mounting, gateway init, startup validation
│   │   ├── config.ts          Mutable config from env vars (Record<string, any> & typed)
│   │   ├── gateway/           OpenClaw WebSocket gateway (protocol v3)
│   │   │   ├── connection.ts  Singleton gateway class with reconnect()
│   │   │   ├── protocol.ts    Message building (buildRequest, buildConnectRequest, parseMessage)
│   │   │   └── types.ts       Gateway protocol types
│   │   ├── middleware/        JWT auth, error handler
│   │   ├── routes/            REST API endpoints (all gateway-only, no fs imports)
│   │   │   ├── auth.ts        Register, login, logout, me, socket-token
│   │   │   ├── health.ts      Server + gateway health check
│   │   │   ├── chat.ts        Sessions, history, reset, delete
│   │   │   ├── dashboard.ts   Aggregated status
│   │   │   ├── connections.ts Config, providers, models, credentials (via agentExec)
│   │   │   ├── integrations.ts Custom API integration builder (6 endpoints)
│   │   │   ├── skills.ts      List, install, update, hub search
│   │   │   ├── todos.ts       CRUD for todos (Prisma)
│   │   │   ├── calendar.ts    Events (Google/Microsoft), build-agenda
│   │   │   ├── email.ts       Status, inbox (Gmail/Outlook), tags, settings
│   │   │   ├── crm.ts         CRM features
│   │   │   ├── oauth.ts       OAuth URLs, callbacks, status, store-credentials
│   │   │   ├── drive.ts       Google Drive file list/search, Google Docs read
│   │   │   └── gateway.ts     Gateway status, configure (runtime-only)
│   │   ├── services/          OAuth, auth, crypto, Prisma client
│   │   ├── socket/            Socket.io setup + chat streaming
│   │   │   ├── index.ts       Socket.io server init
│   │   │   ├── auth.ts        Socket auth middleware (JWT verification)
│   │   │   └── chat.ts        Chat event handlers (streaming via gateway)
│   │   └── types/             Shared TS interfaces
│   └── prisma/schema.prisma   SQLite database schema
│
└── client/          Next.js 16 + React 19 frontend (port 3000)
    ├── app/                   App router pages
    ├── components/            React components (by feature)
    │   ├── connections/       Connections page components
    │   │   ├── ConnectionsPage.tsx    Main page with all sections
    │   │   ├── GatewayCard.tsx        Gateway URL/token config + status
    │   │   ├── OAuthAccountCard.tsx   Google/Microsoft OAuth connection
    │   │   ├── ModelProviderCard.tsx   LLM provider API key entry
    │   │   ├── ChannelCard.tsx        Communication channel config
    │   │   ├── ServiceCard.tsx        Service integration (Notion, etc.)
    │   │   ├── IntegrationBuilder.tsx Custom API integration form
    │   │   ├── IntegrationCard.tsx    Display card for custom integrations
    │   │   ├── ClawHubSuggestions.tsx  ClawHub recommendation UI
    │   │   └── SkillGuidelinesPanel.tsx Skill writing guidelines reference
    │   ├── chat/              Chat interface components
    │   ├── ui/                Shared UI components (GlassPanel, HudButton, etc.)
    │   └── ...                Other feature components
    ├── lib/                   API client, contexts, hooks
    │   ├── api.ts             Fetch wrapper with { ok, data, error } handling
    │   ├── contexts/          React contexts (SocketContext, AuthContext)
    │   └── hooks/             Custom hooks (useAuth, useSocket)
    └── next.config.ts         Proxies /api/* → localhost:3001
```

## Quick Start

```bash
# 1. Install dependencies
cd server && npm install && npx prisma db push && cd ..
cd client && npm install && cd ..

# 2. Configure environment
cp server/.env.example server/.env
# Edit server/.env — set JWT_SECRET (generate random), OPENCLAW_AUTH_TOKEN, etc.

# 3. Start both servers (separate terminals)
cd server && npm run dev     # Express on :3001
cd client && npm run dev     # Next.js on :3000

# 4. Open http://localhost:3000 — first visit creates admin account
```

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | Next.js 16, React 19, Tailwind CSS 4, React Query, Socket.io-client |
| Backend | Express 5, TypeScript, Prisma 6 (SQLite), Socket.io, ws |
| Auth | JWT (httpOnly cookies, 7-day expiry), bcryptjs |
| OAuth | Google APIs (googleapis), Microsoft Graph API |
| AI Gateway | OpenClaw protocol v3 over WebSocket |
| Icons | lucide-react |
| Animations | framer-motion |

## OpenClaw Gateway

The core AI functionality runs through the OpenClaw gateway, a locally-running AI orchestration server.

- **Connection**: WebSocket at `ws://127.0.0.1:18789` (configurable via Gateway Card UI or env vars)
- **Auth**: Challenge-response handshake using `OPENCLAW_AUTH_TOKEN`
- **Protocol**: v3 — request/response with `{ type: "req", id, method, params }` / `{ type: "res", id, ok, payload }`
- **83 methods** including `chat.send`, `chat.history`, `config.get`, `config.patch`, `models.list`, `skills.install`, etc.
- **Graceful degradation**: Server starts even if gateway is down; auto-reconnects with exponential backoff (1s→30s)
- **Singleton**: `server/src/gateway/connection.ts` exports `gateway` instance
- **Reconnect**: `gateway.reconnect()` method for hot-reload after config changes
- **Per-user OAuth**: OAuth credentials stored per-user in Prisma DB (encrypted), no longer in gateway config

### Critical: config.patch format

```typescript
// config.patch requires baseHash, NOT hash. additionalProperties: false enforces this.
gateway.send("config.patch", {
  raw: JSON.stringify(patch),
  baseHash: currentBaseHash  // Get from config.get first
});
```

### Critical: patchConfig helper pattern

Multiple routes use a retry-safe `patchConfig()` helper that handles hash conflicts:

```typescript
async function patchConfig(updateFn: (config: any) => any, maxRetries = 2) {
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    const current = (await gateway.send("config.get", {})) as any;
    const hash = current?.hash;
    const merged = updateFn(current?.config || {});
    try {
      return await gateway.send("config.patch", {
        raw: JSON.stringify(merged, null, 2),
        baseHash: hash,
      });
    } catch (err: any) {
      if (attempt === maxRetries) throw err;
      // Hash conflict — retry with fresh config
    }
  }
}
```

### Critical: agentExec helper pattern

For operations that need the agent to perform filesystem actions on the OpenClaw host (credential storage, skill creation), routes use `agentExec()`:

```typescript
async function agentExec(prompt: string, timeoutMs = 60000) {
  const defaults = gateway.sessionDefaults;
  const sessionKey = `agent:${defaults?.defaultAgentId || "main"}:${defaults?.mainKey || "main"}`;
  return gateway.send("chat.send", {
    sessionKey,
    message: prompt,
    deliver: "full",      // Returns complete response (no streaming)
    thinking: "low",
    idempotencyKey: `prefix-${Date.now()}-${randomUUID().slice(0, 8)}`,
  }, timeoutMs);
}
```

### Critical: API key & credential storage

**Provider/service credential storage goes through the gateway.** OAuth credentials are stored per-user in the local Prisma DB.

- **Provider API keys** (OpenAI, Anthropic, etc.): Stored via `agentExec()` prompt that writes to `~/.openclaw/.env` on the OpenClaw host, PLUS redundantly stored in gateway config at `models.providers.<provider>.apiKey` via `config.patch` for fast reads
- **Service keys** (Notion, Trello, etc.): Same `agentExec()` pattern to `~/.openclaw/.env`
- **OAuth client credentials** (Google/Microsoft): Stored **per-user** in Prisma `OAuthCredential` table with AES-256-GCM encrypted `clientSecret`. Resolved via `resolveCredentials(userId, provider)` with legacy env var fallback.
- **OAuth tokens** (access/refresh): Stored in Prisma `OAuthToken` table. Refresh tokens encrypted at rest via `crypto.service.ts`.
- **Custom integration credentials**: Stored via `agentExec()` to `~/.openclaw/.env` using idempotent update-or-append pattern
- **Config metadata tracking**: `config.storedEnvKeys` object tracks which env vars have been stored (for fast status lookups without querying the agent)

### Gateway config namespace conventions

```
config.models.providers.<provider>.apiKey    — LLM provider API keys (redundant store)
config.storedEnvKeys.<ENV_VAR_NAME>          — Boolean flags for configured env vars
config.customIntegrations[]                  — Custom API integration metadata array
config.agents.defaults.model.primary         — Active model selection
```

## Custom API Integration Builder

The Connections page includes a full Custom API Integration Builder that scaffolds OpenClaw skills from any external API.

### Server: `/api/integrations` (routes/integrations.ts)

| Method | Path | Purpose |
|--------|------|---------|
| GET | `/` | List integrations (config.get + skills.status cross-reference) |
| POST | `/` | Create integration (validate → store creds → build SKILL.md → config.patch → agentExec create dir → verify) |
| PUT | `/:slug` | Update integration (update creds + SKILL.md + config) |
| DELETE | `/:slug` | Remove integration (agentExec delete dir + config.patch) |
| POST | `/:slug/recommend` | ClawHub suggestions (skills.search + LLM ranking via chat.send) |
| POST | `/install-skill` | Install from ClawHub (skills.install) |

### Creation flow:
1. Validate inputs (name, URL, auth method, description, instructions)
2. Store credentials via `agentExec` → writes to `~/.openclaw/.env` on OpenClaw host
3. Build `SKILL.md` with YAML frontmatter + auth instructions + API reference
4. Store metadata in gateway config at `config.customIntegrations[]`
5. Create skill directory via `agentExec` → `~/.openclaw/skills/<slug>/SKILL.md`
6. Verify with `skills.status`, update status to "created" or "pending"

### Client components:
- **IntegrationBuilder.tsx**: Form with name, URL, auth method dropdown, dynamic credential fields, description, instructions, collapsible skill writing guidelines
- **IntegrationCard.tsx**: Display card with status indicator (green/amber/red), auth badge, delete button
- **ClawHubSuggestions.tsx**: Post-creation recommendations with LLM-ranked results, checkbox multi-select, install buttons
- **SkillGuidelinesPanel.tsx**: Expandable reference panel with best practices for writing skill instructions

## Database (Prisma/SQLite)

Models: `User`, `Todo`, `EmailTag`, `EmailSettings`, `CrmSettings`, `OAuthToken`, `OAuthCredential`, `Notification`, `OnboardingProgress`

Key relationships:
- `OAuthToken` has `@@unique([userId, provider])` — one token per provider per user
- `OAuthCredential` has `@@unique([userId, provider])` — one credential set per provider per user (clientSecret encrypted)
- All models cascade delete from User

Run migrations: `cd server && npx prisma db push`

## API Response Format

All endpoints return: `{ ok: boolean, data?: T, error?: string }`

The client API wrapper at `client/lib/api.ts` handles this automatically.

## Authentication Flow

1. First visit → `/login` page (register mode if no users exist)
2. `POST /api/auth/login` → sets `jarvis_token` httpOnly cookie
3. All API routes use `authMiddleware` which reads cookie → verifies JWT → sets `req.user`
4. Socket.io auth: `GET /api/auth/socket-token` → token passed during socket handshake

## OAuth Flow (Per-User)

OAuth uses a **per-user "bring your own credentials"** model. Each user stores their own Google Cloud / Azure project credentials.

1. User enters Client ID + Secret on Connections page → `POST /api/oauth/store-credentials`
2. Credentials stored per-user in Prisma `OAuthCredential` table (clientSecret AES-256-GCM encrypted via `crypto.service.ts`)
3. Redirect to `GET /api/oauth/{provider}/auth-url` → resolves per-user credentials → consent screen
4. Provider callback → `GET /api/oauth/{provider}/callback` → resolves credentials from state JWT userId → exchanges code for tokens
5. Tokens stored in `OAuthToken` table (refresh token encrypted), auto-refreshed when within 5 min of expiry
6. Calendar/email/drive routes use `getGoogleApiClient(userId)` or `getTokensForProvider(userId, provider)`

**Credential resolution precedence** (`resolveCredentials(userId, provider)`):
1. Per-user DB credentials (`OAuthCredential` table) — primary
2. Legacy env vars (`GOOGLE_CLIENT_ID` etc.) — deprecated fallback, logs warning

**Disconnect vs Remove:**
- `POST /disconnect/:provider` — revokes tokens only, keeps credentials for easy reconnect
- `POST /disconnect/:provider?deleteCredentials=true` — revokes tokens + deletes stored credentials

Google scopes: gmail.modify, calendar, spreadsheets, documents, drive.file, userinfo.email, userinfo.profile
Microsoft scopes: Mail.ReadWrite, Calendars.ReadWrite, Files.ReadWrite.All, User.Read, offline_access

OAuth callback URL is derived from `OAUTH_BASE_URL` env var (required in production). Callbacks must point to Express directly since they are full page navigations.

## Socket.io Events

| Direction | Event | Purpose |
|-----------|-------|---------|
| Client→Server | `chat:send` | Send message (sessionKey, text) |
| Client→Server | `chat:abort` | Abort streaming response |
| Server→Client | `chat:token` | Streaming token text |
| Server→Client | `chat:status` | Status change (thinking/idle) |
| Server→Client | `chat:message` | Complete message object |
| Server→Client | `chat:error` | Error message |
| Server→Client | `chat:session-state` | Session updates |

## API Route Map

| Path | File | Purpose |
|------|------|---------|
| `/api/auth` | routes/auth.ts | Register, login, logout, me, socket-token |
| `/api/health` | routes/health.ts | Server + gateway health check |
| `/api/chat` | routes/chat.ts | Sessions, history, reset, delete |
| `/api/dashboard` | routes/dashboard.ts | Aggregated status |
| `/api/connections` | routes/connections.ts | Config, providers, models, credentials (via gateway) |
| `/api/integrations` | routes/integrations.ts | Custom API integration CRUD, ClawHub suggestions |
| `/api/skills` | routes/skills.ts | List, install, update, hub search |
| `/api/todos` | routes/todos.ts | CRUD for todos |
| `/api/calendar` | routes/calendar.ts | Events (Google/Microsoft), build-agenda |
| `/api/email` | routes/email.ts | Status, inbox (Gmail/Outlook), tags, settings |
| `/api/crm` | routes/crm.ts | CRM features |
| `/api/oauth` | routes/oauth.ts | OAuth URLs, callbacks, status, disconnect, store-credentials |
| `/api/drive` | routes/drive.ts | Google Drive file list/search, Google Docs read |
| `/api/gateway` | routes/gateway.ts | Gateway status, configure (runtime-only, no file writes) |

## Design System

Iron Man HUD theme defined in `client/app/globals.css`:

| Token | Value | Use |
|-------|-------|-----|
| `hud-bg` | `#0a0e17` | Page background |
| `hud-bg-secondary` | `#111827` | Card backgrounds |
| `hud-surface` | `#1a1f2e` | Elevated surfaces |
| `hud-accent` | `#00d4ff` | Primary cyan accent |
| `hud-amber` | `#f0a500` | Warning/secondary accent |
| `hud-success` | `#00ff88` | Success states |
| `hud-error` | `#ff4757` | Error states |
| `hud-text` | `#e8edf5` | Primary text |
| `hud-text-secondary` | `#8892a4` | Secondary text |
| `hud-text-muted` | `#4a5568` | Muted text |
| `hud-border` | `rgba(0,212,255,0.12)` | Default borders |

Key CSS classes: `.glass-panel` (frosted glass), `.circuit-bg` (grid pattern), `.glow-cyan`, `.glow-amber`, `.animate-pulse-glow`

Fonts: Inter (sans), JetBrains Mono (mono)

UI components: `GlassPanel`, `HudButton` (variants: primary, secondary, danger), `HudInput`, `HudBadge`, `LoadingSpinner`

## Client Pages

| URL | Component | Description |
|-----|-----------|-------------|
| `/login` | app/login/page.tsx | Auth (register/login) |
| `/dashboard/home` | HomeDashboard | Status overview |
| `/dashboard/chat` | ChatContainer | AI chat with streaming |
| `/dashboard/email` | EmailPage | Gmail/Outlook inbox |
| `/dashboard/calendar` | CalendarPage + AgendaPanel | Calendar events |
| `/dashboard/crm` | CrmPage | CRM |
| `/dashboard/skills` | SkillsPage | Skill marketplace |
| `/dashboard/connections` | ConnectionsPage | Gateway, OAuth, providers, services, custom integrations |

## Environment Variables (server/.env)

```
PORT=3001
JWT_SECRET=<random-string>
OPENCLAW_GATEWAY_URL=ws://127.0.0.1:18789
OPENCLAW_AUTH_TOKEN=<from-openclaw>
OAUTH_CREDENTIALS_ENCRYPTION_KEY=<32-byte-hex — required in production>
OAUTH_BASE_URL=<server-public-url — required in production>
# Legacy (deprecated — migrate to per-user credentials via Connections UI):
GOOGLE_CLIENT_ID=<optional — deprecated fallback>
GOOGLE_CLIENT_SECRET=<optional — deprecated fallback>
GOOGLE_REDIRECT_URI=<optional — deprecated fallback>
MICROSOFT_CLIENT_ID=<optional — deprecated fallback>
MICROSOFT_CLIENT_SECRET=<optional — deprecated fallback>
MICROSOFT_REDIRECT_URI=<optional — deprecated fallback>
```

The config object in `server/src/config.ts` is intentionally mutable (`Record<string, any> &`) so credentials can be updated at runtime.

**Required in production:** `JWT_SECRET`, `OPENCLAW_GATEWAY_URL`, `OPENCLAW_AUTH_TOKEN`, `OAUTH_CREDENTIALS_ENCRYPTION_KEY`, `OAUTH_BASE_URL`. The server will `process.exit(1)` if encryption key is missing in production.

**Required in dev:** `JWT_SECRET`, `OPENCLAW_GATEWAY_URL`, `OPENCLAW_AUTH_TOKEN`. Encryption key falls back to JWT_SECRET derivation with warning. OAuth base URL falls back to `http://localhost:3001`.

OAuth credentials (Google/Microsoft) are stored per-user in the DB, not in env vars. Legacy env vars are a deprecated fallback.

## Production Notes

OAuth configuration differs between local development and production deployment:

- **Local dev (current setup)**: set `OAUTH_BASE_URL=http://localhost:3001` so OAuth callbacks return to the local backend.
- **Production (website deployment)**: set `OAUTH_BASE_URL` to your public backend origin (example: `https://api.yourdomain.com`). Do not leave this as localhost.
- **Encryption key**: set `OAUTH_CREDENTIALS_ENCRYPTION_KEY` to a 32-byte key (hex or base64). This is required in production.

Generate a production-safe encryption key:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

Recommended OAuth setup behavior:

- Users paste **Client ID** and **Client Secret** into Jarvis (two fields).
- Jarvis stores credentials securely and handles browser OAuth consent/callback.
- Keep legacy `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` empty when using per-user OAuth.
- In Google Cloud Console, each OAuth client must include the exact backend callback URL:
  - `<OAUTH_BASE_URL>/api/oauth/google/callback`

## Gotchas & Patterns

- **Gateway-only architecture** — ZERO `fs` imports in any route file. All credential/config operations go through `gateway.send()` or `agentExec()`. This is enforced by design for portability.
- **config.ts is mutable** — The intersection type `Record<string, any> &` allows runtime updates
- **Per-user OAuth credentials** — Stored in Prisma `OAuthCredential` table (encrypted). Resolved per-request via `resolveCredentials(userId, provider)` with legacy env var fallback. OAuth routes no longer use gateway `patchConfig`.
- **Encrypted OAuth secrets** — `crypto.service.ts` uses AES-256-GCM with `OAUTH_CREDENTIALS_ENCRYPTION_KEY`. Refresh tokens in `OAuthToken` also encrypted. Legacy plaintext tokens handled gracefully (try decrypt, fallback to raw value, re-encrypt on next refresh).
- **patchConfig retry** — Used by connections/integrations routes (NOT oauth routes). Handles hash conflicts from concurrent writes
- **agentExec idempotent prompts** — Credential storage prompts use "update-or-append" pattern: if a line starting with `KEY=` exists, replace it; otherwise append. This prevents duplicates on retry.
- **deliver: "full"** — Used in `agentExec()` and calendar's `build-agenda` to get complete agent responses synchronously without streaming
- **Next.js rewrites** — All `/api/*` requests proxy from :3000 to :3001 via `next.config.ts`
- **OAuth callbacks bypass proxy** — Must point to Express directly (configured via `OAUTH_BASE_URL`)
- **OpenClaw .env** — Provider API keys (OpenAI, Anthropic, etc.) are written to `~/.openclaw/.env` via agent prompts through the gateway
- **chat.send streaming** — Gateway sends events; the socket handler in `server/src/socket/chat.ts` forwards them as Socket.io events
- **Prisma generate** — Run `npx prisma generate` if you modify schema.prisma, then `npx prisma db push` to apply
- **Port conflicts** — Kill stale processes with `lsof -ti:3001 | xargs kill -9` if EADDRINUSE
- **No .env in git** — Root and server `.gitignore` both exclude `.env`, `*.db`, `node_modules/`, `.claude/`
- **Socket.io connect errors** — Uses `console.warn` (not `console.error`) to avoid Next.js dev error overlay on transient connection failures
- **Session key format** — `agent:<defaultAgentId>:<mainKey>` (typically `agent:main:main`), derived from `gateway.sessionDefaults`

## GitHub

- **Repo**: https://github.com/nkpardon8-prog/Jarvis3
- **Branch**: main
- **Desktop symlink**: `~/Desktop/jarvis` → `~/jarvis/`

## Build for Production (MANDATORY)

All code must be written for **production use by multiple users**, not just local development on one machine.

- **No hardcoded values** — no hardcoded URLs, ports, IPs, paths, usernames, or machine-specific assumptions. Everything configurable goes through env vars or gateway config.
- **No localhost assumptions** — never assume the app runs on `localhost`. Use relative URLs on the client, and respect `process.env` for host/port on the server.
- **Multi-user from day one** — every feature must work for multiple concurrent users. Auth, data isolation (userId scoping), and session management are not optional.
- **Scalable patterns** — write code that handles N users, not just one. Database queries should be scoped and indexed. API endpoints should paginate where appropriate. Don't load unbounded data into memory.
- **Environment-agnostic** — the app should run on any machine with the correct env vars set. No assumptions about OS, file paths, home directories, or installed tools beyond what's in `package.json`.
- **Error handling at boundaries** — validate user input, handle API failures gracefully, return meaningful error messages. Internal code can trust its own types.
- **Security defaults** — httpOnly cookies, parameterized queries (Prisma handles this), no secrets in client bundles, no sensitive data in logs.

## Git Collaboration Rules (MANDATORY)

This codebase has **two contributors** working simultaneously from separate machines with their own Claude Code agents. Every agent session MUST follow these rules to prevent overwrites, conflicts, and lost work.

### Before Every Action

**Pull before you do anything.** Every time you start a task, write code, or make a commit:

```bash
git pull origin main --rebase
```

If rebase conflicts arise, stop and ask the user — do NOT auto-resolve or force through.

### Branching

- **Never commit directly to `main`** for feature work or multi-file changes.
- Create a feature branch for any non-trivial work:
  ```bash
  git checkout -b <initials>/<short-description>
  ```
  Example: `oz/add-calendar-filters` or `np/fix-chat-scroll`
- Single-line fixes or typo corrections may go directly to `main` only if the user explicitly says so.

### Committing

**Every single commit MUST follow this exact sequence. No shortcuts, no exceptions.**

1. `git pull origin main --rebase` — sync before committing.
2. Stage specific files by name — **never use `git add .` or `git add -A`**.
3. **Update `CHANGES.md` BEFORE committing** — write the entry first, then stage `CHANGES.md` alongside the other files. The CHANGES.md entry is part of the commit, not a follow-up. See the "Change Tracking" section below for the required format.
4. Write a clear commit message that describes the **why**, not just the what.
5. Never amend commits that have already been pushed.

**CRITICAL: If you forget to include `CHANGES.md` in a commit, you have made an error. Fix it immediately with a follow-up commit — do NOT let any commit exist without a corresponding CHANGES.md entry.**

### Pushing

- **NEVER force push.** No `--force`, no `--force-with-lease`, no exceptions.
- Always push with a simple `git push origin <branch>`.
- If push is rejected, pull first and resolve:
  ```bash
  git pull origin <branch> --rebase
  git push origin <branch>
  ```
  If rebase conflicts appear, stop and involve the user.

### Merging

- Feature branches merge into `main` via **pull request only** (`gh pr create`).
- Before creating a PR, sync with main:
  ```bash
  git fetch origin main
  git rebase origin/main
  ```
- After PR is merged, delete the feature branch:
  ```bash
  git branch -d <branch>
  git push origin --delete <branch>
  ```

### What NOT to Do

- **NEVER** `git push --force` or `git push --force-with-lease`
- **NEVER** `git reset --hard` on shared branches
- **NEVER** `git checkout .` or `git restore .` without user confirmation
- **NEVER** `git clean -f`
- **NEVER** `git rebase` on commits already pushed to `main`
- **NEVER** delete `main` or any branch you didn't create
- **NEVER** skip pre-commit hooks (`--no-verify`)

### Conflict Resolution

If you encounter a merge conflict:
1. **Stop.** Do not auto-resolve.
2. Show the user the conflicted files and both sides of the diff.
3. Let the user decide which changes to keep.
4. Only after user approval, mark resolved and continue.

### Session Start Checklist

Every new Claude Code session MUST begin with these steps in order:
1. `git fetch origin` — see what's changed remotely
2. `git status` — check for local uncommitted work
3. `git pull origin main --rebase` — sync up (if on main)
4. If on a feature branch: `git pull origin <branch> --rebase` to sync that too
5. **Read `CHANGES.md`** — understand what changed recently before writing any code

This ensures neither contributor's agent starts working on stale code or duplicates recent work.

## Change Tracking (MANDATORY — ZERO TOLERANCE)

**`CHANGES.md` must be updated as part of every single commit.** Not after. Not in a follow-up. IN the same commit. This is the #1 most-violated rule — treat it as a hard blocker before running `git commit`.

All changes are logged in **`CHANGES.md`** at the project root. This file is the shared context window for both contributors and their agents.

### Pre-Commit Checklist (memorize this)

Before EVERY `git commit`, verify:
- [ ] `CHANGES.md` has a new entry at the top for this commit
- [ ] `CHANGES.md` is staged (`git add CHANGES.md`)
- [ ] The entry includes: date, author, commit message, branch, what changed, why, files touched

If `CHANGES.md` is not staged, **STOP and add it.** Do not commit without it.

### Rules

1. **Read `CHANGES.md` at the start of every session** — before writing any code, read the recent entries to understand what's changed.
2. **Write the CHANGES.md entry BEFORE running `git commit`** and stage it with the other files. The entry is part of the commit itself, not a separate follow-up. No exceptions.
3. **Entry format:**

```markdown
## YYYY-MM-DD — Short Description of Change

**Author:** <name> (via Claude Code)
**Commit:** <short hash + message>
**Branch:** <branch name>

**What changed:**
- Bullet list of specific changes made

**Why:**
- Motivation / context for the change

**Files touched:**
- List of files added, modified, or deleted
```

Note: For the commit hash, use the branch name and commit message in the entry. After committing, if you want to update with the actual hash, do so in the same push — but never skip the entry entirely.

4. **Be specific** — don't write "updated stuff." Name the functions, components, routes, or patterns that changed.
5. **Include the why** — future agents and contributors need to understand intent, not just diffs.
6. **Link to the commit** — include the short hash so anyone can `git show` it for full detail.
7. **This file is committed WITH every change** — it's part of the codebase, not separate. It MUST be in your staged files when committing.
