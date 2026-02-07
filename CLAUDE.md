# CLAUDE.md — Jarvis Project Agent Memory

## What is this project?

Jarvis is an Iron Man-inspired web dashboard that serves as a visual control surface over a locally-running **OpenClaw** AI assistant. It provides a sci-fi HUD interface for chatting with AI, managing email, calendar, CRM, skills, and connections to external services.

## Core Architecture Principle

**100% of operations route through the OpenClaw Gateway.** The Jarvis UI is designed to be fully portable — it can connect to any OpenClaw instance without local filesystem dependencies. There are ZERO direct filesystem reads/writes in any route file. All credential storage, config management, and skill creation happen through gateway methods (`config.get`, `config.patch`, `chat.send`).

The only "local" config is the gateway URL + auth token (which defines WHERE to connect), set via environment variables or the Gateway Card UI.

## Architecture

```
jarvis/
├── server/          Express 5 + TypeScript backend (port 3001)
│   ├── src/
│   │   ├── index.ts           Entry point, route mounting, gateway init + OAuth hydration
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
│   │   │   └── gateway.ts     Gateway status, configure (runtime-only)
│   │   ├── services/          OAuth, auth, Prisma client
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
- **OAuth hydration**: On connect, `index.ts` loads OAuth credentials from `config.jarvis.oauth` into runtime

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

**All credential storage goes through the gateway.** There are NO direct filesystem writes anywhere.

- **Provider API keys** (OpenAI, Anthropic, etc.): Stored via `agentExec()` prompt that writes to `~/.openclaw/.env` on the OpenClaw host, PLUS redundantly stored in gateway config at `models.providers.<provider>.apiKey` via `config.patch` for fast reads
- **Service keys** (Notion, Trello, etc.): Same `agentExec()` pattern to `~/.openclaw/.env`
- **OAuth client credentials** (Google/Microsoft): Stored in gateway config at `config.jarvis.oauth.<provider>` via `config.patch`, hydrated into runtime on gateway connect
- **Custom integration credentials**: Stored via `agentExec()` to `~/.openclaw/.env` using idempotent update-or-append pattern
- **Config metadata tracking**: `config.storedEnvKeys` object tracks which env vars have been stored (for fast status lookups without querying the agent)

### Gateway config namespace conventions

```
config.models.providers.<provider>.apiKey    — LLM provider API keys (redundant store)
config.storedEnvKeys.<ENV_VAR_NAME>          — Boolean flags for configured env vars
config.jarvis.oauth.<provider>               — OAuth client ID + secret
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

Models: `User`, `Todo`, `EmailTag`, `EmailSettings`, `CrmSettings`, `OAuthToken`, `Notification`, `OnboardingProgress`

Key relationships:
- `OAuthToken` has `@@unique([userId, provider])` — one token per provider per user
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

## OAuth Flow

1. User enters Client ID + Secret on Connections page → `POST /api/oauth/store-credentials`
2. Credentials saved to gateway config at `config.jarvis.oauth.<provider>` via `config.patch` + hot-reloaded into runtime config (no restart needed)
3. On server startup/reconnect, credentials are hydrated from gateway config in `index.ts` `connected` event handler
4. Redirect to `GET /api/oauth/{provider}/auth-url` → consent screen
5. Provider callback → `GET /api/oauth/{provider}/callback` → exchanges code for tokens
6. Tokens stored in `OAuthToken` table (Prisma/SQLite), auto-refreshed when within 5 min of expiry
7. Calendar/email routes check for tokens via `getTokensForProvider(userId, provider)`

Google scopes: gmail.modify, calendar, spreadsheets, documents, drive.file, userinfo.email, userinfo.profile
Microsoft scopes: Mail.ReadWrite, Calendars.ReadWrite, Files.ReadWrite.All, User.Read, offline_access

OAuth callbacks must point to Express (port 3001) directly since they are full page navigations.

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
GOOGLE_CLIENT_ID=<optional — also stored in gateway config>
GOOGLE_CLIENT_SECRET=<optional — also stored in gateway config>
GOOGLE_REDIRECT_URI=http://localhost:3001/api/oauth/google/callback
MICROSOFT_CLIENT_ID=<optional — also stored in gateway config>
MICROSOFT_CLIENT_SECRET=<optional — also stored in gateway config>
MICROSOFT_REDIRECT_URI=http://localhost:3001/api/oauth/microsoft/callback
```

Template at `server/.env.example`. The config object in `server/src/config.ts` is intentionally mutable (`Record<string, any> &`) so credentials can be hot-reloaded at runtime from gateway config without restarting.

**Note:** The only values that MUST be in the local `.env` are `JWT_SECRET`, `OPENCLAW_GATEWAY_URL`, and `OPENCLAW_AUTH_TOKEN`. All other credentials (OAuth, provider keys, service keys) are stored in and read from the gateway config, making the UI fully portable.

## Gotchas & Patterns

- **Gateway-only architecture** — ZERO `fs` imports in any route file. All credential/config operations go through `gateway.send()` or `agentExec()`. This is enforced by design for portability.
- **config.ts is mutable** — The intersection type `Record<string, any> &` allows runtime updates when hydrating OAuth/gateway credentials from gateway config
- **OAuth hydration on connect** — `index.ts` listens for gateway `"connected"` event and loads `config.jarvis.oauth.*` into runtime config automatically
- **patchConfig retry** — All `config.patch` calls should use the `patchConfig()` helper with retry logic to handle hash conflicts from concurrent writes
- **agentExec idempotent prompts** — Credential storage prompts use "update-or-append" pattern: if a line starting with `KEY=` exists, replace it; otherwise append. This prevents duplicates on retry.
- **deliver: "full"** — Used in `agentExec()` and calendar's `build-agenda` to get complete agent responses synchronously without streaming
- **Next.js rewrites** — All `/api/*` requests proxy from :3000 to :3001 via `next.config.ts`
- **OAuth callbacks bypass proxy** — Must use `http://localhost:3001/api/oauth/...` directly
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

- Always `git pull origin main --rebase` before committing.
- Stage specific files by name — **never use `git add .` or `git add -A`**. This prevents accidentally committing `.env`, `.db`, or other local files.
- Write clear commit messages that describe the **why**, not just the what.
- Never amend commits that have already been pushed.

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

Every new Claude Code session should begin with:
1. `git fetch origin` — see what's changed remotely
2. `git status` — check for local uncommitted work
3. `git pull origin main --rebase` — sync up (if on main)
4. If on a feature branch: `git pull origin <branch> --rebase` to sync that too

This ensures neither contributor's agent starts working on stale code.

## Change Tracking (MANDATORY)

All changes are logged in **`CHANGES.md`** at the project root. This file is the shared context window for both contributors and their agents.

### Rules

1. **Read `CHANGES.md` at the start of every session** — before writing any code, read the recent entries to understand what's changed.
2. **Append an entry after every commit.** No exceptions. The entry goes at the top of the log (below the header), so the most recent change is always first.
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

4. **Be specific** — don't write "updated stuff." Name the functions, components, routes, or patterns that changed.
5. **Include the why** — future agents and contributors need to understand intent, not just diffs.
6. **Link to the commit** — include the short hash so anyone can `git show` it for full detail.
7. **This file is committed with every change** — it's part of the codebase, not separate. Include it in your staged files when committing.
