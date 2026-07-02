import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { recordEvent, recordEventAsync } from './record-event.js';
import type { AgentInfo, GitContext, PromptSubmittedEvent, SkillInfo, SourceAvailability } from './types.js';

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

function promptSubmittedDraft(
  userSlug: string,
  timestamp: string,
  overrides: Partial<PromptSubmittedEvent> = {},
): Omit<PromptSubmittedEvent, 'schemaVersion' | 'eventId'> {
  return {
    eventType: 'prompt_submitted',
    timestamp,
    sessionId: 's1',
    gitUserName: 'Alice',
    userSlug,
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
    ...overrides,
  };
}

describe('recordEvent', () => {
  let cwd: string;

  beforeEach(() => {
    cwd = mkdtempSync(join(tmpdir(), 'ai-metrics-'));
  });

  afterEach(() => {
    rmSync(cwd, { recursive: true, force: true });
  });

  it('writes to .ai/metrics/events/<userSlug>/<YYYY-MM-DD>.jsonl', () => {
    const event = recordEvent(promptSubmittedDraft('alice-1a2b3c', '2026-07-02T03:04:05.000Z'), { cwd });

    expect(event.schemaVersion).toBe('1.0');
    expect(typeof event.eventId).toBe('string');

    const filePath = join(cwd, '.ai/metrics/events/alice-1a2b3c/2026-07-02.jsonl');
    expect(existsSync(filePath)).toBe(true);
    expect(JSON.parse(readFileSync(filePath, 'utf8').trim())).toEqual(event);
  });

  it('creates a separate daily file per userSlug', () => {
    recordEvent(promptSubmittedDraft('alice', '2026-07-02T00:00:00.000Z'), { cwd });
    recordEvent(promptSubmittedDraft('bob', '2026-07-02T00:00:00.000Z'), { cwd });

    expect(existsSync(join(cwd, '.ai/metrics/events/alice/2026-07-02.jsonl'))).toBe(true);
    expect(existsSync(join(cwd, '.ai/metrics/events/bob/2026-07-02.jsonl'))).toBe(true);
  });

  it('splits the same user across day boundaries', () => {
    recordEvent(promptSubmittedDraft('alice', '2026-07-01T23:59:59.000Z'), { cwd });
    recordEvent(promptSubmittedDraft('alice', '2026-07-02T00:00:01.000Z'), { cwd });

    expect(existsSync(join(cwd, '.ai/metrics/events/alice/2026-07-01.jsonl'))).toBe(true);
    expect(existsSync(join(cwd, '.ai/metrics/events/alice/2026-07-02.jsonl'))).toBe(true);
  });

  it('appends multiple events for the same user/day, each line independently parseable', () => {
    recordEvent(promptSubmittedDraft('alice', '2026-07-02T00:00:00.000Z'), { cwd });
    recordEvent(promptSubmittedDraft('alice', '2026-07-02T12:00:00.000Z'), { cwd });
    recordEvent(promptSubmittedDraft('alice', '2026-07-02T23:59:59.000Z'), { cwd });

    const lines = readFileSync(join(cwd, '.ai/metrics/events/alice/2026-07-02.jsonl'), 'utf8').trim().split('\n');

    expect(lines).toHaveLength(3);
    const parsed = lines.map((line) => JSON.parse(line));
    expect(parsed.map((event) => event.timestamp)).toEqual([
      '2026-07-02T00:00:00.000Z',
      '2026-07-02T12:00:00.000Z',
      '2026-07-02T23:59:59.000Z',
    ]);
  });

  it('appends events asynchronously', async () => {
    await recordEventAsync(promptSubmittedDraft('alice', '2026-07-02T00:00:00.000Z'), { cwd });

    expect(existsSync(join(cwd, '.ai/metrics/events/alice/2026-07-02.jsonl'))).toBe(true);
  });

  it('preserves string content (quotes, newlines, unicode) verbatim through the JSON round-trip', () => {
    const rawText = 'line1\nline2 "quoted" 日本語 emoji 🎉';
    const event = recordEvent(promptSubmittedDraft('alice', '2026-07-02T00:00:00.000Z', { modelRaw: rawText }), { cwd });

    expect(event.modelRaw).toBe(rawText);

    const persisted = JSON.parse(
      readFileSync(join(cwd, '.ai/metrics/events/alice/2026-07-02.jsonl'), 'utf8').trim(),
    );
    expect(persisted.modelRaw).toBe(rawText);
  });

  it('truncates rawEvent once it exceeds the configured maxBytes and flags rawEventTruncated', () => {
    const oversized = { payload: 'x'.repeat(2_000_000) };
    const event = recordEvent(
      promptSubmittedDraft('alice', '2026-07-02T00:00:00.000Z', { rawEvent: oversized, rawEventTruncated: false }),
      { cwd },
    );

    expect(event.rawEventTruncated).toBe(true);
    expect(typeof event.rawEvent).toBe('string');
    expect(Buffer.byteLength(event.rawEvent as string, 'utf8')).toBeLessThanOrEqual(1_048_576);
  });

  it('leaves rawEvent and rawEventTruncated untouched when under the configured maxBytes', () => {
    const small = { hello: 'world' };
    const event = recordEvent(
      promptSubmittedDraft('alice', '2026-07-02T00:00:00.000Z', { rawEvent: small, rawEventTruncated: false }),
      { cwd },
    );

    expect(event.rawEvent).toEqual(small);
    expect(event.rawEventTruncated).toBe(false);
  });
});
