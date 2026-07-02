import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DEFAULT_CONFIG } from '../../config/default-config.js';
import { createCopilotAdapter, createCopilotHookAdapter } from './adapter.js';

describe('createCopilotAdapter', () => {
  let cwd: string;

  beforeEach(() => {
    cwd = mkdtempSync(join(tmpdir(), 'ai-metrics-'));
  });

  afterEach(() => {
    rmSync(cwd, { recursive: true, force: true });
  });

  it('records an event tagged with provider "copilot"', () => {
    const adapter = createCopilotAdapter({ cwd });

    const event = adapter.handleInput({ sessionId: 's1', eventType: 'prompt_submitted' });

    expect(event?.toolProvider).toBe('copilot');
    expect(event?.sessionId).toBe('s1');
  });

  it('reports every optional field as unavailable when the caller supplies none', () => {
    const adapter = createCopilotAdapter({ cwd });

    const event = adapter.handleInput({ sessionId: 's1', eventType: 'session_completed' });

    expect(event?.modelRaw).toBeNull();
    expect(event?.sourceAvailability).toEqual({
      tokenUsageAvailable: false,
      modelAvailable: false,
      durationAvailable: false,
      promptAvailable: false,
      responseAvailable: false,
    });
  });

  it('reflects availability honestly once the caller supplies real values', () => {
    const adapter = createCopilotAdapter({ cwd });

    const event = adapter.handleInput({
      sessionId: 's1',
      eventType: 'prompt_submitted',
      modelRaw: 'copilot-chat',
      promptBody: 'hello',
    });

    expect(event?.modelRaw).toBe('copilot-chat');
    expect(event && 'promptBody' in event ? event.promptBody : undefined).toBe('hello');
    expect(event?.sourceAvailability.modelAvailable).toBe(true);
    expect(event?.sourceAvailability.promptAvailable).toBe(true);
    expect(event?.sourceAvailability.responseAvailable).toBe(false);
  });

  it('follows the same ProviderAdapter contract as the Claude Code adapter (handleInput -> MetricsEvent | undefined)', () => {
    const adapter = createCopilotAdapter({ cwd });
    expect(typeof adapter.handleInput).toBe('function');
  });

  it('swallows errors instead of throwing', () => {
    const notADirectory = join(cwd, 'i-am-a-file');
    writeFileSync(notADirectory, '');
    const onError = vi.fn();
    const adapter = createCopilotAdapter({ cwd: notADirectory, onError });

    expect(() => adapter.handleInput({ sessionId: 's1', eventType: 'prompt_submitted' })).not.toThrow();
    expect(onError).toHaveBeenCalled();
  });
});

describe('createCopilotHookAdapter', () => {
  let cwd: string;

  beforeEach(() => {
    cwd = mkdtempSync(join(tmpdir(), 'ai-metrics-'));
  });

  afterEach(() => {
    rmSync(cwd, { recursive: true, force: true });
  });

  function initRepo(): void {
    execFileSync('git', ['init', '-q', '-b', 'main'], { cwd });
    execFileSync('git', ['config', 'user.email', 'test@example.com'], { cwd });
    execFileSync('git', ['config', 'user.name', 'Test User'], { cwd });
    execFileSync('git', ['commit', '--allow-empty', '-q', '-m', 'init'], { cwd });
  }

  it('records a recognized event from a JSON string payload', () => {
    initRepo();
    const adapter = createCopilotHookAdapter({ cwd });

    const event = adapter.handleInput(JSON.stringify({ eventType: 'prompt_submitted', sessionId: 's1', promptBody: 'hi' }));

    expect(event?.eventType).toBe('prompt_submitted');
    expect(event?.toolProvider).toBe('copilot');
  });

  it('never throws and calls onError when the payload is not valid JSON', () => {
    initRepo();
    const onError = vi.fn();
    const adapter = createCopilotHookAdapter({ cwd, onError });

    expect(() => adapter.handleInput('not json')).not.toThrow();
    expect(onError).toHaveBeenCalled();
  });

  it('skips recording (without erroring) when providers.copilot.enabled is false', () => {
    initRepo();
    const onError = vi.fn();
    const adapter = createCopilotHookAdapter({
      cwd,
      onError,
      config: {
        ...DEFAULT_CONFIG,
        providers: { ...DEFAULT_CONFIG.providers, copilot: { ...DEFAULT_CONFIG.providers.copilot, enabled: false } },
      },
    });

    const event = adapter.handleInput(JSON.stringify({ eventType: 'prompt_submitted', sessionId: 's1' }));

    expect(event).toBeUndefined();
    expect(onError).not.toHaveBeenCalled();
    expect(existsSync(join(cwd, '.ai/metrics/events'))).toBe(false);
  });

  it('skips recording and calls onError when the repo root cannot be located', () => {
    const onError = vi.fn();
    const adapter = createCopilotHookAdapter({ cwd, onError });

    const event = adapter.handleInput(JSON.stringify({ eventType: 'prompt_submitted', sessionId: 's1' }));

    expect(event).toBeUndefined();
    expect(onError).toHaveBeenCalled();
    expect(existsSync(join(cwd, '.ai/metrics/events'))).toBe(false);
  });

  it('omits rawEvent (and never truncates it) when providers.copilot.rawEvent.enabled is false', () => {
    initRepo();
    const adapter = createCopilotHookAdapter({
      cwd,
      config: {
        ...DEFAULT_CONFIG,
        providers: {
          ...DEFAULT_CONFIG.providers,
          copilot: { ...DEFAULT_CONFIG.providers.copilot, rawEvent: { enabled: false, maxBytes: 1_048_576 } },
        },
      },
    });

    const event = adapter.handleInput(JSON.stringify({ eventType: 'prompt_submitted', sessionId: 's1', extra: 'x'.repeat(100) }));

    expect(event?.rawEvent).toBeNull();
    expect(event?.rawEventTruncated).toBe(false);
  });

  it('maps an unrecognized eventType to raw_event instead of dropping it', () => {
    initRepo();
    const adapter = createCopilotHookAdapter({ cwd });

    const event = adapter.handleInput(JSON.stringify({ eventType: 'inlineSuggestion.accepted', sessionId: 's1' }));

    expect(event?.eventType).toBe('raw_event');
    expect(event?.normalizationStatus).toBe('raw_only');
    expect(event?.providerEventName).toBe('inlineSuggestion.accepted');
  });
});
