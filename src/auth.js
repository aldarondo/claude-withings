/**
 * Withings OAuth2 token management.
 * Withings uses OAuth2 with refresh tokens.
 * Tokens are stored in env vars and refreshed automatically when expired.
 *
 * Docs: https://developer.withings.com/api-reference/#tag/oauth2
 */

import axios from 'axios';

const TOKEN_URL = 'https://wbsapi.withings.net/v2/oauth2';

export async function getAccessToken() {
  const expiresAt = parseInt(process.env.WITHINGS_TOKEN_EXPIRES_AT || '0', 10);
  // Refresh if within 5 minutes of expiry
  if (Date.now() < expiresAt - 300_000) {
    return process.env.WITHINGS_ACCESS_TOKEN;
  }
  return refreshAccessToken();
}

export async function refreshAccessToken() {
  const clientId     = process.env.WITHINGS_CLIENT_ID;
  const clientSecret = process.env.WITHINGS_CLIENT_SECRET;
  const refreshToken = process.env.WITHINGS_REFRESH_TOKEN;

  if (!clientId || !clientSecret || !refreshToken) {
    throw new Error('WITHINGS_CLIENT_ID, WITHINGS_CLIENT_SECRET, and WITHINGS_REFRESH_TOKEN must be set');
  }

  const params = new URLSearchParams({
    action: 'requesttoken',
    grant_type: 'refresh_token',
    client_id: clientId,
    client_secret: clientSecret,
    refresh_token: refreshToken,
  });

  const { data } = await axios.post(TOKEN_URL, params.toString(), {
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
  });

  if (data.status !== 0) {
    throw new Error(`Withings token refresh failed: status ${data.status} — ${data.error || 'unknown'}`);
  }

  const { access_token, refresh_token, expires_in } = data.body;
  process.env.WITHINGS_ACCESS_TOKEN = access_token;
  process.env.WITHINGS_REFRESH_TOKEN = refresh_token;
  process.env.WITHINGS_TOKEN_EXPIRES_AT = String(Date.now() + expires_in * 1000);

  return access_token;
}
