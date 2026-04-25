/**
 * claude-withings MCP Server — HTTP/SSE entry point.
 * Listens on PORT (default 8769) for SSE connections from MCP clients.
 * Also serves:
 *   /          — family member authorization UI
 *   /webhook   — Withings push notification receiver
 */

import express from 'express';
import axios from 'axios';
import { SSEServerTransport } from '@modelcontextprotocol/sdk/server/sse.js';
import { createServer } from './server.js';
import { getTokens, setTokens, listUsers, getUserByWithingsId } from './tokenStore.js';
import { refreshAccessToken } from './auth.js';
import { storeMemory, deleteMemory } from './memory.js';
import { buildBodyStats, formatMonthlySummary, fetchAllMeasurements } from './backfill.js';
import { getMonthHash, setMonthHash } from './monthlyStore.js';

const PORT          = parseInt(process.env.PORT || '8769', 10);
const CLIENT_ID     = process.env.WITHINGS_CLIENT_ID;
const CLIENT_SECRET = process.env.WITHINGS_CLIENT_SECRET;
const HOST          = process.env.SERVER_HOST || 'localhost';
const REDIRECT_URI  = `http://${HOST}:${PORT}/auth/callback`;

// Webhook security
const WEBHOOK_SECRET = process.env.WEBHOOK_SECRET || '';
// Comma-separated list of allowed Withings source IPs (from CF-Connecting-IP behind Cloudflare Tunnel).
// Leave blank to skip IP check — add IPs once obtained from Withings support.
const WEBHOOK_ALLOWED_IPS = (process.env.WITHINGS_WEBHOOK_IPS || '')
  .split(',').map(s => s.trim()).filter(Boolean);

// Simple in-memory rate limiter: max 60 requests per IP per minute
const webhookRateMap = new Map();
function isRateLimited(ip) {
  const now = Date.now();
  const entry = webhookRateMap.get(ip) || { count: 0, resetAt: now + 60_000 };
  if (now > entry.resetAt) { entry.count = 0; entry.resetAt = now + 60_000; }
  entry.count++;
  webhookRateMap.set(ip, entry);
  return entry.count > 60;
}

// Withings appli values we handle
const APPLI_WEIGHT     = 1;
const APPLI_HEART_RATE = 4;

const app = express();
const transports = new Map();

// ── MCP endpoints ─────────────────────────────────────────────────────────────

app.get('/sse', async (req, res) => {
  const transport = new SSEServerTransport('/messages', res);
  transports.set(transport.sessionId, transport);
  res.on('close', () => transports.delete(transport.sessionId));
  const server = createServer();
  await server.connect(transport);
});

app.post('/messages', express.json(), async (req, res) => {
  const transport = transports.get(req.query.sessionId);
  if (!transport) return res.status(404).json({ error: 'Session not found' });
  await transport.handlePostMessage(req, res);
});

// ── Withings webhook ──────────────────────────────────────────────────────────
// Withings requires the callback URL to exactly match the registered app URL (no path allowed),
// so notifications arrive at POST /. The /webhook path is kept as an alias for compatibility.

async function handleWebhook(req, res) {
  // IP allowlist check (real client IP from CF-Connecting-IP behind Cloudflare Tunnel)
  const clientIp = req.headers['cf-connecting-ip'] || req.ip;
  if (WEBHOOK_ALLOWED_IPS.length > 0 && !WEBHOOK_ALLOWED_IPS.includes(clientIp)) {
    console.error(`[webhook] rejected: IP not allowed — ${clientIp}`);
    return res.status(403).end();
  }

  if (isRateLimited(clientIp)) {
    console.error(`[webhook] rate limited: ${clientIp}`);
    return res.status(429).end();
  }

  // Respond 200 immediately — Withings retries on timeout
  res.status(200).end();

  const { userid, appli, startdate, enddate } = req.body;
  const user = getUserByWithingsId(userid);

  if (!user) {
    console.error(`[webhook] no local user found for Withings ID ${userid}`);
    return;
  }

  console.error(`[webhook] appli=${appli} userid=${userid} (${user}) start=${startdate} end=${enddate}`);

  try {
    const appliNum = parseInt(appli, 10);

    if (appliNum === APPLI_WEIGHT || appliNum === APPLI_HEART_RATE) {
      // Rebuild the full current-month summary so it stays current and complete
      const now        = new Date();
      const monthKey   = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
      const monthStart = Math.floor(new Date(now.getFullYear(), now.getMonth(), 1).getTime() / 1000);

      const fetchWithRetry = async () => {
        try {
          return await fetchAllMeasurements(monthStart, user);
        } catch (err) {
          if (err.message?.includes('601')) {
            console.error(`[webhook] 601 rate limit, retrying in 30s`);
            await new Promise((r) => setTimeout(r, 30_000));
            return await fetchAllMeasurements(monthStart, user);
          }
          throw err;
        }
      };

      const grps      = await fetchWithRetry();
      const bodyStats = buildBodyStats(grps);

      if (Object.keys(bodyStats).length) {
        const summary  = formatMonthlySummary(monthKey, user, bodyStats, grps);
        const tags     = `monthly-summary,${user},${monthKey}`;
        const oldHash  = getMonthHash(user, monthKey);
        if (oldHash) await deleteMemory(oldHash);
        const newHash = await storeMemory(summary, tags);
        if (newHash) setMonthHash(user, monthKey, newHash);
        console.error(`[webhook] updated monthly summary for ${user} ${monthKey} (appli=${appliNum})`);
      }
    } else {
      console.error(`[webhook] unhandled appli=${appli}, ignoring`);
    }
  } catch (err) {
    console.error(`[webhook] error processing notification: ${err.message}`);
  }
}

const webhookMiddleware = express.urlencoded({ extended: false });
app.post('/', webhookMiddleware, handleWebhook);
app.post('/webhook', webhookMiddleware, handleWebhook);

// ── Auth web UI ───────────────────────────────────────────────────────────────

app.get('/', (req, res) => {
  const users = listUsers();
  const rows = users.length
    ? users.map(u => `<li>${u} ✅</li>`).join('')
    : '<li><em>No users authorized yet.</em></li>';

  res.send(`<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Withings Auth</title>
  <style>
    body { font-family: system-ui, sans-serif; max-width: 480px; margin: 60px auto; padding: 0 20px; }
    h1 { font-size: 1.4rem; }
    ul { padding-left: 1.2em; line-height: 2; }
    form { margin-top: 24px; display: flex; gap: 8px; }
    input { flex: 1; padding: 8px 12px; font-size: 1rem; border: 1px solid #ccc; border-radius: 6px; }
    button { padding: 8px 16px; font-size: 1rem; background: #2563eb; color: #fff; border: none; border-radius: 6px; cursor: pointer; }
    button:hover { background: #1d4ed8; }
  </style>
</head>
<body>
  <h1>Withings Family Authorization</h1>
  <p>Authorized users:</p>
  <ul>${rows}</ul>
  <form action="/auth/start" method="get">
    <input name="user" placeholder="Enter name (e.g. laura)" required>
    <button type="submit">Authorize →</button>
  </form>
</body>
</html>`);
});

app.get('/auth/start', (req, res) => {
  const user = (req.query.user || '').trim().toLowerCase();
  if (!user) return res.redirect('/');

  const url = new URL('https://account.withings.com/oauth2_user/authorize2');
  url.searchParams.set('response_type', 'code');
  url.searchParams.set('client_id', CLIENT_ID);
  url.searchParams.set('redirect_uri', REDIRECT_URI);
  url.searchParams.set('scope', 'user.info,user.metrics,user.activity,user.sleepevents');
  url.searchParams.set('state', user);

  res.redirect(url.toString());
});

app.get('/auth/callback', async (req, res) => {
  const { code, state: user, error } = req.query;

  if (error || !code) {
    return res.send(`<p>Authorization failed: ${error || 'no code received'}. <a href="/">Try again</a></p>`);
  }

  try {
    const params = new URLSearchParams({
      action: 'requesttoken',
      grant_type: 'authorization_code',
      client_id: CLIENT_ID,
      client_secret: CLIENT_SECRET,
      code,
      redirect_uri: REDIRECT_URI,
    });
    const { data } = await axios.post('https://wbsapi.withings.net/v2/oauth2', params.toString(), {
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    });

    if (data.status !== 0) {
      return res.send(`<p>Token exchange failed (status ${data.status}). <a href="/">Try again</a></p>`);
    }

    const { access_token, refresh_token, expires_in, userid } = data.body;
    setTokens(user, { access_token, refresh_token, expires_at: Date.now() + expires_in * 1000, withings_user_id: userid });

    res.send(`<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"><title>Authorized</title>
<style>body{font-family:system-ui,sans-serif;max-width:480px;margin:60px auto;padding:0 20px;}</style>
</head>
<body>
  <h1>✅ ${user} authorized!</h1>
  <p>Withings data for <strong>${user}</strong> is now accessible.</p>
  <p><a href="/">Authorize another family member</a></p>
</body>
</html>`);
  } catch (err) {
    res.send(`<p>Error: ${err.message}. <a href="/">Try again</a></p>`);
  }
});

// ── Start ─────────────────────────────────────────────────────────────────────

app.listen(PORT, async () => {
  console.error(`[MCP SSE] claude-withings listening on port ${PORT}`);
  // Heal any users missing withings_user_id by forcing a token refresh (refresh response includes userid)
  for (const user of listUsers()) {
    const tokens = getTokens(user);
    if (!tokens?.withings_user_id) {
      try {
        await refreshAccessToken(user, tokens.refresh_token);
        console.error(`[startup] healed withings_user_id for "${user}"`);
      } catch (err) {
        console.error(`[startup] could not heal withings_user_id for "${user}": ${err.message}`);
      }
    }
  }
});
