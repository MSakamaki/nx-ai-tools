import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { resolveGitContext } from './git.js';

function initRepoWithCommit(cwd: string): void {
  execFileSync('git', ['init', '-q', '-b', 'main'], { cwd });
  execFileSync('git', ['config', 'user.email', 'test@example.com'], { cwd });
  execFileSync('git', ['config', 'user.name', 'Test User'], { cwd });
  execFileSync('git', ['commit', '--allow-empty', '-q', '-m', 'init'], { cwd });
}

describe('resolveGitContext', () => {
  let cwd: string;

  beforeEach(() => {
    cwd = mkdtempSync(join(tmpdir(), 'ai-metrics-'));
  });

  afterEach(() => {
    rmSync(cwd, { recursive: true, force: true });
  });

  it('falls back to "unknown" when not inside a git repository', () => {
    const context = resolveGitContext(cwd);

    expect(context.repoRootHash).toBe('unknown');
    expect(context.branch).toBe('unknown');
    expect(context.baseCommitHash).toBe('unknown');
    expect(context.commitHash).toBeNull();
    expect(context.commitLinkStrategy).toBe('since_previous_commit');
  });

  it('resolves branch, commit and hashed repo root inside a git repository', () => {
    initRepoWithCommit(cwd);

    const context = resolveGitContext(cwd);

    expect(context.branch).toBe('main');
    expect(context.baseCommitHash).toMatch(/^[0-9a-f]{40}$/);
    expect(context.repoRootHash).toMatch(/^[0-9a-f]{40}$/);
    expect(context.commitHash).toBeNull();
  });

  it('derives workingTreeId from repoRootHash, branch, and baseCommitHash', () => {
    initRepoWithCommit(cwd);

    const first = resolveGitContext(cwd);
    const second = resolveGitContext(cwd);

    expect(first.workingTreeId).toBe(second.workingTreeId);
    expect(first.workingTreeId).toMatch(/^[0-9a-f]{40}$/);
  });

  it('changes workingTreeId once a new commit moves baseCommitHash', () => {
    initRepoWithCommit(cwd);
    const before = resolveGitContext(cwd);

    execFileSync('git', ['commit', '--allow-empty', '-q', '-m', 'second'], { cwd });
    const after = resolveGitContext(cwd);

    expect(after.baseCommitHash).not.toBe(before.baseCommitHash);
    expect(after.workingTreeId).not.toBe(before.workingTreeId);
  });
});
