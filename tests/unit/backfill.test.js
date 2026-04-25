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
  test('includes month key and user in header', () => {
    const text = formatMonthlySummary('2024-01', 'charles', sampleBodyStats, null);
    expect(text).toContain('2024-01');
    expect(text).toContain('charles');
  });

  test('includes weight in kg and lbs', () => {
    const text = formatMonthlySummary('2024-01', 'charles', sampleBodyStats, null);
    expect(text).toContain('80.00 kg');
    expect(text).toContain('176.4 lbs');
  });

  test('includes fat ratio and muscle mass', () => {
    const text = formatMonthlySummary('2024-01', 'charles', sampleBodyStats, null);
    expect(text).toContain('18.5%');
    expect(text).toContain('65.35 kg');
  });

  test('includes heart rate section when provided', () => {
    const text = formatMonthlySummary('2024-01', 'charles', sampleBodyStats, sampleHeartStats);
    expect(text).toContain('Heart rate (2 readings)');
    expect(text).toContain('avg 68');
    expect(text).toContain('min 60');
    expect(text).toContain('max 76');
  });

  test('omits heart rate section when null', () => {
    const text = formatMonthlySummary('2024-01', 'charles', sampleBodyStats, null);
    expect(text).not.toContain('Heart rate');
  });

  test('includes reading count', () => {
    const text = formatMonthlySummary('2024-01', 'charles', sampleBodyStats, null);
    expect(text).toContain('2 readings');
  });
});

describe('formatMonthlySummary — individual records', () => {
  test('includes daily readings section', () => {
    const text = formatMonthlySummary('2024-01', 'charles', sampleBodyStats, null, sampleGrps);
    expect(text).toContain('Daily readings');
  });

  test('includes each date', () => {
    const text = formatMonthlySummary('2024-01', 'charles', sampleBodyStats, null, sampleGrps);
    expect(text).toContain('2024-01-03');
    expect(text).toContain('2024-01-15');
  });

  test('includes per-day weight values', () => {
    const text = formatMonthlySummary('2024-01', 'charles', sampleBodyStats, null, sampleGrps);
    expect(text).toContain('80.50 kg');
    expect(text).toContain('79.50 kg');
  });

  test('includes per-day fat and muscle', () => {
    const text = formatMonthlySummary('2024-01', 'charles', sampleBodyStats, null, sampleGrps);
    expect(text).toContain('fat 18.8%');
    expect(text).toContain('muscle 65.30 kg');
  });

  test('omits daily readings section when no measuregrps', () => {
    const text = formatMonthlySummary('2024-01', 'charles', sampleBodyStats, null, []);
    expect(text).not.toContain('Daily readings');
  });

  test('includes heart readings section with timestamps', () => {
    const text = formatMonthlySummary('2024-01', 'charles', sampleBodyStats, sampleHeartStats, [], sampleHeartSeries);
    expect(text).toContain('Heart readings');
    expect(text).toContain('60 bpm');
    expect(text).toContain('76 bpm');
  });

  test('daily readings are sorted chronologically', () => {
    const reversed = [...sampleGrps].reverse();
    const text = formatMonthlySummary('2024-01', 'charles', sampleBodyStats, null, reversed);
    const idx3  = text.indexOf('2024-01-03');
    const idx15 = text.indexOf('2024-01-15');
    expect(idx3).toBeLessThan(idx15);
  });
});
