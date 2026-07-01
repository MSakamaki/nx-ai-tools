import { randomUUID } from 'node:crypto';
import { existsSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { DEFAULT_CONFIG, DEFAULT_CONFIG_FILE_NAME, DEFAULT_METRICS_ROOT } from '../../config/default-config.js';
import { loadConfig, MetricsConfigError } from '../../config/load-config.js';
import { resolveEventsDirPath, resolveHooksDirPath } from '../../core/paths.js';
import type { MetricsConfig } from '../../core/types.js';
import { resolveGitContext } from '../../core/git.js';
import { resolveGitUserName } from '../../core/user.js';
import type { ClaudeSettings } from './claude-settings-merge.js';

export type CheckStatus = 'ok' | 'warn' | 'error';

export interface CheckResult {
  id: string;
  label: string;
  status: CheckStatus;
  message: string;
}

const HOOK_SCRIPT_FILE_NAME = 'claude-code-hook.mjs';

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

function checkHookScript(cwd: string, config: MetricsConfig): CheckResult {
  const id = 'hook-script';
  const label = 'claude-code-hook.mjs';
  const hookPath = join(resolveHooksDirPath(config, cwd), HOOK_SCRIPT_FILE_NAME);

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
    groups.some((group) => group.hooks.some((hook) => hook.command.includes(HOOK_SCRIPT_FILE_NAME))),
  );

  if (hasOurHook) {
    return { id, label, status: 'ok', message: `ai-metrics hook found in ${info.settingsPath}` };
  }
  return { id, label, status: 'warn', message: `No ai-metrics hook found in ${info.settingsPath}. Run "ai-metrics init".` };
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
    return {
      id,
      label,
      status: 'warn',
      message: 'Not inside a git repository (or git is unavailable); recorded events will use "unknown" for git fields.',
    };
  }
  return { id, label, status: 'ok', message: `branch=${context.branch} head=${context.baseCommitHash.slice(0, 7)}` };
}

/** Read-only: never records a metrics event or writes anything other than a probe file it immediately deletes. */
export function runDoctorChecks(cwd: string): CheckResult[] {
  const resolvedConfig = resolveConfigForDoctor(cwd);
  const settingsInfo = checkClaudeSettingsExists(cwd);

  return [
    checkNodeVersion(),
    checkPackageInstalled(cwd),
    checkMetricsConfig(resolvedConfig),
    checkHookScript(cwd, resolvedConfig.config),
    settingsInfo.result,
    checkClaudeSettingsHooks(settingsInfo),
    checkEventsDirWritable(cwd, resolvedConfig.config),
    checkGitUserName(cwd),
    checkGitContext(cwd),
  ];
}
