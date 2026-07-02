import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DEFAULT_CONFIG } from './default-config.js';
import { loadConfig, MetricsConfigError } from './load-config.js';

describe('loadConfig', () => {
  let cwd: string;

  beforeEach(() => {
    cwd = mkdtempSync(join(tmpdir(), 'ai-metrics-'));
  });

  afterEach(() => {
    rmSync(cwd, { recursive: true, force: true });
  });

  it('returns defaults when no config file exists', () => {
    expect(loadConfig({ cwd })).toEqual(DEFAULT_CONFIG);
  });

  it('deep-merges partial overrides from metrics.config.json onto the defaults', () => {
    mkdirSync(join(cwd, '.ai/metrics'), { recursive: true });
    writeFileSync(
      join(cwd, '.ai/metrics/metrics.config.json'),
      JSON.stringify({ report: { port: 9999 }, providers: { copilot: { enabled: false } } }),
    );

    const config = loadConfig({ cwd });

    expect(config).toEqual({
      ...DEFAULT_CONFIG,
      report: { port: 9999 },
      providers: {
        claudeCode: { enabled: true },
        copilot: { enabled: false, rawEvent: { enabled: true, maxBytes: 1048576 } },
      },
    });
  });

  it('deep-merges a nested override onto providers.copilot.rawEvent without dropping siblings', () => {
    mkdirSync(join(cwd, '.ai/metrics'), { recursive: true });
    writeFileSync(
      join(cwd, '.ai/metrics/metrics.config.json'),
      JSON.stringify({ providers: { copilot: { rawEvent: { maxBytes: 2048 } } } }),
    );

    const config = loadConfig({ cwd });

    expect(config.providers.copilot).toEqual({ enabled: true, rawEvent: { enabled: true, maxBytes: 2048 } });
  });

  it('throws a MetricsConfigError when the config file is not valid JSON', () => {
    mkdirSync(join(cwd, '.ai/metrics'), { recursive: true });
    writeFileSync(join(cwd, '.ai/metrics/metrics.config.json'), '{ not json');

    expect(() => loadConfig({ cwd })).toThrow(MetricsConfigError);
  });

  it('throws a MetricsConfigError when the config fails schema validation', () => {
    mkdirSync(join(cwd, '.ai/metrics'), { recursive: true });
    writeFileSync(join(cwd, '.ai/metrics/metrics.config.json'), JSON.stringify({ report: { port: 'not-a-number' } }));

    expect(() => loadConfig({ cwd })).toThrow(MetricsConfigError);
  });

  it('includes the config path in the thrown error', () => {
    mkdirSync(join(cwd, '.ai/metrics'), { recursive: true });
    const configPath = join(cwd, '.ai/metrics/metrics.config.json');
    writeFileSync(configPath, '{ not json');

    let caught: unknown;
    try {
      loadConfig({ cwd });
    } catch (error) {
      caught = error;
    }

    expect(caught).toBeInstanceOf(MetricsConfigError);
    expect((caught as MetricsConfigError).configPath).toBe(configPath);
  });
});
