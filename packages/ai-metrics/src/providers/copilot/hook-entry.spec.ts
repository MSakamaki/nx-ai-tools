import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { runHookEntry } from './hook-entry.js';

function initRepo(cwd: string): void {
  execFileSync('git', ['init', '-q', '-b', 'main'], { cwd });
  execFileSync('git', ['config', 'user.email', 'test@example.com'], { cwd });
  execFileSync('git', ['config', 'user.name', 'Test User'], { cwd });
  execFileSync('git', ['commit', '--allow-empty', '-q', '-m', 'init'], { cwd });
}

describe('runHookEntry (copilot)', () => {
  let cwd: string;

  beforeEach(() => {
    cwd = mkdtempSync(join(tmpdir(), 'ai-metrics-'));
  });

  afterEach(() => {
    rmSync(cwd, { recursive: true, force: true });
  });

  it('records a valid hook payload', () => {
    initRepo(cwd);

    runHookEntry({ cwd, input: JSON.stringify({ eventType: 'prompt_submitted', sessionId: 's1', promptBody: 'hi' }) });

    const eventsRoot = join(cwd, '.ai/metrics/events');
    const userDirs = readdirSync(eventsRoot);
    const files = readdirSync(join(eventsRoot, userDirs[0]));
    const event = JSON.parse(readFileSync(join(eventsRoot, userDirs[0], files[0]), 'utf8').trim());

    expect(event.eventType).toBe('prompt_submitted');
    expect(event.toolProvider).toBe('copilot');
  });

  it('never throws, and reports malformed input to stderr via console.error', () => {
    initRepo(cwd);
    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);

    expect(() => runHookEntry({ cwd, input: 'not json' })).not.toThrow();
    expect(consoleErrorSpy).toHaveBeenCalled();

    consoleErrorSpy.mockRestore();
  });

  it('never throws, and WARNs to stderr instead of recording when the repo root cannot be located', () => {
    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);

    expect(() =>
      runHookEntry({ cwd, input: JSON.stringify({ eventType: 'prompt_submitted', sessionId: 's1' }) }),
    ).not.toThrow();

    expect(consoleErrorSpy).toHaveBeenCalled();
    expect(existsSync(join(cwd, '.ai/metrics/events'))).toBe(false);

    consoleErrorSpy.mockRestore();
  });

  it('records an unrecognized eventType as a raw_event rather than dropping it', () => {
    initRepo(cwd);

    runHookEntry({ cwd, input: JSON.stringify({ eventType: 'inlineSuggestion.accepted', sessionId: 's1' }) });

    const eventsRoot = join(cwd, '.ai/metrics/events');
    const userDirs = readdirSync(eventsRoot);
    const files = readdirSync(join(eventsRoot, userDirs[0]));
    const event = JSON.parse(readFileSync(join(eventsRoot, userDirs[0], files[0]), 'utf8').trim());

    expect(event.eventType).toBe('raw_event');
    expect(event.normalizationStatus).toBe('raw_only');
  });
});
