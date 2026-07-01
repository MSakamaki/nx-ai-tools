#!/usr/bin/env node
// Copies the non-TS asset directories (schema/templates/report-ui) into dist as-is.
// TS sources living alongside them (e.g. src/schema/validate.ts) are compiled separately by tsc.
import { cpSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const packageRoot = join(dirname(fileURLToPath(import.meta.url)), '..');
const ASSET_DIRS = ['schema', 'templates', 'report-ui'];

for (const dir of ASSET_DIRS) {
  const src = join(packageRoot, 'src', dir);
  const dest = join(packageRoot, 'dist', dir);
  mkdirSync(dest, { recursive: true });
  cpSync(src, dest, { recursive: true, filter: (source) => !source.endsWith('.ts') });
}
