import { createMetricsEventDraft } from '../../core/eventFactory.js';
import { loadConfig } from '../../config/load-config.js';
import { resolveGitContext } from '../../core/git.js';
import { recordEvent } from '../../core/record-event.js';
import { findRepoRoot } from '../../core/repo-root.js';
import type { CopilotAdapterOptions, MetricsEvent, MetricsEventType, ProviderAdapter, TokenUsage } from '../../core/types.js';
import { buildUserSlug, resolveGitUserName } from '../../core/user.js';
import type { CopilotHookInput } from './normalize.js';
import { normalizeCopilotEvent } from './normalize.js';

/**
 * Experimental, interface-only: there is no real Copilot telemetry source wired up yet (no VS
 * Code extension, no OpenTelemetry collector). This defines the shape a future integration can
 * fill in without a breaking change — every optional field below is simply absent/unavailable
 * until something actually supplies it.
 */
export interface CopilotEventInput {
  sessionId: string;
  eventType: MetricsEventType;
  actionId?: string;
  providerEventName?: string | null;
  modelRaw?: string | null;
  promptBody?: string | null;
  responseBody?: string | null;
  tokenUsage?: TokenUsage;
}

/**
 * Experimental: exposed only via the "./experimental" entry point, not the main package export.
 * Follows the same `ProviderAdapter` contract as `createClaudeCodeAdapter` so a real Copilot
 * integration (VS Code extension, OpenTelemetry collector, etc.) can be dropped in later without
 * changing callers. Fields the caller doesn't supply are recorded as unavailable in
 * `sourceAvailability` rather than guessed.
 */
export function createCopilotAdapter(options: CopilotAdapterOptions = {}): ProviderAdapter<CopilotEventInput> {
  return {
    handleInput(input) {
      try {
        const cwd = options.cwd ?? process.cwd();
        const gitUserName = resolveGitUserName(cwd);

        const draft = createMetricsEventDraft(input.eventType, {
          sessionId: input.sessionId,
          actionId: input.actionId,
          gitUserName,
          userSlug: buildUserSlug(gitUserName),
          toolProvider: 'copilot',
          providerEventName: input.providerEventName ?? null,
          modelRaw: input.modelRaw ?? null,
          status: null,
          normalizationStatus: input.eventType === 'raw_event' ? 'raw_only' : 'normalized',
          git: resolveGitContext(cwd),
          rawEvent: input,
          promptBody: input.promptBody ?? null,
          responseBody: input.responseBody ?? null,
          tokenUsage: input.tokenUsage,
          sourceAvailability: {
            promptAvailable: input.promptBody != null,
            responseAvailable: input.responseBody != null,
            modelAvailable: input.modelRaw != null,
            tokenUsageAvailable: input.tokenUsage != null,
          },
        });

        return recordEvent<MetricsEvent>(draft, { config: options.config, cwd: options.cwd });
      } catch (error) {
        options.onError?.(error);
        return undefined;
      }
    },
  };
}

function parseHookInput(rawInput: string | CopilotHookInput): CopilotHookInput {
  return typeof rawInput === 'string' ? (JSON.parse(rawInput) as CopilotHookInput) : rawInput;
}

/**
 * Drives the `.ai/metrics/hooks/copilot-hook.mjs` stdin-JSON path (experimental / project hooks
 * template). Never throws: malformed JSON, `providers.copilot.enabled: false`, and an
 * unresolvable repo root all skip recording and let the caller exit 0. `providers.copilot.rawEvent`
 * controls whether the raw payload is persisted at all (its `maxBytes` truncation happens later,
 * inside `recordEvent`, the same way for every provider).
 */
export function createCopilotHookAdapter(options: CopilotAdapterOptions = {}): ProviderAdapter<string | CopilotHookInput> {
  return {
    handleInput(rawInput) {
      try {
        const cwd = options.cwd ?? process.cwd();
        const config = options.config ?? loadConfig({ cwd });
        const input = parseHookInput(rawInput);

        if (!config.providers.copilot.enabled) {
          return undefined;
        }

        const { root } = findRepoRoot(cwd);
        if (!root) {
          options.onError?.(new Error(`could not locate a git repository above ${cwd}; skipping`));
          return undefined;
        }

        const gitUserName = resolveGitUserName(cwd);
        const draft = normalizeCopilotEvent(input, {
          gitUserName,
          userSlug: buildUserSlug(gitUserName),
          gitContext: resolveGitContext(cwd),
        });

        const recordable = config.providers.copilot.rawEvent.enabled ? draft : { ...draft, rawEvent: null };

        return recordEvent<MetricsEvent>(recordable, { config, cwd });
      } catch (error) {
        options.onError?.(error);
        return undefined;
      }
    },
  };
}
