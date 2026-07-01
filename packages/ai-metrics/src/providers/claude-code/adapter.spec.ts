import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { formatDateStampFromTimestamp } from '../../core/date.js';
import { createClaudeCodeAdapter } from './adapter.js';

describe('createClaudeCodeAdapter', () => {
  let cwd: string;

  beforeEach(() => {
    cwd = mkdtempSync(join(tmpdir(), 'ai-metrics-'));
  });

  afterEach(() => {
    rmSync(cwd, { recursive: true, force: true });
  });

  it('records a PreToolUse hook payload as an action_started event', () => {
    const adapter = createClaudeCodeAdapter({ cwd });

    const event = adapter.handleInput(
      JSON.stringify({ hook_event_name: 'PreToolUse', session_id: 'abc', tool_name: 'Edit' }),
    );

    expect(event?.eventType).toBe('action_started');
    expect(event?.sessionId).toBe('abc');
    expect(event?.toolProvider).toBe('claude-code');
    if (!event) {
      throw new Error('expected an event to be recorded');
    }

    const dateStamp = formatDateStampFromTimestamp(event.timestamp);
    const raw = readFileSync(join(cwd, `.ai/metrics/events/${event.userSlug}/${dateStamp}.jsonl`), 'utf8');
    expect(raw.trim().split('\n')).toHaveLength(1);
  });

  it('records a PostToolUse hook payload with a tool error as action_failed', () => {
    const adapter = createClaudeCodeAdapter({ cwd });

    const event = adapter.handleInput(
      JSON.stringify({
        hook_event_name: 'PostToolUse',
        session_id: 'abc',
        tool_name: 'Edit',
        tool_response: { error: 'boom' },
      }),
    );

    expect(event?.eventType).toBe('action_failed');
    expect(event?.status).toBe('error');
  });

  it('ignores hook events it does not recognize', () => {
    const adapter = createClaudeCodeAdapter({ cwd });

    const event = adapter.handleInput(JSON.stringify({ hook_event_name: 'Notification', session_id: 'abc' }));

    expect(event).toBeUndefined();
  });

  it('swallows malformed input instead of throwing', () => {
    const onError = vi.fn();
    const adapter = createClaudeCodeAdapter({ cwd, onError });

    expect(() => adapter.handleInput('not json')).not.toThrow();
    expect(onError).toHaveBeenCalled();
  });

  it('keeps the raw hook payload and the prompt body verbatim', () => {
    const adapter = createClaudeCodeAdapter({ cwd });

    const event = adapter.handleInput(
      JSON.stringify({ hook_event_name: 'UserPromptSubmit', session_id: 'abc', prompt: 'line1\nline2 日本語' }),
    );

    expect(event && 'promptBody' in event ? event.promptBody : undefined).toBe('line1\nline2 日本語');
    expect(event?.raw).toEqual({ hook_event_name: 'UserPromptSubmit', session_id: 'abc', prompt: 'line1\nline2 日本語' });
  });
});
