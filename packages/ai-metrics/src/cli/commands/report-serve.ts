import type { Server } from 'node:http';
import type { ReportServerOptions } from '../../report/server.js';
import { createReportServer } from '../../report/server.js';

export type RunReportServeOptions = ReportServerOptions;

export async function runReportServe(options: RunReportServeOptions = {}): Promise<Server> {
  return createReportServer(options);
}
