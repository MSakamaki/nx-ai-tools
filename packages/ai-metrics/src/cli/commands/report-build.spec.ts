import { appendFileSync, mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { ReportBuildError } from '../../report/build-report.js';
import { runReportBuild } from './report-build.js';

describe('runReportBuild', () => {
  let cwd: string;
  let consoleLogSpy: ReturnType<typeof vi.spyOn>;
  let consoleWarnSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    cwd = mkdtempSync(join(tmpdir(), 'ai-metrics-'));
    consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => undefined);
    consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
  });

  afterEach(() => {
    rmSync(cwd, { recursive: true, force: true });
    consoleLogSpy.mockRestore();
    consoleWarnSpy.mockRestore();
  });

  it('reports the written file paths', () => {
    runReportBuild({ cwd });

    expect(consoleLogSpy.mock.calls.some((call: unknown[]) => String(call[0]).includes('summary.json'))).toBe(true);
    expect(consoleLogSpy.mock.calls.some((call: unknown[]) => String(call[0]).includes('sessions.json'))).toBe(true);
  });

  it('warns (but does not throw) on an invalid event line by default', () => {
    mkdirSync(join(cwd, '.ai/metrics/events/alice'), { recursive: true });
    appendFileSync(join(cwd, '.ai/metrics/events/alice/2026-07-01.jsonl'), 'not valid json\n');

    expect(() => runReportBuild({ cwd })).not.toThrow();
    expect(consoleWarnSpy).toHaveBeenCalled();
  });

  it('propagates a ReportBuildError when --strict is set and a line is invalid', () => {
    mkdirSync(join(cwd, '.ai/metrics/events/alice'), { recursive: true });
    appendFileSync(join(cwd, '.ai/metrics/events/alice/2026-07-01.jsonl'), 'not valid json\n');

    expect(() => runReportBuild({ cwd, strict: true })).toThrow(ReportBuildError);
  });
});
