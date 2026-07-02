import { appendFileSync, existsSync, mkdirSync, mkdtempSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { recordEvent } from '../core/record-event.js';
import type { AgentInfo, GitContext, PromptSubmittedEvent, SkillInfo, SourceAvailability } from '../core/types.js';
import { buildReport, ReportBuildError } from './build-report.js';

const GIT_CONTEXT: GitContext = {
  repoRootHash: 'repo-hash',
  branch: 'main',
  baseCommitHash: 'abc123',
  workingTreeId: 'tree-hash',
  commitHash: null,
  commitLinkStrategy: 'since_previous_commit',
};

const NO_AGENT: AgentInfo = { used: false, name: null, type: null, sourcePath: null };
const NO_SKILL: SkillInfo = { used: false, name: null, sourcePath: null };

const SOURCE_AVAILABILITY: SourceAvailability = {
  tokenUsageAvailable: false,
  modelAvailable: false,
  durationAvailable: false,
  promptAvailable: true,
  responseAvailable: false,
};

function promptSubmittedDraft(sessionId: string): Omit<PromptSubmittedEvent, 'schemaVersion' | 'eventId' | 'timestamp'> {
  return {
    eventType: 'prompt_submitted',
    sessionId,
    gitUserName: 'Alice',
    userSlug: 'alice',
    toolProvider: 'claude-code',
    providerEventName: null,
    modelRaw: null,
    status: null,
    normalizationStatus: 'normalized',
    sourceAvailability: SOURCE_AVAILABILITY,
    git: GIT_CONTEXT,
    agent: NO_AGENT,
    skill: NO_SKILL,
    rawEvent: null,
    rawEventTruncated: false,
    promptBody: null,
  };
}

describe('buildReport', () => {
  let cwd: string;

  beforeEach(() => {
    cwd = mkdtempSync(join(tmpdir(), 'ai-metrics-'));
  });

  afterEach(() => {
    rmSync(cwd, { recursive: true, force: true });
  });

  it('aggregates recorded events into generated/summary.json and sessions.json', () => {
    recordEvent(promptSubmittedDraft('s1'), { cwd });
    recordEvent(promptSubmittedDraft('s1'), { cwd });

    const result = buildReport({ cwd, generatedAt: '2026-07-02T00:00:00.000Z' });

    expect(result.summary.totalEvents).toBe(2);
    expect(result.summary.overall.totalSessions).toBe(1);
    expect(result.sessions).toHaveLength(1);
    expect(result.sessions[0].promptCount).toBe(2);
    expect(result.warnings).toEqual([]);
    expect(existsSync(join(cwd, '.ai/metrics/generated/summary.json'))).toBe(true);
    expect(existsSync(join(cwd, '.ai/metrics/generated/sessions.json'))).toBe(true);
  });

  it('warns instead of failing when events have no resolvable git context', () => {
    recordEvent(
      {
        ...promptSubmittedDraft('s1'),
        git: { ...GIT_CONTEXT, repoRootHash: 'unknown', branch: 'unknown', baseCommitHash: 'unknown' },
      },
      { cwd },
    );

    const result = buildReport({ cwd, generatedAt: '2026-07-02T00:00:00.000Z' });

    expect(result.warnings).toHaveLength(1);
    expect(result.warnings[0]).toContain('1 event(s)');
  });

  it('skips an invalid jsonl line with a warning by default', () => {
    recordEvent(promptSubmittedDraft('s1'), { cwd });
    const eventsRoot = join(cwd, '.ai/metrics/events');
    const userDir = readdirSync(eventsRoot)[0];
    const dayFile = join(eventsRoot, userDir, readdirSync(join(eventsRoot, userDir))[0]);
    appendFileSync(dayFile, 'not valid json\n');

    const result = buildReport({ cwd });

    expect(result.summary.totalEvents).toBe(1);
    expect(result.warnings.some((w) => w.includes('Skipped invalid event'))).toBe(true);
  });

  it('skips a structurally invalid (but well-formed JSON) line with a warning by default', () => {
    mkdirSync(join(cwd, '.ai/metrics/events/alice'), { recursive: true });
    appendFileSync(join(cwd, '.ai/metrics/events/alice/2026-07-01.jsonl'), `${JSON.stringify({ hello: 'world' })}\n`);

    const result = buildReport({ cwd });

    expect(result.summary.totalEvents).toBe(0);
    expect(result.warnings.some((w) => w.includes('does not match the expected event schema'))).toBe(true);
  });

  it('--strict throws a ReportBuildError instead of skipping invalid lines', () => {
    mkdirSync(join(cwd, '.ai/metrics/events/alice'), { recursive: true });
    appendFileSync(join(cwd, '.ai/metrics/events/alice/2026-07-01.jsonl'), 'not valid json\n');

    expect(() => buildReport({ cwd, strict: true })).toThrow(ReportBuildError);
  });

  it('strict mode does not write any output files when it fails', () => {
    mkdirSync(join(cwd, '.ai/metrics/events/alice'), { recursive: true });
    appendFileSync(join(cwd, '.ai/metrics/events/alice/2026-07-01.jsonl'), 'not valid json\n');

    expect(() => buildReport({ cwd, strict: true })).toThrow();
    expect(existsSync(join(cwd, '.ai/metrics/generated/summary.json'))).toBe(false);
  });

  it('does not fail in non-strict mode when every line happens to be valid', () => {
    recordEvent(promptSubmittedDraft('s1'), { cwd });

    expect(() => buildReport({ cwd, strict: true })).not.toThrow();
  });
});
