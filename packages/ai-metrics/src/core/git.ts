import { execFileSync } from 'node:child_process';
import { findRepoRoot } from './repo-root.js';
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

/**
 * A hook's cwd may be a subdirectory rather than the repo root, so the root is located first (via
 * a plain filesystem walk, not a git subprocess) and all git commands then run from there.
 * Never throws — an unresolvable root simply produces "unknown" fields.
 */
export function resolveGitContext(cwd: string): GitContext {
  const { root } = findRepoRoot(cwd);

  const branch = root ? runGitCommand(['rev-parse', '--abbrev-ref', 'HEAD'], root) : null;
  const headCommit = root ? runGitCommand(['rev-parse', 'HEAD'], root) : null;

  const repoRootHash = root ? sha1Hex(root) : 'unknown';
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
