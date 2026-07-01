import { existsSync, readFileSync } from 'node:fs';
import { createServer, type Server } from 'node:http';
import { extname, isAbsolute, join, normalize, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadConfig } from '../../config/load-config.js';
import { resolveSessionsFilePath, resolveSummaryFilePath } from '../../core/paths.js';
import type { MetricsConfig, ReportSession } from '../../core/types.js';

const REPORT_UI_DIR = fileURLToPath(new URL('../../report-ui/', import.meta.url));

const NOT_BUILT_MESSAGE = 'Report not built yet. Run `ai-metrics report build` first.';

const MIME_TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
};

export interface RunReportServeOptions {
  port?: number;
  cwd?: string;
}

function redactSessions(sessions: ReportSession[], config: MetricsConfig): ReportSession[] {
  if (config.showPromptBody && config.showResponseBody) {
    return sessions;
  }

  return sessions.map((session) => ({
    ...session,
    prompts: config.showPromptBody ? session.prompts : session.prompts.map((prompt) => ({ ...prompt, promptBody: null })),
    actions: config.showResponseBody ? session.actions : session.actions.map((action) => ({ ...action, responseBody: null })),
  }));
}

/** Resolves a request path to a file under REPORT_UI_DIR, refusing anything that would escape it (e.g. `..`). */
function resolveStaticFile(pathname: string): string | undefined {
  const decoded = decodeURIComponent(pathname === '/' ? '/index.html' : pathname);
  const resolved = normalize(join(REPORT_UI_DIR, decoded));
  const relativePath = relative(REPORT_UI_DIR, resolved);

  if (relativePath.startsWith('..') || isAbsolute(relativePath)) {
    return undefined;
  }
  return existsSync(resolved) ? resolved : undefined;
}

function renderIndexHtml(config: MetricsConfig): string {
  const html = readFileSync(join(REPORT_UI_DIR, 'index.html'), 'utf8');
  const bootstrap = `<script>window.__AI_METRICS_CONFIG__ = ${JSON.stringify({
    markdownRendering: config.markdownRendering,
    showPromptBody: config.showPromptBody,
    showResponseBody: config.showResponseBody,
  })};</script>`;
  return html.replace('<!--AI_METRICS_CONFIG-->', bootstrap);
}

/** Read-only: never records a metrics event or mutates anything on disk. Returns the listening server (e.g. so callers/tests can close it). */
export async function runReportServe(options: RunReportServeOptions = {}): Promise<Server> {
  const cwd = options.cwd ?? process.cwd();
  const config = loadConfig({ cwd });
  const port = options.port ?? config.report.port;

  const summaryPath = resolveSummaryFilePath(config, cwd);
  const sessionsPath = resolveSessionsFilePath(config, cwd);

  if (!existsSync(summaryPath) || !existsSync(sessionsPath)) {
    console.log(NOT_BUILT_MESSAGE);
  }

  const server = createServer((req, res) => {
    if (req.method !== 'GET' && req.method !== 'HEAD') {
      res.writeHead(405, { 'content-type': 'text/plain', allow: 'GET, HEAD' });
      res.end('Method not allowed: this server is view-only.');
      return;
    }

    const pathname = (req.url ?? '/').split('?')[0];

    if (pathname === '/api/health') {
      const built = existsSync(summaryPath) && existsSync(sessionsPath);
      res.writeHead(200, { 'content-type': MIME_TYPES['.json'] });
      res.end(JSON.stringify({ status: 'ok', built }));
      return;
    }

    if (pathname === '/api/summary' || pathname === '/api/sessions') {
      const filePath = pathname === '/api/summary' ? summaryPath : sessionsPath;
      if (!existsSync(filePath)) {
        res.writeHead(404, { 'content-type': MIME_TYPES['.json'] });
        res.end(JSON.stringify({ error: NOT_BUILT_MESSAGE }));
        return;
      }

      if (pathname === '/api/sessions') {
        const sessions = JSON.parse(readFileSync(filePath, 'utf8')) as ReportSession[];
        res.writeHead(200, { 'content-type': MIME_TYPES['.json'] });
        res.end(JSON.stringify(redactSessions(sessions, config)));
        return;
      }

      res.writeHead(200, { 'content-type': MIME_TYPES['.json'] });
      res.end(readFileSync(filePath, 'utf8'));
      return;
    }

    if (pathname === '/' || pathname === '/index.html') {
      res.writeHead(200, { 'content-type': MIME_TYPES['.html'] });
      res.end(renderIndexHtml(config));
      return;
    }

    const filePath = resolveStaticFile(pathname);
    if (!filePath) {
      res.writeHead(404, { 'content-type': 'text/plain' });
      res.end('Not found');
      return;
    }

    res.writeHead(200, { 'content-type': MIME_TYPES[extname(filePath)] ?? 'application/octet-stream' });
    res.end(readFileSync(filePath));
  });

  await new Promise<void>((resolve) => {
    server.listen(port, () => {
      const actualPort = typeof server.address() === 'object' ? (server.address() as { port: number }).port : port;
      console.log(`ai-metrics report served at http://localhost:${actualPort}`);
      resolve();
    });
  });

  return server;
}
