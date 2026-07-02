import { existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';

export interface RepoRootLookup {
  /** Absolute path to the repo root, or `null` when no `.git` was found walking up from `cwd`. */
  root: string | null;
  /** Human-readable reason for a `null` root, for WARN messages in `doctor`/`report build`. `null` when `root` was found. */
  reason: string | null;
}

/**
 * Walks upward from `cwd` looking for a `.git` entry (a directory for a normal repo, a file for a
 * worktree/submodule), since a Claude Code hook may run with its cwd set to a subdirectory rather
 * than the repo root. Purely filesystem-based — never shells out to git — so it still works if the
 * git binary itself is missing or broken, and never throws.
 */
export function findRepoRoot(cwd: string): RepoRootLookup {
  let dir = resolve(cwd);

  for (;;) {
    if (existsSync(join(dir, '.git'))) {
      return { root: dir, reason: null };
    }

    const parent = dirname(dir);
    if (parent === dir) {
      return { root: null, reason: `No .git found by walking up from ${cwd}` };
    }
    dir = parent;
  }
}
