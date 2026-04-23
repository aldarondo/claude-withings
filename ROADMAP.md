# claude-withings Roadmap
> Tag key: `[Code]` = Claude Code · `[Cowork]` = Claude Cowork · `[Human]` = Charles must act

## 🔄 In Progress
<!-- nothing active -->

## 🔲 Backlog

### Deployment
- [x] `[Human]` 2026-04-21 — Created Withings developer app and provided credentials
- [x] `[Human]` 2026-04-21 — Completed OAuth2 flow for Charles; tokens in tokens.json
- [ ] `[Human]` Run `node src/authorize.js --user <name>` for each additional family member
- [x] `[Code]` 2026-04-19 — Deployed to Synology NAS (port 8769, SSE)
- [x] `[Code]` 2026-04-19 — Add `claude-withings` to `config/mcp.json` in brian-telegram (port 8769, SSE)

### Build & Infrastructure
- [x] `[Code]` 2026-04-21 — Add GHCR build-push workflow — Dockerfile + `.github/workflows/docker-publish.yml`; pushes `ghcr.io/aldarondo/claude-withings:latest` + SHA tag on every push to main
- [x] `[Code]` 2026-04-21 — Add weekly scheduled rebuild — `.github/workflows/docker-rebuild.yml`; no-cache build every Monday 4am UTC to pick up base-image security patches

### Enhancements
- [x] `[Code]` 2026-04-19 — Store latest measurements in brian-mem on each `get_weight` call
- [x] `[Code]` 2026-04-19 — Trend summary tool — compare current week vs last week for weight + activity

## ✅ Completed
- [x] 2026-04-19 — Scaffolded: MCP server (get_weight, get_sleep, get_activity, get_heart_rate), API client, auth module, unit tests
- [x] 2026-04-21 — Multi-user token store: tokens.json keyed by user name; all tools accept optional `user` param; browser auth UI at `http://<nas-ip>:<PORT>/`
- [x] 2026-04-21 — Removed get_sleep and get_activity (not supported by scale or blood pressure monitor); added brian-mem storage to get_heart_rate; simplified trend_summary to weight-only
- [x] 2026-04-21 — Withings webhook receiver: /webhook endpoint with secret token + IP allowlist + rate limiting; src/subscribe.js to register/revoke; withings_user_id stored in tokens.json for user mapping
- [x] 2026-04-21 — CI/CD pipeline: GitHub Actions builds GHCR image and auto-deploys to NAS via Cloudflare SSH tunnel on every push to main; Cloudflare Tunnel service added to docker-compose for public webhook exposure
- [x] 2026-04-21 — GHCR image pipeline: Dockerfile, build-push on push to main, weekly no-cache rebuild for security patches

## 🚫 Blocked
- ❌ [docker-monitor:container-stopped] Container `claude-withings` is not running on the NAS — check `docker logs claude-withings` and restart — 2026-04-23 08:42 UTC

- ❌ [docker-monitor:no-ghcr-image] Container `claude-withings` uses `node:20-alpine` — migrate to `ghcr.io/aldarondo/...` with a GitHub Actions build-push workflow — 2026-04-23 08:00 UTC
<!-- log blockers here -->
