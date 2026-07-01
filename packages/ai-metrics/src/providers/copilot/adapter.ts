import { createMetricsEventDraft } from '../../core/eventFactory.js';
import { resolveGitContext } from '../../core/git.js';
import { recordEvent } from '../../core/record-event.js';
import type { CopilotAdapterOptions, MetricsEvent, MetricsEventType, ProviderAdapter, TokenUsage } from '../../core/types.js';
import { buildUserSlug, resolveGitUserName } from '../../core/user.js';

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
          modelRaw: input.modelRaw ?? null,
          status: null,
          gitContext: resolveGitContext(cwd),
          raw: input,
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
