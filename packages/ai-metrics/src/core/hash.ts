import { createHash } from 'node:crypto';

export function sha1Hex(value: string): string {
  return createHash('sha1').update(value).digest('hex');
}

export function shortHash(value: string, length = 6): string {
  return sha1Hex(value).slice(0, length);
}
