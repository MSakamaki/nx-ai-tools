import type { MetricsConfig } from '../core/types.js';

export const DEFAULT_METRICS_ROOT = '.ai/metrics';
export const DEFAULT_CONFIG_FILE_NAME = 'metrics.config.json';

export const DEFAULT_CONFIG: MetricsConfig = {
  metricsRoot: DEFAULT_METRICS_ROOT,
  eventsDir: '.ai/metrics/events',
  generatedDir: '.ai/metrics/generated',
  hooksDir: '.ai/metrics/hooks',
  report: {
    port: 4321,
  },
  showPromptBody: true,
  showResponseBody: true,
  markdownRendering: false,
  providers: {
    'claude-code': 'enabled',
    copilot: 'experimental',
  },
};

export function createDefaultConfig(): MetricsConfig {
  return structuredClone(DEFAULT_CONFIG);
}
