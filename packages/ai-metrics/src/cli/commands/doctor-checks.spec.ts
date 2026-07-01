import { execFileSync } from 'node:child_process';
import { chmodSync, mkdirSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { CheckResult } from './doctor-checks.js';
import { runDoctorChecks } from './doctor-checks.js';

function byId(checks: CheckResult[], id: string): CheckResult {
  const found = checks.find((check) => check.id === id);
  if (!found) {
    throw new Error(`no check with id "${id}"`);
  }
  return found;
}

describe('runDoctorChecks', () => {
  let cwd: string;

  beforeEach(() => {
    cwd = mkdtempSync(join(tmpdir(), 'ai-metrics-'));
  });

  afterEach(() => {
    rmSync(cwd, { recursive: true, force: true });
  });

  it('reports the current Node.js runtime as ok (test environment requires >=22)', () => {
    const checks = runDoctorChecks(cwd);
    expect(byId(checks, 'node-version').status).toBe('ok');
  });

  it('flags a missing @nx-ai-tools/ai-metrics install as an error', () => {
    const checks = runDoctorChecks(cwd);
    expect(byId(checks, 'package-installed').status).toBe('error');
  });

  it('reports ok once the package appears in node_modules', () => {
    mkdirSync(join(cwd, 'node_modules/@nx-ai-tools/ai-metrics'), { recursive: true });

    const checks = runDoctorChecks(cwd);

    expect(byId(checks, 'package-installed').status).toBe('ok');
  });

  it('warns when nothing has been initialized yet', () => {
    const checks = runDoctorChecks(cwd);

    expect(byId(checks, 'metrics-config').status).toBe('warn');
    expect(byId(checks, 'hook-script').status).toBe('warn');
    expect(byId(checks, 'claude-settings-exists').status).toBe('warn');
    expect(byId(checks, 'claude-settings-hooks').status).toBe('warn');
    expect(byId(checks, 'events-dir-writable').status).toBe('warn');
  });

  it('errors when metrics.config.json exists but is broken', () => {
    mkdirSync(join(cwd, '.ai/metrics'), { recursive: true });
    writeFileSync(join(cwd, '.ai/metrics/metrics.config.json'), '{ not json');

    const checks = runDoctorChecks(cwd);

    expect(byId(checks, 'metrics-config').status).toBe('error');
  });

  it('reports ok for metrics.config.json, hook script, and events dir once initialized', () => {
    mkdirSync(join(cwd, '.ai/metrics/events'), { recursive: true });
    mkdirSync(join(cwd, '.ai/metrics/hooks'), { recursive: true });
    writeFileSync(join(cwd, '.ai/metrics/metrics.config.json'), '{}');
    writeFileSync(join(cwd, '.ai/metrics/hooks/claude-code-hook.mjs'), '// hook\n');

    const checks = runDoctorChecks(cwd);

    expect(byId(checks, 'metrics-config').status).toBe('ok');
    expect(byId(checks, 'hook-script').status).toBe('ok');
    expect(byId(checks, 'events-dir-writable').status).toBe('ok');
  });

  it('errors when the events directory exists but is not writable', () => {
    mkdirSync(join(cwd, '.ai/metrics/events'), { recursive: true });
    chmodSync(join(cwd, '.ai/metrics/events'), 0o444);

    try {
      const checks = runDoctorChecks(cwd);
      expect(byId(checks, 'events-dir-writable').status).toBe('error');
    } finally {
      chmodSync(join(cwd, '.ai/metrics/events'), 0o755);
    }
  });

  it('errors when .claude/settings.json exists but is not valid JSON', () => {
    mkdirSync(join(cwd, '.claude'), { recursive: true });
    writeFileSync(join(cwd, '.claude/settings.json'), '{ not json');

    const checks = runDoctorChecks(cwd);

    expect(byId(checks, 'claude-settings-exists').status).toBe('error');
    expect(byId(checks, 'claude-settings-hooks').status).toBe('error');
  });

  it('warns when settings.json exists but has no ai-metrics hook', () => {
    mkdirSync(join(cwd, '.claude'), { recursive: true });
    writeFileSync(join(cwd, '.claude/settings.json'), JSON.stringify({ hooks: {} }));

    const checks = runDoctorChecks(cwd);

    expect(byId(checks, 'claude-settings-exists').status).toBe('ok');
    expect(byId(checks, 'claude-settings-hooks').status).toBe('warn');
  });

  it('reports ok when settings.json has the ai-metrics hook configured', () => {
    mkdirSync(join(cwd, '.claude'), { recursive: true });
    writeFileSync(
      join(cwd, '.claude/settings.json'),
      JSON.stringify({
        hooks: {
          PreToolUse: [{ matcher: '', hooks: [{ type: 'command', command: 'node .ai/metrics/hooks/claude-code-hook.mjs' }] }],
        },
      }),
    );

    const checks = runDoctorChecks(cwd);

    expect(byId(checks, 'claude-settings-hooks').status).toBe('ok');
  });

  it('warns about git user.name and git context outside a git repository', () => {
    // Isolate from the dev machine's own global ~/.gitconfig, which would otherwise leak a real
    // user.name into this "no repo, no config" scenario.
    const isolatedHome = mkdtempSync(join(tmpdir(), 'ai-metrics-home-'));
    const originalEnv = {
      HOME: process.env.HOME,
      GIT_CONFIG_GLOBAL: process.env.GIT_CONFIG_GLOBAL,
      GIT_CONFIG_NOSYSTEM: process.env.GIT_CONFIG_NOSYSTEM,
    };
    process.env.HOME = isolatedHome;
    process.env.GIT_CONFIG_GLOBAL = join(isolatedHome, 'unused-gitconfig');
    process.env.GIT_CONFIG_NOSYSTEM = '1';

    try {
      const checks = runDoctorChecks(cwd);

      expect(byId(checks, 'git-user-name').status).toBe('warn');
      expect(byId(checks, 'git-context').status).toBe('warn');
    } finally {
      for (const [key, value] of Object.entries(originalEnv)) {
        if (value === undefined) {
          delete process.env[key];
        } else {
          process.env[key] = value;
        }
      }
      rmSync(isolatedHome, { recursive: true, force: true });
    }
  });

  it('reports ok for git user.name and git context inside a configured git repository', () => {
    execFileSync('git', ['init', '-q', '-b', 'main'], { cwd });
    execFileSync('git', ['config', 'user.name', 'Test User'], { cwd });
    execFileSync('git', ['config', 'user.email', 'test@example.com'], { cwd });
    execFileSync('git', ['commit', '--allow-empty', '-q', '-m', 'init'], { cwd });

    const checks = runDoctorChecks(cwd);

    expect(byId(checks, 'git-user-name')).toEqual({
      id: 'git-user-name',
      label: 'git user.name',
      status: 'ok',
      message: 'Test User',
    });
    expect(byId(checks, 'git-context').status).toBe('ok');
    expect(byId(checks, 'git-context').message).toContain('branch=main');
  });

  it('never writes an events jsonl file', () => {
    mkdirSync(join(cwd, '.ai/metrics/events'), { recursive: true });

    runDoctorChecks(cwd);

    const entries = readdirSync(join(cwd, '.ai/metrics/events'));
    expect(entries).toEqual([]);
  });
});
