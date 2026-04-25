import { groupByMonth, stats, buildBodyStats, formatMonthlySummary } from '../../src/backfill.js';
import { MEAS_TYPE } from '../../src/api.js';

// ── stats() ───────────────────────────────────────────────────────────────────

describe('stats', () => {
  test('returns null for empty array', () => {
    expect(stats([])).toBeNull();
  });

  test('returns null when all values are null', () => {
    expect(stats([null, null])).toBeNull();
  });

  test('computes avg, min, max, count correctly', () => {
    const result = stats([70, 80, 90]);
    expect(result.count).toBe(3);
    expect(result.avg).toBeCloseTo(80);
    expect(result.min).toBe(70);
    expect(result.max).toBe(90);
  });

  test('filters nulls before computing', () => {
    const result = stats([null, 60, 80, null]);
    expect(result.count).toBe(2);
    expect(result.avg).toBeCloseTo(70);
  });

  test('handles single value', () => {
    const result = stats([75.5]);
    expect(result.count).toBe(1);
    expect(result.avg).toBeCloseTo(75.5);
    expect(result.min).toBe(75.5);
    expect(result.max).toBe(75.5);
  });
});

// ── groupByMonth() ────────────────────────────────────────────────────────────

describe('groupByMonth', () => {
  const jan15 = Math.floor(new Date('2024-01-15T12:00:00Z').getTime() / 1000);
  const jan28 = Math.floor(new Date('2024-01-28T12:00:00Z').getTime() / 1000);
  const feb10 = Math.floor(new Date('2024-02-10T12:00:00Z').getTime() / 1000);

  const grpJan15 = { date: jan15, measures: [] };
  const grpJan28 = { date: jan28, measures: [] };
  const grpFeb10 = { date: feb10, measures: [] };

  test('groups by YYYY-MM key', () => {
    const result = groupByMonth([grpJan15, grpJan28, grpFeb10]);
    expect(Object.keys(result).sort()).toEqual(['2024-01', '2024-02']);
    expect(result['2024-01']).toHaveLength(2);
    expect(result['2024-02']).toHaveLength(1);
  });

  test('returns empty object for empty input', () => {
    expect(groupByMonth([])).toEqual({});
  });

  test('zero-pads single-digit months', () => {
    const mar1 = Math.floor(new Date('2024-03-01T12:00:00Z').getTime() / 1000);
    const result = groupByMonth([{ date: mar1, measures: [] }]);
    expect(Object.keys(result)[0]).toBe('2024-03');
  });
});

// ── buildBodyStats() ──────────────────────────────────────────────────────────

describe('buildBodyStats', () => {
  const makeGrp = (weight, fat) => ({
    date: 0,
    measures: [
      { type: MEAS_TYPE.WEIGHT,    value: weight * 100, unit: -2 },
      { type: MEAS_TYPE.FAT_RATIO, value: fat * 10,     unit: -1 },
    ],
  });

  test('computes weight and fat stats across multiple groups', () => {
    const grps = [makeGrp(80.0, 18.0), makeGrp(81.0, 19.0)];
    const result = buildBodyStats(grps);
    expect(result[MEAS_TYPE.WEIGHT].count).toBe(2);
    expect(result[MEAS_TYPE.WEIGHT].avg).toBeCloseTo(80.5);
    expect(result[MEAS_TYPE.FAT_RATIO].avg).toBeCloseTo(18.5);
  });

  test('omits metric types that have no readings', () => {
    const grps = [makeGrp(80.0, 18.0)];
    const result = buildBodyStats(grps);
    expect(result[MEAS_TYPE.MUSCLE_MASS]).toBeUndefined();
  });

  test('returns empty object for empty input', () => {
    expect(buildBodyStats([])).toEqual({});
  });
});

// ── formatMonthlySummary() ────────────────────────────────────────────────────

const jan3  = Math.floor(new Date('2024-01-03T08:00:00Z').getTime() / 1000);
const jan15 = Math.floor(new Date('2024-01-15T08:00:00Z').getTime() / 1000);

const sampleGrps = [
  {
    date: jan3,
    measures: [
      { type: MEAS_TYPE.WEIGHT,      value: 8050, unit: -2 }, // 80.50 kg
      { type: MEAS_TYPE.FAT_RATIO,   value: 188,  unit: -1 }, // 18.8%
      { type: MEAS_TYPE.MUSCLE_MASS, value: 6530, unit: -2 }, // 65.30 kg
    ],
  },
  {
    date: jan15,
    measures: [
      { type: MEAS_TYPE.WEIGHT,      value: 7950, unit: -2 }, // 79.50 kg
      { type: MEAS_TYPE.FAT_RATIO,   value: 182,  unit: -1 }, // 18.2%
      { type: MEAS_TYPE.MUSCLE_MASS, value: 6540, unit: -2 }, // 65.40 kg
    ],
  },
];

const sampleBodyStats = {
  [MEAS_TYPE.WEIGHT]:      { count: 2, avg: 80.0,  min: 79.50, max: 80.50 },
  [MEAS_TYPE.FAT_RATIO]:   { count: 2, avg: 18.5,  min: 18.2,  max: 18.8  },
  [MEAS_TYPE.MUSCLE_MASS]: { count: 2, avg: 65.35, min: 65.30, max: 65.40 },
};

const sampleHeartStats  = { count: 2, avg: 68, min: 60, max: 76 };
const sampleHeartSeries = [
  { timestamp: jan3,  heart_rate: 60 },
  { timestamp: jan15, heart_rate: 76 },
];

describe('formatMonthlySummary — aggregated stats', () => {
  test('includes month key and user', () => {
    const parsed = JSON.parse(formatMonthlySummary('2024-01', 'charles', sampleBodyStats, null));
    expect(parsed.month).toBe('2024-01');
    expect(parsed.user).toBe('charles');
    expect(parsed.type).toBe('withings_monthly_summary');
  });

  test('includes weight stats', () => {
    const parsed = JSON.parse(formatMonthlySummary('2024-01', 'charles', sampleBodyStats, null));
    expect(parsed.body.weight_kg.avg).toBe(80);
    expect(parsed.body.weight_kg.min).toBe(79.5);
    expect(parsed.body.weight_kg.max).toBe(80.5);
    expect(parsed.body.weight_kg.count).toBe(2);
  });

  test('includes fat ratio and muscle mass', () => {
    const parsed = JSON.parse(formatMonthlySummary('2024-01', 'charles', sampleBodyStats, null));
    expect(parsed.body.fat_pct.avg).toBe(18.5);
    expect(parsed.body.muscle_kg.avg).toBe(65.35);
  });

  test('includes heart rate section when provided', () => {
    const parsed = JSON.parse(formatMonthlySummary('2024-01', 'charles', sampleBodyStats, sampleHeartStats));
    expect(parsed.heart.stats.count).toBe(2);
    expect(parsed.heart.stats.avg).toBe(68);
    expect(parsed.heart.stats.min).toBe(60);
    expect(parsed.heart.stats.max).toBe(76);
  });

  test('omits heart stats when null', () => {
    const parsed = JSON.parse(formatMonthlySummary('2024-01', 'charles', sampleBodyStats, null));
    expect(parsed.heart.stats).toBeNull();
  });

  test('includes reading count', () => {
    const parsed = JSON.parse(formatMonthlySummary('2024-01', 'charles', sampleBodyStats, null));
    expect(parsed.body.weight_kg.count).toBe(2);
  });
});

describe('formatMonthlySummary — individual records', () => {
  test('includes daily readings array', () => {
    const parsed = JSON.parse(formatMonthlySummary('2024-01', 'charles', sampleBodyStats, null, sampleGrps));
    expect(parsed.readings).toHaveLength(2);
  });

  test('includes each date', () => {
    const parsed = JSON.parse(formatMonthlySummary('2024-01', 'charles', sampleBodyStats, null, sampleGrps));
    const dates = parsed.readings.map((r) => r.date);
    expect(dates).toContain('2024-01-03');
    expect(dates).toContain('2024-01-15');
  });

  test('includes per-day weight values', () => {
    const parsed = JSON.parse(formatMonthlySummary('2024-01', 'charles', sampleBodyStats, null, sampleGrps));
    const jan3 = parsed.readings.find((r) => r.date === '2024-01-03');
    const jan15 = parsed.readings.find((r) => r.date === '2024-01-15');
    expect(jan3.weight_kg).toBe(80.5);
    expect(jan15.weight_kg).toBe(79.5);
  });

  test('includes per-day fat and muscle', () => {
    const parsed = JSON.parse(formatMonthlySummary('2024-01', 'charles', sampleBodyStats, null, sampleGrps));
    const jan3 = parsed.readings.find((r) => r.date === '2024-01-03');
    expect(jan3.fat_pct).toBe(18.8);
    expect(jan3.muscle_kg).toBe(65.3);
  });

  test('omits daily readings when no measuregrps', () => {
    const parsed = JSON.parse(formatMonthlySummary('2024-01', 'charles', sampleBodyStats, null, []));
    expect(parsed.readings).toHaveLength(0);
  });

  test('includes heart readings with timestamps and bpm', () => {
    const parsed = JSON.parse(formatMonthlySummary('2024-01', 'charles', sampleBodyStats, sampleHeartStats, [], sampleHeartSeries));
    expect(parsed.heart.readings).toHaveLength(2);
    expect(parsed.heart.readings[0].bpm).toBe(60);
    expect(parsed.heart.readings[1].bpm).toBe(76);
  });

  test('daily readings are sorted chronologically', () => {
    const reversed = [...sampleGrps].reverse();
    const parsed = JSON.parse(formatMonthlySummary('2024-01', 'charles', sampleBodyStats, null, reversed));
    expect(parsed.readings[0].date).toBe('2024-01-03');
    expect(parsed.readings[1].date).toBe('2024-01-15');
  });
});
