import { randomUUID } from 'node:crypto';
import type {
  AgentInfo,
  DistributiveOmit,
  GitContext,
  MetricsEvent,
  MetricsEventStatus,
  MetricsEventType,
  NormalizationStatus,
  SkillInfo,
  SourceAvailability,
  ToolProvider,
  TokenUsage,
} from './types.js';

export interface EventFactoryInput {
  sessionId: string;
  actionId?: string;
  gitUserName: string;
  userSlug: string;
  toolProvider: ToolProvider;
  providerEventName?: string | null;
  modelRaw: string | null;
  status: MetricsEventStatus | null;
  normalizationStatus?: NormalizationStatus;
  git: GitContext;
  rawEvent?: unknown;
  rawEventTruncated?: boolean;
  sourceAvailability?: Partial<SourceAvailability>;
  agent?: AgentInfo;
  skill?: SkillInfo;
  tokenUsage?: TokenUsage;
  promptBody?: string | null;
  responseBody?: string | null;
}

export type MetricsEventDraft = DistributiveOmit<MetricsEvent, 'schemaVersion' | 'eventId' | 'timestamp'>;

const DEFAULT_SOURCE_AVAILABILITY: SourceAvailability = {
  tokenUsageAvailable: false,
  modelAvailable: false,
  durationAvailable: false,
  promptAvailable: false,
  responseAvailable: false,
};

const DEFAULT_AGENT_INFO: AgentInfo = { used: false, name: null, type: null, sourcePath: null };
const DEFAULT_SKILL_INFO: SkillInfo = { used: false, name: null, sourcePath: null };
const DEFAULT_TOKEN_USAGE: TokenUsage = {
  inputTokens: 0,
  outputTokens: 0,
  cacheReadTokens: 0,
  cacheWriteTokens: 0,
  totalTokens: 0,
  tokenSource: 'unknown',
};

export function createMetricsEventDraft(eventType: MetricsEventType, input: EventFactoryInput): MetricsEventDraft {
  const common = {
    sessionId: input.sessionId,
    gitUserName: input.gitUserName,
    userSlug: input.userSlug,
    toolProvider: input.toolProvider,
    providerEventName: input.providerEventName ?? null,
    modelRaw: input.modelRaw,
    status: input.status,
    normalizationStatus: input.normalizationStatus ?? 'normalized',
    git: input.git,
    agent: input.agent ?? DEFAULT_AGENT_INFO,
    skill: input.skill ?? DEFAULT_SKILL_INFO,
    rawEvent: input.rawEvent ?? null,
    rawEventTruncated: input.rawEventTruncated ?? false,
    sourceAvailability: { ...DEFAULT_SOURCE_AVAILABILITY, ...input.sourceAvailability },
  };

  switch (eventType) {
    case 'prompt_submitted':
      return { ...common, eventType, actionId: input.actionId, promptBody: input.promptBody ?? null };
    case 'action_started':
      return { ...common, eventType, actionId: input.actionId ?? randomUUID() };
    case 'action_completed':
    case 'action_failed':
      return {
        ...common,
        eventType,
        actionId: input.actionId ?? randomUUID(),
        tokenUsage: input.tokenUsage ?? DEFAULT_TOKEN_USAGE,
        responseBody: input.responseBody ?? null,
      };
    case 'session_completed':
      return {
        ...common,
        eventType,
        actionId: input.actionId,
        tokenUsage: input.tokenUsage ?? DEFAULT_TOKEN_USAGE,
        responseBody: input.responseBody ?? null,
      };
    case 'raw_event':
      return { ...common, eventType, actionId: input.actionId };
  }
}
