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
import { getMeasurements, getHeartData, MEAS_TYPE } from './api.js';
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

async function fetchAllMeasurements(startEpoch, user) {
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

async function fetchMonthHeartData(startEpoch, endEpoch, user) {
  try {
    const body = await getHeartData({ startdate: startEpoch, enddate: endEpoch }, user);
    return body?.series ?? [];
  } catch {
    return [];
  }
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

export function formatMonthlySummary(monthKey, user, bodyStats, heartStats, measuregrps = [], heartSeries = []) {
  const f   = (n, d) => (n != null ? n.toFixed(d) : 'N/A');
  const lbs = (kg)   => (kg * 2.20462).toFixed(1);
  const lines = [`Withings Monthly Health Summary — ${monthKey} (${user})`, ''];

  // ── Aggregated stats ──────────────────────────────────────────────────────

  const ws = bodyStats[MEAS_TYPE.WEIGHT];
  if (ws) {
    lines.push(`Body composition (${ws.count} readings):`);
    lines.push(`  Weight:      avg ${f(ws.avg, 2)} kg (${lbs(ws.avg)} lbs), min ${f(ws.min, 2)}, max ${f(ws.max, 2)}`);

    const fat = bodyStats[MEAS_TYPE.FAT_RATIO];
    if (fat) lines.push(`  Fat ratio:   avg ${f(fat.avg, 1)}%, min ${f(fat.min, 1)}, max ${f(fat.max, 1)}`);

    const mu = bodyStats[MEAS_TYPE.MUSCLE_MASS];
    if (mu) lines.push(`  Muscle mass: avg ${f(mu.avg, 2)} kg, min ${f(mu.min, 2)}, max ${f(mu.max, 2)}`);

    const bo = bodyStats[MEAS_TYPE.BONE_MASS];
    if (bo) lines.push(`  Bone mass:   avg ${f(bo.avg, 2)} kg`);

    const hy = bodyStats[MEAS_TYPE.HYDRATION];
    if (hy) lines.push(`  Hydration:   avg ${f(hy.avg, 2)} kg`);
  }

  if (heartStats?.count) {
    if (ws) lines.push('');
    lines.push(`Heart rate (${heartStats.count} readings):`);
    lines.push(`  BPM: avg ${Math.round(heartStats.avg)}, min ${heartStats.min}, max ${heartStats.max}`);
  }

  // ── Individual body readings ──────────────────────────────────────────────

  if (measuregrps.length) {
    lines.push('', '--- Daily readings ---');
    const sorted = [...measuregrps].sort((a, b) => a.date - b.date);
    for (const grp of sorted) {
      const date = new Date(grp.date * 1000).toISOString().slice(0, 10);
      const parts = [];

      const w = extractMetric(grp, MEAS_TYPE.WEIGHT);
      if (w != null) parts.push(`${w.toFixed(2)} kg`);

      const fat = extractMetric(grp, MEAS_TYPE.FAT_RATIO);
      if (fat != null) parts.push(`fat ${fat.toFixed(1)}%`);

      const mu = extractMetric(grp, MEAS_TYPE.MUSCLE_MASS);
      if (mu != null) parts.push(`muscle ${mu.toFixed(2)} kg`);

      const bo = extractMetric(grp, MEAS_TYPE.BONE_MASS);
      if (bo != null) parts.push(`bone ${bo.toFixed(2)} kg`);

      const hy = extractMetric(grp, MEAS_TYPE.HYDRATION);
      if (hy != null) parts.push(`hydration ${hy.toFixed(2)} kg`);

      if (parts.length) lines.push(`${date}: ${parts.join(' | ')}`);
    }
  }

  // ── Individual heart readings ─────────────────────────────────────────────

  if (heartSeries.length) {
    lines.push('', '--- Heart readings ---');
    const sorted = [...heartSeries].sort((a, b) => a.timestamp - b.timestamp);
    for (const s of sorted) {
      if (s.heart_rate == null) continue;
      const ts = new Date(s.timestamp * 1000).toISOString().slice(0, 16).replace('T', ' ');
      lines.push(`${ts}: ${s.heart_rate} bpm`);
    }
  }

  return lines.join('\n');
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

    const grps        = measByMonth[monthKey] ?? [];
    const bodyStats   = buildBodyStats(grps);
    const heartSeries = await fetchMonthHeartData(monthStart, monthEnd, resolvedUser);
    await sleep(300);

    const heartBPMs  = heartSeries.map((s) => s.heart_rate).filter((v) => v != null);
    const heartStats = stats(heartBPMs);

    if (!Object.keys(bodyStats).length && !heartStats) {
      skipped++;
      continue;
    }

    const summary = formatMonthlySummary(monthKey, resolvedUser, bodyStats, heartStats, grps, heartSeries);

    if (dryRun) {
      console.log(`  [DRY RUN] ${monthKey}: ${grps.length} body, ${heartBPMs.length} HR`);
    } else {
      await storeMonthSummary(monthKey, resolvedUser, summary, false);
      stored++;
      console.log(`  ✅ ${monthKey}: ${grps.length} body, ${heartBPMs.length} HR → stored`);
    }

    results.push({ month: monthKey, bodyCount: grps.length, heartCount: heartBPMs.length });
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
