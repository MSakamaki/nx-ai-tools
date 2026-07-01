import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import type { ClaudeCodeAdapterOptions } from '../../core/types.js';
import { createClaudeCodeAdapter } from './adapter.js';

export interface RunHookEntryOptions extends ClaudeCodeAdapterOptions {
  /** Mainly for tests; when omitted the hook payload is read from stdin. */
  input?: string;
}

function readStdin(): string {
  try {
    return readFileSync(0, 'utf8');
  } catch {
    return '';
  }
}

/**
 * What Claude Code actually runs as the hook command: read the JSON payload from stdin,
 * normalize and record it, and never let a failure surface as a non-zero exit or a thrown
 * error — only a stderr line.
 */
export function runHookEntry(options: RunHookEntryOptions = {}): void {
  const { input, onError, ...adapterOptions } = options;
  const rawInput = input ?? readStdin();

  const adapter = createClaudeCodeAdapter({
    ...adapterOptions,
    onError: (error) => {
      console.error('[ai-metrics] claude-code hook error:', error instanceof Error ? error.message : error);
      onError?.(error);
    },
  });

  adapter.handleInput(rawInput);
}

function isMainModule(): boolean {
  return process.argv[1] !== undefined && fileURLToPath(import.meta.url) === process.argv[1];
}

if (isMainModule()) {
  try {
    runHookEntry();
  } catch (error) {
    console.error('[ai-metrics] unexpected claude-code hook error:', error instanceof Error ? error.message : error);
  } finally {
    process.exit(0);
  }
}
