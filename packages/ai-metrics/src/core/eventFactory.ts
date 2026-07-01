import { randomUUID } from 'node:crypto';
import type {
  AgentInfo,
  DistributiveOmit,
  GitContext,
  MetricsEvent,
  MetricsEventStatus,
  MetricsEventType,
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
  modelRaw: string | null;
  status: MetricsEventStatus | null;
  gitContext: GitContext;
  raw?: unknown;
  sourceAvailability?: Partial<SourceAvailability>;
  agentInfo?: AgentInfo;
  skillInfo?: SkillInfo;
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
    modelRaw: input.modelRaw,
    status: input.status,
    gitContext: input.gitContext,
    raw: input.raw ?? null,
    sourceAvailability: { ...DEFAULT_SOURCE_AVAILABILITY, ...input.sourceAvailability },
  };

  switch (eventType) {
    case 'prompt_submitted':
      return { ...common, eventType, actionId: input.actionId, promptBody: input.promptBody ?? null };
    case 'action_started':
      return {
        ...common,
        eventType,
        actionId: input.actionId ?? randomUUID(),
        agentInfo: input.agentInfo ?? DEFAULT_AGENT_INFO,
        skillInfo: input.skillInfo ?? DEFAULT_SKILL_INFO,
      };
    case 'action_completed':
    case 'action_failed':
      return {
        ...common,
        eventType,
        actionId: input.actionId ?? randomUUID(),
        agentInfo: input.agentInfo ?? DEFAULT_AGENT_INFO,
        skillInfo: input.skillInfo ?? DEFAULT_SKILL_INFO,
        tokenUsage: input.tokenUsage ?? DEFAULT_TOKEN_USAGE,
        responseBody: input.responseBody ?? null,
      };
    case 'session_completed':
      return {
        ...common,
        eventType,
        actionId: input.actionId,
        agentInfo: input.agentInfo ?? DEFAULT_AGENT_INFO,
        skillInfo: input.skillInfo ?? DEFAULT_SKILL_INFO,
        tokenUsage: input.tokenUsage ?? DEFAULT_TOKEN_USAGE,
        responseBody: input.responseBody ?? null,
      };
  }
}
