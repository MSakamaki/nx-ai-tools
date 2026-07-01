import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { formatDateStampFromTimestamp } from '../../core/date.js';
import { runHookEntry } from './hook-entry.js';

describe('runHookEntry', () => {
  let cwd: string;

  beforeEach(() => {
    cwd = mkdtempSync(join(tmpdir(), 'ai-metrics-'));
  });

  afterEach(() => {
    rmSync(cwd, { recursive: true, force: true });
  });

  it('records a valid hook payload', () => {
    runHookEntry({
      cwd,
      input: JSON.stringify({ hook_event_name: 'UserPromptSubmit', session_id: 's1', prompt: 'hi' }),
    });

    const eventsRoot = join(cwd, '.ai/metrics/events');
    expect(existsSync(eventsRoot)).toBe(true);

    const userDirs = readdirSync(eventsRoot);
    expect(userDirs).toHaveLength(1);

    const files = readdirSync(join(eventsRoot, userDirs[0]));
    expect(files).toHaveLength(1);

    const raw = readFileSync(join(eventsRoot, userDirs[0], files[0]), 'utf8').trim();
    const event = JSON.parse(raw);
    expect(event.eventType).toBe('prompt_submitted');
    expect(files[0]).toBe(`${formatDateStampFromTimestamp(event.timestamp)}.jsonl`);
  });

  it('never throws, and reports malformed input to stderr via console.error', () => {
    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);

    expect(() => runHookEntry({ cwd, input: 'not json' })).not.toThrow();
    expect(consoleErrorSpy).toHaveBeenCalled();

    consoleErrorSpy.mockRestore();
  });

  it('ignores hook events without a mapping and does not create an events file', () => {
    runHookEntry({ cwd, input: JSON.stringify({ hook_event_name: 'Notification', session_id: 's1' }) });

    expect(existsSync(join(cwd, '.ai/metrics/events'))).toBe(false);
  });
});
