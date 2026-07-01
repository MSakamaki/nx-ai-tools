import { chmodSync, copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createInterface } from 'node:readline/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { DEFAULT_CONFIG, DEFAULT_CONFIG_FILE_NAME } from '../../config/default-config.js';
import { resolveEventsDirPath, resolveGeneratedDirPath, resolveHooksDirPath, resolveMetricsRootPath } from '../../core/paths.js';
import type { ClaudeSettings } from './claude-settings-merge.js';
import { mergeClaudeHooks } from './claude-settings-merge.js';

const TEMPLATES_DIR = fileURLToPath(new URL('../../templates/', import.meta.url));
const HOOK_SCRIPT_TEMPLATE_PATH = join(TEMPLATES_DIR, 'claude-code-hook.mjs');
const CONFIG_TEMPLATE_PATH = join(TEMPLATES_DIR, 'metrics.config.json');
const CLAUDE_SETTINGS_PATCH_PATH = join(TEMPLATES_DIR, 'claude-settings.patch.json');
const HOOK_SCRIPT_FILE_NAME = 'claude-code-hook.mjs';
const GENERATED_DIR_GITIGNORE = '*\n';

export interface RunInitOptions {
  cwd?: string;
  dryRun?: boolean;
  force?: boolean;
  /** Injection seam for tests; defaults to a real y/N stdin prompt. */
  confirm?: (message: string) => boolean | Promise<boolean>;
}

async function defaultConfirm(message: string): Promise<boolean> {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  try {
    const answer = await rl.question(`${message} [y/N] `);
    return /^y(es)?$/i.test(answer.trim());
  } finally {
    rl.close();
  }
}

function ensureGitignoreEntry(gitignorePath: string, line: string): 'added' | 'already-present' {
  const content = existsSync(gitignorePath) ? readFileSync(gitignorePath, 'utf8') : '';
  const alreadyPresent = content
    .split('\n')
    .map((entry) => entry.trim())
    .includes(line);

  if (alreadyPresent) {
    return 'already-present';
  }

  const separator = content.length > 0 && !content.endsWith('\n') ? '\n' : '';
  writeFileSync(gitignorePath, `${content}${separator}${line}\n`, 'utf8');
  return 'added';
}

export async function runInit(options: RunInitOptions = {}): Promise<void> {
  const cwd = options.cwd ?? process.cwd();
  const dryRun = options.dryRun ?? false;
  const force = options.force ?? false;
  const confirm = options.confirm ?? defaultConfirm;

  const config = DEFAULT_CONFIG;
  const metricsRoot = resolveMetricsRootPath(config, cwd);
  const eventsDir = resolveEventsDirPath(config, cwd);
  const generatedDir = resolveGeneratedDirPath(config, cwd);
  const hooksDir = resolveHooksDirPath(config, cwd);
  const configPath = join(metricsRoot, DEFAULT_CONFIG_FILE_NAME);
  const hookScriptPath = join(hooksDir, HOOK_SCRIPT_FILE_NAME);
  const claudeSettingsPath = join(cwd, '.claude', 'settings.json');
  const gitignorePath = join(cwd, '.gitignore');
  const gitignoreLine = `${config.generatedDir}/`;

  const dirsToCreate = [metricsRoot, eventsDir, generatedDir, hooksDir].filter((dir) => !existsSync(dir));
  const willWriteConfig = !existsSync(configPath);
  const willWriteHookScript = !existsSync(hookScriptPath);
  const gitignoreAlreadyHasLine = existsSync(gitignorePath)
    ? readFileSync(gitignorePath, 'utf8')
        .split('\n')
        .map((line) => line.trim())
        .includes(gitignoreLine)
    : false;

  let existingSettings: ClaudeSettings = {};
  let settingsParseError: string | undefined;
  if (existsSync(claudeSettingsPath)) {
    try {
      existingSettings = JSON.parse(readFileSync(claudeSettingsPath, 'utf8')) as ClaudeSettings;
    } catch (error) {
      settingsParseError = error instanceof Error ? error.message : String(error);
    }
  }

  const patch = JSON.parse(readFileSync(CLAUDE_SETTINGS_PATCH_PATH, 'utf8')) as ClaudeSettings;
  const canMergeSettings = settingsParseError === undefined;
  const mergeResult = canMergeSettings ? mergeClaudeHooks(existingSettings, patch) : undefined;
  // A fully idempotent re-run (nothing new to add) should never prompt — only a genuine
  // partial/mixed state (some events already registered, others missing) needs a human decision.
  const needsConfirmation =
    !force && !!mergeResult && mergeResult.alreadyPresentEvents.length > 0 && mergeResult.addedEvents.length > 0;

  if (dryRun) {
    console.log('[dry-run] ai-metrics init would make the following changes:');
    for (const dir of dirsToCreate) {
      console.log(`  create directory: ${dir}`);
    }
    console.log(willWriteConfig ? `  write file: ${configPath}` : `  skip (exists): ${configPath}`);
    console.log(willWriteHookScript ? `  write file: ${hookScriptPath}` : `  skip (exists): ${hookScriptPath}`);
    console.log(
      gitignoreAlreadyHasLine
        ? `  skip (already present): ${gitignorePath} entry "${gitignoreLine}"`
        : `  append to ${gitignorePath}: "${gitignoreLine}"`,
    );
    if (!canMergeSettings) {
      console.log(`  skip ${claudeSettingsPath}: existing file is not valid JSON (${settingsParseError})`);
    } else if (mergeResult) {
      if (mergeResult.addedEvents.length > 0) {
        console.log(`  update ${claudeSettingsPath}: add hooks for [${mergeResult.addedEvents.join(', ')}]`);
      }
      if (mergeResult.alreadyPresentEvents.length > 0) {
        console.log(`  ${claudeSettingsPath} already has hooks for [${mergeResult.alreadyPresentEvents.join(', ')}]`);
        if (mergeResult.addedEvents.length > 0) {
          console.log(force ? '  (--force: would re-apply without asking)' : '  (would ask for confirmation before touching this file)');
        }
      }
    }
    return;
  }

  for (const dir of dirsToCreate) {
    mkdirSync(dir, { recursive: true });
  }

  if (willWriteConfig) {
    copyFileSync(CONFIG_TEMPLATE_PATH, configPath);
    console.log(`Created ${configPath}`);
  } else {
    console.log(`Skipped ${configPath} (already exists)`);
  }

  if (willWriteHookScript) {
    copyFileSync(HOOK_SCRIPT_TEMPLATE_PATH, hookScriptPath);
    chmodSync(hookScriptPath, 0o755);
    console.log(`Created ${hookScriptPath}`);
  } else {
    console.log(`Skipped ${hookScriptPath} (already exists)`);
  }

  writeFileSync(join(generatedDir, '.gitignore'), GENERATED_DIR_GITIGNORE, 'utf8');

  const gitignoreResult = ensureGitignoreEntry(gitignorePath, gitignoreLine);
  console.log(
    gitignoreResult === 'added'
      ? `Added "${gitignoreLine}" to ${gitignorePath}`
      : `${gitignorePath} already ignores "${gitignoreLine}"`,
  );

  if (!canMergeSettings) {
    console.error(`[ai-metrics] ${claudeSettingsPath} is not valid JSON; skipping hooks setup: ${settingsParseError}`);
    return;
  }

  if (!mergeResult) {
    return;
  }

  let proceed = true;
  if (needsConfirmation) {
    proceed = await confirm(
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
