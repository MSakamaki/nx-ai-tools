import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createCopilotAdapter } from './adapter.js';

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
