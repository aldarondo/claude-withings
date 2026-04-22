#!/usr/bin/env node
/**
 * One-time OAuth2 authorization flow for claude-withings.
 * Starts a local HTTP server to catch the redirect, opens the browser,
 * exchanges the auth code for tokens, and saves them to tokens.json.
 *
 * Usage: node src/authorize.js --user <name>
 *   e.g. node src/authorize.js --user charles
 *        node src/authorize.js --user laura
 */

import http from 'http';

const CLIENT_ID     = process.env.WITHINGS_CLIENT_ID;
const CLIENT_SECRET = process.env.WITHINGS_CLIENT_SECRET;
const REDIRECT_URI  = 'http://localhost:8765/callback';
const PORT          = 8765;

const userArg = process.argv.indexOf('--user');
const USER = userArg !== -1 ? process.argv[userArg + 1] : 'charles';

if (!CLIENT_ID || !CLIENT_SECRET) {
  console.error('ERROR: Set WITHINGS_CLIENT_ID and WITHINGS_CLIENT_SECRET in .env first.');
  process.exit(1);
}

const authUrl = new URL('https://account.withings.com/oauth2_user/authorize2');
authUrl.searchParams.set('response_type', 'code');
authUrl.searchParams.set('client_id', CLIENT_ID);
authUrl.searchParams.set('redirect_uri', REDIRECT_URI);
authUrl.searchParams.set('scope', 'user.info,user.metrics,user.activity,user.sleepevents');
authUrl.searchParams.set('state', `claude-withings-${USER}`);

console.log(`\nAuthorizing user: ${USER}`);
console.log('\nOpen this URL in your browser to authorize:');
console.log('\n' + authUrl.toString() + '\n');

try {
  const { execSync } = await import('child_process');
  const cmd = process.platform === 'win32' ? `start "${authUrl}"` : `open "${authUrl}"`;
  execSync(cmd, { stdio: 'ignore' });
} catch { /* ignore — user can open manually */ }

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
  res.end(`<h2>Authorization complete for "${USER}" — you can close this tab.</h2>`);
  server.close();

  try {
    const { default: axios } = await import('axios');
    const { setTokens } = await import('./tokenStore.js');

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

    const { access_token, refresh_token, expires_in, userid } = data.body;
    const expires_at = Date.now() + expires_in * 1000;

    setTokens(USER, { access_token, refresh_token, expires_at, withings_user_id: userid });
    console.log(`✅ Tokens saved to tokens.json for user "${USER}" (Withings ID: ${userid})`);
    console.log(`   Access token expires: ${new Date(expires_at).toISOString()}`);
  } catch (err) {
    console.error('Failed to exchange code:', err.message);
    process.exit(1);
  }
});

server.listen(PORT, () => console.log(`Waiting for OAuth callback on port ${PORT}...`));
