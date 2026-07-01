export interface ClaudeHookEntry {
  type: string;
  command: string;
  [key: string]: unknown;
}

export interface ClaudeHookMatcherGroup {
  matcher?: string;
  hooks: ClaudeHookEntry[];
  [key: string]: unknown;
}

export type ClaudeHooksSection = Record<string, ClaudeHookMatcherGroup[]>;

export interface ClaudeSettings {
  hooks?: ClaudeHooksSection;
  [key: string]: unknown;
}

export interface MergeHooksResult {
  settings: ClaudeSettings;
  addedEvents: string[];
  alreadyPresentEvents: string[];
}

function firstCommand(groups: ClaudeHookMatcherGroup[]): string | undefined {
  return groups[0]?.hooks[0]?.command;
}

function hasCommand(groups: ClaudeHookMatcherGroup[], command: string): boolean {
  return groups.some((group) => group.hooks.some((hook) => hook.command === command));
}

/**
 * Additive-only merge: existing hook groups (ours or anyone else's) are never removed or
 * replaced. For each event in `patch`, a new group is appended only if no existing group already
 * runs the exact same command — re-running init is then a no-op instead of duplicating entries.
 */
export function mergeClaudeHooks(existing: ClaudeSettings, patch: ClaudeSettings): MergeHooksResult {
  const patchHooks = patch.hooks ?? {};
  const existingHooks = existing.hooks ?? {};
  const mergedHooks: ClaudeHooksSection = { ...existingHooks };

  const addedEvents: string[] = [];
  const alreadyPresentEvents: string[] = [];

  for (const [event, groups] of Object.entries(patchHooks)) {
    const currentGroups = mergedHooks[event] ?? [];
    const command = firstCommand(groups);

    if (command && hasCommand(currentGroups, command)) {
      alreadyPresentEvents.push(event);
      continue;
    }

    mergedHooks[event] = [...currentGroups, ...groups];
    addedEvents.push(event);
  }

  return {
    settings: { ...existing, hooks: mergedHooks },
    addedEvents,
    alreadyPresentEvents,
  };
}
