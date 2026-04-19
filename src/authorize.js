#!/usr/bin/env node
/**
 * One-time OAuth2 authorization flow for claude-withings.
 * Starts a local HTTP server to catch the redirect, opens the browser,
 * exchanges the auth code for tokens, and writes them to .env.
 *
 * Usage: node src/authorize.js
 */

import http from 'http';
import { readFileSync, writeFileSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const ENV_PATH = join(ROOT, '.env');

const CLIENT_ID     = process.env.WITHINGS_CLIENT_ID;
const CLIENT_SECRET = process.env.WITHINGS_CLIENT_SECRET;
const REDIRECT_URI  = 'http://localhost:8765/callback';
const PORT          = 8765;

if (!CLIENT_ID || !CLIENT_SECRET) {
  console.error('ERROR: Set WITHINGS_CLIENT_ID and WITHINGS_CLIENT_SECRET in .env first.');
  process.exit(1);
}

// Build authorization URL
const authUrl = new URL('https://account.withings.com/oauth2_user/authorize2');
authUrl.searchParams.set('response_type', 'code');
authUrl.searchParams.set('client_id', CLIENT_ID);
authUrl.searchParams.set('redirect_uri', REDIRECT_URI);
authUrl.searchParams.set('scope', 'user.info,user.metrics,user.activity,user.sleepevents');
authUrl.searchParams.set('state', 'claude-withings');

console.log('\nOpen this URL in your browser to authorize:');
console.log('\n' + authUrl.toString() + '\n');

// Try to open browser automatically
try {
  const { execSync } = await import('child_process');
  const cmd = process.platform === 'win32' ? `start "${authUrl}"` : `open "${authUrl}"`;
  execSync(cmd, { stdio: 'ignore' });
} catch { /* ignore — user can open manually */ }

// Start local server to catch redirect
const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://localhost:${PORT}`);
  if (url.pathname !== '/callback') { res.end(); return; }

  const code = url.searchParams.get('code');
  if (!code) {
    res.writeHead(400);
    res.end('No authorization code received.');
    return;
  }

  res.writeHead(200, { 'Content-Type': 'text/html' });
  res.end('<h2>Authorization complete — you can close this tab.</h2>');
  server.close();

  // Exchange code for tokens
  try {
    const { default: axios } = await import('axios');
    const params = new URLSearchParams({
      action: 'requesttoken',
      grant_type: 'authorization_code',
      client_id: CLIENT_ID,
      client_secret: CLIENT_SECRET,
      code,
      redirect_uri: REDIRECT_URI,
    });
    const { data } = await axios.post(
      'https://wbsapi.withings.net/v2/oauth2',
      params.toString(),
      { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } }
    );

    if (data.status !== 0) {
      console.error('Token exchange failed:', data);
      process.exit(1);
    }

    const { access_token, refresh_token, expires_in } = data.body;
    const expires_at = Date.now() + expires_in * 1000;

    updateEnv({ access_token, refresh_token, expires_at });
    console.log('✅ Tokens saved to .env');
    console.log(`   Access token expires: ${new Date(expires_at).toISOString()}`);
  } catch (err) {
    console.error('Failed to exchange code:', err.message);
    process.exit(1);
  }
});

server.listen(PORT, () => console.log(`Waiting for OAuth callback on port ${PORT}...`));

function updateEnv({ access_token, refresh_token, expires_at }) {
  let content = existsSync(ENV_PATH) ? readFileSync(ENV_PATH, 'utf8') : '';

  const set = (key, value) => {
    const re = new RegExp(`^${key}=.*$`, 'm');
    if (re.test(content)) {
      content = content.replace(re, `${key}=${value}`);
    } else {
      content += `\n${key}=${value}`;
    }
  };

  set('WITHINGS_ACCESS_TOKEN', access_token);
  set('WITHINGS_REFRESH_TOKEN', refresh_token);
  set('WITHINGS_TOKEN_EXPIRES_AT', String(expires_at));
  writeFileSync(ENV_PATH, content.trim() + '\n');
}
