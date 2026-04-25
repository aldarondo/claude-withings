# claude-withings Roadmap
> Tag key: `[Code]` = Claude Code · `[Cowork]` = Claude Cowork · `[Human]` = Charles must act

## 🔄 In Progress
<!-- nothing active -->

## 🔲 Backlog

- [ ] `[Human]` Authorize additional family members — open `http://<nas-ip>:8769/` and run `subscribe.js --action subscribe` for each

## ✅ Completed

- [x] 2026-04-25 — Webhook fully operational: charles subscribed for weight + heart rate; Cloudflare Tunnel ingress added for `withings.aldarondo.family`; serve.js handles `POST /` (Withings requires bare-domain callback, no path); subscribe.js uses `WEBHOOK_CALLBACK_URL`
- [x] 2026-04-25 — `backfill_to_memory` tool: fetches historical Withings data and stores monthly summaries in brian-mem; monthly-hashes.json tracks hash per user/month to enable upserts
- [x] 2026-04-23 — Updated Dockerfile base image from `node:20-alpine` to `node:22-alpine`
- [x] 2026-04-21 — CI/CD pipeline: GitHub Actions builds GHCR image and auto-deploys to NAS via Cloudflare SSH tunnel on every push to main
- [x] 2026-04-21 — Withings webhook receiver: rate limiting + IP allowlist; src/subscribe.js to register/list/revoke; withings_user_id stored in tokens.json for user mapping
- [x] 2026-04-21 — Multi-user token store: tokens.json keyed by user name; all tools accept optional `user` param; browser auth UI at `http://<nas-ip>:<PORT>/`
- [x] 2026-04-21 — Removed get_sleep and get_activity (not supported by devices); added brian-mem storage to get_heart_rate; trend_summary weight-only
- [x] 2026-04-21 — Completed OAuth2 flow for Charles; tokens in tokens.json
- [x] 2026-04-21 — Created Withings developer app and provided credentials
- [x] 2026-04-19 — Trend summary tool — compare current week vs last week
- [x] 2026-04-19 — Store latest measurements in brian-mem on each tool call
- [x] 2026-04-19 — Deployed to Synology NAS (port 8769, SSE); added to brian-telegram MCP config
- [x] 2026-04-19 — Scaffolded: MCP server, API client, auth module, unit tests

## 🚫 Blocked
<!-- nothing blocked -->
