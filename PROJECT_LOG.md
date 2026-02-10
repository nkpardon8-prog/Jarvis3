# PROJECT_LOG.md

Chronological project log (higher-signal than CHANGES.md).

## 2026-02-10
- Environment brought up locally (server + client).
- Gateway successfully connected via OPENCLAW_GATEWAY_URL + OPENCLAW_AUTH_TOKEN.
- Began implementation planning for a new dashboard tab:
  - "Your everyday AI" (BYOK chat wrapper, not OpenClaw-agent driven)
  - Sub-tab "Active research" (OpenClaw-gateway driven research-only agent + auto-installed skill)
- Implemented "Your everyday AI" end-to-end:
  - New navigation tab and `/dashboard/everyday-ai` UI with Chat + Active research sub-tabs
  - BYOK provider/model dropdown, streaming chat, advanced toggles, and memory injection
  - Encrypted per-user provider keys in Prisma with gateway auto-import
  - Active research gateway route with strict system prompt + skill auto-install
