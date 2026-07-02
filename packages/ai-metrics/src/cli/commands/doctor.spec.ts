import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { runDoctor } from './doctor.js';

function fullyInitializedProject(cwd: string): void {
  mkdirSync(join(cwd, 'node_modules/@nx-ai-tools/ai-metrics'), { recursive: true });
  mkdirSync(join(cwd, '.ai/metrics/events'), { recursive: true });
  mkdirSync(join(cwd, '.ai/metrics/hooks'), { recursive: true });
  mkdirSync(join(cwd, '.claude'), { recursive: true });
  writeFileSync(join(cwd, '.ai/metrics/metrics.config.json'), '{}');
  writeFileSync(join(cwd, '.ai/metrics/hooks/claude-code-hook.mjs'), '// hook\n');
  writeFileSync(
    join(cwd, '.claude/settings.json'),
    JSON.stringify({
      hooks: {
        PreToolUse: [{ matcher: '', hooks: [{ type: 'command', command: 'node .ai/metrics/hooks/claude-code-hook.mjs' }] }],
      },
    }),
  );
  writeFileSync(join(cwd, '.gitignore'), '.ai/metrics/generated/\n');
  execFileSync('git', ['init', '-q', '-b', 'main'], { cwd });
  execFileSync('git', ['config', 'user.name', 'Test User'], { cwd });
  execFileSync('git', ['config', 'user.email', 'test@example.com'], { cwd });
  execFileSync('git', ['commit', '--allow-empty', '-q', '-m', 'init'], { cwd });
}

describe('runDoctor', () => {
  let cwd: string;
  let consoleLogSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    cwd = mkdtempSync(join(tmpdir(), 'ai-metrics-'));
    consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => undefined);
    process.exitCode = undefined;
  });

  afterEach(() => {
    rmSync(cwd, { recursive: true, force: true });
    consoleLogSpy.mockRestore();
    process.exitCode = undefined;
  });

  it('exits 0 and reports OK overall for a fully initialized, healthy project', () => {
    fullyInitializedProject(cwd);

    runDoctor({ cwd });

    expect(process.exitCode).toBe(0);
    const lastLine = consoleLogSpy.mock.calls.at(-1)?.[0] as string;
    expect(lastLine).toBe('Overall: OK');
  });

  it('exits 0 for a fresh (uninitialized) project — only warnings, no errors', () => {
    mkdirSync(join(cwd, 'node_modules/@nx-ai-tools/ai-metrics'), { recursive: true });

    runDoctor({ cwd });

    expect(process.exitCode).toBe(0);
    const lastLine = consoleLogSpy.mock.calls.at(-1)?.[0] as string;
    expect(lastLine).toBe('Overall: WARN');
  });

  it('exits 1 when the package is not installed (an error-level check)', () => {
    runDoctor({ cwd });

    expect(process.exitCode).toBe(1);
    const lastLine = consoleLogSpy.mock.calls.at(-1)?.[0] as string;
    expect(lastLine).toBe('Overall: ERROR');
  });

  it('--json prints a single parseable JSON document with checks/summary/result', () => {
    fullyInitializedProject(cwd);

    runDoctor({ cwd, json: true });

    expect(consoleLogSpy).toHaveBeenCalledTimes(1);
    const output = JSON.parse(consoleLogSpy.mock.calls[0][0] as string);
    expect(Array.isArray(output.checks)).toBe(true);
    expect(output.checks.length).toBeGreaterThan(0);
    expect(output.result).toBe('ok');
    expect(output.summary).toEqual({ ok: output.checks.length, warn: 0, error: 0 });
  });

  it('never creates an events jsonl file (doctor is read-only)', () => {
    fullyInitializedProject(cwd);

    runDoctor({ cwd });
    runDoctor({ cwd, json: true });

    expect(readdirSync(join(cwd, '.ai/metrics/events'))).toEqual([]);
  });

  describe('--provider', () => {
    it('--provider claude-code on a fully initialized project still reports OK', () => {
      fullyInitializedProject(cwd);

      runDoctor({ cwd, provider: 'claude-code' });

      expect(process.exitCode).toBe(0);
      const lastLine = consoleLogSpy.mock.calls.at(-1)?.[0] as string;
      expect(lastLine).toBe('Overall: OK');
    });

    it('--provider copilot exits 1 when Copilot has not been set up at all', () => {
      mkdirSync(join(cwd, 'node_modules/@nx-ai-tools/ai-metrics'), { recursive: true });

      runDoctor({ cwd, provider: 'copilot' });

      expect(process.exitCode).toBe(1);
      const lastLine = consoleLogSpy.mock.calls.at(-1)?.[0] as string;
      expect(lastLine).toBe('Overall: ERROR');
    });

    it('--provider copilot exits 0 once both required files are present and valid', () => {
      mkdirSync(join(cwd, 'node_modules/@nx-ai-tools/ai-metrics'), { recursive: true });
      mkdirSync(join(cwd, '.github/hooks'), { recursive: true });
      mkdirSync(join(cwd, '.ai/metrics/hooks'), { recursive: true });
      mkdirSync(join(cwd, '.ai/metrics/events'), { recursive: true });
      mkdirSync(join(cwd, '.ai/metrics/copilot'), { recursive: true });
      writeFileSync(join(cwd, '.ai/metrics/metrics.config.json'), '{}');
      writeFileSync(
        join(cwd, '.github/hooks/ai-metrics.json'),
        JSON.stringify({ version: 1, hooks: { userPromptSubmitted: { command: 'node .ai/metrics/hooks/copilot-hook.mjs' } } }),
      );
      writeFileSync(join(cwd, '.ai/metrics/hooks/copilot-hook.mjs'), '// hook\n');
      writeFileSync(join(cwd, '.ai/metrics/copilot/adapter.config.json'), '{}');
      writeFileSync(join(cwd, '.ai/metrics/copilot/sample-event.json'), '{}');
      writeFileSync(join(cwd, '.gitignore'), '.ai/metrics/generated/\n');
      execFileSync('git', ['init', '-q', '-b', 'main'], { cwd });
      execFileSync('git', ['config', 'user.name', 'Test User'], { cwd });
      execFileSync('git', ['config', 'user.email', 'test@example.com'], { cwd });
      execFileSync('git', ['commit', '--allow-empty', '-q', '-m', 'init'], { cwd });

      runDoctor({ cwd, provider: 'copilot' });

      expect(process.exitCode).toBe(0);
      const lastLine = consoleLogSpy.mock.calls.at(-1)?.[0] as string;
      expect(lastLine).toBe('Overall: OK');
    });

    it('rejects an unknown --provider value', () => {
      expect(() => runDoctor({ cwd, provider: 'vscode-copilot' })).toThrow();
    });
  });
});
