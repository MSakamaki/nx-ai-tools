import type { GitContext } from '../../core/types.js';
import type { CopilotHookInput } from './normalize.js';
import { normalizeCopilotEvent } from './normalize.js';

const GIT_CONTEXT: GitContext = {
  repoRootHash: 'repo-hash',
  branch: 'main',
  baseCommitHash: 'abc123',
  workingTreeId: 'tree-hash',
  commitHash: null,
  commitLinkStrategy: 'since_previous_commit',
};

const CONTEXT = { gitUserName: 'Alice', userSlug: 'alice-1a2b3c', gitContext: GIT_CONTEXT };

function input(overrides: Partial<CopilotHookInput> = {}): CopilotHookInput {
  return { sessionId: 's1', ...overrides };
}

describe('normalizeCopilotEvent', () => {
  it('maps a recognized eventType onto the matching MetricsEventType', () => {
    const draft = normalizeCopilotEvent(input({ eventType: 'prompt_submitted', promptBody: 'hello' }), CONTEXT);

    expect(draft.eventType).toBe('prompt_submitted');
    expect(draft.toolProvider).toBe('copilot');
    expect(draft.normalizationStatus).toBe('normalized');
    expect((draft as { promptBody: string | null }).promptBody).toBe('hello');
  });

  it('falls back to raw_event with normalizationStatus raw_only when eventType is missing', () => {
    const draft = normalizeCopilotEvent(input(), CONTEXT);

    expect(draft.eventType).toBe('raw_event');
    expect(draft.normalizationStatus).toBe('raw_only');
  });

  it('falls back to raw_event when eventType is not one ai-metrics recognizes', () => {
    const draft = normalizeCopilotEvent(input({ eventType: 'inlineSuggestion.accepted' }), CONTEXT);

    expect(draft.eventType).toBe('raw_event');
    expect(draft.providerEventName).toBe('inlineSuggestion.accepted');
  });

  it('keeps the raw payload on the event regardless of normalization outcome', () => {
    const rawInput = input({ eventType: 'unknown-thing', extra: 'field' });
    const draft = normalizeCopilotEvent(rawInput, CONTEXT);

    expect(draft.rawEvent).toEqual(rawInput);
  });

  it('generates a UUID sessionId when the input has none', () => {
    const draft = normalizeCopilotEvent({ eventType: 'prompt_submitted' }, CONTEXT);

    expect(draft.sessionId).toMatch(/^[0-9a-f-]{36}$/);
  });

  it('generates a UUID actionId for action events when the input has none', () => {
    const draft = normalizeCopilotEvent(input({ eventType: 'action_started' }), CONTEXT);

    expect((draft as { actionId: string }).actionId).toMatch(/^[0-9a-f-]{36}$/);
  });

  it('defaults unavailable fields to null and reflects it in sourceAvailability', () => {
    const draft = normalizeCopilotEvent(input({ eventType: 'session_completed' }), CONTEXT);

    expect(draft.modelRaw).toBeNull();
    expect(draft.sourceAvailability).toEqual({
      tokenUsageAvailable: false,
      modelAvailable: false,
      durationAvailable: false,
      promptAvailable: false,
      responseAvailable: false,
    });
  });

  it('reports tokenUsage as reported and available once any numeric field is present', () => {
    const draft = normalizeCopilotEvent(
      input({ eventType: 'action_completed', tokenUsage: { inputTokens: 10, totalTokens: 10 } }),
      CONTEXT,
    );

    expect((draft as { tokenUsage: { tokenSource: string } }).tokenUsage).toEqual({
      inputTokens: 10,
      outputTokens: 0,
      cacheReadTokens: 0,
      cacheWriteTokens: 0,
      totalTokens: 10,
      tokenSource: 'reported',
    });
    expect(draft.sourceAvailability.tokenUsageAvailable).toBe(true);
  });

  it('preserves the response body verbatim when it is a string', () => {
    const draft = normalizeCopilotEvent(input({ eventType: 'action_completed', responseBody: 'ok' }), CONTEXT);

    expect((draft as { responseBody: string | null }).responseBody).toBe('ok');
  });

  it('records the providerEventName when supplied', () => {
    const draft = normalizeCopilotEvent(
      input({ eventType: 'prompt_submitted', providerEventName: 'chat.prompt' }),
      CONTEXT,
    );

    expect(draft.providerEventName).toBe('chat.prompt');
  });
});
