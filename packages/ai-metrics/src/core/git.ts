import { execFileSync } from 'node:child_process';
import { sha1Hex } from './hash.js';
import type { GitContext } from './types.js';

/** Never throws: git may be missing, the cwd may not be a repo, or the repo may have no commits yet. */
export function runGitCommand(args: string[], cwd: string): string | null {
  try {
    const output = execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
    return output.trim() || null;
  } catch {
    return null;
  }
}

export function resolveGitContext(cwd: string): GitContext {
  const repoRoot = runGitCommand(['rev-parse', '--show-toplevel'], cwd);
  const branch = runGitCommand(['rev-parse', '--abbrev-ref', 'HEAD'], cwd);
  const headCommit = runGitCommand(['rev-parse', 'HEAD'], cwd);

  const repoRootHash = repoRoot ? sha1Hex(repoRoot) : 'unknown';
  const branchName = branch ?? 'unknown';
  const baseCommitHash = headCommit ?? 'unknown';

  return {
    repoRootHash,
    branch: branchName,
    baseCommitHash,
    workingTreeId: sha1Hex(`${repoRootHash}:${branchName}:${baseCommitHash}`),
    // Left null here: linking to the commit made "since" this baseline is a report-time correlation
    // (commitLinkStrategy), not something a single hook invocation can observe on its own.
    commitHash: null,
    commitLinkStrategy: 'since_previous_commit',
  };
}
