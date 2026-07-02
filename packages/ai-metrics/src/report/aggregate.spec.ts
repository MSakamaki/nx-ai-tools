import type {
  ActionCompletedEvent,
  ActionFailedEvent,
  ActionStartedEvent,
  AgentInfo,
  GitContext,
  MetricsEvent,
  PromptSubmittedEvent,
  RawEvent,
  SessionCompletedEvent,
  SkillInfo,
  SourceAvailability,
  TokenUsage,
} from '../core/types.js';
import { aggregateSessions, aggregateSummary } from './aggregate.js';

let idCounter = 0;
function nextId(prefix: string): string {
  idCounter += 1;
  return `${prefix}-${idCounter}`;
}

function gitContext(overrides: Partial<GitContext> = {}): GitContext {
  return {
    repoRootHash: 'repo-hash',
    branch: 'main',
    baseCommitHash: 'abc123',
    workingTreeId: 'tree-hash',
    commitHash: null,
    commitLinkStrategy: 'since_previous_commit',
    ...overrides,
  };
}

const NO_AGENT: AgentInfo = { used: false, name: null, type: null, sourcePath: null };
const NO_SKILL: SkillInfo = { used: false, name: null, sourcePath: null };
const UNAVAILABLE: SourceAvailability = {
  tokenUsageAvailable: false,
  modelAvailable: false,
  durationAvailable: false,
  promptAvailable: false,
  responseAvailable: false,
};
const AVAILABLE: SourceAvailability = { ...UNAVAILABLE, tokenUsageAvailable: true };

function tokenUsage(overrides: Partial<TokenUsage> = {}): TokenUsage {
  return { inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0, totalTokens: 0, tokenSource: 'unknown', ...overrides };
}

function promptSubmitted(overrides: Partial<PromptSubmittedEvent> = {}): PromptSubmittedEvent {
  return {
    schemaVersion: '1.0',
    eventId: nextId('evt'),
    eventType: 'prompt_submitted',
    timestamp: '2026-07-01T00:00:00.000Z',
    sessionId: 's1',
    gitUserName: 'Alice',
    userSlug: 'alice',
    toolProvider: 'claude-code',
    providerEventName: null,
    modelRaw: null,
    status: null,
    normalizationStatus: 'normalized',
    sourceAvailability: UNAVAILABLE,
    git: gitContext(),
    agent: NO_AGENT,
    skill: NO_SKILL,
    rawEvent: null,
    rawEventTruncated: false,
    promptBody: null,
    ...overrides,
  };
}

function actionStarted(overrides: Partial<ActionStartedEvent> = {}): ActionStartedEvent {
  return {
    schemaVersion: '1.0',
    eventId: nextId('evt'),
    eventType: 'action_started',
    timestamp: '2026-07-01T00:00:01.000Z',
    sessionId: 's1',
    actionId: 'a1',
    gitUserName: 'Alice',
    userSlug: 'alice',
    toolProvider: 'claude-code',
    providerEventName: null,
    modelRaw: null,
    status: null,
    normalizationStatus: 'normalized',
    sourceAvailability: UNAVAILABLE,
    git: gitContext(),
    agent: NO_AGENT,
    skill: NO_SKILL,
    rawEvent: null,
    rawEventTruncated: false,
    ...overrides,
  };
}

function actionCompleted(overrides: Partial<ActionCompletedEvent> = {}): ActionCompletedEvent {
  return {
    schemaVersion: '1.0',
    eventId: nextId('evt'),
    eventType: 'action_completed',
    timestamp: '2026-07-01T00:00:02.000Z',
    sessionId: 's1',
    actionId: 'a1',
    gitUserName: 'Alice',
    userSlug: 'alice',
    toolProvider: 'claude-code',
    providerEventName: null,
    modelRaw: null,
    status: 'success',
    normalizationStatus: 'normalized',
    sourceAvailability: UNAVAILABLE,
    git: gitContext(),
    agent: NO_AGENT,
    skill: NO_SKILL,
    rawEvent: null,
    rawEventTruncated: false,
    tokenUsage: tokenUsage(),
    responseBody: null,
    ...overrides,
  };
}

function actionFailed(overrides: Partial<ActionFailedEvent> = {}): ActionFailedEvent {
  return {
    schemaVersion: '1.0',
    eventId: nextId('evt'),
    eventType: 'action_failed',
    timestamp: '2026-07-01T00:00:02.000Z',
    sessionId: 's1',
    actionId: 'a1',
    gitUserName: 'Alice',
    userSlug: 'alice',
    toolProvider: 'claude-code',
    providerEventName: null,
    modelRaw: null,
    status: 'error',
    normalizationStatus: 'normalized',
    sourceAvailability: UNAVAILABLE,
    git: gitContext(),
    agent: NO_AGENT,
    skill: NO_SKILL,
    rawEvent: null,
    rawEventTruncated: false,
    tokenUsage: tokenUsage(),
    responseBody: null,
    ...overrides,
  };
}

function sessionCompleted(overrides: Partial<SessionCompletedEvent> = {}): SessionCompletedEvent {
  return {
    schemaVersion: '1.0',
    eventId: nextId('evt'),
    eventType: 'session_completed',
    timestamp: '2026-07-01T00:00:03.000Z',
    sessionId: 's1',
    gitUserName: 'Alice',
    userSlug: 'alice',
    toolProvider: 'claude-code',
    providerEventName: null,
    modelRaw: null,
    status: 'success',
    normalizationStatus: 'normalized',
    sourceAvailability: UNAVAILABLE,
    git: gitContext(),
    agent: NO_AGENT,
    skill: NO_SKILL,
    rawEvent: null,
    rawEventTruncated: false,
    tokenUsage: tokenUsage(),
    responseBody: null,
    ...overrides,
  };
}

function rawEvent(overrides: Partial<RawEvent> = {}): RawEvent {
  return {
    schemaVersion: '1.0',
    eventId: nextId('evt'),
    eventType: 'raw_event',
    timestamp: '2026-07-01T00:00:00.000Z',
    sessionId: 's1',
    gitUserName: 'Alice',
    userSlug: 'alice',
    toolProvider: 'copilot',
    providerEventName: 'inlineSuggestion.accepted',
    modelRaw: null,
    status: null,
    normalizationStatus: 'raw_only',
    sourceAvailability: UNAVAILABLE,
    git: gitContext(),
    agent: NO_AGENT,
    skill: NO_SKILL,
    rawEvent: { some: 'payload' },
    rawEventTruncated: false,
    ...overrides,
  };
}

describe('aggregateSessions', () => {
  it('builds one row per session with prompt/action/timestamp rollups', () => {
    const events: MetricsEvent[] = [
      promptSubmitted({ timestamp: '2026-07-01T00:00:00.000Z' }),
      actionStarted({ actionId: 'a1', timestamp: '2026-07-01T00:00:01.000Z' }),
      actionCompleted({ actionId: 'a1', timestamp: '2026-07-01T00:00:02.000Z' }),
      sessionCompleted({ timestamp: '2026-07-01T00:00:03.000Z' }),
    ];

    const sessions = aggregateSessions(events);

    expect(sessions).toHaveLength(1);
    expect(sessions[0]).toMatchObject({
      sessionId: 's1',
      eventCount: 4,
      promptCount: 1,
      totalActions: 1,
      failedActions: 0,
      failedActionRate: 0,
      firstTimestamp: '2026-07-01T00:00:00.000Z',
      lastTimestamp: '2026-07-01T00:00:03.000Z',
      date: '2026-07-01',
    });
    expect(sessions[0].actions).toHaveLength(1);
  });

  it('marks a session Uncommitted when no event carries a commit hash', () => {
    const sessions = aggregateSessions([promptSubmitted({ git: gitContext({ commitHash: null }) })]);

    expect(sessions[0].commitHash).toBeNull();
    expect(sessions[0].isUncommitted).toBe(true);
  });

  it('adopts a commit hash once any event in the session reports one', () => {
    const events = [
      promptSubmitted({ git: gitContext({ commitHash: null }) }),
      sessionCompleted({ git: gitContext({ commitHash: 'abc123' }) }),
    ];

    const sessions = aggregateSessions(events);

    expect(sessions[0].commitHash).toBe('abc123');
    expect(sessions[0].isUncommitted).toBe(false);
  });

  it('prefers the session_completed token total over summing per-action tokens', () => {
    const events = [
      actionCompleted({
        actionId: 'a1',
        sourceAvailability: AVAILABLE,
        tokenUsage: tokenUsage({ inputTokens: 999, outputTokens: 999, totalTokens: 1998, tokenSource: 'reported' }),
      }),
      sessionCompleted({
        sourceAvailability: AVAILABLE,
        tokenUsage: tokenUsage({ inputTokens: 10, outputTokens: 20, totalTokens: 30, tokenSource: 'reported' }),
      }),
    ];

    const sessions = aggregateSessions(events);

    expect(sessions[0].tokenUsage).toEqual({ inputTokens: 10, outputTokens: 20, cacheReadTokens: 0, cacheWriteTokens: 0, totalTokens: 30 });
    expect(sessions[0].tokenSource).toBe('reported');
  });

  it('falls back to summing per-action tokens when there is no session_completed event', () => {
    const events = [
      actionCompleted({
        actionId: 'a1',
        sourceAvailability: AVAILABLE,
        tokenUsage: tokenUsage({ inputTokens: 10, outputTokens: 5, totalTokens: 15, tokenSource: 'reported' }),
      }),
      actionCompleted({
        actionId: 'a2',
        sourceAvailability: AVAILABLE,
        tokenUsage: tokenUsage({ inputTokens: 3, outputTokens: 2, totalTokens: 5, tokenSource: 'reported' }),
      }),
    ];

    const sessions = aggregateSessions(events);

    expect(sessions[0].tokenUsage).toEqual({ inputTokens: 13, outputTokens: 7, cacheReadTokens: 0, cacheWriteTokens: 0, totalTokens: 20 });
    expect(sessions[0].tokenSource).toBe('reported');
  });

  it('treats unavailable token usage as null, not zero, and never mixes it with estimated data', () => {
    const events = [
      actionCompleted({ actionId: 'a1', sourceAvailability: UNAVAILABLE }),
      actionCompleted({
        actionId: 'a2',
        sourceAvailability: AVAILABLE,
        tokenUsage: tokenUsage({ inputTokens: 7, totalTokens: 7, tokenSource: 'estimated' }),
      }),
    ];

    const sessions = aggregateSessions(events);

    expect(sessions[0].tokenUsage).toEqual({ inputTokens: 7, outputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0, totalTokens: 7 });
    expect(sessions[0].tokenSource).toBe('estimated');
  });

  it('is null when no action in the session ever reported token usage', () => {
    const sessions = aggregateSessions([actionCompleted({ sourceAvailability: UNAVAILABLE })]);

    expect(sessions[0].tokenUsage).toBeNull();
    expect(sessions[0].tokenSource).toBe('unknown');
  });

  it('prefers reported over estimated when both exist across different actions in the same session', () => {
    const events = [
      actionCompleted({
        actionId: 'a1',
        sourceAvailability: AVAILABLE,
        tokenUsage: tokenUsage({ inputTokens: 100, totalTokens: 100, tokenSource: 'estimated' }),
      }),
      actionCompleted({
        actionId: 'a2',
        sourceAvailability: AVAILABLE,
        tokenUsage: tokenUsage({ inputTokens: 5, totalTokens: 5, tokenSource: 'reported' }),
      }),
    ];

    const sessions = aggregateSessions(events);

    // Only the reported total survives; the estimated 100 is dropped rather than blended in.
    expect(sessions[0].tokenUsage).toEqual({ inputTokens: 5, outputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0, totalTokens: 5 });
    expect(sessions[0].tokenSource).toBe('reported');
  });

  it('collects distinct agent and skill names used across actions and session_completed', () => {
    const events = [
      actionCompleted({ actionId: 'a1', agent: { used: true, name: 'Explore', type: 'subagent', sourcePath: null } }),
      actionCompleted({ actionId: 'a2', skill: { used: true, name: 'code-review', sourcePath: null } }),
      sessionCompleted({ agent: { used: true, name: 'Explore', type: 'subagent', sourcePath: null } }),
    ];

    const sessions = aggregateSessions(events);

    expect(sessions[0].agentUsed).toBe(true);
    expect(sessions[0].agentNames).toEqual(['Explore']);
    expect(sessions[0].skillUsed).toBe(true);
    expect(sessions[0].skillNames).toEqual(['code-review']);
  });

  it('computes failedActionRate from completed+failed actions', () => {
    const events = [
      actionCompleted({ actionId: 'a1', status: 'success' }),
      actionFailed({ actionId: 'a2', status: 'error' }),
      actionFailed({ actionId: 'a3', status: 'error' }),
    ];

    const sessions = aggregateSessions(events);

    expect(sessions[0].totalActions).toBe(3);
    expect(sessions[0].failedActions).toBe(2);
    expect(sessions[0].failedActionRate).toBeCloseTo(2 / 3);
  });

  it('returns sessions sorted by sessionId', () => {
    const sessions = aggregateSessions([
      promptSubmitted({ sessionId: 'zzz' }),
      promptSubmitted({ sessionId: 'aaa' }),
    ]);

    expect(sessions.map((s) => s.sessionId)).toEqual(['aaa', 'zzz']);
  });

  it('collects each prompt body in timestamp order', () => {
    const events = [
      promptSubmitted({ timestamp: '2026-07-01T00:00:02.000Z', promptBody: 'second' }),
      promptSubmitted({ timestamp: '2026-07-01T00:00:01.000Z', promptBody: 'first' }),
    ];

    const sessions = aggregateSessions(events);

    expect(sessions[0].prompts).toEqual([
      { timestamp: '2026-07-01T00:00:01.000Z', promptBody: 'first' },
      { timestamp: '2026-07-01T00:00:02.000Z', promptBody: 'second' },
    ]);
  });

  it('keeps promptBody null when the prompt was never captured', () => {
    const sessions = aggregateSessions([promptSubmitted({ promptBody: null })]);

    expect(sessions[0].prompts).toEqual([{ timestamp: '2026-07-01T00:00:00.000Z', promptBody: null }]);
  });

  it('carries each action responseBody through to the session', () => {
    const events = [
      actionCompleted({ actionId: 'a1', responseBody: 'it worked' }),
      actionFailed({ actionId: 'a2', responseBody: 'boom' }),
    ];

    const sessions = aggregateSessions(events);
    const byId = Object.fromEntries(sessions[0].actions.map((a) => [a.actionId, a]));

    expect(byId['a1'].responseBody).toBe('it worked');
    expect(byId['a2'].responseBody).toBe('boom');
  });

  it('counts raw_event events into the session instead of dropping them', () => {
    const events = [
      promptSubmitted({ sessionId: 's1' }),
      rawEvent({ sessionId: 's1', providerEventName: 'inlineSuggestion.accepted' }),
    ];

    const sessions = aggregateSessions(events);

    expect(sessions[0].eventCount).toBe(2);
    expect(sessions[0].rawEventCount).toBe(1);
    expect(sessions[0].rawOnlyEventCount).toBe(1);
    expect(sessions[0].providerEventNames).toEqual(['inlineSuggestion.accepted']);
    expect(sessions[0].normalizationStatuses.sort()).toEqual(['normalized', 'raw_only']);
  });

  it('keeps the raw_event payload verbatim in session.rawEvents', () => {
    const events = [
      rawEvent({
        sessionId: 's1',
        toolProvider: 'copilot',
        providerEventName: 'inlineSuggestion.accepted',
        rawEvent: { some: 'payload' },
        rawEventTruncated: true,
      }),
    ];

    const sessions = aggregateSessions(events);

    expect(sessions[0].rawEvents).toEqual([
      {
        timestamp: '2026-07-01T00:00:00.000Z',
        toolProvider: 'copilot',
        providerEventName: 'inlineSuggestion.accepted',
        normalizationStatus: 'raw_only',
        rawEventTruncated: true,
        rawEvent: { some: 'payload' },
      },
    ]);
  });

  it('counts rawEventTruncated regardless of eventType', () => {
    const sessions = aggregateSessions([promptSubmitted({ rawEventTruncated: true })]);

    expect(sessions[0].rawEventTruncatedCount).toBe(1);
    expect(sessions[0].rawEventCount).toBe(0);
  });

  it('collects distinct providerEventNames across a session, ignoring nulls', () => {
    const events = [
      promptSubmitted({ providerEventName: 'UserPromptSubmit' }),
      actionStarted({ providerEventName: 'PreToolUse' }),
      actionStarted({ actionId: 'a2', providerEventName: null }),
    ];

    const sessions = aggregateSessions(events);

    expect(sessions[0].providerEventNames).toEqual(['PreToolUse', 'UserPromptSubmit']);
  });
});

describe('aggregateSummary', () => {
  it('buckets sessions with no commit under "Uncommitted"', () => {
    const sessions = aggregateSessions([
      promptSubmitted({ sessionId: 's1', git: gitContext({ commitHash: null }) }),
      promptSubmitted({ sessionId: 's2', git: gitContext({ commitHash: 'deadbeef' }) }),
    ]);

    const summary = aggregateSummary(sessions, 2, '2026-07-02T00:00:00.000Z');

    expect(summary.byCommit['Uncommitted'].totalSessions).toBe(1);
    expect(summary.byCommit['deadbeef'].totalSessions).toBe(1);
    expect(summary.overall.uncommittedSessions).toBe(1);
  });

  it('buckets sessions with no model under "unknown"', () => {
    const sessions = aggregateSessions([promptSubmitted({ modelRaw: null })]);

    const summary = aggregateSummary(sessions, 1, '2026-07-02T00:00:00.000Z');

    expect(Object.keys(summary.byModel)).toEqual(['unknown']);
  });

  it('buckets sessions with no agent/skill under "none", and by name otherwise', () => {
    const sessions = aggregateSessions([
      actionCompleted({ sessionId: 's1', agent: { used: true, name: 'Explore', type: 'subagent', sourcePath: null } }),
      actionCompleted({ sessionId: 's2' }),
    ]);

    const summary = aggregateSummary(sessions, 2, '2026-07-02T00:00:00.000Z');

    expect(Object.keys(summary.byAgent).sort()).toEqual(['Explore', 'none']);
    expect(summary.byAgent['Explore'].totalSessions).toBe(1);
    expect(summary.byAgent['none'].totalSessions).toBe(1);
    expect(Object.keys(summary.bySkill)).toEqual(['none']);
  });

  it('includes gitUserName alongside each byUser entry', () => {
    const sessions = aggregateSessions([promptSubmitted({ userSlug: 'alice-123', gitUserName: 'Alice' })]);

    const summary = aggregateSummary(sessions, 1, '2026-07-02T00:00:00.000Z');

    expect(summary.byUser['alice-123'].gitUserName).toBe('Alice');
    expect(summary.byUser['alice-123'].totalSessions).toBe(1);
  });

  it('computes per-session and per-commit token/action rates', () => {
    const sessions = aggregateSessions([
      actionCompleted({
        sessionId: 's1',
        git: gitContext({ commitHash: 'c1' }),
        sourceAvailability: AVAILABLE,
        tokenUsage: tokenUsage({ inputTokens: 100, cacheReadTokens: 50, outputTokens: 10, totalTokens: 160, tokenSource: 'reported' }),
      }),
      actionCompleted({
        sessionId: 's2',
        git: gitContext({ commitHash: 'c1' }),
        sourceAvailability: AVAILABLE,
        tokenUsage: tokenUsage({ inputTokens: 50, cacheReadTokens: 0, outputTokens: 10, totalTokens: 60, tokenSource: 'reported' }),
      }),
    ]);

    const summary = aggregateSummary(sessions, 2, '2026-07-02T00:00:00.000Z');
    const overall = summary.overall;

    expect(overall.totalSessions).toBe(2);
    expect(overall.totalTokens).toBe(220);
    expect(overall.totalTokensPerSession).toBe(110);
    expect(overall.totalTokensPerCommit).toBe(220); // one distinct commit ("c1")
    expect(overall.sessionsPerCommit).toBe(2);
    expect(overall.actionsPerSession).toBe(1);
    expect(overall.cacheRatePerSession).toBeCloseTo(50 / (150 + 50));
    expect(overall.tokenSource).toBe('reported');
  });

  it('leaves per-session/per-commit metrics null when there is no token or commit data', () => {
    const sessions = aggregateSessions([promptSubmitted()]);

    const summary = aggregateSummary(sessions, 1, '2026-07-02T00:00:00.000Z');

    expect(summary.overall.totalTokens).toBeNull();
    expect(summary.overall.totalTokensPerSession).toBeNull();
    expect(summary.overall.totalTokensPerCommit).toBeNull();
    expect(summary.overall.sessionsPerCommit).toBeNull();
    expect(summary.overall.cacheRatePerSession).toBeNull();
  });

  it('drops estimated-only sessions from a reported-dominant group total rather than blending them', () => {
    const sessions = aggregateSessions([
      actionCompleted({
        sessionId: 's1',
        sourceAvailability: AVAILABLE,
        tokenUsage: tokenUsage({ totalTokens: 10, tokenSource: 'reported' }),
      }),
      actionCompleted({
        sessionId: 's2',
        sourceAvailability: AVAILABLE,
        tokenUsage: tokenUsage({ totalTokens: 1000, tokenSource: 'estimated' }),
      }),
    ]);

    const summary = aggregateSummary(sessions, 2, '2026-07-02T00:00:00.000Z');

    expect(summary.overall.totalTokens).toBe(10);
    expect(summary.overall.tokenSource).toBe('reported');
  });

  it('includes raw_event events in overall totals and breaks them down by providerEventName/normalizationStatus', () => {
    const sessions = aggregateSessions([
      promptSubmitted({ sessionId: 's1' }),
      rawEvent({ sessionId: 's1', providerEventName: 'inlineSuggestion.accepted' }),
      rawEvent({ sessionId: 's2', providerEventName: 'inlineSuggestion.accepted', rawEventTruncated: true }),
    ]);

    const summary = aggregateSummary(sessions, 3, '2026-07-02T00:00:00.000Z');

    expect(summary.overall.totalRawEvents).toBe(2);
    expect(summary.overall.rawOnlyEventCount).toBe(2);
    expect(summary.overall.rawEventTruncatedCount).toBe(1);
    expect(Object.keys(summary.byProviderEventName)).toEqual(['inlineSuggestion.accepted']);
    expect(summary.byProviderEventName['inlineSuggestion.accepted'].totalSessions).toBe(2);
    expect(Object.keys(summary.byNormalizationStatus).sort()).toEqual(['normalized', 'raw_only']);
    expect(summary.byNormalizationStatus['raw_only'].totalRawEvents).toBe(2);
  });

  it('buckets sessions with no providerEventName under "unknown"', () => {
    const sessions = aggregateSessions([promptSubmitted({ providerEventName: null })]);

    const summary = aggregateSummary(sessions, 1, '2026-07-02T00:00:00.000Z');

    expect(Object.keys(summary.byProviderEventName)).toEqual(['unknown']);
  });
});
