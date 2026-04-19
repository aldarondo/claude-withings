# claude-withings

## Project Purpose
MCP server deployed on Synology NAS via Docker. Pulls weight, body composition, sleep, and activity data from the Withings API. Exposes tools callable by Claude skills.

## Key Commands
```bash
npm install          # install dependencies
npm start            # run locally (stdio mode)
npm test             # run unit tests
node src/authorize.js  # interactive OAuth2 flow to get initial tokens
docker compose up -d
docker compose logs -f
```

## Setup
1. Create a Withings developer app at https://developer.withings.com/dashboard/
2. Copy `.env.example` → `.env`, fill in CLIENT_ID and CLIENT_SECRET
3. Run `node src/authorize.js` to complete the OAuth2 flow and get tokens
4. Tokens auto-refresh — WITHINGS_REFRESH_TOKEN and WITHINGS_ACCESS_TOKEN update in env/compose

## Testing Requirements
- Unit tests in `tests/unit/` with Jest unstable_mockModule for axios + auth
- Run before marking any task complete: `npm test`

## After Every Completed Task
- Move task to ✅ Completed in ROADMAP.md with today's date

## Git Rules
- Never create pull requests. Push directly to main.
- solo/auto-push OK

@~/Documents/GitHub/CLAUDE.md
