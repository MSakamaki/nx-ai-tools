import { join } from 'node:path';
import { formatDateStampFromTimestamp } from './date.js';
import type { MetricsConfig } from './types.js';

export const SUMMARY_FILE_NAME = 'summary.json';
export const SESSIONS_FILE_NAME = 'sessions.json';

export function resolveMetricsRootPath(config: MetricsConfig, cwd: string = process.cwd()): string {
  return join(cwd, config.metricsRoot);
}

export function resolveEventsDirPath(config: MetricsConfig, cwd: string = process.cwd()): string {
  return join(cwd, config.eventsDir);
}

export function resolveUserEventsDirPath(config: MetricsConfig, userSlug: string, cwd: string = process.cwd()): string {
  return join(resolveEventsDirPath(config, cwd), userSlug);
}

/** `<eventsDir>/<userSlug>/<YYYY-MM-DD>.jsonl`, the day being derived from the event's own timestamp. */
export function resolveEventsFilePath(
  config: MetricsConfig,
  userSlug: string,
  timestamp: string,
  cwd: string = process.cwd(),
): string {
  const dateStamp = formatDateStampFromTimestamp(timestamp);
  return join(resolveUserEventsDirPath(config, userSlug, cwd), `${dateStamp}.jsonl`);
}

export function resolveGeneratedDirPath(config: MetricsConfig, cwd: string = process.cwd()): string {
  return join(cwd, config.generatedDir);
}

export function resolveHooksDirPath(config: MetricsConfig, cwd: string = process.cwd()): string {
  return join(cwd, config.hooksDir);
}

export function resolveSummaryFilePath(config: MetricsConfig, cwd: string = process.cwd()): string {
  return join(resolveGeneratedDirPath(config, cwd), SUMMARY_FILE_NAME);
}

export function resolveSessionsFilePath(config: MetricsConfig, cwd: string = process.cwd()): string {
  return join(resolveGeneratedDirPath(config, cwd), SESSIONS_FILE_NAME);
}
