export const SCHEMA_VERSION = '1.0';

export type ToolProvider = 'claude-code' | 'copilot' | 'unknown';

export type MetricsEventType =
  | 'prompt_submitted'
  | 'action_started'
  | 'action_completed'
  | 'action_failed'
  | 'session_completed';

export type MetricsEventStatus = 'success' | 'error' | 'cancelled';

export type TokenSource = 'reported' | 'estimated' | 'unknown';

export interface TokenUsage {
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheWriteTokens: number;
  totalTokens: number;
  tokenSource: TokenSource;
}

/** What the adapter could actually observe for this event, so aggregation can tell "zero" from "unknown". */
export interface SourceAvailability {
  tokenUsageAvailable: boolean;
  modelAvailable: boolean;
  durationAvailable: boolean;
  promptAvailable: boolean;
  responseAvailable: boolean;
}

export type CommitLinkStrategy = 'since_previous_commit';

export interface GitContext {
  repoRootHash: string;
  branch: string;
  baseCommitHash: string;
  workingTreeId: string;
  commitHash: string | null;
  commitLinkStrategy: CommitLinkStrategy;
}

export interface AgentInfo {
  used: boolean;
  name: string | null;
  type: string | null;
  sourcePath: string | null;
}

export interface SkillInfo {
  used: boolean;
  name: string | null;
  sourcePath: string | null;
}

export interface MetricsEventBase {
  schemaVersion: typeof SCHEMA_VERSION;
  eventId: string;
  eventType: MetricsEventType;
  timestamp: string;
  sessionId: string;
  actionId?: string;
  gitUserName: string;
  userSlug: string;
  toolProvider: ToolProvider;
  modelRaw: string | null;
  status: MetricsEventStatus | null;
  sourceAvailability: SourceAvailability;
  gitContext: GitContext;
  /** The unprocessed provider payload this event was normalized from, kept for debugging/reprocessing. */
  raw: unknown;
}

export interface PromptSubmittedEvent extends MetricsEventBase {
  eventType: 'prompt_submitted';
  promptBody: string | null;
}

export interface ActionStartedEvent extends MetricsEventBase {
  eventType: 'action_started';
  actionId: string;
  agentInfo: AgentInfo;
  skillInfo: SkillInfo;
}

export interface ActionCompletedEvent extends MetricsEventBase {
  eventType: 'action_completed';
  actionId: string;
  agentInfo: AgentInfo;
  skillInfo: SkillInfo;
  tokenUsage: TokenUsage;
  responseBody: string | null;
}

export interface ActionFailedEvent extends MetricsEventBase {
  eventType: 'action_failed';
  actionId: string;
  agentInfo: AgentInfo;
  skillInfo: SkillInfo;
  tokenUsage: TokenUsage;
  responseBody: string | null;
}

export interface SessionCompletedEvent extends MetricsEventBase {
  eventType: 'session_completed';
  tokenUsage: TokenUsage;
  agentInfo: AgentInfo;
  skillInfo: SkillInfo;
  responseBody: string | null;
}

export type MetricsEvent =
  | PromptSubmittedEvent
  | ActionStartedEvent
  | ActionCompletedEvent
  | ActionFailedEvent
  | SessionCompletedEvent;

/** `Omit` does not distribute over a union by itself; this keeps each variant's extra fields intact. */
export type DistributiveOmit<T, K extends PropertyKey> = T extends unknown ? Omit<T, K> : never;

export type ProviderStatus = 'enabled' | 'experimental' | 'disabled';

export interface ReportConfig {
  port: number;
}

export interface ProvidersConfig {
  'claude-code': ProviderStatus;
  copilot: ProviderStatus;
}

export interface MetricsConfig {
  metricsRoot: string;
  eventsDir: string;
  generatedDir: string;
  hooksDir: string;
  report: ReportConfig;
  showPromptBody: boolean;
  showResponseBody: boolean;
  markdownRendering: boolean;
  providers: ProvidersConfig;
}

export interface ProviderAdapter<TInput = unknown> {
  handleInput(input: TInput): MetricsEvent | undefined;
}

export interface ClaudeCodeAdapterOptions {
  config?: MetricsConfig;
  cwd?: string;
  onError?: (error: unknown) => void;
}

export interface CopilotAdapterOptions {
  config?: MetricsConfig;
  cwd?: string;
  onError?: (error: unknown) => void;
}

export interface TokenTotals {
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheWriteTokens: number;
  totalTokens: number;
}

/** One row per actionId within a session (an action_started/completed/failed triplet). */
export interface ReportAction {
  actionId: string;
  status: MetricsEventStatus | null;
  agentUsed: boolean;
  agentName: string | null;
  skillUsed: boolean;
  skillName: string | null;
  /** null when token usage was never observed (not zero — see the "null vs estimated" rule in aggregate.ts). */
  tokenUsage: TokenTotals | null;
  tokenSource: TokenSource;
  startedAt: string | null;
  completedAt: string | null;
  /** null when unavailable, or when the config that generated this report has showResponseBody disabled. */
  responseBody: string | null;
}

/** One row per prompt_submitted event within a session. */
export interface ReportPrompt {
  timestamp: string;
  /** null when unavailable, or when the config that generated this report has showPromptBody disabled. */
  promptBody: string | null;
}

export interface ReportSession {
  sessionId: string;
  userSlug: string;
  gitUserName: string;
  provider: ToolProvider;
  modelRaw: string | null;
  date: string;
  branch: string;
  commitHash: string | null;
  isUncommitted: boolean;
  firstTimestamp: string;
  lastTimestamp: string;
  eventCount: number;
  promptCount: number;
  totalActions: number;
  failedActions: number;
  failedActionRate: number | null;
  agentUsed: boolean;
  agentNames: string[];
  skillUsed: boolean;
  skillNames: string[];
  tokenUsage: TokenTotals | null;
  tokenSource: TokenSource;
  prompts: ReportPrompt[];
  actions: ReportAction[];
}

/** The metrics computed for one slice of sessions (overall, or grouped by user/date/provider/model/commit/agent/skill). */
export interface MainMetrics {
  totalSessions: number;
  totalActions: number;
  totalTokens: number | null;
  inputTokens: number | null;
  outputTokens: number | null;
  cacheReadTokens: number | null;
  cacheWriteTokens: number | null;
  tokenSource: TokenSource;
  totalTokensPerSession: number | null;
  totalTokensPerCommit: number | null;
  inputTokensPerSession: number | null;
  outputTokensPerSession: number | null;
  cacheRatePerSession: number | null;
  sessionsPerCommit: number | null;
  actionsPerSession: number | null;
  failedActionRate: number | null;
  uncommittedSessions: number;
}

export interface ReportSummary {
  schemaVersion: string;
  generatedAt: string;
  totalEvents: number;
  overall: MainMetrics;
  byUser: Record<string, MainMetrics & { gitUserName: string }>;
  byDate: Record<string, MainMetrics>;
  byProvider: Record<string, MainMetrics>;
  byModel: Record<string, MainMetrics>;
  byCommit: Record<string, MainMetrics>;
  byAgent: Record<string, MainMetrics>;
  bySkill: Record<string, MainMetrics>;
}

export interface BuildReportOptions {
  config?: MetricsConfig;
  cwd?: string;
  generatedAt?: string;
  /** When true, any unparseable/invalid event line fails the whole build instead of being skipped with a warning. */
  strict?: boolean;
}

export interface BuildReportResult {
  summary: ReportSummary;
  sessions: ReportSession[];
  summaryPath: string;
  sessionsPath: string;
  warnings: string[];
}
