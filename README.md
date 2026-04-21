# claude-withings

MCP server deployed on Synology NAS via Docker. Pulls weight, body composition, sleep, and activity data from the Withings health API. Exposes tools callable by Claude skills.

## Features
- Get weight and body composition measurements
- Get sleep metrics (duration, score, stages)
- Get activity data (steps, calories, active minutes)
- Weekly trend summary (current vs prior week)
- Stores latest measurements in brian-mem (fire-and-forget)
- OAuth2 with auto-refresh tokens

## Tech Stack
| Layer | Technology |
|---|---|
| Runtime | Node.js 20 (alpine) |
| MCP SDK | `@modelcontextprotocol/sdk` |
| HTTP | axios |
| Auth | OAuth2 (auto-refresh) |
| Container | Docker Compose, image published to GHCR |
| CI | GitHub Actions (`.github/workflows/docker-build-push.yml`) |
| Memory store | brian-mem (optional) |

## Getting Started (local dev)

```bash
npm install

# Copy and fill env vars
cp .env.example .env   # set WITHINGS_CLIENT_ID, WITHINGS_CLIENT_SECRET

# Complete OAuth2 flow (one-time — writes tokens back to .env)
node src/authorize.js

# Run locally (stdio mode)
npm start

# Run tests
npm test
```

## Image & CI

Every push to `main` triggers `.github/workflows/docker-build-push.yml`, which builds and publishes the image to GitHub Container Registry:

- `ghcr.io/aldarondo/claude-withings:latest`
- `ghcr.io/aldarondo/claude-withings:sha-<short>`

The image contains only the runtime (`npm ci --omit=dev` + `src/`) — no secrets. Credentials are injected at runtime via `.env`.

## Deploy (Synology NAS)

```bash
# On the NAS, beside docker-compose.yml:
#   .env must contain WITHINGS_CLIENT_ID, WITHINGS_CLIENT_SECRET,
#   WITHINGS_ACCESS_TOKEN, WITHINGS_REFRESH_TOKEN, WITHINGS_TOKEN_EXPIRES_AT
docker compose pull
docker compose up -d
docker compose logs -f
```

`docker-compose.yml` pulls `ghcr.io/aldarondo/claude-withings:latest` and runs `node src/serve.js` on port `8769` (SSE). Update by re-running `docker compose pull && docker compose up -d` after a new image is published.

## Setup (first time)

1. Create a Withings developer app at https://developer.withings.com/dashboard/
   - Callback URL: `http://localhost:8765/callback`
   - Notification URL: leave blank (pull-based, no webhooks)
2. Copy `.env.example` → `.env`, fill in `WITHINGS_CLIENT_ID` and `WITHINGS_CLIENT_SECRET`
3. Run `node src/authorize.js` to complete the OAuth2 flow and populate tokens
4. Copy the finished `.env` to the NAS beside `docker-compose.yml`
5. Tokens auto-refresh — `WITHINGS_REFRESH_TOKEN` and `WITHINGS_ACCESS_TOKEN` update automatically

## Project Status
Active development. See [ROADMAP.md](ROADMAP.md) for what's planned.

---
**Publisher:** Xity Software, LLC
