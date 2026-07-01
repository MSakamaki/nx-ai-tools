import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { buildUserSlug, resolveGitUserName } from './user.js';

describe('buildUserSlug', () => {
  it('slugifies an ascii name and appends a short hash', () => {
    expect(buildUserSlug('Mizuho Sakamaki')).toMatch(/^mizuho-sakamaki-[0-9a-f]{6}$/);
  });

  it('falls back to a hash-only slug when nothing ascii-safe survives (e.g. Japanese names)', () => {
    expect(buildUserSlug('坂巻瑞穂')).toMatch(/^[0-9a-f]{6}$/);
  });

  it('decomposes accented latin letters instead of dropping them', () => {
    expect(buildUserSlug('Renée Müller')).toMatch(/^renee-muller-[0-9a-f]{6}$/);
  });

  it('collapses whitespace and symbols into single hyphens', () => {
    expect(buildUserSlug('  Alice!! Smith--Jones  ')).toMatch(/^alice-smith-jones-[0-9a-f]{6}$/);
  });

  it('is stable for the same input', () => {
    expect(buildUserSlug('Alice')).toBe(buildUserSlug('Alice'));
  });

  it('differs for different input', () => {
    expect(buildUserSlug('Alice')).not.toBe(buildUserSlug('Bob'));
  });
});

describe('resolveGitUserName', () => {
  let cwd: string;

  beforeEach(() => {
    cwd = mkdtempSync(join(tmpdir(), 'ai-metrics-'));
    execFileSync('git', ['init', '-q'], { cwd });
    execFileSync('git', ['config', 'user.name', 'Test User'], { cwd });
  });

  afterEach(() => {
    rmSync(cwd, { recursive: true, force: true });
  });

  it('reads the configured git user.name', () => {
    expect(resolveGitUserName(cwd)).toBe('Test User');
  });

  it('returns "unknown" when git cannot be run', () => {
    expect(resolveGitUserName(join(cwd, 'does-not-exist'))).toBe('unknown');
  });
});
