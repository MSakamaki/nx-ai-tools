import { createServer, type Server } from 'node:http';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { runReportServe } from './report-serve.js';

function actualPort(server: Server): number {
  const address = server.address();
  if (typeof address !== 'object' || address === null) {
    throw new Error('server has no port');
  }
  return address.port;
}

/** Asks the OS for a free port, then releases it immediately so the real test can bind to it. */
async function getFreePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const probe = createServer();
    probe.listen(0, () => {
      const port = actualPort(probe);
      probe.close((error) => (error ? reject(error) : resolve(port)));
    });
  });
}

async function fetchJson<T>(url: string, init?: RequestInit): Promise<{ status: number; body: T }> {
  const res = await fetch(url, init);
  return { status: res.status, body: (await res.json()) as T };
}

const SUMMARY = { schemaVersion: '1.0', generatedAt: '2026-07-01T00:00:00.000Z', totalEvents: 1, overall: {}, byUser: {} };
const SESSIONS = [
  {
    sessionId: 's1',
    prompts: [{ timestamp: '2026-07-01T00:00:00.000Z', promptBody: 'hello there' }],
    actions: [{ actionId: 'a1', status: 'success', responseBody: 'the result' }],
    rawEvents: [
      {
        timestamp: '2026-07-01T00:00:00.000Z',
        toolProvider: 'copilot',
        providerEventName: 'inlineSuggestion.accepted',
        normalizationStatus: 'raw_only',
        rawEventTruncated: false,
        rawEvent: { some: 'payload' },
      },
    ],
  },
];

function seedGeneratedReport(cwd: string): void {
  mkdirSync(join(cwd, '.ai/metrics/generated'), { recursive: true });
  writeFileSync(join(cwd, '.ai/metrics/generated/summary.json'), JSON.stringify(SUMMARY));
  writeFileSync(join(cwd, '.ai/metrics/generated/sessions.json'), JSON.stringify(SESSIONS));
}

function writeConfig(cwd: string, overrides: Record<string, unknown>): void {
  mkdirSync(join(cwd, '.ai/metrics'), { recursive: true });
  writeFileSync(join(cwd, '.ai/metrics/metrics.config.json'), JSON.stringify(overrides));
}

describe('runReportServe', () => {
  let cwd: string;
  let server: Server | undefined;

  beforeEach(() => {
    cwd = mkdtempSync(join(tmpdir(), 'ai-metrics-'));
  });

  afterEach(async () => {
    if (server) {
      await new Promise((resolve) => server?.close(resolve));
      server = undefined;
    }
    rmSync(cwd, { recursive: true, force: true });
  });

  it('binds to the configured default port when --port is not given', async () => {
    const configuredPort = await getFreePort();
    writeConfig(cwd, { report: { port: configuredPort } });

    server = await runReportServe({ cwd });

    expect(actualPort(server)).toBe(configuredPort);
  });

  it('an explicit port option overrides the config default', async () => {
    const configuredPort = await getFreePort();
    const overridePort = await getFreePort();
    writeConfig(cwd, { report: { port: configuredPort } });

    server = await runReportServe({ cwd, port: overridePort });

    expect(actualPort(server)).toBe(overridePort);
  });

  it('GET /api/health reports built=false before a report exists', async () => {
    server = await runReportServe({ cwd, port: 0 });

    const { status, body } = await fetchJson<{ status: string; built: boolean }>(`http://localhost:${actualPort(server)}/api/health`);

    expect(status).toBe(200);
    expect(body).toEqual({ status: 'ok', built: false });
  });

  it('GET /api/summary and /api/sessions 404 with a helpful message before report build has run', async () => {
    server = await runReportServe({ cwd, port: 0 });
    const port = actualPort(server);

    const summary = await fetchJson<{ error: string }>(`http://localhost:${port}/api/summary`);
    const sessions = await fetchJson<{ error: string }>(`http://localhost:${port}/api/sessions`);

    expect(summary.status).toBe(404);
    expect(sessions.status).toBe(404);
    expect(summary.body.error).toContain('ai-metrics report build');
    expect(sessions.body.error).toContain('ai-metrics report build');
  });

  it('serves summary.json and sessions.json once a report has been built', async () => {
    seedGeneratedReport(cwd);
    server = await runReportServe({ cwd, port: 0 });
    const port = actualPort(server);

    const summary = await fetchJson<{ totalEvents: number }>(`http://localhost:${port}/api/summary`);
    const sessions = await fetchJson<Array<{ sessionId: string }>>(`http://localhost:${port}/api/sessions`);
    const health = await fetchJson<{ built: boolean }>(`http://localhost:${port}/api/health`);

    expect(summary.body.totalEvents).toBe(1);
    expect(sessions.body[0].sessionId).toBe('s1');
    expect(health.body.built).toBe(true);
  });

  it('redacts prompt bodies when showPromptBody is disabled, but keeps response bodies', async () => {
    seedGeneratedReport(cwd);
    writeConfig(cwd, { showPromptBody: false });
    server = await runReportServe({ cwd, port: 0 });

    const { body: sessions } = await fetchJson<Array<{ prompts: Array<{ promptBody: string | null }>; actions: Array<{ responseBody: string | null }> }>>(
      `http://localhost:${actualPort(server)}/api/sessions`,
    );

    expect(sessions[0].prompts[0].promptBody).toBeNull();
    expect(sessions[0].actions[0].responseBody).toBe('the result');
  });

  it('redacts response bodies when showResponseBody is disabled, but keeps prompt bodies', async () => {
    seedGeneratedReport(cwd);
    writeConfig(cwd, { showResponseBody: false });
    server = await runReportServe({ cwd, port: 0 });

    const { body: sessions } = await fetchJson<Array<{ prompts: Array<{ promptBody: string | null }>; actions: Array<{ responseBody: string | null }> }>>(
      `http://localhost:${actualPort(server)}/api/sessions`,
    );

    expect(sessions[0].prompts[0].promptBody).toBe('hello there');
    expect(sessions[0].actions[0].responseBody).toBeNull();
  });

  it('serves rawEvents verbatim regardless of showPromptBody/showResponseBody', async () => {
    seedGeneratedReport(cwd);
    writeConfig(cwd, { showPromptBody: false, showResponseBody: false });
    server = await runReportServe({ cwd, port: 0 });

    const { body: sessions } = await fetchJson<Array<{ rawEvents: Array<{ rawEvent: unknown; providerEventName: string }> }>>(
      `http://localhost:${actualPort(server)}/api/sessions`,
    );

    expect(sessions[0].rawEvents[0].rawEvent).toEqual({ some: 'payload' });
    expect(sessions[0].rawEvents[0].providerEventName).toBe('inlineSuggestion.accepted');
  });

  it('serves index.html with the display config injected', async () => {
    writeConfig(cwd, { markdownRendering: true });
    server = await runReportServe({ cwd, port: 0 });

    const html = await (await fetch(`http://localhost:${actualPort(server)}/`)).text();

    expect(html).toContain('window.__AI_METRICS_CONFIG__');
    expect(html).toContain('"markdownRendering":true');
  });

  it('serves the static app.js and styles.css assets', async () => {
    server = await runReportServe({ cwd, port: 0 });
    const port = actualPort(server);

    const js = await fetch(`http://localhost:${port}/app.js`);
    const css = await fetch(`http://localhost:${port}/styles.css`);

    expect(js.status).toBe(200);
    expect(js.headers.get('content-type')).toContain('javascript');
    expect(css.status).toBe(200);
    expect(css.headers.get('content-type')).toContain('css');
  });

  it('refuses to serve files outside the report-ui directory', async () => {
    server = await runReportServe({ cwd, port: 0 });
    const port = actualPort(server);

    const res = await fetch(`http://localhost:${port}/../../../../etc/passwd`);

    expect(res.status).toBe(404);
  });

  it('rejects non-GET methods since the server is view-only', async () => {
    server = await runReportServe({ cwd, port: 0 });
    const port = actualPort(server);

    const res = await fetch(`http://localhost:${port}/api/summary`, { method: 'POST' });

    expect(res.status).toBe(405);
  });
});
