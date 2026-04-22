/**
 * Per-user token store backed by tokens.json.
 * Each entry: { access_token, refresh_token, expires_at, withings_user_id }
 */

import { readFileSync, writeFileSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const STORE_PATH = join(ROOT, 'tokens.json');

function load() {
  if (!existsSync(STORE_PATH)) return {};
  try { return JSON.parse(readFileSync(STORE_PATH, 'utf8')); } catch { return {}; }
}

function save(store) {
  writeFileSync(STORE_PATH, JSON.stringify(store, null, 2) + '\n');
}

export function getTokens(user) {
  const store = load();
  return store[user] ?? null;
}

export function setTokens(user, { access_token, refresh_token, expires_at, withings_user_id }) {
  const store = load();
  store[user] = { access_token, refresh_token, expires_at, ...(withings_user_id != null && { withings_user_id }) };
  save(store);
}

export function listUsers() {
  return Object.keys(load());
}

/** Find the local user name whose Withings account matches the given numeric user ID. */
export function getUserByWithingsId(withingsUserId) {
  const store = load();
  for (const [name, tokens] of Object.entries(store)) {
    if (String(tokens.withings_user_id) === String(withingsUserId)) return name;
  }
  return null;
}
