import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DEFAULT_CONFIG } from '../../config/default-config.js';
import { runInit } from './init.js';

describe('runInit', () => {
  let cwd: string;
  let consoleLogSpy: ReturnType<typeof vi.spyOn>;
  let consoleErrorSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    cwd = mkdtempSync(join(tmpdir(), 'ai-metrics-'));
    consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => undefined);
    consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
  });

  afterEach(() => {
    rmSync(cwd, { recursive: true, force: true });
    consoleLogSpy.mockRestore();
    consoleErrorSpy.mockRestore();
  });

  it('creates the .ai/metrics directory structure', async () => {
    await runInit({ cwd });

    expect(existsSync(join(cwd, '.ai/metrics'))).toBe(true);
    expect(existsSync(join(cwd, '.ai/metrics/events'))).toBe(true);
    expect(existsSync(join(cwd, '.ai/metrics/generated'))).toBe(true);
    expect(existsSync(join(cwd, '.ai/metrics/hooks'))).toBe(true);
  });

  it('writes metrics.config.json matching the default config', async () => {
    await runInit({ cwd });

    const written = JSON.parse(readFileSync(join(cwd, '.ai/metrics/metrics.config.json'), 'utf8'));
    expect(written).toEqual(DEFAULT_CONFIG);
  });

  it('writes an executable hooks/claude-code-hook.mjs', async () => {
    await runInit({ cwd });

    const hookPath = join(cwd, '.ai/metrics/hooks/claude-code-hook.mjs');
    expect(existsSync(hookPath)).toBe(true);
    expect(readFileSync(hookPath, 'utf8')).toContain('createClaudeCodeAdapter');
  });

  it('adds the generated dir to .gitignore', async () => {
    await runInit({ cwd });

    const gitignore = readFileSync(join(cwd, '.gitignore'), 'utf8');
    expect(gitignore.split('\n').map((l) => l.trim())).toContain('.ai/metrics/generated/');
  });

  it('appends to an existing .gitignore without touching prior content', async () => {
    writeFileSync(join(cwd, '.gitignore'), 'node_modules\n');

    await runInit({ cwd });

    const gitignore = readFileSync(join(cwd, '.gitignore'), 'utf8');
    expect(gitignore).toContain('node_modules');
    expect(gitignore).toContain('.ai/metrics/generated/');
  });

  it('does not duplicate an already-present .gitignore entry', async () => {
    writeFileSync(join(cwd, '.gitignore'), '.ai/metrics/generated/\n');

    await runInit({ cwd });

    const gitignore = readFileSync(join(cwd, '.gitignore'), 'utf8');
    expect(gitignore.match(/\.ai\/metrics\/generated\//g)).toHaveLength(1);
  });

  it('creates .claude/settings.json with ai-metrics hooks when none exists', async () => {
    await runInit({ cwd });

    const settings = JSON.parse(readFileSync(join(cwd, '.claude/settings.json'), 'utf8'));
    expect(Object.keys(settings.hooks)).toEqual(
      expect.arrayContaining(['UserPromptSubmit', 'PreToolUse', 'PostToolUse', 'Stop', 'SessionEnd']),
    );
  });

  it('merges into an existing .claude/settings.json without touching unrelated settings or hooks', async () => {
    mkdirSync(join(cwd, '.claude'), { recursive: true });
    writeFileSync(
      join(cwd, '.claude/settings.json'),
      JSON.stringify({
        model: 'claude-fable-5',
        hooks: { Notification: [{ matcher: '', hooks: [{ type: 'command', command: 'echo hi' }] }] },
      }),
    );

    await runInit({ cwd });

    const settings = JSON.parse(readFileSync(join(cwd, '.claude/settings.json'), 'utf8'));
    expect(settings.model).toBe('claude-fable-5');
    expect(settings.hooks.Notification).toEqual([{ matcher: '', hooks: [{ type: 'command', command: 'echo hi' }] }]);
    expect(settings.hooks.PreToolUse).toBeDefined();
  });

  it('does not overwrite an existing metrics.config.json or hook script', async () => {
    await runInit({ cwd });
    writeFileSync(join(cwd, '.ai/metrics/metrics.config.json'), JSON.stringify({ report: { port: 9999 } }));
    writeFileSync(join(cwd, '.ai/metrics/hooks/claude-code-hook.mjs'), '// customized by the user\n');

    await runInit({ cwd });

    expect(JSON.parse(readFileSync(join(cwd, '.ai/metrics/metrics.config.json'), 'utf8'))).toEqual({ report: { port: 9999 } });
    expect(readFileSync(join(cwd, '.ai/metrics/hooks/claude-code-hook.mjs'), 'utf8')).toBe('// customized by the user\n');
  });

  it('is idempotent: running twice with no existing ai-metrics hooks needs no confirmation', async () => {
    await runInit({ cwd });
    const confirm = vi.fn().mockResolvedValue(true);

    await runInit({ cwd, confirm });

    expect(confirm).not.toHaveBeenCalled();
  });

  it('skips updating settings.json entirely when the existing file is invalid JSON', async () => {
    mkdirSync(join(cwd, '.claude'), { recursive: true });
    writeFileSync(join(cwd, '.claude/settings.json'), '{ not json');

    await runInit({ cwd });

    expect(readFileSync(join(cwd, '.claude/settings.json'), 'utf8')).toBe('{ not json');
    expect(consoleErrorSpy).toHaveBeenCalled();
    // the rest of init still ran
    expect(existsSync(join(cwd, '.ai/metrics/metrics.config.json'))).toBe(true);
  });

  describe('--dry-run', () => {
    it('makes no filesystem changes', async () => {
      await runInit({ cwd, dryRun: true });

      expect(existsSync(join(cwd, '.ai/metrics'))).toBe(false);
      expect(existsSync(join(cwd, '.gitignore'))).toBe(false);
      expect(existsSync(join(cwd, '.claude/settings.json'))).toBe(false);
    });

    it('never prompts for confirmation', async () => {
      await runInit({ cwd }); // first real run registers the hooks
      const confirm = vi.fn().mockResolvedValue(true);

      await runInit({ cwd, dryRun: true, confirm });

      expect(confirm).not.toHaveBeenCalled();
    });
  });

  describe('re-running when the ai-metrics command is partially already configured', () => {
    function seedPartialSettings(): void {
      mkdirSync(join(cwd, '.claude'), { recursive: true });
      writeFileSync(
        join(cwd, '.claude/settings.json'),
        JSON.stringify({
          hooks: {
            PreToolUse: [{ matcher: '', hooks: [{ type: 'command', command: 'node .ai/metrics/hooks/claude-code-hook.mjs' }] }],
          },
        }),
      );
    }

    it('asks for confirmation, and skips the settings.json update when declined', async () => {
      seedPartialSettings();
      const confirm = vi.fn().mockResolvedValue(false);

      await runInit({ cwd, confirm });

      expect(confirm).toHaveBeenCalled();
      const settings = JSON.parse(readFileSync(join(cwd, '.claude/settings.json'), 'utf8'));
      expect(settings.hooks.UserPromptSubmit).toBeUndefined();
    });

    it('applies the merge (adding the missing events) once confirmed', async () => {
      seedPartialSettings();
      const confirm = vi.fn().mockResolvedValue(true);

      await runInit({ cwd, confirm });

      expect(confirm).toHaveBeenCalled();
      const settings = JSON.parse(readFileSync(join(cwd, '.claude/settings.json'), 'utf8'));
      expect(settings.hooks.UserPromptSubmit).toBeDefined();
      expect(settings.hooks.PreToolUse).toHaveLength(1);
    });

    it('--force skips the confirmation prompt and merges directly', async () => {
      seedPartialSettings();
      const confirm = vi.fn().mockResolvedValue(false);

      await runInit({ cwd, force: true, confirm });

      expect(confirm).not.toHaveBeenCalled();
      const settings = JSON.parse(readFileSync(join(cwd, '.claude/settings.json'), 'utf8'));
      expect(settings.hooks.UserPromptSubmit).toBeDefined();
    });
  });
});
