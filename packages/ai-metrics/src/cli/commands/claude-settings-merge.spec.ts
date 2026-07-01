import { mergeClaudeHooks } from './claude-settings-merge.js';
import type { ClaudeSettings } from './claude-settings-merge.js';

const PATCH: ClaudeSettings = {
  hooks: {
    UserPromptSubmit: [{ matcher: '', hooks: [{ type: 'command', command: 'node .ai/metrics/hooks/claude-code-hook.mjs' }] }],
    PreToolUse: [{ matcher: '', hooks: [{ type: 'command', command: 'node .ai/metrics/hooks/claude-code-hook.mjs' }] }],
  },
};

describe('mergeClaudeHooks', () => {
  it('adds hooks to an empty settings object', () => {
    const result = mergeClaudeHooks({}, PATCH);

    expect(result.addedEvents).toEqual(['UserPromptSubmit', 'PreToolUse']);
    expect(result.alreadyPresentEvents).toEqual([]);
    expect(result.settings.hooks).toEqual(PATCH.hooks);
  });

  it('preserves unrelated top-level settings and unrelated hook events', () => {
    const existing: ClaudeSettings = {
      model: 'claude-fable-5',
      hooks: {
        Notification: [{ matcher: '', hooks: [{ type: 'command', command: 'echo hi' }] }],
      },
    };

    const result = mergeClaudeHooks(existing, PATCH);

    expect(result.settings.model).toBe('claude-fable-5');
    expect(result.settings.hooks?.['Notification']).toEqual(existing.hooks?.['Notification']);
    expect(result.settings.hooks?.['UserPromptSubmit']).toEqual(PATCH.hooks?.['UserPromptSubmit']);
  });

  it('preserves an existing tool-specific matcher group for the same event', () => {
    const existing: ClaudeSettings = {
      hooks: {
        PreToolUse: [{ matcher: 'Bash', hooks: [{ type: 'command', command: 'some-other-tool' }] }],
      },
    };

    const result = mergeClaudeHooks(existing, PATCH);

    expect(result.settings.hooks?.['PreToolUse']).toHaveLength(2);
    expect(result.settings.hooks?.['PreToolUse']?.[0]).toEqual(existing.hooks?.['PreToolUse']?.[0]);
  });

  it('does not add a duplicate group when the exact same command is already registered', () => {
    const existing: ClaudeSettings = {
      hooks: {
        PreToolUse: [{ matcher: '', hooks: [{ type: 'command', command: 'node .ai/metrics/hooks/claude-code-hook.mjs' }] }],
      },
    };

    const result = mergeClaudeHooks(existing, PATCH);

    expect(result.alreadyPresentEvents).toEqual(['PreToolUse']);
    expect(result.addedEvents).toEqual(['UserPromptSubmit']);
    expect(result.settings.hooks?.['PreToolUse']).toHaveLength(1);
  });

  it('is idempotent: merging the already-fully-applied patch again changes nothing', () => {
    const first = mergeClaudeHooks({}, PATCH);
    const second = mergeClaudeHooks(first.settings, PATCH);

    expect(second.addedEvents).toEqual([]);
    expect(second.alreadyPresentEvents).toEqual(['UserPromptSubmit', 'PreToolUse']);
    expect(second.settings).toEqual(first.settings);
  });
});
