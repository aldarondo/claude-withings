/**
 * Withings REST API client.
 * Docs: https://developer.withings.com/api-reference/
 *
 * Supported devices: Withings scale (body composition) and blood pressure monitor.
 * Sleep and activity tracking are not available on these devices.
 */

import axios from 'axios';
import { getAccessToken } from './auth.js';

const BASE = 'https://wbsapi.withings.net';

async function get(path, params = {}, user) {
  const token = await getAccessToken(user);
  const { data } = await axios.get(`${BASE}${path}`, {
    params,
    headers: { Authorization: `Bearer ${token}` },
    timeout: 15_000,
  });
  if (data.status !== 0) {
    throw new Error(`Withings API error on ${path}: status ${data.status} — ${data.error || 'unknown'}`);
  }
  return data.body;
}

// ── Measurement types ────────────────────────────────────────────────────────
// https://developer.withings.com/api-reference/#tag/measure/operation/measure-getmeas
export const MEAS_TYPE = {
  WEIGHT:            1,   // kg
  HEIGHT:            4,   // m
  FAT_FREE_MASS:     5,   // kg
  FAT_RATIO:         6,   // %
  FAT_MASS:          8,   // kg
  MUSCLE_MASS:       76,  // kg
  BONE_MASS:         88,  // kg
  HYDRATION:         77,  // kg
  PULSE_WAVE_VELOCITY: 91, // m/s
};

/**
 * Get body measurements (weight, body composition).
 * @param {Object} opts
 * @param {number} [opts.lastupdate] - unix timestamp, only return newer measurements
 * @param {number[]} [opts.meastype] - array of MEAS_TYPE values (default: all weight/composition)
 * @returns {Promise<Object>}
 */
export async function getMeasurements({ lastupdate, meastype } = {}, user) {
  const params = { action: 'getmeas', meastypes: meastype?.join(',') };
  if (lastupdate) params.lastupdate = lastupdate;
  return get('/measure', params, user);
}

/**
 * Get heart rate measurements from blood pressure monitor.
 * @param {Object} opts
 * @param {number} [opts.startdate] - unix timestamp
 * @param {number} [opts.enddate]   - unix timestamp
 * @returns {Promise<Object>}
 */
export async function getHeartData({ startdate, enddate } = {}, user) {
  const params = { action: 'list' };
  if (startdate) params.startdate = startdate;
  if (enddate) params.enddate = enddate;
  return get('/v2/heart', params, user);
}

/**
 * Format latest weight/body-composition measurement as human-readable string.
 * @param {Object} body - response from getMeasurements()
 * @returns {string}
 */
export function formatMeasurements(body) {
  if (!body?.measuregrps?.length) return 'No measurements found.';
  const latest = body.measuregrps[0];
  const date = new Date(latest.date * 1000).toLocaleDateString();
  const measures = {};
  for (const m of latest.measures) {
    const value = m.value * Math.pow(10, m.unit);
    measures[m.type] = value;
  }

  const kg = measures[MEAS_TYPE.WEIGHT];
  const lbs = kg ? (kg * 2.20462).toFixed(1) : null;
  const fatRatio = measures[MEAS_TYPE.FAT_RATIO];
  const muscleMass = measures[MEAS_TYPE.MUSCLE_MASS];
  const boneMass = measures[MEAS_TYPE.BONE_MASS];
  const hydration = measures[MEAS_TYPE.HYDRATION];

  const lines = [`📅 Date: ${date}`];
  if (kg)         lines.push(`⚖️  Weight:      ${kg.toFixed(2)} kg (${lbs} lbs)`);
  if (fatRatio)   lines.push(`🥩  Fat ratio:   ${fatRatio.toFixed(1)}%`);
  if (muscleMass) lines.push(`💪  Muscle:      ${muscleMass.toFixed(2)} kg`);
  if (boneMass)   lines.push(`🦴  Bone mass:   ${boneMass.toFixed(2)} kg`);
  if (hydration)  lines.push(`💧  Hydration:   ${hydration.toFixed(2)} kg`);
  return lines.join('\n');
}

/**
 * Compare this week vs last week for weight.
 * @param {Object} thisWeekMeas - getMeasurements() result for this week
 * @param {Object} lastWeekMeas - getMeasurements() result for last week
 */
export function formatTrendSummary(thisWeekMeas, lastWeekMeas) {
  const extractWeight = (body) => {
    if (!body?.measuregrps?.length) return null;
    const grp = body.measuregrps[0];
    for (const m of grp.measures) {
      if (m.type === MEAS_TYPE.WEIGHT) return m.value * Math.pow(10, m.unit);
    }
    return null;
  };

  const thisWeight = extractWeight(thisWeekMeas);
  const lastWeight = extractWeight(lastWeekMeas);

  const delta = (curr, prev, unit = '', precision = 2) => {
    if (curr == null) return 'N/A';
    const formatted = curr.toFixed(precision);
    if (prev == null) return `${formatted}${unit}`;
    const diff = curr - prev;
    const sign = diff > 0 ? '+' : '';
    return `${formatted}${unit} (${sign}${diff.toFixed(precision)})`;
  };

  return [
    '📈 Withings Trend — This Week vs Last Week',
    '',
    `⚖️  Weight: ${delta(thisWeight, lastWeight, ' kg')}`,
  ].join('\n');
}
