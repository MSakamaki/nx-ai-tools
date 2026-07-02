import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { ClaudeSettings } from './claude-settings-merge.js';
import { mergeClaudeHooks } from './claude-settings-merge.js';
import type { FileTaskOptions } from './init-file-task.js';
import { applyFileTask } from './init-file-task.js';

const TEMPLATES_DIR = fileURLToPath(new URL('../../templates/claude-code/', import.meta.url));
const HOOK_SCRIPT_TEMPLATE_PATH = join(TEMPLATES_DIR, 'claude-code-hook.mjs');
const SETTINGS_PATCH_PATH = join(TEMPLATES_DIR, 'claude-settings.patch.json');
const README_TEMPLATE_PATH = join(TEMPLATES_DIR, 'README.md');
const HOOK_SCRIPT_FILE_NAME = 'claude-code-hook.mjs';

export interface InitClaudeCodeOptions extends FileTaskOptions {
  cwd: string;
  hooksDir: string;
}

/**
 * Scaffolds the Claude Code provider: `.ai/metrics/hooks/claude-code-hook.mjs`, a merge of ai-metrics'
 * hooks into `.claude/settings.json` (existing hooks are always preserved, additive-only), and a
 * short README. `.claude/settings.json` is always resolved from `cwd` — the project's own
 * `.claude/` directory, never `$HOME/.claude/` — so a user's global Claude Code settings are never
 * touched.
 */
export async function initClaudeCode(options: InitClaudeCodeOptions): Promise<void> {
  const hookScriptPath = join(options.hooksDir, HOOK_SCRIPT_FILE_NAME);
  await applyFileTask({ destPath: hookScriptPath, sourcePath: HOOK_SCRIPT_TEMPLATE_PATH, executable: true }, options);

  const readmePath = join(options.cwd, '.ai', 'metrics', 'claude-code', 'README.md');
  await applyFileTask({ destPath: readmePath, sourcePath: README_TEMPLATE_PATH }, options);

  await applyClaudeSettingsHooks(options);
}

async function applyClaudeSettingsHooks(options: InitClaudeCodeOptions): Promise<void> {
  const claudeSettingsPath = join(options.cwd, '.claude', 'settings.json');

  let existingSettings: ClaudeSettings = {};
  let settingsParseError: string | undefined;
  if (existsSync(claudeSettingsPath)) {
    try {
      existingSettings = JSON.parse(readFileSync(claudeSettingsPath, 'utf8')) as ClaudeSettings;
    } catch (error) {
      settingsParseError = error instanceof Error ? error.message : String(error);
    }
  }

  const patch = JSON.parse(readFileSync(SETTINGS_PATCH_PATH, 'utf8')) as ClaudeSettings;
  const canMergeSettings = settingsParseError === undefined;
  const mergeResult = canMergeSettings ? mergeClaudeHooks(existingSettings, patch) : undefined;
  // Only a genuine conflict (some of our events already registered, others still missing) needs a
  // human decision; a fully idempotent re-run or a from-scratch merge never prompts.
  const needsConfirmation =
    !options.force && !!mergeResult && mergeResult.alreadyPresentEvents.length > 0 && mergeResult.addedEvents.length > 0;

  if (options.dryRun) {
    if (!canMergeSettings) {
      console.log(`  skip ${claudeSettingsPath}: existing file is not valid JSON (${settingsParseError})`);
    } else if (mergeResult) {
      if (mergeResult.addedEvents.length > 0) {
        console.log(`  update ${claudeSettingsPath}: add hooks for [${mergeResult.addedEvents.join(', ')}]`);
      }
      if (mergeResult.alreadyPresentEvents.length > 0) {
        console.log(`  ${claudeSettingsPath} already has hooks for [${mergeResult.alreadyPresentEvents.join(', ')}]`);
        if (mergeResult.addedEvents.length > 0) {
          console.log(
            options.force ? '  (--force: would re-apply without asking)' : '  (would ask for confirmation before touching this file)',
          );
        }
      }
    }
    return;
  }

  if (!canMergeSettings) {
    console.error(`[ai-metrics] ${claudeSettingsPath} is not valid JSON; skipping hooks setup: ${settingsParseError}`);
    return;
  }

  if (!mergeResult) {
    return;
  }

  let proceed = true;
  if (needsConfirmation) {
    proceed = await options.confirm(
      `ai-metrics hooks already appear to be configured in ${claudeSettingsPath} (${mergeResult.alreadyPresentEvents.join(', ')}). Merge anyway?`,
    );
  }

  if (!proceed) {
    console.log(`Skipped updating ${claudeSettingsPath}.`);
    return;
  }

  if (mergeResult.addedEvents.length === 0) {
    console.log(`${claudeSettingsPath} already has ai-metrics hooks configured; nothing to do.`);
    return;
  }

  mkdirSync(dirname(claudeSettingsPath), { recursive: true });
  writeFileSync(claudeSettingsPath, `${JSON.stringify(mergeResult.settings, null, 2)}\n`, 'utf8');
  console.log(`Updated ${claudeSettingsPath} (added hooks for: ${mergeResult.addedEvents.join(', ')})`);
}
