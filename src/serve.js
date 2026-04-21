/**
 * claude-withings MCP Server — HTTP/SSE entry point.
 * Listens on PORT (default 8769) for SSE connections from brian-telegram.
 * Also serves a web UI at / for authorizing family members.
 */

import express from 'express';
import axios from 'axios';
import { SSEServerTransport } from '@modelcontextprotocol/sdk/server/sse.js';
import { createServer } from './server.js';
import { setTokens, listUsers } from './tokenStore.js';

const PORT        = parseInt(process.env.PORT || '8769', 10);
const CLIENT_ID   = process.env.WITHINGS_CLIENT_ID;
const CLIENT_SECRET = process.env.WITHINGS_CLIENT_SECRET;
const REDIRECT_URI = `http://localhost:${PORT}/auth/callback`;

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

    const { access_token, refresh_token, expires_in } = data.body;
    setTokens(user, { access_token, refresh_token, expires_at: Date.now() + expires_in * 1000 });

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

app.listen(PORT, () => console.error(`[MCP SSE] claude-withings listening on port ${PORT}`));
