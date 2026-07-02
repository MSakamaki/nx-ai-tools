import { readFileSync, realpathSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import type { CopilotAdapterOptions } from '../../core/types.js';
import { createCopilotHookAdapter } from './adapter.js';

export interface RunHookEntryOptions extends CopilotAdapterOptions {
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
 * What `.ai/metrics/hooks/copilot-hook.mjs` actually runs: read the JSON payload from stdin,
 * normalize and record it, and never let a failure surface as a non-zero exit or a thrown
 * error — only a stderr WARN line.
 */
export function runHookEntry(options: RunHookEntryOptions = {}): void {
  const { input, onError, ...adapterOptions } = options;
  const rawInput = input ?? readStdin();

  const adapter = createCopilotHookAdapter({
    ...adapterOptions,
    onError: (error) => {
      console.error('[ai-metrics] WARN: copilot hook error:', error instanceof Error ? error.message : error);
      onError?.(error);
    },
  });

  adapter.handleInput(rawInput);
}

/**
 * A plain string comparison of `import.meta.url` against `process.argv[1]` breaks when this file
 * is reached through a symlink (npm/pnpm workspaces routinely symlink `node_modules`) or when the
 * OS normalizes the path differently (e.g. macOS's `/tmp` -> `/private/tmp`) — `import.meta.url` is
 * realpath-resolved by the ESM loader but `argv[1]` is not, so the two silently stop matching and
 * the hook does nothing at all, with no error. Resolving both through `realpathSync` neutralizes
 * both cases.
 */
function isMainModule(): boolean {
  if (process.argv[1] === undefined) {
    return false;
  }
  try {
    return realpathSync(fileURLToPath(import.meta.url)) === realpathSync(process.argv[1]);
  } catch {
    return false;
  }
}

/** Never lets a hook failure surface as a non-zero exit. */
if (isMainModule()) {
  try {
    runHookEntry();
  } catch (error) {
    console.error('[ai-metrics] WARN: unexpected copilot hook error:', error instanceof Error ? error.message : error);
  } finally {
    process.exit(0);
  }
}
