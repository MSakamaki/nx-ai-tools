import { randomUUID } from 'node:crypto';
import { existsSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { DEFAULT_CONFIG, DEFAULT_CONFIG_FILE_NAME, DEFAULT_METRICS_ROOT } from '../../config/default-config.js';
import { loadConfig, MetricsConfigError } from '../../config/load-config.js';
import { resolveEventsDirPath, resolveHooksDirPath } from '../../core/paths.js';
import type { MetricsConfig } from '../../core/types.js';
import { resolveGitContext } from '../../core/git.js';
import { findRepoRoot } from '../../core/repo-root.js';
import { resolveGitUserName } from '../../core/user.js';
import type { ProviderId } from '../provider-selection.js';
import type { ClaudeSettings } from './claude-settings-merge.js';

export type CheckStatus = 'ok' | 'warn' | 'error';

export interface CheckResult {
  id: string;
  label: string;
  status: CheckStatus;
  message: string;
}

const CLAUDE_CODE_HOOK_SCRIPT_FILE_NAME = 'claude-code-hook.mjs';
const COPILOT_HOOK_SCRIPT_FILE_NAME = 'copilot-hook.mjs';

function checkNodeVersion(): CheckResult {
  const id = 'node-version';
  const label = 'Node.js version';
  const major = Number(process.versions.node.split('.')[0]);

  if (!Number.isFinite(major) || major < 22) {
    return { id, label, status: 'error', message: `Node.js ${process.version} detected; ai-metrics requires >=22.` };
  }
  return { id, label, status: 'ok', message: `Node.js ${process.version}` };
}

function checkPackageInstalled(cwd: string): CheckResult {
  const id = 'package-installed';
  const label = '@nx-ai-tools/ai-metrics in node_modules';
  const packageDir = join(cwd, 'node_modules', '@nx-ai-tools', 'ai-metrics');

  if (existsSync(packageDir)) {
    return { id, label, status: 'ok', message: packageDir };
  }
  return {
    id,
    label,
    status: 'error',
    message: `Not found at ${packageDir}. The hook script imports "@nx-ai-tools/ai-metrics" and will fail to resolve it. Run npm install.`,
  };
}

interface ResolvedConfig {
  config: MetricsConfig;
  configPath: string;
  configExists: boolean;
  error?: string;
}

function resolveConfigForDoctor(cwd: string): ResolvedConfig {
  const configPath = join(cwd, DEFAULT_METRICS_ROOT, DEFAULT_CONFIG_FILE_NAME);
  const configExists = existsSync(configPath);

  try {
    return { config: loadConfig({ cwd }), configPath, configExists };
  } catch (error) {
    const message = error instanceof MetricsConfigError ? error.message : String(error);
    return { config: DEFAULT_CONFIG, configPath, configExists, error: message };
  }
}

function checkMetricsConfig(resolved: ResolvedConfig): CheckResult {
  const id = 'metrics-config';
  const label = 'metrics.config.json';

  if (!resolved.configExists) {
    return { id, label, status: 'warn', message: `${resolved.configPath} not found. Run "ai-metrics init".` };
  }
  if (resolved.error) {
    return { id, label, status: 'error', message: resolved.error };
  }
  return { id, label, status: 'ok', message: resolved.configPath };
}

function checkEventsDirWritable(cwd: string, config: MetricsConfig): CheckResult {
  const id = 'events-dir-writable';
  const label = 'events directory writable';
  const eventsDir = resolveEventsDirPath(config, cwd);

  if (!existsSync(eventsDir)) {
    return { id, label, status: 'warn', message: `${eventsDir} does not exist yet. Run "ai-metrics init".` };
  }

  const probePath = join(eventsDir, `.doctor-probe-${randomUUID()}.tmp`);
  try {
    writeFileSync(probePath, '');
    rmSync(probePath, { force: true });
    return { id, label, status: 'ok', message: eventsDir };
  } catch (error) {
    return {
      id,
      label,
      status: 'error',
      message: `${eventsDir} is not writable: ${error instanceof Error ? error.message : String(error)}`,
    };
  }
}

function checkGitUserName(cwd: string): CheckResult {
  const id = 'git-user-name';
  const label = 'git user.name';
  const name = resolveGitUserName(cwd);

  if (name === 'unknown') {
    return {
      id,
      label,
      status: 'warn',
      message: 'git user.name is not set (or git is unavailable); recorded events will use "unknown".',
    };
  }
  return { id, label, status: 'ok', message: name };
}

function checkGitContext(cwd: string): CheckResult {
  const id = 'git-context';
  const label = 'git branch / HEAD';
  const context = resolveGitContext(cwd);

  if (context.branch === 'unknown' || context.baseCommitHash === 'unknown') {
    const { reason } = findRepoRoot(cwd);
    return {
      id,
      label,
      status: 'warn',
      message: `${reason ?? 'git is unavailable, or the repository has no commits yet'}; recorded events will use "unknown" for git fields.`,
    };
  }
  return { id, label, status: 'ok', message: `branch=${context.branch} head=${context.baseCommitHash.slice(0, 7)}` };
}

function checkGeneratedDirGitignored(cwd: string, config: MetricsConfig): CheckResult {
  const id = 'generated-dir-gitignored';
  const label = 'generated/ gitignored';
  const gitignorePath = join(cwd, '.gitignore');
  const gitignoreLine = `${config.generatedDir}/`;

  if (!existsSync(gitignorePath)) {
    return { id, label, status: 'warn', message: `${gitignorePath} not found; ${gitignoreLine} is not ignored. Run "ai-metrics init".` };
  }

  const lines = readFileSync(gitignorePath, 'utf8')
    .split('\n')
    .map((line) => line.trim());
  if (lines.includes(gitignoreLine)) {
    return { id, label, status: 'ok', message: `${gitignoreLine} is ignored in ${gitignorePath}` };
  }
  return { id, label, status: 'warn', message: `${gitignoreLine} not found in ${gitignorePath}. Run "ai-metrics init".` };
}

// --- Claude Code provider checks -------------------------------------------------------------

function checkClaudeCodeHookScript(cwd: string, config: MetricsConfig): CheckResult {
  const id = 'hook-script';
  const label = 'claude-code-hook.mjs';
  const hookPath = join(resolveHooksDirPath(config, cwd), CLAUDE_CODE_HOOK_SCRIPT_FILE_NAME);

  if (existsSync(hookPath)) {
    return { id, label, status: 'ok', message: hookPath };
  }
  return { id, label, status: 'warn', message: `${hookPath} not found. Run "ai-metrics init".` };
}

interface ClaudeSettingsInfo {
  result: CheckResult;
  settingsPath: string;
  parsed?: ClaudeSettings;
  parseError?: string;
}

function checkClaudeSettingsExists(cwd: string): ClaudeSettingsInfo {
  const id = 'claude-settings-exists';
  const label = '.claude/settings.json';
  const settingsPath = join(cwd, '.claude', 'settings.json');

  if (!existsSync(settingsPath)) {
    return { result: { id, label, status: 'warn', message: `${settingsPath} not found. Run "ai-metrics init".` }, settingsPath };
  }

  try {
    const parsed = JSON.parse(readFileSync(settingsPath, 'utf8')) as ClaudeSettings;
    return { result: { id, label, status: 'ok', message: settingsPath }, settingsPath, parsed };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      result: { id, label, status: 'error', message: `${settingsPath} is not valid JSON: ${message}` },
      settingsPath,
      parseError: message,
    };
  }
}

function checkClaudeSettingsHooks(info: ClaudeSettingsInfo): CheckResult {
  const id = 'claude-settings-hooks';
  const label = 'Claude Code hook configuration';

  if (info.parseError) {
    return { id, label, status: 'error', message: `Cannot check hooks: ${info.settingsPath} is not valid JSON.` };
  }
  if (!info.parsed) {
    return { id, label, status: 'warn', message: `${info.settingsPath} not found; hooks are not configured.` };
  }

  const hooks = info.parsed.hooks ?? {};
  const hasOurHook = Object.values(hooks).some((groups) =>
    groups.some((group) => group.hooks.some((hook) => hook.command.includes(CLAUDE_CODE_HOOK_SCRIPT_FILE_NAME))),
  );

  if (hasOurHook) {
    return { id, label, status: 'ok', message: `ai-metrics hook found in ${info.settingsPath}` };
  }
  return { id, label, status: 'warn', message: `No ai-metrics hook found in ${info.settingsPath}. Run "ai-metrics init".` };
}

function runClaudeCodeChecks(cwd: string, config: MetricsConfig): CheckResult[] {
  const settingsInfo = checkClaudeSettingsExists(cwd);
  return [checkClaudeCodeHookScript(cwd, config), settingsInfo.result, checkClaudeSettingsHooks(settingsInfo)];
}

// --- Copilot provider checks (experimental / project hooks template) -------------------------

function checkCopilotHooksJson(cwd: string, requireCore: boolean): CheckResult[] {
  const label = '.github/hooks/ai-metrics.json';
  const hooksJsonPath = join(cwd, '.github', 'hooks', 'ai-metrics.json');

  if (!existsSync(hooksJsonPath)) {
    return [
      {
        id: 'copilot-hooks-json-exists',
        label,
        status: requireCore ? 'error' : 'warn',
        message: `${hooksJsonPath} not found. Run "ai-metrics init --provider copilot".`,
      },
    ];
  }
  const existsResult: CheckResult = { id: 'copilot-hooks-json-exists', label, status: 'ok', message: hooksJsonPath };

  let parsed: unknown;
  try {
    parsed = JSON.parse(readFileSync(hooksJsonPath, 'utf8'));
  } catch (error) {
    return [
      existsResult,
      {
        id: 'copilot-hooks-json-parses',
        label: `${label} (JSON)`,
        status: 'error',
        message: `${hooksJsonPath} is not valid JSON: ${error instanceof Error ? error.message : String(error)}`,
      },
    ];
  }
  const parsesResult: CheckResult = { id: 'copilot-hooks-json-parses', label: `${label} (JSON)`, status: 'ok', message: 'valid JSON' };

  const record = typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed) ? (parsed as Record<string, unknown>) : {};
  const hasVersion = 'version' in record;
  const hooksValue = record.hooks;
  const hasHooks = typeof hooksValue === 'object' && hooksValue !== null && !Array.isArray(hooksValue);

  const shapeResult: CheckResult =
    hasVersion && hasHooks
      ? { id: 'copilot-hooks-json-shape', label: `${label} (shape)`, status: 'ok', message: 'has top-level "version" and "hooks"' }
      : {
          id: 'copilot-hooks-json-shape',
          label: `${label} (shape)`,
          status: 'error',
          message: `${hooksJsonPath} is missing a top-level "version" and/or "hooks" field.`,
        };

  if (!hasHooks) {
    return [existsResult, parsesResult, shapeResult];
  }

  const referencesHookScript = Object.values(hooksValue as Record<string, unknown>).some(
    (hook) =>
      typeof hook === 'object' &&
      hook !== null &&
      typeof (hook as Record<string, unknown>).command === 'string' &&
      ((hook as Record<string, unknown>).command as string).includes(COPILOT_HOOK_SCRIPT_FILE_NAME),
  );

  const referenceResult: CheckResult = referencesHookScript
    ? {
        id: 'copilot-hooks-json-references-hook-script',
        label: `${label} (hook script reference)`,
        status: 'ok',
        message: `references ${COPILOT_HOOK_SCRIPT_FILE_NAME}`,
      }
    : {
        id: 'copilot-hooks-json-references-hook-script',
        label: `${label} (hook script reference)`,
        status: 'warn',
        message: `No hook command in ${hooksJsonPath} references ${COPILOT_HOOK_SCRIPT_FILE_NAME}.`,
      };

  return [existsResult, parsesResult, shapeResult, referenceResult];
}

function checkCopilotHookScript(cwd: string, config: MetricsConfig, requireCore: boolean): CheckResult {
  const id = 'copilot-hook-script';
  const label = 'copilot-hook.mjs';
  const hookPath = join(resolveHooksDirPath(config, cwd), COPILOT_HOOK_SCRIPT_FILE_NAME);

  if (existsSync(hookPath)) {
    return { id, label, status: 'ok', message: hookPath };
  }
  return {
    id,
    label,
    status: requireCore ? 'error' : 'warn',
    message: `${hookPath} not found. Run "ai-metrics init --provider copilot".`,
  };
}

function checkCopilotFileExists(cwd: string, id: string, label: string, relativePath: string[]): CheckResult {
  const filePath = join(cwd, ...relativePath);
  if (existsSync(filePath)) {
    return { id, label, status: 'ok', message: filePath };
  }
  return { id, label, status: 'warn', message: `${filePath} not found. Run "ai-metrics init --provider copilot".` };
}

function checkCopilotEnabled(config: MetricsConfig): CheckResult {
  const id = 'copilot-enabled';
  const label = 'providers.copilot.enabled';
  const value = config.providers.copilot.enabled;

  if (typeof value !== 'boolean') {
    return { id, label, status: 'error', message: 'Could not read providers.copilot.enabled from metrics.config.json.' };
  }
  return { id, label, status: 'ok', message: String(value) };
}

function checkCopilotRawEventMaxBytes(config: MetricsConfig): CheckResult {
  const id = 'copilot-raw-event-max-bytes';
  const label = 'providers.copilot.rawEvent.maxBytes';
  const value = config.providers.copilot.rawEvent.maxBytes;

  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return { id, label, status: 'error', message: 'Could not read providers.copilot.rawEvent.maxBytes from metrics.config.json.' };
  }
  return { id, label, status: 'ok', message: String(value) };
}

function isCopilotConfigured(cwd: string, config: MetricsConfig): boolean {
  return (
    existsSync(join(cwd, '.github', 'hooks', 'ai-metrics.json')) ||
    existsSync(join(resolveHooksDirPath(config, cwd), COPILOT_HOOK_SCRIPT_FILE_NAME))
  );
}

function runCopilotChecks(cwd: string, config: MetricsConfig, requireCore: boolean): CheckResult[] {
  return [
    ...checkCopilotHooksJson(cwd, requireCore),
    checkCopilotHookScript(cwd, config, requireCore),
    checkCopilotFileExists(cwd, 'copilot-adapter-config', '.ai/metrics/copilot/adapter.config.json', [
      '.ai',
      'metrics',
      'copilot',
      'adapter.config.json',
    ]),
    checkCopilotFileExists(cwd, 'copilot-sample-event', '.ai/metrics/copilot/sample-event.json', [
      '.ai',
      'metrics',
      'copilot',
      'sample-event.json',
    ]),
    checkCopilotEnabled(config),
    checkCopilotRawEventMaxBytes(config),
  ];
}

export interface RunDoctorChecksOptions {
  /** Explicit `--provider` selection. Omit to auto-detect from what's already on disk. */
  providers?: ProviderId[];
}

/** Read-only: never records a metrics event or writes anything other than a probe file it immediately deletes. */
export function runDoctorChecks(cwd: string, options: RunDoctorChecksOptions = {}): CheckResult[] {
  const resolvedConfig = resolveConfigForDoctor(cwd);
  const config = resolvedConfig.config;

  const commonChecks = [
    checkNodeVersion(),
    checkPackageInstalled(cwd),
    checkMetricsConfig(resolvedConfig),
    checkEventsDirWritable(cwd, config),
    checkGitUserName(cwd),
    checkGitContext(cwd),
    checkGeneratedDirGitignored(cwd, config),
  ];

  // Claude Code has always been checked by default (backward compatible). Copilot is newer and
  // experimental, so without an explicit --provider it only shows up once it's actually been
  // configured — an unused provider shouldn't warn just for not being set up.
  const includeClaudeCode = options.providers ? options.providers.includes('claude-code') : true;
  const includeCopilot = options.providers ? options.providers.includes('copilot') : isCopilotConfigured(cwd, config);
  // An explicit `--provider copilot` asserts "this must be working" — its two core files become
  // required (ERROR if missing) instead of merely advisory.
  const requireCopilotCore = options.providers?.includes('copilot') ?? false;

  return [
    ...commonChecks,
    ...(includeClaudeCode ? runClaudeCodeChecks(cwd, config) : []),
    ...(includeCopilot ? runCopilotChecks(cwd, config, requireCopilotCore) : []),
  ];
}
