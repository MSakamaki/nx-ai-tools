#!/usr/bin/env node
// Thin wrapper: reads the hook payload from stdin and hands it to the installed package's compiled
// hook entry in a child process, so a broken/missing install (or any other failure) is reported as
// a WARN instead of crashing the Claude Code host process.
import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { join } from 'node:path';

const hookEntryPath = join(
  process.cwd(),
  'node_modules',
  '@nx-ai-tools',
  'ai-metrics',
  'dist',
  'providers',
  'claude-code',
  'hook-entry.js',
);

function warn(message) {
  console.error(`[ai-metrics] WARN: claude-code hook: ${message}`);
}

let input = '';
process.stdin.setEncoding('utf8');
process.stdin.on('data', (chunk) => {
  input += chunk;
});
process.stdin.on('end', () => {
  try {
    if (!existsSync(hookEntryPath)) {
      warn(`${hookEntryPath} not found. Run "npm install".`);
      return;
    }

    const result = spawnSync(process.execPath, [hookEntryPath], { input, encoding: 'utf8' });
    if (result.error) {
      warn(result.error.message);
    } else if (result.stderr) {
      process.stderr.write(result.stderr);
    }
  } catch (error) {
    warn(error instanceof Error ? error.message : String(error));
  } finally {
    process.exit(0);
  }
});
