import type { GitContext } from '../../core/types.js';
import { normalizeClaudeCodeEvent } from './normalize.js';
import type { ClaudeCodeHookInput } from './types.js';

const GIT_CONTEXT: GitContext = {
  repoRootHash: 'repo-hash',
  branch: 'main',
  baseCommitHash: 'abc123',
  workingTreeId: 'tree-hash',
  commitHash: null,
  commitLinkStrategy: 'since_previous_commit',
};

const CONTEXT = { gitUserName: 'Alice', userSlug: 'alice-1a2b3c', gitContext: GIT_CONTEXT };

function input(overrides: Partial<ClaudeCodeHookInput> & { hook_event_name: string }): ClaudeCodeHookInput {
  return { session_id: 's1', ...overrides };
}

describe('normalizeClaudeCodeEvent', () => {
  it('maps UserPromptSubmit to prompt_submitted and keeps the prompt body verbatim', () => {
    const draft = normalizeClaudeCodeEvent(input({ hook_event_name: 'UserPromptSubmit', prompt: 'hello\nworld' }), CONTEXT);

    expect(draft?.eventType).toBe('prompt_submitted');
    expect(draft?.toolProvider).toBe('claude-code');
    expect((draft as { promptBody: string | null }).promptBody).toBe('hello\nworld');
    expect(draft?.sourceAvailability.promptAvailable).toBe(true);
    expect(draft?.status).toBeNull();
  });

  it('maps PreToolUse to action_started and captures agent/skill invocation', () => {
    const draft = normalizeClaudeCodeEvent(
      input({ hook_event_name: 'PreToolUse', tool_name: 'Task', tool_input: { subagent_type: 'Explore' } }),
      CONTEXT,
    );

    expect(draft?.eventType).toBe('action_started');
    expect(draft?.agent).toEqual({
      used: true,
      name: 'Explore',
      type: 'subagent',
      sourcePath: null,
    });
  });

  it('maps a successful PostToolUse to action_completed and preserves the response verbatim', () => {
    const draft = normalizeClaudeCodeEvent(
      input({ hook_event_name: 'PostToolUse', tool_name: 'Edit', tool_response: { output: 'ok' } }),
      CONTEXT,
    );

    expect(draft?.eventType).toBe('action_completed');
    expect(draft?.status).toBe('success');
    expect((draft as { responseBody: string | null }).responseBody).toBe(JSON.stringify({ output: 'ok' }));
    expect(draft?.sourceAvailability.responseAvailable).toBe(true);
  });

  it('maps a failing PostToolUse (tool_response.error) to action_failed', () => {
    const draft = normalizeClaudeCodeEvent(
      input({ hook_event_name: 'PostToolUse', tool_name: 'Edit', tool_response: { error: 'boom' } }),
      CONTEXT,
    );

    expect(draft?.eventType).toBe('action_failed');
    expect(draft?.status).toBe('error');
  });

  it('maps Stop and SessionEnd to session_completed', () => {
    expect(normalizeClaudeCodeEvent(input({ hook_event_name: 'Stop' }), CONTEXT)?.eventType).toBe('session_completed');
    expect(normalizeClaudeCodeEvent(input({ hook_event_name: 'SessionEnd' }), CONTEXT)?.eventType).toBe('session_completed');
  });

  it('maps hook events without a mapping to raw_event instead of dropping them', () => {
    const draft = normalizeClaudeCodeEvent(input({ hook_event_name: 'Notification' }), CONTEXT);

    expect(draft.eventType).toBe('raw_event');
    expect(draft.normalizationStatus).toBe('raw_only');
    expect(draft.providerEventName).toBe('Notification');
    expect(draft.rawEvent).toEqual(input({ hook_event_name: 'Notification' }));
  });

  it('defaults unavailable fields to null and reflects it in sourceAvailability', () => {
    const draft = normalizeClaudeCodeEvent(input({ hook_event_name: 'PreToolUse' }), CONTEXT);

    expect(draft?.modelRaw).toBeNull();
    expect(draft?.sourceAvailability.modelAvailable).toBe(false);
    expect(draft?.sourceAvailability.tokenUsageAvailable).toBe(false);
  });

  it('captures modelRaw verbatim when present', () => {
    const draft = normalizeClaudeCodeEvent(input({ hook_event_name: 'PreToolUse', model: 'claude-fable-5' }), CONTEXT);

    expect(draft?.modelRaw).toBe('claude-fable-5');
    expect(draft?.sourceAvailability.modelAvailable).toBe(true);
  });

  it('keeps the raw hook payload on the event', () => {
    const rawInput = input({ hook_event_name: 'PreToolUse', tool_name: 'Edit' });
    const draft = normalizeClaudeCodeEvent(rawInput, CONTEXT);

    expect(draft?.rawEvent).toEqual(rawInput);
  });

  it('records the originating hook event name as providerEventName', () => {
    const draft = normalizeClaudeCodeEvent(input({ hook_event_name: 'PreToolUse' }), CONTEXT);

    expect(draft?.providerEventName).toBe('PreToolUse');
  });
});
