import { parseProviderOption } from '../provider-selection.js';
import type { CheckStatus } from './doctor-checks.js';
import { runDoctorChecks } from './doctor-checks.js';

export interface RunDoctorOptions {
  cwd?: string;
  json?: boolean;
  /** Raw `--provider` CLI value (e.g. "claude-code", "copilot", "claude-code,copilot"); omit to auto-detect from what's on disk. */
  provider?: string;
}

function overallStatus(summary: Record<CheckStatus, number>): CheckStatus {
  if (summary.error > 0) {
    return 'error';
  }
  if (summary.warn > 0) {
    return 'warn';
  }
  return 'ok';
}

/** Read-only diagnostic: never calls recordEvent, so running `doctor` never produces a metrics event. */
export function runDoctor(options: RunDoctorOptions = {}): void {
  const cwd = options.cwd ?? process.cwd();
  const providers = options.provider !== undefined ? parseProviderOption(options.provider) : undefined;
  const checks = runDoctorChecks(cwd, { providers });

  const summary: Record<CheckStatus, number> = {
    ok: checks.filter((check) => check.status === 'ok').length,
    warn: checks.filter((check) => check.status === 'warn').length,
    error: checks.filter((check) => check.status === 'error').length,
  };
  const result = overallStatus(summary);

  if (options.json) {
    console.log(JSON.stringify({ checks, summary, result }, null, 2));
  } else {
    for (const check of checks) {
      console.log(`[${check.status.toUpperCase()}] ${check.label}: ${check.message}`);
    }
    console.log('');
    console.log(`${summary.ok} OK, ${summary.warn} WARN, ${summary.error} ERROR`);
    console.log(`Overall: ${result.toUpperCase()}`);
  }

  process.exitCode = result === 'error' ? 1 : 0;
}
