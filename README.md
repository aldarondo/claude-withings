# claude-withings

MCP server that pulls weight and heart rate data from the Withings API. Runs on a Synology NAS via Docker and exposes tools callable by Claude skills. Supports multiple family members — each person authorizes their own Withings account via a browser UI, no SSH required.

## Supported devices

- **Withings scale** — body composition (weight, fat %, muscle mass, bone mass, hydration)
- **Withings blood pressure monitor** — heart rate readings

> Sleep and activity tracking are not available on these devices and are not supported.

## Tools

| Tool | Description | Writes to brian-mem |
|------|-------------|---------------------|
| `get_weight` | Latest weight and body composition from scale | ✅ |
| `get_heart_rate` | Heart rate readings from blood pressure monitor | ✅ |
| `trend_summary` | Weight this week vs last week | — |

All tools accept an optional `user` parameter to query a specific family member's data (e.g. `{ "user": "laura" }`). Defaults to `WITHINGS_DEFAULT_USER` if omitted.

---

## CI/CD

Every push to `main`:
1. GitHub Actions builds the Docker image and pushes it to `ghcr.io/aldarondo/claude-withings:latest`
2. Actions SSHes into the NAS via Cloudflare Tunnel and runs `docker compose pull && up -d`

Required GitHub Actions secrets (set once at the repo or org level):

| Secret | Description |
|--------|-------------|
| `NAS_SSH_PASSWORD` | NAS SSH password |
| `CF_ACCESS_CLIENT_ID` | Cloudflare Access service token client ID |
| `CF_ACCESS_CLIENT_SECRET` | Cloudflare Access service token client secret |

A weekly no-cache rebuild also runs every Monday at 4am UTC to pick up base-image security patches.

---

## Initial NAS setup

This is a one-time process. After this, all updates deploy automatically via GitHub Actions.

### 1. Create a Withings developer app

Go to [developer.withings.com/dashboard](https://developer.withings.com/dashboard/) and create an app. Note your **Client ID** and **Client Secret**.

Set the redirect URI in the Withings app settings to:
```
http://<your-nas-ip>:<PORT>/auth/callback
```

### 2. Configure the NAS `.env`

On the NAS at `/volume1/docker/claude-withings/.env`, ensure these variables are set:

| Variable | Description |
|----------|-------------|
| `WITHINGS_CLIENT_ID` | Client ID from your Withings developer app |
| `WITHINGS_CLIENT_SECRET` | Client secret from your Withings developer app |
| `WITHINGS_DEFAULT_USER` | Name of the primary user (e.g. `charles`) |
| `SERVER_HOST` | LAN IP of the NAS — used for OAuth redirect URLs |
| `PORT` | Port to listen on (default: `8769`) |
| `WEBHOOK_SECRET` | Random secret for webhook URL — generate with `openssl rand -hex 32` |
| `WITHINGS_WEBHOOK_IPS` | Comma-separated Withings source IPs (leave blank initially) |
| `BRIAN_MEM_URL` | URL of the brian-mem MCP server |
| `BRIAN_MCP_CLIENT_ID` | Cloudflare Access client ID for brian-mem |
| `BRIAN_MCP_CLIENT_SECRET` | Cloudflare Access client secret for brian-mem |

Tokens are stored in `tokens.json` on the NAS (gitignored) and auto-refreshed — you don't manage them manually.

### 3. Create an empty tokens.json on the NAS

```bash
echo '{}' > /volume1/docker/claude-withings/tokens.json
```

### 4. Push code to trigger first deploy

```bash
git push origin main
```

GitHub Actions will build the image and deploy it to the NAS automatically.

### 5. Authorize family members

Once the container is running, open the auth UI in any browser on your local network:

```
http://<nas-ip>:<PORT>/
```

Enter a name (e.g. `charles`, `laura`) and click **Authorize**. Each person logs in with their own Withings account. Their tokens are saved to `tokens.json` automatically. Repeat for each family member. No SSH or server restart needed.

---

## Webhook setup (automatic data push from Withings)

Without webhooks, data only enters brian-mem when Claude actively calls a tool. With webhooks, Withings pushes a notification the moment someone steps on the scale or takes a blood pressure reading — data lands in brian-mem automatically with no conversation needed.

### Cloudflare Tunnel setup

The webhook endpoint must be publicly accessible. The `claude-withings-tunnel` service in `docker-compose.yml` handles this using Cloudflare Tunnel.

**In the Cloudflare Zero Trust dashboard:**
1. Go to **Networks → Tunnels** and create a new tunnel named `claude-withings`
2. Add a public hostname (e.g. `withings.yourdomain.com`) pointing to `http://localhost:8769`
3. Copy the tunnel token

**On the NAS**, add to `.env`:
```env
WEBHOOK_TUNNEL_TOKEN=<tunnel token from Cloudflare dashboard>
```

Then start the tunnel service:
```bash
docker compose --profile tunnel up -d
```

The webhook URL will be: `https://withings.yourdomain.com/webhook?token=<WEBHOOK_SECRET>`

### Register webhooks with Withings

Run once per family member (from the NAS or locally with `.env` loaded):

```bash
node --env-file=.env src/subscribe.js --user charles --action subscribe
node --env-file=.env src/subscribe.js --user laura --action subscribe
```

This registers the webhook for both weight (`appli=1`) and heart rate (`appli=4`) events.

### Add IP allowlisting (recommended)

Contact Withings developer support to get their webhook source IP ranges. Add them to `.env`:
```env
WITHINGS_WEBHOOK_IPS=1.2.3.4,5.6.7.8
```
If left blank, the IP check is skipped — the secret token is still enforced.

### How it works

1. Family member steps on scale or takes a blood pressure reading
2. Withings POSTs to `https://withings.yourdomain.com/webhook?token=<secret>`
3. Cloudflare Tunnel forwards the request to the NAS
4. Server verifies the secret token and (if configured) source IP
5. Server fetches the full measurement from the Withings API
6. Data is stored in brian-mem automatically

### Managing subscriptions

```bash
node --env-file=.env src/subscribe.js --user charles --action list    # view active
node --env-file=.env src/subscribe.js --user charles --action revoke  # remove all
```

---

## Adding a family member later

Open `http://<nas-ip>:<PORT>/` in any browser on the local network, enter their name, and have them log in with their Withings account. Then run `subscribe.js` for their user to enable webhook push for them.

---

## Running locally

```bash
npm install
cp .env.example .env   # fill in CLIENT_ID, CLIENT_SECRET, SERVER_HOST
npm start              # stdio mode (for direct MCP use)
node src/serve.js      # HTTP/SSE mode (same as Docker)
npm test               # run unit tests
```

---

## Project structure

```
src/
  serve.js       — Express HTTP/SSE server + browser auth UI + webhook receiver
  server.js      — MCP tool definitions
  api.js         — Withings REST API client
  auth.js        — per-user token management with auto-refresh
  tokenStore.js  — read/write tokens.json (keyed by user name)
  memory.js      — brian-mem integration (fire-and-forget)
  subscribe.js   — CLI to register/list/revoke Withings webhook subscriptions
  index.js       — stdio entry point
  authorize.js   — CLI OAuth2 flow (--user <name> flag, alternative to browser UI)
.github/
  workflows/
    docker-publish.yml  — build + push to GHCR + deploy to NAS on every push to main
    docker-rebuild.yml  — weekly no-cache rebuild for base-image security patches
Dockerfile              — production image build
tokens.json      — per-user OAuth tokens + Withings user IDs (gitignored)
.env             — credentials and config (gitignored)
```

---

## Tech stack

| Layer | Technology |
|-------|------------|
| Runtime | Node.js 20 |
| MCP SDK | @modelcontextprotocol/sdk |
| HTTP | Express + axios |
| Auth | OAuth2 with per-user auto-refresh |
| Container | Docker Compose + GHCR |
| Tunnel | Cloudflare Tunnel (webhook) |
| Memory store | brian-mem |

## Project status

Active development. See [ROADMAP.md](ROADMAP.md) for what's planned.
