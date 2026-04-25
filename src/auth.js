/**
 * Withings OAuth2 token management — per-user.
 * Tokens are stored in tokens.json keyed by user name.
 *
 * Docs: https://developer.withings.com/api-reference/#tag/oauth2
 */

import axios from 'axios';
import { getTokens, setTokens } from './tokenStore.js';

const TOKEN_URL = 'https://wbsapi.withings.net/v2/oauth2';

export const DEFAULT_USER = process.env.WITHINGS_DEFAULT_USER || 'charles';

export async function getAccessToken(user = DEFAULT_USER) {
  const tokens = getTokens(user);
  if (!tokens) throw new Error(`No Withings tokens for user "${user}". Run: node src/authorize.js --user ${user}`);

  if (Date.now() < tokens.expires_at - 300_000) {
    return tokens.access_token;
  }
  return refreshAccessToken(user, tokens.refresh_token);
}

export async function refreshAccessToken(user, refreshToken) {
  const clientId     = process.env.WITHINGS_CLIENT_ID;
  const clientSecret = process.env.WITHINGS_CLIENT_SECRET;

  if (!clientId || !clientSecret) {
    throw new Error('WITHINGS_CLIENT_ID and WITHINGS_CLIENT_SECRET must be set');
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
    throw new Error(`Withings token refresh failed for "${user}": status ${data.status} — ${data.error || 'unknown'}`);
  }

  const { access_token, refresh_token, expires_in, userid } = data.body;
  setTokens(user, { access_token, refresh_token, expires_at: Date.now() + expires_in * 1000, withings_user_id: userid });
  return access_token;
}
