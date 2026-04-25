# claude-withings

MCP server that pulls weight, body composition, and heart rate data from the Withings API. Exposes tools callable by Claude (via Claude Desktop, Claude Code, or any MCP-compatible client). Supports multiple users — each person authorizes their own Withings account via a browser UI.

## Supported devices

- **Withings scale** — body composition (weight, fat %, muscle mass, bone mass, hydration)
- **Withings BPM Connect** — heart rate readings (stored as measurement type 11 in the Withings `/measure` API)

> Sleep and activity tracking are not available on these devices and are not supported.

---

## Quickstart (local / standalone)

No NAS, no Docker, no external memory store required. This is the fastest way to get running.

### Prerequisites

- Node.js 22+
- A Withings account and at least one supported device
- A Withings developer app (free — see step 1 below)

### 1. Create a Withings developer app

Go to [developer.withings.com/dashboard](https://developer.withings.com/dashboard/) and create an app.

- **Target environment:** Production (Development mode blocks external webhook URLs)
- Note your **Client ID** and **Client Secret**
- **Registered URL:** set to `http://localhost:8769` for local use (or your public domain if using webhooks — see [Webhook setup](#webhook-setup-optional) below)
- **OAuth redirect URI:** `http://localhost:8769/auth/callback`

### 2. Clone and configure

```bash
git clone https://github.com/aldarondo/claude-withings.git
cd claude-withings
npm install
cp .env.example .env
```

Edit `.env` — at minimum, fill in:

```env
WITHINGS_CLIENT_ID=your_client_id
WITHINGS_CLIENT_SECRET=your_client_secret
WITHINGS_DEFAULT_USER=yourname
SERVER_HOST=localhost
PORT=8769
WEBHOOK_SECRET=any_random_string
```

The `BRIAN_MEM_*` variables are optional — leave them blank if you don't have a brian-mem instance. Tools still return data to Claude; it just won't be auto-stored in a memory graph.

### 3. Start the server

```bash
npm start        # stdio mode — for direct MCP use (Claude Desktop, Claude Code)
# or
node src/serve.js  # HTTP/SSE mode — for network-accessible deployment
```

### 4. Authorize your Withings account

With the server running, open:

```
http://localhost:8769/
```

Enter your name and click **Authorize**. You'll be redirected to Withings to log in. Tokens are saved to `tokens.json` automatically. Repeat for any additional users.

### 5. Connect to Claude

**Claude Desktop (`stdio` mode)** — add to `claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "withings": {
      "command": "node",
      "args": ["/path/to/claude-withings/src/index.js"]
    }
  }
}
```

**Claude Code** — add to `.claude/settings.json`:

```json
{
  "mcpServers": {
    "withings": {
      "command": "node",
      "args": ["/path/to/claude-withings/src/index.js"]
    }
  }
}
```

**HTTP/SSE mode** (for remote access) — point your MCP client at `http://localhost:8769/sse`.

---

## Tools

| Tool | Description | Writes to brian-mem |
|------|-------------|---------------------|
| `get_weight` | Latest weight and body composition from scale | ✅ (if configured) |
| `get_heart_rate` | Heart rate readings from BPM Connect | ✅ (if configured) |
| `trend_summary` | Weight this week vs last week | — |
| `backfill_to_memory` | Fetch historical data and store monthly summaries in brian-mem | ✅ (if configured) |

Monthly summaries include aggregated stats (avg/min/max/count) plus individual daily readings for body metrics and timestamped BPM readings. Each summary is prefixed with a unique header (`Withings health summary — {user} {month}`) so distinct months produce distinct embeddings in the memory store.

All tools accept an optional `user` parameter (e.g. `{ "user": "laura" }`). Defaults to `WITHINGS_DEFAULT_USER` if omitted.

---

## Environment variables

| Variable | Required | Description |
|----------|----------|-------------|
| `WITHINGS_CLIENT_ID` | ✅ | Client ID from your Withings developer app |
| `WITHINGS_CLIENT_SECRET` | ✅ | Client secret from your Withings developer app |
| `WITHINGS_DEFAULT_USER` | ✅ | Name used when no `user` param is passed to MCP tools |
| `SERVER_HOST` | ✅ | Hostname/IP of this machine — used in OAuth redirect URLs |
| `PORT` | — | Port to listen on (default: `8769`) |
| `WEBHOOK_SECRET` | — | Random string embedded in the callback URL — generate with `openssl rand -hex 32` |
| `WEBHOOK_CALLBACK_URL` | — | Public HTTPS URL Withings POSTs to (required for webhooks) |
| `WITHINGS_WEBHOOK_IPS` | — | Comma-separated Withings source IPs for allowlisting (optional; leave blank to skip) |
| `MEM_URL` | — | URL of any MCP memory server (optional; tools work without it) |
| `MCP_CLIENT_ID` | — | Cloudflare Access client ID for the memory server |
| `MCP_CLIENT_SECRET` | — | Cloudflare Access client secret for the memory server |

Tokens are stored in `tokens.json` (gitignored) and auto-refreshed — you don't manage them manually.

---

## Adding users

Open `http://<SERVER_HOST>:<PORT>/` in a browser, enter a name, and have that person log in with their Withings account. Tokens are saved automatically. No server restart needed.

---

## Webhook setup (optional)

Without webhooks, data is fetched on demand when Claude calls a tool. With webhooks, Withings pushes a notification whenever someone steps on the scale or takes a blood pressure reading — data arrives automatically.

Webhooks require a **public HTTPS URL** that Withings can POST to. Any reverse proxy works (Nginx, Caddy, Traefik, Cloudflare Tunnel, ngrok, etc.).

### Steps

1. Set `WEBHOOK_CALLBACK_URL` in `.env` to your public domain, bare (no path or query string — Withings requires an exact match):
   ```env
   WEBHOOK_CALLBACK_URL=https://withings.yourdomain.com
   ```

2. Set the same URL as the **Registered URL** in your Withings developer app.

3. Point your reverse proxy at `http://<host>:<PORT>` — the server handles all routing internally.

4. Register webhooks for each user (run after the server is deployed and reachable):
   ```bash
   node src/subscribe.js --user yourname --action subscribe
   ```

5. Verify registrations:
   ```bash
   node src/subscribe.js --user yourname --action list
   ```

6. To remove webhooks:
   ```bash
   node src/subscribe.js --user yourname --action revoke
   ```

### Optional: IP allowlisting

Contact Withings developer support for their webhook source IP ranges, then add to `.env`:
```env
WITHINGS_WEBHOOK_IPS=1.2.3.4,5.6.7.8
```
Leave blank to skip the check (fine for personal use).

---

## Docker deployment

A `Dockerfile` and `docker-compose.yml` are included for containerized deployment.

```bash
# Build and run locally
docker compose up -d
docker compose logs -f
```

Mount your `.env`, `tokens.json`, and `monthly-hashes.json` as volume files so they persist across container restarts:

```yaml
volumes:
  - ./tokens.json:/app/tokens.json
  - ./monthly-hashes.json:/app/monthly-hashes.json
  - ./.env:/app/.env
```

Create empty data files before first run:
```bash
echo '{}' > tokens.json
echo '{}' > monthly-hashes.json
```

---

## CI/CD (example: Synology NAS via GitHub Actions)

The included `.github/workflows/build.yml` builds the Docker image, pushes it to GHCR, and SSHes into a NAS to redeploy on every push to `main`. It assumes:

- A NAS reachable via SSH through a Cloudflare Tunnel
- The container running at `/volume1/docker/claude-withings/`

Required GitHub Actions secrets for this workflow:

| Secret | Description |
|--------|-------------|
| `NAS_SSH_PASSWORD` | NAS SSH password |
| `CF_ACCESS_CLIENT_ID` | Cloudflare Access service token client ID |
| `CF_ACCESS_CLIENT_SECRET` | Cloudflare Access service token client secret |

A weekly rebuild also runs every Sunday at 8am UTC to pick up base-image security patches.

You can adapt the workflow for any SSH-accessible host by updating the connection details.

---

## Project structure

```
src/
  serve.js        — Express HTTP/SSE server + browser auth UI + webhook receiver
  server.js       — MCP tool definitions
  api.js          — Withings REST API client
  auth.js         — per-user token management with auto-refresh
  tokenStore.js   — read/write tokens.json (keyed by user name)
  memory.js       — brian-mem integration (optional, fire-and-forget)
  monthlyStore.js — read/write monthly-hashes.json (tracks brian-mem hash per user/month)
  backfill.js     — historical data fetch and monthly summary builder
  subscribe.js    — CLI to register/list/revoke Withings webhook subscriptions
  index.js        — stdio entry point
  authorize.js    — CLI OAuth2 flow alternative to browser UI (--user <name>)
.github/
  workflows/
    build.yml           — build + push to GHCR + deploy to NAS on push to main; weekly Sunday rebuild
Dockerfile
tokens.json             — per-user OAuth tokens (gitignored)
monthly-hashes.json     — brian-mem hash index per user/month (gitignored)
.env                    — credentials and config (gitignored)
.env.example            — template with all variables listed
```

---

## Tech stack

| Layer | Technology |
|-------|------------|
| Runtime | Node.js 22 |
| MCP SDK | @modelcontextprotocol/sdk |
| HTTP | Express + axios |
| Auth | OAuth2 with per-user auto-refresh |
| Container | Docker Compose + GHCR |
| Memory store | brian-mem (optional) |

## Project status

Active. See [ROADMAP.md](ROADMAP.md) for history and backlog.
