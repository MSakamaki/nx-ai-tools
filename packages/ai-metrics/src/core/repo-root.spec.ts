import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { findRepoRoot } from './repo-root.js';

describe('findRepoRoot', () => {
  let cwd: string;

  beforeEach(() => {
    cwd = mkdtempSync(join(tmpdir(), 'ai-metrics-'));
  });

  afterEach(() => {
    rmSync(cwd, { recursive: true, force: true });
  });

  it('returns null with a reason when no .git is found walking up from cwd', () => {
    const result = findRepoRoot(cwd);

    expect(result.root).toBeNull();
    expect(result.reason).toContain(cwd);
  });

  it('finds the repo root when cwd is the root itself', () => {
    execFileSync('git', ['init', '-q'], { cwd });

    const result = findRepoRoot(cwd);

    expect(result.root).toBe(cwd);
    expect(result.reason).toBeNull();
  });

  it('finds the repo root by walking up from a nested subdirectory', () => {
    execFileSync('git', ['init', '-q'], { cwd });
    const nested = join(cwd, 'a', 'b', 'c');
    mkdirSync(nested, { recursive: true });

    const result = findRepoRoot(nested);

    expect(result.root).toBe(cwd);
  });
});
