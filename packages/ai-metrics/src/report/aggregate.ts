import { formatDateStampFromTimestamp } from '../core/date.js';
import { SCHEMA_VERSION } from '../core/types.js';
import type {
  MainMetrics,
  MetricsEvent,
  MetricsEventStatus,
  ReportAction,
  ReportPrompt,
  ReportRawEvent,
  ReportSession,
  ReportSummary,
  TokenSource,
  TokenTotals,
  ToolProvider,
} from '../core/types.js';

const UNCOMMITTED_KEY = 'Uncommitted';
const UNKNOWN_MODEL_KEY = 'unknown';
const NO_AGENT_KEY = 'none';
const NO_SKILL_KEY = 'none';
const UNKNOWN_PROVIDER_EVENT_NAME_KEY = 'unknown';

function emptyTokenTotals(): TokenTotals {
  return { inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0, totalTokens: 0 };
}

function addTokenTotals(a: TokenTotals, b: TokenTotals): TokenTotals {
  return {
    inputTokens: a.inputTokens + b.inputTokens,
    outputTokens: a.outputTokens + b.outputTokens,
    cacheReadTokens: a.cacheReadTokens + b.cacheReadTokens,
    cacheWriteTokens: a.cacheWriteTokens + b.cacheWriteTokens,
    totalTokens: a.totalTokens + b.totalTokens,
  };
}

interface ResolvedTokens {
  totals: TokenTotals;
  source: TokenSource;
}

/** Honesty gate: a token field only counts if the adapter actually observed it (sourceAvailability), never a guessed zero. */
function resolveEventTokens(event: MetricsEvent): ResolvedTokens | null {
  if (!('tokenUsage' in event) || !event.sourceAvailability.tokenUsageAvailable) {
    return null;
  }
  const usage = event.tokenUsage;
  if (usage.tokenSource === 'unknown') {
    return null;
  }
  return {
    totals: {
      inputTokens: usage.inputTokens,
      outputTokens: usage.outputTokens,
      cacheReadTokens: usage.cacheReadTokens,
      cacheWriteTokens: usage.cacheWriteTokens,
      totalTokens: usage.totalTokens,
    },
    source: usage.tokenSource,
  };
}

/**
 * Accumulates "reported" and "estimated" token totals in separate buckets, because the two must
 * never be summed together (an estimate blended with a real count would misrepresent both).
 * `resolve()` prefers reported data whenever any exists.
 */
class TokenBucket {
  private reported: TokenTotals | null = null;
  private estimated: TokenTotals | null = null;

  add(resolved: ResolvedTokens | null): void {
    if (!resolved) {
      return;
    }
    if (resolved.source === 'reported') {
      this.reported = addTokenTotals(this.reported ?? emptyTokenTotals(), resolved.totals);
    } else if (resolved.source === 'estimated') {
      this.estimated = addTokenTotals(this.estimated ?? emptyTokenTotals(), resolved.totals);
    }
  }

  resolve(): { totals: TokenTotals | null; source: TokenSource } {
    if (this.reported) {
      return { totals: this.reported, source: 'reported' };
    }
    if (this.estimated) {
      return { totals: this.estimated, source: 'estimated' };
    }
    return { totals: null, source: 'unknown' };
  }
}

interface ActionAccumulator {
  actionId: string;
  status: MetricsEventStatus | null;
  agentUsed: boolean;
  agentName: string | null;
  skillUsed: boolean;
  skillName: string | null;
  tokens: ResolvedTokens | null;
  startedAt: string | null;
  completedAt: string | null;
  responseBody: string | null;
}

interface SessionAccumulator {
  sessionId: string;
  userSlug: string;
  gitUserName: string;
  provider: ToolProvider;
  modelRaw: string | null;
  branch: string;
  commitHash: string | null;
  firstTimestamp: string;
  lastTimestamp: string;
  eventCount: number;
  promptCount: number;
  prompts: ReportPrompt[];
  actionsById: Map<string, ActionAccumulator>;
  sessionCompletedTokens: ResolvedTokens | null;
  agentNames: Set<string>;
  skillNames: Set<string>;
  providerEventNames: Set<string>;
  normalizationStatuses: Set<string>;
  rawEventCount: number;
  rawOnlyEventCount: number;
  rawEventTruncatedCount: number;
  rawEvents: ReportRawEvent[];
}

function getOrCreateAction(session: SessionAccumulator, actionId: string): ActionAccumulator {
  let action = session.actionsById.get(actionId);
  if (!action) {
    action = {
      actionId,
      status: null,
      agentUsed: false,
      agentName: null,
      skillUsed: false,
      skillName: null,
      tokens: null,
      startedAt: null,
      completedAt: null,
      responseBody: null,
    };
    session.actionsById.set(actionId, action);
  }
  return action;
}

function applyAgentSkill(
  session: SessionAccumulator,
  action: ActionAccumulator,
  agentInfo: { used: boolean; name: string | null },
  skillInfo: { used: boolean; name: string | null },
): void {
  if (agentInfo.used) {
    action.agentUsed = true;
    action.agentName = agentInfo.name;
    if (agentInfo.name) {
      session.agentNames.add(agentInfo.name);
    }
  }
  if (skillInfo.used) {
    action.skillUsed = true;
    action.skillName = skillInfo.name;
    if (skillInfo.name) {
      session.skillNames.add(skillInfo.name);
    }
  }
}

/** Turns the flat event stream into one row per session, each carrying its own per-action rows. */
export function aggregateSessions(events: MetricsEvent[]): ReportSession[] {
  const sessions = new Map<string, SessionAccumulator>();

  function getSession(event: MetricsEvent): SessionAccumulator {
    let session = sessions.get(event.sessionId);
    if (!session) {
      session = {
        sessionId: event.sessionId,
        userSlug: event.userSlug,
        gitUserName: event.gitUserName,
        provider: event.toolProvider,
        modelRaw: event.modelRaw,
        branch: event.git.branch,
        commitHash: event.git.commitHash,
        firstTimestamp: event.timestamp,
        lastTimestamp: event.timestamp,
        eventCount: 0,
        promptCount: 0,
        prompts: [],
        actionsById: new Map(),
        sessionCompletedTokens: null,
        agentNames: new Set(),
        skillNames: new Set(),
        providerEventNames: new Set(),
        normalizationStatuses: new Set(),
        rawEventCount: 0,
        rawOnlyEventCount: 0,
        rawEventTruncatedCount: 0,
        rawEvents: [],
      };
      sessions.set(event.sessionId, session);
    }
    return session;
  }

  for (const event of events) {
    const session = getSession(event);
    session.eventCount += 1;
    if (event.timestamp < session.firstTimestamp) {
      session.firstTimestamp = event.timestamp;
    }
    if (event.timestamp > session.lastTimestamp) {
      session.lastTimestamp = event.timestamp;
    }
    if (event.modelRaw) {
      session.modelRaw = event.modelRaw;
    }
    if (event.git.commitHash) {
      session.commitHash = event.git.commitHash;
    }
    if (event.git.branch !== 'unknown') {
      session.branch = event.git.branch;
    }
    if (event.providerEventName) {
      session.providerEventNames.add(event.providerEventName);
    }
    session.normalizationStatuses.add(event.normalizationStatus);
    if (event.eventType === 'raw_event') {
      session.rawEventCount += 1;
    }
    if (event.normalizationStatus === 'raw_only') {
      session.rawOnlyEventCount += 1;
    }
    if (event.rawEventTruncated) {
      session.rawEventTruncatedCount += 1;
    }

    switch (event.eventType) {
      case 'prompt_submitted':
        session.promptCount += 1;
        session.prompts.push({ timestamp: event.timestamp, promptBody: event.promptBody });
        break;
      case 'action_started': {
        const action = getOrCreateAction(session, event.actionId);
        applyAgentSkill(session, action, event.agent, event.skill);
        action.startedAt = event.timestamp;
        break;
      }
      case 'action_completed':
      case 'action_failed': {
        const action = getOrCreateAction(session, event.actionId);
        applyAgentSkill(session, action, event.agent, event.skill);
        action.status = event.status;
        action.completedAt = event.timestamp;
        action.tokens = resolveEventTokens(event);
        action.responseBody = event.responseBody;
        break;
      }
      case 'session_completed': {
        session.sessionCompletedTokens = resolveEventTokens(event);
        if (event.agent.used && event.agent.name) {
          session.agentNames.add(event.agent.name);
        }
        if (event.skill.used && event.skill.name) {
          session.skillNames.add(event.skill.name);
        }
        break;
      }
      case 'raw_event': {
        // No action/prompt shape to attach to — still worth surfacing agent/skill usage if present.
        if (event.agent.used && event.agent.name) {
          session.agentNames.add(event.agent.name);
        }
        if (event.skill.used && event.skill.name) {
          session.skillNames.add(event.skill.name);
        }
        session.rawEvents.push({
          timestamp: event.timestamp,
          toolProvider: event.toolProvider,
          providerEventName: event.providerEventName,
          normalizationStatus: event.normalizationStatus,
          rawEventTruncated: event.rawEventTruncated,
          rawEvent: event.rawEvent,
        });
        break;
      }
    }
  }

  return [...sessions.values()].map(finalizeSession).sort((a, b) => a.sessionId.localeCompare(b.sessionId));
}

function resolveTokensFromActions(actions: ReportAction[]): ResolvedTokens | null {
  const bucket = new TokenBucket();
  for (const action of actions) {
    if (action.tokenUsage) {
      bucket.add({ totals: action.tokenUsage, source: action.tokenSource });
    }
  }
  const resolved = bucket.resolve();
  return resolved.totals ? { totals: resolved.totals, source: resolved.source } : null;
}

function finalizeSession(session: SessionAccumulator): ReportSession {
  const actions: ReportAction[] = [...session.actionsById.values()]
    .map(
      (action): ReportAction => ({
        actionId: action.actionId,
        status: action.status,
        agentUsed: action.agentUsed,
        agentName: action.agentName,
        skillUsed: action.skillUsed,
        skillName: action.skillName,
        tokenUsage: action.tokens?.totals ?? null,
        tokenSource: action.tokens?.source ?? 'unknown',
        startedAt: action.startedAt,
        completedAt: action.completedAt,
        responseBody: action.responseBody,
      }),
    )
    .sort((a, b) => (a.startedAt ?? '').localeCompare(b.startedAt ?? ''));

  const totalActions = actions.filter((action) => action.completedAt !== null).length;
  const failedActions = actions.filter((action) => action.status === 'error').length;

  // The session_completed event's own total is authoritative when present; re-deriving it by
  // summing per-action tokens is only a fallback for sessions that never reached completion.
  const tokens = session.sessionCompletedTokens ?? resolveTokensFromActions(actions);

  return {
    sessionId: session.sessionId,
    userSlug: session.userSlug,
    gitUserName: session.gitUserName,
    provider: session.provider,
    modelRaw: session.modelRaw,
    date: formatDateStampFromTimestamp(session.firstTimestamp),
    branch: session.branch,
    commitHash: session.commitHash,
    isUncommitted: session.commitHash === null,
    firstTimestamp: session.firstTimestamp,
    lastTimestamp: session.lastTimestamp,
    eventCount: session.eventCount,
    promptCount: session.promptCount,
    totalActions,
    failedActions,
    failedActionRate: totalActions > 0 ? failedActions / totalActions : null,
    agentUsed: session.agentNames.size > 0,
    agentNames: [...session.agentNames].sort(),
    skillUsed: session.skillNames.size > 0,
    skillNames: [...session.skillNames].sort(),
    tokenUsage: tokens?.totals ?? null,
    tokenSource: tokens?.source ?? 'unknown',
    providerEventNames: [...session.providerEventNames].sort(),
    normalizationStatuses: [...session.normalizationStatuses].sort(),
    rawEventCount: session.rawEventCount,
    rawOnlyEventCount: session.rawOnlyEventCount,
    rawEventTruncatedCount: session.rawEventTruncatedCount,
    prompts: [...session.prompts].sort((a, b) => a.timestamp.localeCompare(b.timestamp)),
    actions,
    rawEvents: [...session.rawEvents].sort((a, b) => a.timestamp.localeCompare(b.timestamp)),
  };
}

function computeMainMetrics(sessions: ReportSession[]): MainMetrics {
  const totalSessions = sessions.length;
  const totalActions = sessions.reduce((sum, session) => sum + session.totalActions, 0);
  const failedActions = sessions.reduce((sum, session) => sum + session.failedActions, 0);
  const uncommittedSessions = sessions.filter((session) => session.isUncommitted).length;
  const totalRawEvents = sessions.reduce((sum, session) => sum + session.rawEventCount, 0);
  const rawOnlyEventCount = sessions.reduce((sum, session) => sum + session.rawOnlyEventCount, 0);
  const rawEventTruncatedCount = sessions.reduce((sum, session) => sum + session.rawEventTruncatedCount, 0);
  const distinctCommits = new Set(
    sessions.filter((session) => session.commitHash !== null).map((session) => session.commitHash as string),
  ).size;

  const bucket = new TokenBucket();
  for (const session of sessions) {
    if (session.tokenUsage) {
      bucket.add({ totals: session.tokenUsage, source: session.tokenSource });
    }
  }
  const { totals, source } = bucket.resolve();

  const perSession = (value: number | null): number | null => (value !== null && totalSessions > 0 ? value / totalSessions : null);
  // Numerator intentionally includes all recorded tokens (committed or not); the denominator is
  // real commits only, so this reads as "tokens spent per commit landed", not "per session".
  const perCommit = (value: number | null): number | null => (value !== null && distinctCommits > 0 ? value / distinctCommits : null);

  const cacheRatePerSession =
    totals && totals.inputTokens + totals.cacheReadTokens > 0
      ? totals.cacheReadTokens / (totals.inputTokens + totals.cacheReadTokens)
      : null;

  return {
    totalSessions,
    totalActions,
    totalTokens: totals?.totalTokens ?? null,
    inputTokens: totals?.inputTokens ?? null,
    outputTokens: totals?.outputTokens ?? null,
    cacheReadTokens: totals?.cacheReadTokens ?? null,
    cacheWriteTokens: totals?.cacheWriteTokens ?? null,
    tokenSource: source,
    totalTokensPerSession: perSession(totals?.totalTokens ?? null),
    totalTokensPerCommit: perCommit(totals?.totalTokens ?? null),
    inputTokensPerSession: perSession(totals?.inputTokens ?? null),
    outputTokensPerSession: perSession(totals?.outputTokens ?? null),
    cacheRatePerSession,
    sessionsPerCommit: perCommit(totalSessions),
    actionsPerSession: totalSessions > 0 ? totalActions / totalSessions : null,
    failedActionRate: totalActions > 0 ? failedActions / totalActions : null,
    uncommittedSessions,
    totalRawEvents,
    rawOnlyEventCount,
    rawEventTruncatedCount,
  };
}

function groupBy(sessions: ReportSession[], keysFor: (session: ReportSession) => string[]): Record<string, ReportSession[]> {
  const groups: Record<string, ReportSession[]> = {};
  for (const session of sessions) {
    for (const key of keysFor(session)) {
      (groups[key] ??= []).push(session);
    }
  }
  return groups;
}

function buildBreakdown(sessions: ReportSession[], keysFor: (session: ReportSession) => string[]): Record<string, MainMetrics> {
  const groups = groupBy(sessions, keysFor);
  const breakdown: Record<string, MainMetrics> = {};
  for (const [key, groupSessions] of Object.entries(groups)) {
    breakdown[key] = computeMainMetrics(groupSessions);
  }
  return breakdown;
}

/** Builds the cross-cutting breakdowns (user/date/provider/providerEventName/model/commit/agent/skill/normalizationStatus) from already-aggregated sessions. */
export function aggregateSummary(sessions: ReportSession[], totalEvents: number, generatedAt: string): ReportSummary {
  const byUserGroups = groupBy(sessions, (session) => [session.userSlug]);
  const byUser: Record<string, MainMetrics & { gitUserName: string }> = {};
  for (const [userSlug, groupSessions] of Object.entries(byUserGroups)) {
    byUser[userSlug] = { ...computeMainMetrics(groupSessions), gitUserName: groupSessions[0]?.gitUserName ?? 'unknown' };
  }

  return {
    schemaVersion: SCHEMA_VERSION,
    generatedAt,
    totalEvents,
    overall: computeMainMetrics(sessions),
    byUser,
    byDate: buildBreakdown(sessions, (session) => [session.date]),
    byProvider: buildBreakdown(sessions, (session) => [session.provider]),
    byProviderEventName: buildBreakdown(sessions, (session) =>
      session.providerEventNames.length > 0 ? session.providerEventNames : [UNKNOWN_PROVIDER_EVENT_NAME_KEY],
    ),
    byModel: buildBreakdown(sessions, (session) => [session.modelRaw ?? UNKNOWN_MODEL_KEY]),
    byCommit: buildBreakdown(sessions, (session) => [session.commitHash ?? UNCOMMITTED_KEY]),
    byAgent: buildBreakdown(sessions, (session) => (session.agentNames.length > 0 ? session.agentNames : [NO_AGENT_KEY])),
    bySkill: buildBreakdown(sessions, (session) => (session.skillNames.length > 0 ? session.skillNames : [NO_SKILL_KEY])),
    byNormalizationStatus: buildBreakdown(sessions, (session) => session.normalizationStatuses),
  };
}

/** Surfaces events recorded without a resolvable git context as a report-time warning, not a hard failure. */
export function collectGitContextWarnings(events: MetricsEvent[]): string[] {
  const unresolvedCount = events.filter(
    (event) =>
      event.git.repoRootHash === 'unknown' || event.git.branch === 'unknown' || event.git.baseCommitHash === 'unknown',
  ).length;

  if (unresolvedCount === 0) {
    return [];
  }

  return [
    `${unresolvedCount} event(s) were recorded without a resolvable git context (not run inside a git repository, or git was unavailable).`,
  ];
}
