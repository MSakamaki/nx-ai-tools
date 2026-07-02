#!/usr/bin/env node
import { MetricsConfigError } from '../config/load-config.js';
import { ReportBuildError } from '../report/build-report.js';
import { runDoctor } from './commands/doctor.js';
import { runInit } from './commands/init.js';
import { InvalidProviderError } from './provider-selection.js';
import { runReportBuild } from './commands/report-build.js';
import { runReportServe } from './commands/report-serve.js';

function printUsage(): void {
  console.error(
    'Usage: ai-metrics <init [--provider <claude-code,copilot>] [--dry-run] [--force] [--yes]|doctor [--provider <claude-code,copilot>] [--json]|report build [--strict]|report serve [--port <number>]>',
  );
}

async function main(): Promise<void> {
  const [command, subCommand, ...rest] = process.argv.slice(2);

  if (command === '--help' || command === '-h') {
    printUsage();
    return;
  }

  if (command === 'init') {
    const initArgs = [subCommand, ...rest].filter(Boolean);
    const providerFlagIndex = initArgs.indexOf('--provider');
    const provider = providerFlagIndex >= 0 ? initArgs[providerFlagIndex + 1] : undefined;
    await runInit({
      dryRun: initArgs.includes('--dry-run'),
      force: initArgs.includes('--force') || initArgs.includes('--yes'),
      provider,
    });
    return;
  }

  if (command === 'doctor') {
    const doctorArgs = [subCommand, ...rest].filter(Boolean);
    const providerFlagIndex = doctorArgs.indexOf('--provider');
    const provider = providerFlagIndex >= 0 ? doctorArgs[providerFlagIndex + 1] : undefined;
    runDoctor({ json: doctorArgs.includes('--json'), provider });
    return;
  }

  if (command === 'report' && subCommand === 'build') {
    runReportBuild({ strict: rest.includes('--strict') });
    return;
  }

  if (command === 'report' && subCommand === 'serve') {
    const portArgIndex = rest.indexOf('--port');
    const port = portArgIndex >= 0 ? Number(rest[portArgIndex + 1]) : undefined;
    await runReportServe({ port });
    return;
  }

  console.error(`Unknown command: ${[command, subCommand].filter(Boolean).join(' ')}`);
  printUsage();
  process.exitCode = 1;
}

main().catch((error: unknown) => {
  if (error instanceof ReportBuildError) {
    console.error(`ai-metrics: ${error.message}`);
    for (const issue of error.issues) {
      console.error(`  - ${issue}`);
    }
  } else if (error instanceof MetricsConfigError || error instanceof InvalidProviderError) {
    console.error(`ai-metrics: ${error.message}`);
  } else {
    console.error(error);
  }
  process.exitCode = 1;
});
