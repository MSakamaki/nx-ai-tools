import { runGitCommand } from './git.js';
import { shortHash } from './hash.js';

export function resolveGitUserName(cwd: string): string {
  return runGitCommand(['config', 'user.name'], cwd) ?? 'unknown';
}

const COMBINING_MARKS = /[̀-ͯ]/g;

/** Ascii-only, hyphen-separated slug. Accented latin letters are decomposed and kept; everything else (CJK, emoji, symbols) is dropped. */
function slugifySegment(value: string): string {
  return value
    .normalize('NFKD')
    .replace(COMBINING_MARKS, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');
}

/**
 * "Mizuho Sakamaki" -> "mizuho-sakamaki-a1b2c3". The hash suffix keeps the slug unique and
 * filesystem/URL-safe even when the name is empty after slugifying (e.g. Japanese names).
 */
export function buildUserSlug(gitUserName: string): string {
  const slug = slugifySegment(gitUserName);
  const hash = shortHash(gitUserName);
  return slug ? `${slug}-${hash}` : hash;
}
