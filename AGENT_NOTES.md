# AGENT_NOTES.md

Running notes for agent-driven development on Jarvis3.

## 2026-02-10
- Started setup on Mac mini, running:
  - server: http://localhost:3001 (connected to OpenClaw gateway ws://127.0.0.1:18789)
  - client: http://localhost:3000
- Admin account created for local testing:
  - username: nick
  - (password shared in Telegram thread)
- Completed feature: "Your everyday AI" + "Active research" (feat/everyday-ai branch)
  - New dashboard tab + route
  - BYOK chat streaming + memory injection
  - Provider keys stored encrypted in Prisma with gateway auto-import
  - Active research gateway route + skill auto-install
