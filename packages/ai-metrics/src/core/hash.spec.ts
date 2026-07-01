import { sha1Hex, shortHash } from './hash.js';

describe('sha1Hex', () => {
  it('returns the sha1 hex digest', () => {
    expect(sha1Hex('hello')).toBe('aaf4c61ddcc5e8a2dabede0f3b482cd9aea9434d');
  });

  it('is deterministic', () => {
    expect(sha1Hex('same input')).toBe(sha1Hex('same input'));
  });

  it('differs for different input', () => {
    expect(sha1Hex('a')).not.toBe(sha1Hex('b'));
  });
});

describe('shortHash', () => {
  it('returns the first 6 hex characters of the sha1 digest by default', () => {
    expect(shortHash('hello')).toBe(sha1Hex('hello').slice(0, 6));
    expect(shortHash('hello')).toHaveLength(6);
  });

  it('supports a custom length', () => {
    expect(shortHash('hello', 10)).toBe(sha1Hex('hello').slice(0, 10));
  });
});
