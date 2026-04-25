/**
 * Historical Withings data backfill — stores monthly summaries to the configured memory store.
 * Each monthly summary includes aggregated stats AND individual daily readings.
 *
 * CLI usage:
 *   node src/backfill.js [--user charles] [--years 5] [--dry-run]
 *
 * Also exported as runBackfill() for use by the MCP backfill_to_memory tool.
 */

import { fileURLToPath } from 'url';
import { getMeasurements, MEAS_TYPE } from './api.js';
import { storeMemory, deleteMemory } from './memory.js';
import { getMonthHash, setMonthHash } from './monthlyStore.js';

const DEFAULT_YEARS = 5;

function sleep(ms) {
  return new Promise((res) => setTimeout(res, ms));
}

function parseArgs(argv) {
  const args = { user: null, years: DEFAULT_YEARS, dryRun: false };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--user')    args.user    = argv[++i];
    if (argv[i] === '--years')   args.years   = Number(argv[++i]);
    if (argv[i] === '--dry-run') args.dryRun  = true;
  }
  return args;
}

// ── Data fetching ─────────────────────────────────────────────────────────────

export async function fetchAllMeasurements(startEpoch, user) {
  const all = [];
  let offset;

  while (true) {
    const body = await getMeasurements({ lastupdate: startEpoch, offset }, user);
    if (body?.measuregrps) all.push(...body.measuregrps);
    if (body?.more === 1) {
      offset = body.offset;
      await sleep(300);
    } else {
      break;
    }
  }

  return all;
}

// ── Aggregation ───────────────────────────────────────────────────────────────

export function groupByMonth(measuregrps) {
  const byMonth = {};
  for (const grp of measuregrps) {
    const d   = new Date(grp.date * 1000);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    if (!byMonth[key]) byMonth[key] = [];
    byMonth[key].push(grp);
  }
  return byMonth;
}

function extractMetric(grp, type) {
  const m = grp.measures.find((m) => m.type === type);
  return m ? m.value * Math.pow(10, m.unit) : null;
}

export function stats(values) {
  const valid = values.filter((v) => v !== null && v !== undefined);
  if (!valid.length) return null;
  const sum = valid.reduce((a, b) => a + b, 0);
  return {
    count: valid.length,
    avg:   sum / valid.length,
    min:   Math.min(...valid),
    max:   Math.max(...valid),
  };
}

export function buildBodyStats(grps) {
  const bodyStats = {};
  for (const type of Object.values(MEAS_TYPE)) {
    const vals = grps.map((g) => extractMetric(g, type));
    const s    = stats(vals);
    if (s) bodyStats[type] = s;
  }
  return bodyStats;
}

// ── Formatting ────────────────────────────────────────────────────────────────

export function formatMonthlySummary(monthKey, user, bodyStats, measuregrps = []) {
  const round = (n, d) => (n != null ? parseFloat(n.toFixed(d)) : null);

  const buildStatObj = (s, decimals = 2) => s ? {
    count: s.count,
    avg:   round(s.avg, decimals),
    min:   round(s.min, decimals),
    max:   round(s.max, decimals),
  } : null;

  const body = {
    weight_kg:    buildStatObj(bodyStats[MEAS_TYPE.WEIGHT]),
    fat_pct:      buildStatObj(bodyStats[MEAS_TYPE.FAT_RATIO], 1),
    muscle_kg:    buildStatObj(bodyStats[MEAS_TYPE.MUSCLE_MASS]),
    bone_kg:      buildStatObj(bodyStats[MEAS_TYPE.BONE_MASS]),
    hydration_kg: buildStatObj(bodyStats[MEAS_TYPE.HYDRATION]),
  };

  const readings = [...measuregrps]
    .sort((a, b) => a.date - b.date)
    .map((grp) => {
      const date = new Date(grp.date * 1000).toISOString().slice(0, 10);
      const w    = extractMetric(grp, MEAS_TYPE.WEIGHT);
      const fat  = extractMetric(grp, MEAS_TYPE.FAT_RATIO);
      const mu   = extractMetric(grp, MEAS_TYPE.MUSCLE_MASS);
      const bo   = extractMetric(grp, MEAS_TYPE.BONE_MASS);
      const hy   = extractMetric(grp, MEAS_TYPE.HYDRATION);
      return {
        date,
        weight_kg:    w   != null ? round(w, 2)   : null,
        fat_pct:      fat != null ? round(fat, 1)  : null,
        muscle_kg:    mu  != null ? round(mu, 2)   : null,
        bone_kg:      bo  != null ? round(bo, 2)   : null,
        hydration_kg: hy  != null ? round(hy, 2)   : null,
      };
    })
    .filter((r) => r.weight_kg != null || r.fat_pct != null);

  const heartReadings = [...measuregrps]
    .sort((a, b) => a.date - b.date)
    .map((grp) => {
      const bpm = extractMetric(grp, MEAS_TYPE.HEART_RATE);
      if (bpm == null) return null;
      return {
        timestamp: new Date(grp.date * 1000).toISOString().slice(0, 16),
        bpm: Math.round(bpm),
      };
    })
    .filter(Boolean);

  const heart = {
    stats:    buildStatObj(bodyStats[MEAS_TYPE.HEART_RATE], 0),
    readings: heartReadings,
  };

  const payload = {
    type: 'withings_monthly_summary',
    month: monthKey,
    user,
    generated_at: new Date().toISOString(),
    body,
    readings,
    heart,
  };

  return JSON.stringify(payload);
}

// ── Store one month (delete old + write new) ──────────────────────────────────

export async function storeMonthSummary(monthKey, user, summary, dryRun) {
  const tags = `monthly-summary,${user},${monthKey}`;
  if (dryRun) return null;

  const oldHash = getMonthHash(user, monthKey);
  if (oldHash) await deleteMemory(oldHash);

  const newHash = await storeMemory(summary, tags);
  if (newHash) setMonthHash(user, monthKey, newHash);
  return newHash;
}

// ── Main backfill ─────────────────────────────────────────────────────────────

export async function runBackfill({ user, years = DEFAULT_YEARS, dryRun = false } = {}) {
  const { DEFAULT_USER } = await import('./auth.js');
  const resolvedUser = user || DEFAULT_USER;

  const startEpoch = Math.floor((Date.now() - years * 365.25 * 86400_000) / 1000);
  const startDate  = new Date(startEpoch * 1000).toISOString().slice(0, 10);

  console.log(`Backfilling ${years} years of Withings data for "${resolvedUser}" (since ${startDate})...`);

  console.log('  Fetching body measurements...');
  const allGrps = await fetchAllMeasurements(startEpoch, resolvedUser);
  console.log(`  Got ${allGrps.length} measurement groups`);

  // Build full month range
  const measByMonth = groupByMonth(allGrps);
  const allMonths   = new Set(Object.keys(measByMonth));
  const startD      = new Date(startEpoch * 1000);
  const cursor      = new Date(startD.getFullYear(), startD.getMonth(), 1);
  const now         = new Date();
  while (cursor <= now) {
    allMonths.add(`${cursor.getFullYear()}-${String(cursor.getMonth() + 1).padStart(2, '0')}`);
    cursor.setMonth(cursor.getMonth() + 1);
  }
  const sortedMonths = [...allMonths].sort();

  let stored = 0, skipped = 0;
  const results = [];

  for (const monthKey of sortedMonths) {
    const [yr, mo]   = monthKey.split('-').map(Number);
    const monthStart = Math.floor(new Date(yr, mo - 1, 1).getTime() / 1000);
    const monthEnd   = Math.floor(new Date(yr, mo,     1).getTime() / 1000) - 1;

    const grps      = measByMonth[monthKey] ?? [];
    const bodyStats = buildBodyStats(grps);

    if (!Object.keys(bodyStats).length) {
      skipped++;
      continue;
    }

    const summary    = formatMonthlySummary(monthKey, resolvedUser, bodyStats, grps);
    const heartCount = bodyStats[MEAS_TYPE.HEART_RATE]?.count ?? 0;

    if (dryRun) {
      console.log(`  [DRY RUN] ${monthKey}: ${grps.length} body, ${heartCount} HR`);
    } else {
      await storeMonthSummary(monthKey, resolvedUser, summary, false);
      stored++;
      console.log(`  ✅ ${monthKey}: ${grps.length} body, ${heartCount} HR → stored`);
    }

    results.push({ month: monthKey, bodyCount: grps.length, heartCount });
  }

  const summary = dryRun
    ? `Dry run complete: ${results.length} months would be stored`
    : `Backfill complete: ${stored} months stored, ${skipped} skipped (no data)`;

  console.log(`\n${summary}`);
  return { summary, results };
}

// ── CLI entry point ───────────────────────────────────────────────────────────

const __filename = fileURLToPath(import.meta.url);
if (process.argv[1] === __filename) {
  try {
    const { default: dotenv } = await import('dotenv');
    dotenv.config();
  } catch { /* dotenv optional */ }

  const args = parseArgs(process.argv.slice(2));
  runBackfill(args).catch((err) => {
    console.error('Backfill failed:', err.message);
    process.exit(1);
  });
}
