import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { z } from 'zod';
import type { MetricsConfig } from '../core/types.js';
import { DEFAULT_CONFIG, DEFAULT_CONFIG_FILE_NAME, DEFAULT_METRICS_ROOT } from './default-config.js';

const reportConfigSchema = z
  .object({
    port: z.number().int().min(1).max(65535),
  })
  .partial();

const claudeCodeProviderConfigSchema = z
  .object({
    enabled: z.boolean(),
  })
  .partial();

const copilotRawEventConfigSchema = z
  .object({
    enabled: z.boolean(),
    maxBytes: z.number().int().positive(),
  })
  .partial();

const copilotProviderConfigSchema = z
  .object({
    enabled: z.boolean(),
    rawEvent: copilotRawEventConfigSchema,
  })
  .partial();

const providersConfigSchema = z
  .object({
    claudeCode: claudeCodeProviderConfigSchema,
    copilot: copilotProviderConfigSchema,
  })
  .partial();

/** Every field is optional: an on-disk config only needs to list the overrides it wants. */
const partialMetricsConfigSchema = z
  .object({
    metricsRoot: z.string(),
    eventsDir: z.string(),
    generatedDir: z.string(),
    hooksDir: z.string(),
    report: reportConfigSchema,
    showPromptBody: z.boolean(),
    showResponseBody: z.boolean(),
    markdownRendering: z.boolean(),
    providers: providersConfigSchema,
  })
  .partial();

export class MetricsConfigError extends Error {
  readonly configPath: string;

  constructor(message: string, configPath: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = 'MetricsConfigError';
    this.configPath = configPath;
  }
}

export interface LoadConfigOptions {
  cwd?: string;
  configFileName?: string;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function deepMerge(base: Record<string, unknown>, override: Record<string, unknown>): Record<string, unknown> {
  const result: Record<string, unknown> = { ...base };

  for (const [key, value] of Object.entries(override)) {
    if (value === undefined) {
      continue;
    }
    const baseValue = base[key];
    result[key] = isPlainObject(value) && isPlainObject(baseValue) ? deepMerge(baseValue, value) : value;
  }

  return result;
}

function formatZodError(error: z.ZodError): string {
  return error.issues.map((issue) => `  - ${issue.path.join('.') || '(root)'}: ${issue.message}`).join('\n');
}

/** Missing config file -> defaults. Present-but-broken config file -> throws MetricsConfigError. */
export function loadConfig(options: LoadConfigOptions = {}): MetricsConfig {
  const cwd = options.cwd ?? process.cwd();
  const configFileName = options.configFileName ?? DEFAULT_CONFIG_FILE_NAME;
  const configPath = join(cwd, DEFAULT_METRICS_ROOT, configFileName);

  if (!existsSync(configPath)) {
    return structuredClone(DEFAULT_CONFIG);
  }

  let raw: string;
  try {
    raw = readFileSync(configPath, 'utf8');
  } catch (error) {
    throw new MetricsConfigError(
      `Failed to read ai-metrics config at ${configPath}: ${(error as Error).message}`,
      configPath,
      { cause: error },
    );
  }

  let parsedJson: unknown;
  try {
    parsedJson = JSON.parse(raw);
  } catch (error) {
    throw new MetricsConfigError(
      `ai-metrics config at ${configPath} is not valid JSON: ${(error as Error).message}`,
      configPath,
      { cause: error },
    );
  }

  const result = partialMetricsConfigSchema.safeParse(parsedJson);
  if (!result.success) {
    throw new MetricsConfigError(
      `ai-metrics config at ${configPath} is invalid:\n${formatZodError(result.error)}`,
      configPath,
      { cause: result.error },
    );
  }

  return deepMerge(DEFAULT_CONFIG as unknown as Record<string, unknown>, result.data) as unknown as MetricsConfig;
}
