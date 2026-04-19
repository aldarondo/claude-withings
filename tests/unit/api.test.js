import { describe, test, expect, jest, beforeEach } from '@jest/globals';

// Mock auth so no real token requests happen
jest.unstable_mockModule('../../src/auth.js', async () => ({
  getAccessToken: jest.fn().mockResolvedValue('mock-token'),
  refreshAccessToken: jest.fn().mockResolvedValue('mock-token'),
}));

const mockGet  = jest.fn();
const mockPost = jest.fn();
jest.unstable_mockModule('axios', async () => ({
  default: {
    get: mockGet,
    post: mockPost,
    create: jest.fn(() => ({ get: mockGet, post: mockPost })),
  },
}));

const { getMeasurements, getSleepSummary, getActivitySummary, formatMeasurements, MEAS_TYPE } =
  await import('../../src/api.js');

beforeEach(() => {
  mockGet.mockReset();
  mockPost.mockReset();
});

describe('getMeasurements', () => {
  test('fetches measurements with Bearer auth', async () => {
    mockGet.mockResolvedValue({ data: { status: 0, body: { measuregrps: [] } } });

    await getMeasurements();

    expect(mockGet).toHaveBeenCalledWith(
      'https://wbsapi.withings.net/measure',
      expect.objectContaining({
        headers: { Authorization: 'Bearer mock-token' },
      })
    );
  });

  test('throws on non-zero status', async () => {
    mockGet.mockResolvedValue({ data: { status: 401, error: 'invalid_token' } });
    await expect(getMeasurements()).rejects.toThrow('status 401');
  });
});

describe('getSleepSummary', () => {
  test('throws if startdateymd or enddateymd missing', async () => {
    await expect(getSleepSummary({})).rejects.toThrow('required');
  });

  test('fetches sleep data with correct params', async () => {
    mockGet.mockResolvedValue({ data: { status: 0, body: { series: [] } } });

    await getSleepSummary({ startdateymd: 20260401, enddateymd: 20260407 });

    expect(mockGet).toHaveBeenCalledWith(
      'https://wbsapi.withings.net/v2/sleep',
      expect.objectContaining({ params: expect.objectContaining({ startdateymd: 20260401 }) })
    );
  });
});

describe('getActivitySummary', () => {
  test('throws if dates missing', async () => {
    await expect(getActivitySummary({})).rejects.toThrow('required');
  });
});

describe('formatMeasurements', () => {
  const UNIX_DATE = 1745001600; // 2026-04-19 approx

  test('returns "No measurements found" for empty body', () => {
    expect(formatMeasurements({})).toBe('No measurements found.');
    expect(formatMeasurements({ measuregrps: [] })).toBe('No measurements found.');
  });

  test('formats weight and fat ratio', () => {
    const body = {
      measuregrps: [{
        date: UNIX_DATE,
        measures: [
          { type: MEAS_TYPE.WEIGHT, value: 8000, unit: -2 },    // 80.00 kg
          { type: MEAS_TYPE.FAT_RATIO, value: 185, unit: -1 },  // 18.5%
        ],
      }],
    };
    const result = formatMeasurements(body);
    expect(result).toContain('80.00 kg');
    expect(result).toContain('176.4 lbs');
    expect(result).toContain('18.5%');
  });

  test('omits fields not present in measurement', () => {
    const body = {
      measuregrps: [{
        date: UNIX_DATE,
        measures: [{ type: MEAS_TYPE.WEIGHT, value: 7500, unit: -2 }],
      }],
    };
    const result = formatMeasurements(body);
    expect(result).not.toContain('Fat ratio');
    expect(result).not.toContain('Muscle');
  });
});
