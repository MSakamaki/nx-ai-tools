import { mkdirSync, writeFileSync } from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
import { loadConfig } from '../config/load-config.js';
import type { JsonlParseIssue } from '../core/jsonl.js';
import { listJsonlFiles, readJsonlLenient, readJsonlLenientSync } from '../core/jsonl.js';
import { resolveEventsDirPath, resolveGeneratedDirPath, resolveSessionsFilePath, resolveSummaryFilePath } from '../core/paths.js';
import type { BuildReportOptions, BuildReportResult, MetricsEvent } from '../core/types.js';
import { isMetricsEvent } from '../schema/validate.js';
import { aggregateSessions, aggregateSummary, collectGitContextWarnings } from './aggregate.js';

export type { BuildReportOptions, BuildReportResult } from '../core/types.js';

export class ReportBuildError extends Error {
  readonly issues: string[];

  constructor(message: string, issues: string[]) {
    super(message);
    this.name = 'ReportBuildError';
    this.issues = issues;
  }
}

function formatIssue(issue: JsonlParseIssue): string {
  return `${issue.filePath}:${issue.lineNumber}: ${issue.message}`;
}

function toParseWarnings(issues: string[]): string[] {
  return issues.map((issue) => `Skipped invalid event: ${issue}`);
}

function guardStrict(issues: string[], strict: boolean): void {
  if (strict && issues.length > 0) {
    throw new ReportBuildError(`${issues.length} invalid event line(s) found while building the report.`, issues);
  }
}

/** Events live under `<eventsDir>/<userSlug>/<date>.jsonl`; a report reads across all of them. Invalid lines are skipped (and warned about) unless `strict`. */
function collectEventsSync(eventsDir: string, strict: boolean): { events: MetricsEvent[]; warnings: string[] } {
  const events: MetricsEvent[] = [];
  const issues: string[] = [];

  for (const filePath of listJsonlFiles(eventsDir)) {
    const result = readJsonlLenientSync<MetricsEvent>(filePath, isMetricsEvent);
    events.push(...result.values);
    issues.push(...result.issues.map(formatIssue));
  }

  guardStrict(issues, strict);
  return { events, warnings: toParseWarnings(issues) };
}

async function collectEvents(eventsDir: string, strict: boolean): Promise<{ events: MetricsEvent[]; warnings: string[] }> {
  const results = await Promise.all(
    listJsonlFiles(eventsDir).map((filePath) => readJsonlLenient<MetricsEvent>(filePath, isMetricsEvent)),
  );

  const events = results.flatMap((result) => result.values);
  const issues = results.flatMap((result) => result.issues.map(formatIssue));

  guardStrict(issues, strict);
  return { events, warnings: toParseWarnings(issues) };
}

export function buildReport(options: BuildReportOptions = {}): BuildReportResult {
  const config = options.config ?? loadConfig({ cwd: options.cwd });
  const generatedAt = options.generatedAt ?? new Date().toISOString();
  const strict = options.strict ?? false;

  const { events, warnings: parseWarnings } = collectEventsSync(resolveEventsDirPath(config, options.cwd), strict);

  const sessions = aggregateSessions(events);
  const summary = aggregateSummary(sessions, events.length, generatedAt);
  const warnings = [...parseWarnings, ...collectGitContextWarnings(events)];
  const summaryPath = resolveSummaryFilePath(config, options.cwd);
  const sessionsPath = resolveSessionsFilePath(config, options.cwd);

  mkdirSync(resolveGeneratedDirPath(config, options.cwd), { recursive: true });
  writeFileSync(summaryPath, `${JSON.stringify(summary, null, 2)}\n`, 'utf8');
  writeFileSync(sessionsPath, `${JSON.stringify(sessions, null, 2)}\n`, 'utf8');

  return { summary, sessions, summaryPath, sessionsPath, warnings };
}

export async function buildReportAsync(options: BuildReportOptions = {}): Promise<BuildReportResult> {
  const config = options.config ?? loadConfig({ cwd: options.cwd });
  const generatedAt = options.generatedAt ?? new Date().toISOString();
  const strict = options.strict ?? false;

  const { events, warnings: parseWarnings } = await collectEvents(resolveEventsDirPath(config, options.cwd), strict);

  const sessions = aggregateSessions(events);
  const summary = aggregateSummary(sessions, events.length, generatedAt);
  const warnings = [...parseWarnings, ...collectGitContextWarnings(events)];
  const summaryPath = resolveSummaryFilePath(config, options.cwd);
  const sessionsPath = resolveSessionsFilePath(config, options.cwd);

  await mkdir(resolveGeneratedDirPath(config, options.cwd), { recursive: true });
  await writeFile(summaryPath, `${JSON.stringify(summary, null, 2)}\n`, 'utf8');
  await writeFile(sessionsPath, `${JSON.stringify(sessions, null, 2)}\n`, 'utf8');

  return { summary, sessions, summaryPath, sessionsPath, warnings };
}
