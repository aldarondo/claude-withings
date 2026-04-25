/**
 * Persists per-user monthly memory hashes so we can delete+replace
 * a month's summary when new measurements arrive.
 *
 * Storage: monthly-hashes.json (volume-mounted in Docker, same as tokens.json)
 * Key format: "{user}:{YYYY-MM}"  →  content hash string
 */

import { readFileSync, writeFileSync } from 'fs';
import { resolve } from 'path';

const STORE_PATH = resolve(process.cwd(), 'monthly-hashes.json');

function load() {
  try {
    return JSON.parse(readFileSync(STORE_PATH, 'utf8'));
  } catch {
    return {};
  }
}

function save(data) {
  try {
    writeFileSync(STORE_PATH, JSON.stringify(data, null, 2), 'utf8');
  } catch (err) {
    console.error('[monthlyStore] write failed:', err.message);
  }
}

export function getMonthHash(user, monthKey) {
  return load()[`${user}:${monthKey}`] ?? null;
}

export function setMonthHash(user, monthKey, hash) {
  const data = load();
  data[`${user}:${monthKey}`] = hash;
  save(data);
}

export function clearMonthHash(user, monthKey) {
  const data = load();
  delete data[`${user}:${monthKey}`];
  save(data);
}
