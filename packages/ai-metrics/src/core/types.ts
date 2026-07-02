export const SCHEMA_VERSION = '1.0';

export type ToolProvider = 'claude-code' | 'copilot' | 'unknown';

export type MetricsEventType =
  | 'prompt_submitted'
  | 'action_started'
  | 'action_completed'
  | 'action_failed'
  | 'session_completed'
  | 'raw_event';

export type MetricsEventStatus = 'success' | 'error' | 'cancelled';

/**
 * How far normalization got: `normalized` (full mapping succeeded), `partial` (some fields
 * unavailable), `raw_only` (kept as a `raw_event` because normalization was not possible), or
 * `failed` (normalization threw / produced nothing usable).
 */
export type NormalizationStatus = 'normalized' | 'partial' | 'raw_only' | 'failed';

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
  /** The provider's own name for this event (e.g. a Claude Code hook name), verbatim. `null` when the provider doesn't expose one. */
  providerEventName: string | null;
  modelRaw: string | null;
  status: MetricsEventStatus | null;
  normalizationStatus: NormalizationStatus;
  sourceAvailability: SourceAvailability;
  git: GitContext;
  agent: AgentInfo;
  skill: SkillInfo;
  /** The unprocessed provider payload this event was normalized from, kept for debugging/reprocessing. */
  rawEvent: unknown;
  /** True when `rawEvent` was truncated before being stored (e.g. to bound payload size). */
  rawEventTruncated: boolean;
}

export interface PromptSubmittedEvent extends MetricsEventBase {
  eventType: 'prompt_submitted';
  promptBody: string | null;
}

export interface ActionStartedEvent extends MetricsEventBase {
  eventType: 'action_started';
  actionId: string;
}

export interface ActionCompletedEvent extends MetricsEventBase {
  eventType: 'action_completed';
  actionId: string;
  tokenUsage: TokenUsage;
  responseBody: string | null;
}

export interface ActionFailedEvent extends MetricsEventBase {
  eventType: 'action_failed';
  actionId: string;
  tokenUsage: TokenUsage;
  responseBody: string | null;
}

export interface SessionCompletedEvent extends MetricsEventBase {
  eventType: 'session_completed';
  tokenUsage: TokenUsage;
  responseBody: string | null;
}

/** Holds a Copilot-unrecognized or otherwise unnormalizable payload verbatim, instead of dropping it. */
export interface RawEvent extends MetricsEventBase {
  eventType: 'raw_event';
}

export type MetricsEvent =
  | PromptSubmittedEvent
  | ActionStartedEvent
  | ActionCompletedEvent
  | ActionFailedEvent
  | SessionCompletedEvent
  | RawEvent;

/** `Omit` does not distribute over a union by itself; this keeps each variant's extra fields intact. */
export type DistributiveOmit<T, K extends PropertyKey> = T extends unknown ? Omit<T, K> : never;

export interface ReportConfig {
  port: number;
}

export interface ClaudeCodeProviderConfig {
  enabled: boolean;
}

export interface CopilotRawEventConfig {
  enabled: boolean;
  /** Payloads larger than this are truncated before being stored as `rawEvent`. */
  maxBytes: number;
}

export interface CopilotProviderConfig {
  enabled: boolean;
  rawEvent: CopilotRawEventConfig;
}

export interface ProvidersConfig {
  claudeCode: ClaudeCodeProviderConfig;
  copilot: CopilotProviderConfig;
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

/** One row per raw_event within a session — kept verbatim so the report-ui can render it, e.g. for Copilot's experimental unmapped events. */
export interface ReportRawEvent {
  timestamp: string;
  toolProvider: ToolProvider;
  providerEventName: string | null;
  normalizationStatus: NormalizationStatus;
  rawEventTruncated: boolean;
  rawEvent: unknown;
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
  /** Distinct `providerEventName`s (e.g. "PreToolUse") seen across this session's events, excluding nulls. */
  providerEventNames: string[];
  /** Distinct `normalizationStatus`es seen across this session's events. */
  normalizationStatuses: string[];
  /** Count of this session's events with `eventType: "raw_event"`. */
  rawEventCount: number;
  /** Count of this session's events with `normalizationStatus: "raw_only"`. */
  rawOnlyEventCount: number;
  /** Count of this session's events with `rawEventTruncated: true`. */
  rawEventTruncatedCount: number;
  prompts: ReportPrompt[];
  actions: ReportAction[];
  rawEvents: ReportRawEvent[];
}

/** The metrics computed for one slice of sessions (overall, or grouped by user/date/provider/model/commit/agent/skill/providerEventName/normalizationStatus). */
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
  /** Count of `raw_event`-type events. */
  totalRawEvents: number;
  /** Count of events with `normalizationStatus: "raw_only"`. */
  rawOnlyEventCount: number;
  /** Count of events with `rawEventTruncated: true`. */
  rawEventTruncatedCount: number;
}

export interface ReportSummary {
  schemaVersion: string;
  generatedAt: string;
  totalEvents: number;
  overall: MainMetrics;
  byUser: Record<string, MainMetrics & { gitUserName: string }>;
  byDate: Record<string, MainMetrics>;
  byProvider: Record<string, MainMetrics>;
  byProviderEventName: Record<string, MainMetrics>;
  byModel: Record<string, MainMetrics>;
  byCommit: Record<string, MainMetrics>;
  byAgent: Record<string, MainMetrics>;
  bySkill: Record<string, MainMetrics>;
  byNormalizationStatus: Record<string, MainMetrics>;
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
