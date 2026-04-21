# claude-withings Roadmap
> Tag key: `[Code]` = Claude Code · `[Cowork]` = Claude Cowork · `[Human]` = Charles must act

## 🔄 In Progress
<!-- nothing active -->

## 🔲 Backlog

### Deployment
- [ ] `[Human]` Create Withings developer app at https://developer.withings.com/dashboard/
- [x] `[Code]` 2026-04-19 — Write `src/authorize.js` — interactive CLI OAuth2 flow (opens browser, captures code, exchanges for tokens, writes .env)
- [ ] `[Human]` Run `node src/authorize.js` to complete OAuth2 and populate tokens in `.env`
- [x] `[Code]` 2026-04-19 — Deployed to Synology NAS (port 8769, SSE); container running — blocked on `[Human]` completing OAuth2 flow to populate tokens
- [x] `[Code]` 2026-04-19 — Add `claude-withings` to `config/mcp.json` in brian-telegram (port 8769, SSE); added `src/serve.js` + `src/server.js` factory

### Build & Infrastructure
- [ ] `[Code]` Add GHCR build-push workflow — migrate container from `node:20-alpine` to a versioned GHCR image (`ghcr.io/aldarondo/...`) with GitHub Actions auto-deploy
- [ ] `[Code]` Add weekly scheduled rebuild — GitHub Actions `schedule: cron` to repull and push a fresh image every week, picking up base-image security patches

### Enhancements
- [x] `[Code]` 2026-04-19 — Store latest measurements in brian-mem on each `get_weight` call — fire-and-forget via `src/memory.js`; requires `BRIAN_MEM_URL` env var (silently skips if absent)
- [x] `[Code]` 2026-04-19 — Trend summary tool — compare current week vs last week for weight + activity

## ✅ Completed
- [x] 2026-04-19 — Scaffolded: MCP server (get_weight, get_sleep, get_activity, get_heart_rate), API client, auth module, unit tests

## 🚫 Blocked
<!-- log blockers here -->
