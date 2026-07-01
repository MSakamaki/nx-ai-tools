import { buildReport } from '../../report/buildReport.js';

export interface RunReportBuildOptions {
  cwd?: string;
  strict?: boolean;
}

export function runReportBuild(options: RunReportBuildOptions = {}): void {
  const result = buildReport({ cwd: options.cwd, strict: options.strict });
  console.log(`Summary written: ${result.summaryPath}`);
  console.log(`Sessions written: ${result.sessionsPath}`);
  for (const warning of result.warnings) {
    console.warn(`Warning: ${warning}`);
  }
}
