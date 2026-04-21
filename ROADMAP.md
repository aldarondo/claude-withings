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

### Enhancements
- [x] `[Code]` 2026-04-19 — Store latest measurements in brian-mem on each `get_weight` call — fire-and-forget via `src/memory.js`; requires `BRIAN_MEM_URL` env var (silently skips if absent)
- [x] `[Code]` 2026-04-19 — Trend summary tool — compare current week vs last week for weight + activity

## ✅ Completed
- [x] 2026-04-19 — Scaffolded: MCP server (get_weight, get_sleep, get_activity, get_heart_rate), API client, auth module, unit tests
- [x] `[Code]` 2026-04-21 — Migrate container to `ghcr.io/aldarondo/claude-withings` — added `Dockerfile`, `.dockerignore`, and `.github/workflows/docker-build-push.yml` (builds on push to `main`, tags `latest` + short SHA); updated `docker-compose.yml` to pull the GHCR image

## 🚫 Blocked
- ❌ [docker-monitor:container-stopped] Container `claude-withings` is not running on the NAS — check `docker logs claude-withings` and restart — 2026-04-21 08:42 UTC
- ❌ [docker-monitor:no-ghcr-image] Container `claude-withings` uses `node:20-alpine` — migrate to `ghcr.io/aldarondo/...` with a GitHub Actions build-push workflow — 2026-04-21 08:00 UTC
<!-- log blockers here -->
