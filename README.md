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
| Runtime | Node.js 20 |
| MCP SDK | @modelcontextprotocol/sdk |
| HTTP | axios |
| Auth | OAuth2 (auto-refresh) |
| Container | Docker Compose |
| Memory store | brian-mem (optional) |

## Getting Started

```bash
npm install

# Copy and fill env vars
cp .env.example .env   # set CLIENT_ID, CLIENT_SECRET

# Complete OAuth2 flow (one-time)
node src/authorize.js

# Run locally (stdio mode)
npm start

# Run tests
npm test

# Deploy on NAS
docker compose up -d
docker compose logs -f
```

## Setup

1. Create a Withings developer app at https://developer.withings.com/dashboard/
2. Copy `.env.example` → `.env`, fill in `CLIENT_ID` and `CLIENT_SECRET`
3. Run `node src/authorize.js` to complete the OAuth2 flow and get tokens
4. Tokens auto-refresh — `WITHINGS_REFRESH_TOKEN` and `WITHINGS_ACCESS_TOKEN` update automatically

## Project Status
Active development. See [ROADMAP.md](ROADMAP.md) for what's planned.

---
**Publisher:** Xity Software, LLC
