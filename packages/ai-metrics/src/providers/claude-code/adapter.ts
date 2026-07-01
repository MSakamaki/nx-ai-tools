import { resolveGitContext } from '../../core/git.js';
import { recordEvent } from '../../core/record-event.js';
import type { ClaudeCodeAdapterOptions, MetricsEvent, ProviderAdapter } from '../../core/types.js';
import { buildUserSlug, resolveGitUserName } from '../../core/user.js';
import { normalizeClaudeCodeEvent } from './normalize.js';
import type { ClaudeCodeHookInput } from './types.js';

function parseHookInput(rawInput: string | ClaudeCodeHookInput): ClaudeCodeHookInput {
  return typeof rawInput === 'string' ? (JSON.parse(rawInput) as ClaudeCodeHookInput) : rawInput;
}

/** Never throws: a failing hook must not block the Claude Code host process. */
export function createClaudeCodeAdapter(options: ClaudeCodeAdapterOptions = {}): ProviderAdapter<string | ClaudeCodeHookInput> {
  return {
    handleInput(rawInput) {
      try {
        const input = parseHookInput(rawInput);
        const cwd = options.cwd ?? process.cwd();
        const gitUserName = resolveGitUserName(cwd);

        const draft = normalizeClaudeCodeEvent(input, {
          gitUserName,
          userSlug: buildUserSlug(gitUserName),
          gitContext: resolveGitContext(cwd),
        });

        if (!draft) {
          return undefined;
        }

        return recordEvent<MetricsEvent>(draft, { config: options.config, cwd: options.cwd });
      } catch (error) {
        options.onError?.(error);
        return undefined;
      }
    },
  };
}
