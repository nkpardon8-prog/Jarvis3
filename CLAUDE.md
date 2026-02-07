# CLAUDE.md — Jarvis Project Agent Memory

## What is this project?

Jarvis is an Iron Man-inspired web dashboard that serves as a visual control surface over a locally-running **OpenClaw** AI assistant. It provides a sci-fi HUD interface for chatting with AI, managing email, calendar, CRM, skills, and connections to external services.

## Architecture

```
jarvis/
├── server/          Express 5 + TypeScript backend (port 3001)
│   ├── src/
│   │   ├── index.ts           Entry point, route mounting, gateway init
│   │   ├── config.ts          Mutable config from env vars (Record<string, any> & typed)
│   │   ├── gateway/           OpenClaw WebSocket gateway (protocol v3)
│   │   ├── middleware/        JWT auth, error handler
│   │   ├── routes/            REST API endpoints
│   │   ├── services/          OAuth, auth, Prisma client
│   │   ├── socket/            Socket.io setup + chat streaming
│   │   └── types/             Shared TS interfaces
│   └── prisma/schema.prisma   SQLite database schema
│
└── client/          Next.js 16 + React 19 frontend (port 3000)
    ├── app/                   App router pages
    ├── components/            React components (by feature)
    ├── lib/                   API client, contexts, hooks
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

- **Connection**: WebSocket at `ws://127.0.0.1:18789` (configurable)
- **Auth**: Challenge-response handshake using `OPENCLAW_AUTH_TOKEN`
- **Protocol**: v3 — request/response with `{ type: "req", id, method, params }` / `{ type: "res", id, ok, payload }`
- **83 methods** including `chat.send`, `chat.history`, `config.get`, `config.patch`, `models.list`, `skills.install`, etc.
- **Graceful degradation**: Server starts even if gateway is down; auto-reconnects with exponential backoff (1s→30s)
- **Singleton**: `server/src/gateway/connection.ts` exports `gateway` instance
- **Reconnect**: `gateway.reconnect()` method for hot-reload after config changes

### Critical: config.patch format

```typescript
// config.patch requires baseHash, NOT hash. additionalProperties: false enforces this.
gateway.send("config.patch", {
  raw: JSON.stringify(patch),
  baseHash: currentBaseHash  // Get from config.get first
});
```

### Critical: API key storage

OpenClaw reads provider API keys from `~/.openclaw/.env` via shell environment fallback, NOT from a `providers` config key. The Connections page writes keys there via the server's `POST /api/connections/store-credential` endpoint.

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
2. Credentials saved to `server/.env` AND hot-reloaded into runtime config (no restart needed)
3. Redirect to `GET /api/oauth/{provider}/auth-url` → consent screen
4. Provider callback → `GET /api/oauth/{provider}/callback` → exchanges code for tokens
5. Tokens stored in `OAuthToken` table, auto-refreshed when within 5 min of expiry
6. Calendar/email routes check for tokens via `getTokensForProvider(userId, provider)`

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
| `/api/connections` | routes/connections.ts | Config, providers, models, credentials |
| `/api/skills` | routes/skills.ts | List, install, update, hub search |
| `/api/todos` | routes/todos.ts | CRUD for todos |
| `/api/calendar` | routes/calendar.ts | Events (Google/Microsoft), build-agenda |
| `/api/email` | routes/email.ts | Status, inbox (Gmail/Outlook), tags, settings |
| `/api/crm` | routes/crm.ts | CRM features |
| `/api/oauth` | routes/oauth.ts | OAuth URLs, callbacks, status, disconnect, store-credentials |
| `/api/gateway` | routes/gateway.ts | Gateway status, configure (save + reconnect) |

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
| `/dashboard/connections` | ConnectionsPage | Gateway, OAuth, providers, services |

## Environment Variables (server/.env)

```
PORT=3001
JWT_SECRET=<random-string>
OPENCLAW_GATEWAY_URL=ws://127.0.0.1:18789
OPENCLAW_AUTH_TOKEN=<from-openclaw>
GOOGLE_CLIENT_ID=<optional>
GOOGLE_CLIENT_SECRET=<optional>
GOOGLE_REDIRECT_URI=http://localhost:3001/api/oauth/google/callback
MICROSOFT_CLIENT_ID=<optional>
MICROSOFT_CLIENT_SECRET=<optional>
MICROSOFT_REDIRECT_URI=http://localhost:3001/api/oauth/microsoft/callback
```

Template at `server/.env.example`. The config object in `server/src/config.ts` is intentionally mutable (`Record<string, any> &`) so OAuth credential storage can hot-reload values without restarting the server.

## Gotchas & Patterns

- **config.ts is mutable** — The intersection type `Record<string, any> &` allows runtime updates when storing OAuth/gateway credentials
- **Next.js rewrites** — All `/api/*` requests proxy from :3000 to :3001 via `next.config.ts`
- **OAuth callbacks bypass proxy** — Must use `http://localhost:3001/api/oauth/...` directly
- **OpenClaw .env** — Provider API keys (OpenAI, Anthropic, etc.) go to `~/.openclaw/.env`, not the server `.env`
- **chat.send streaming** — Gateway sends events; the socket handler in `server/src/socket/chat.ts` forwards them as Socket.io events
- **Prisma generate** — Run `npx prisma generate` if you modify schema.prisma, then `npx prisma db push` to apply
- **Port conflicts** — Kill stale processes with `lsof -ti:3001 | xargs kill -9` if EADDRINUSE
- **No .env in git** — Root and server `.gitignore` both exclude `.env`, `*.db`, `node_modules/`, `.claude/`
