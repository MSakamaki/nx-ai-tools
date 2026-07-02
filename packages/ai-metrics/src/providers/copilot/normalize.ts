import { randomUUID } from 'node:crypto';
import { createMetricsEventDraft } from '../../core/eventFactory.js';
import type { MetricsEventDraft } from '../../core/eventFactory.js';
import type { GitContext, MetricsEventType, TokenUsage } from '../../core/types.js';

/**
 * Best-effort shape of the JSON `.ai/metrics/hooks/copilot-hook.mjs` writes to stdin. There is no
 * fixed schema for a Copilot hook payload — it depends entirely on how the project's hook script
 * is wired up — so every field is optional and unrecognized shapes fall back to `raw_event`
 * instead of being rejected.
 */
export interface CopilotHookInput {
  eventType?: string;
  providerEventName?: string;
  sessionId?: string;
  actionId?: string;
  modelRaw?: string;
  promptBody?: string;
  responseBody?: unknown;
  tokenUsage?: {
    inputTokens?: number;
    outputTokens?: number;
    cacheReadTokens?: number;
    cacheWriteTokens?: number;
    totalTokens?: number;
  };
  [key: string]: unknown;
}

export interface NormalizeContext {
  gitUserName: string;
  userSlug: string;
  gitContext: GitContext;
}

const KNOWN_EVENT_TYPES: ReadonlySet<string> = new Set([
  'prompt_submitted',
  'action_started',
  'action_completed',
  'action_failed',
  'session_completed',
]);

function isKnownEventType(value: unknown): value is MetricsEventType {
  return typeof value === 'string' && KNOWN_EVENT_TYPES.has(value);
}

function extractModelRaw(input: CopilotHookInput): string | null {
  return typeof input.modelRaw === 'string' ? input.modelRaw : null;
}

function extractPromptBody(input: CopilotHookInput): string | null {
  return typeof input.promptBody === 'string' ? input.promptBody : null;
}

/** Preserves the response verbatim: pass strings through as-is, stringify anything else so it's still stored as-is. */
function extractResponseBody(value: unknown): string | null {
  if (typeof value === 'string') {
    return value;
  }
  if (value === undefined || value === null) {
    return null;
  }
  try {
    return JSON.stringify(value);
  } catch {
    return null;
  }
}

const TOKEN_FIELDS = ['inputTokens', 'outputTokens', 'cacheReadTokens', 'cacheWriteTokens', 'totalTokens'] as const;

/** Only reported when at least one numeric token field is present; otherwise left unavailable rather than guessed as zero. */
function extractTokenUsage(input: CopilotHookInput): TokenUsage | undefined {
  const raw = input.tokenUsage;
  if (typeof raw !== 'object' || raw === null) {
    return undefined;
  }
  const hasAnyField = TOKEN_FIELDS.some((field) => typeof raw[field] === 'number');
  if (!hasAnyField) {
    return undefined;
  }
  return {
    inputTokens: raw.inputTokens ?? 0,
    outputTokens: raw.outputTokens ?? 0,
    cacheReadTokens: raw.cacheReadTokens ?? 0,
    cacheWriteTokens: raw.cacheWriteTokens ?? 0,
    totalTokens: raw.totalTokens ?? 0,
    tokenSource: 'reported',
  };
}

/**
 * Maps a best-effort Copilot hook payload onto the common ai-metrics event schema. Only a
 * recognized `eventType` is normalized into its matching MetricsEventType; a missing or
 * unrecognized `eventType` is kept as a `raw_event` so the payload is never silently lost.
 */
export function normalizeCopilotEvent(input: CopilotHookInput, context: NormalizeContext): MetricsEventDraft {
  const modelRaw = extractModelRaw(input);
  const promptBody = extractPromptBody(input);
  const responseBody = extractResponseBody(input.responseBody);
  const tokenUsage = extractTokenUsage(input);
  const sessionId = typeof input.sessionId === 'string' && input.sessionId.length > 0 ? input.sessionId : randomUUID();

  const sourceAvailability = {
    modelAvailable: modelRaw !== null,
    promptAvailable: promptBody !== null,
    responseAvailable: responseBody !== null,
    tokenUsageAvailable: tokenUsage !== undefined,
  };

  if (!isKnownEventType(input.eventType)) {
    return createMetricsEventDraft('raw_event', {
      sessionId,
      actionId: input.actionId,
      gitUserName: context.gitUserName,
      userSlug: context.userSlug,
      toolProvider: 'copilot',
      providerEventName: input.providerEventName ?? input.eventType ?? null,
      modelRaw,
      status: null,
      normalizationStatus: 'raw_only',
      git: context.gitContext,
      rawEvent: input,
      sourceAvailability,
    });
  }

  return createMetricsEventDraft(input.eventType, {
    sessionId,
    actionId: input.actionId,
    gitUserName: context.gitUserName,
    userSlug: context.userSlug,
    toolProvider: 'copilot',
    providerEventName: input.providerEventName ?? null,
    modelRaw,
    status: null,
    normalizationStatus: 'normalized',
    git: context.gitContext,
    rawEvent: input,
    promptBody,
    responseBody,
    tokenUsage,
    sourceAvailability,
  });
}
