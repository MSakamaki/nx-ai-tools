import { createMetricsEventDraft } from '../../core/eventFactory.js';
import type { MetricsEventDraft } from '../../core/eventFactory.js';
import type { GitContext, MetricsEventType } from '../../core/types.js';
import type { ClaudeCodeHookInput } from './types.js';

/** Hook events with a known mapping normalize fully; everything else is kept as a `raw_event`. */
const HOOK_EVENT_TYPE_MAP: Partial<Record<string, MetricsEventType>> = {
  UserPromptSubmit: 'prompt_submitted',
  PreToolUse: 'action_started',
  PostToolUse: 'action_completed',
  Stop: 'session_completed',
  SessionEnd: 'session_completed',
};

export interface NormalizeContext {
  gitUserName: string;
  userSlug: string;
  gitContext: GitContext;
}

function isToolError(input: ClaudeCodeHookInput): boolean {
  const response = input.tool_response;
  return typeof response === 'object' && response !== null && 'error' in (response as Record<string, unknown>);
}

function toolInputField(input: ClaudeCodeHookInput, key: string): string | null {
  const toolInput = input.tool_input;
  if (typeof toolInput !== 'object' || toolInput === null) {
    return null;
  }
  const value = toolInput[key];
  return typeof value === 'string' ? value : null;
}

function extractModelRaw(input: ClaudeCodeHookInput): string | null {
  return typeof input.model === 'string' ? input.model : null;
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

/**
 * Maps a raw Claude Code hook payload onto the common ai-metrics event schema. Hook events ai-metrics
 * does not have a specific mapping for (e.g. Notification) are kept as a `raw_event` rather than
 * dropped, so the payload is never silently lost.
 */
export function normalizeClaudeCodeEvent(input: ClaudeCodeHookInput, context: NormalizeContext): MetricsEventDraft {
  const mappedType = HOOK_EVENT_TYPE_MAP[input.hook_event_name];
  const modelRaw = extractModelRaw(input);

  if (!mappedType) {
    return createMetricsEventDraft('raw_event', {
      sessionId: input.session_id ?? 'unknown',
      actionId: input.tool_use_id,
      gitUserName: context.gitUserName,
      userSlug: context.userSlug,
      toolProvider: 'claude-code',
      providerEventName: input.hook_event_name,
      modelRaw,
      status: null,
      normalizationStatus: 'raw_only',
      git: context.gitContext,
      rawEvent: input,
      sourceAvailability: {
        modelAvailable: modelRaw !== null,
      },
    });
  }

  const failed = mappedType === 'action_completed' && isToolError(input);
  const eventType = failed ? 'action_failed' : mappedType;
  const isAgentInvocation = input.tool_name === 'Task';
  const isSkillInvocation = input.tool_name === 'Skill';

  const promptBody = mappedType === 'prompt_submitted' && typeof input.prompt === 'string' ? input.prompt : null;
  const responseBody =
    eventType === 'action_completed' || eventType === 'action_failed' ? extractResponseBody(input.tool_response) : null;

  return createMetricsEventDraft(eventType, {
    sessionId: input.session_id ?? 'unknown',
    actionId: input.tool_use_id,
    gitUserName: context.gitUserName,
    userSlug: context.userSlug,
    toolProvider: 'claude-code',
    providerEventName: input.hook_event_name,
    modelRaw,
    status:
      eventType === 'action_completed' || eventType === 'action_failed' || eventType === 'session_completed'
        ? failed
          ? 'error'
          : 'success'
        : null,
    normalizationStatus: 'normalized',
    git: context.gitContext,
    rawEvent: input,
    promptBody,
    responseBody,
    sourceAvailability: {
      promptAvailable: promptBody !== null,
      responseAvailable: responseBody !== null,
      modelAvailable: modelRaw !== null,
    },
    agent: isAgentInvocation
      ? { used: true, name: toolInputField(input, 'subagent_type'), type: 'subagent', sourcePath: null }
      : undefined,
    skill: isSkillInvocation ? { used: true, name: toolInputField(input, 'skill'), sourcePath: null } : undefined,
  });
}
