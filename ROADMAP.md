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
- [ ] `[Code]` Add GHCR build-push workflow — migrate container from `node:20-alpine` to a versioned GHCR image (`ghcr.io/aldarondo/...`) with GitHub Actions auto-deploy
- [ ] `[Code]` Add weekly scheduled rebuild — GitHub Actions `schedule: cron` to repull and push a fresh image every week, picking up base-image security patches

### Enhancements
- [x] `[Code]` 2026-04-19 — Store latest measurements in brian-mem on each `get_weight` call
- [x] `[Code]` 2026-04-19 — Trend summary tool — compare current week vs last week for weight + activity

## ✅ Completed
- [x] 2026-04-19 — Scaffolded: MCP server (get_weight, get_sleep, get_activity, get_heart_rate), API client, auth module, unit tests
- [x] 2026-04-21 — Multi-user token store: tokens.json keyed by user name; all tools accept optional `user` param; authorize.js takes `--user <name>` flag

## 🚫 Blocked
<!-- log blockers here -->
