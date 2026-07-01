import { formatDateStamp, formatDateStampFromTimestamp } from './date.js';

describe('formatDateStamp', () => {
  it('formats a Date as YYYY-MM-DD using UTC fields', () => {
    expect(formatDateStamp(new Date('2026-07-02T23:59:59.000Z'))).toBe('2026-07-02');
  });

  it('pads single-digit months and days', () => {
    expect(formatDateStamp(new Date('2026-01-05T00:00:00.000Z'))).toBe('2026-01-05');
  });
});

describe('formatDateStampFromTimestamp', () => {
  it('parses an ISO timestamp string', () => {
    expect(formatDateStampFromTimestamp('2026-07-02T03:04:05.000Z')).toBe('2026-07-02');
  });
});
