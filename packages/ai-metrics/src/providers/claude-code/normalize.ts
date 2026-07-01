import { createMetricsEventDraft } from '../../core/eventFactory.js';
import type { MetricsEventDraft } from '../../core/eventFactory.js';
import type { GitContext, MetricsEventType } from '../../core/types.js';
import type { ClaudeCodeHookInput } from './types.js';

/** Only hook events with a known mapping produce an ai-metrics event; everything else is ignored. */
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
 * Maps a raw Claude Code hook payload onto the common ai-metrics event schema.
 * Returns `undefined` for hook events ai-metrics does not track (e.g. Notification).
 */
export function normalizeClaudeCodeEvent(input: ClaudeCodeHookInput, context: NormalizeContext): MetricsEventDraft | undefined {
  const mappedType = HOOK_EVENT_TYPE_MAP[input.hook_event_name];
  if (!mappedType) {
    return undefined;
  }

  const failed = mappedType === 'action_completed' && isToolError(input);
  const eventType = failed ? 'action_failed' : mappedType;
  const modelRaw = extractModelRaw(input);
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
    modelRaw,
    status:
      eventType === 'action_completed' || eventType === 'action_failed' || eventType === 'session_completed'
        ? failed
          ? 'error'
          : 'success'
        : null,
    gitContext: context.gitContext,
    raw: input,
    promptBody,
    responseBody,
    sourceAvailability: {
      promptAvailable: promptBody !== null,
      responseAvailable: responseBody !== null,
      modelAvailable: modelRaw !== null,
    },
    agentInfo: isAgentInvocation
      ? { used: true, name: toolInputField(input, 'subagent_type'), type: 'subagent', sourcePath: null }
      : undefined,
    skillInfo: isSkillInvocation ? { used: true, name: toolInputField(input, 'skill'), sourcePath: null } : undefined,
  });
}
