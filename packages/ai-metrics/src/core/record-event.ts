import { randomUUID } from 'node:crypto';
import { loadConfig } from '../config/load-config.js';
import { appendJsonl, appendJsonlSync } from './jsonl.js';
import { resolveEventsFilePath } from './paths.js';
import { SCHEMA_VERSION } from './types.js';
import type { DistributiveOmit, MetricsConfig, MetricsEvent } from './types.js';

export interface RecordEventOptions {
  config?: MetricsConfig;
  cwd?: string;
}

export type RecordableEvent<T extends MetricsEvent = MetricsEvent> = DistributiveOmit<T, 'schemaVersion' | 'eventId' | 'timestamp'> & {
  eventId?: string;
  timestamp?: string;
};

function stampEvent<T extends MetricsEvent>(input: RecordableEvent<T>): T {
  return {
    ...input,
    schemaVersion: SCHEMA_VERSION,
    eventId: input.eventId ?? randomUUID(),
    timestamp: input.timestamp ?? new Date().toISOString(),
  } as unknown as T;
}

function resolvePath(event: MetricsEvent, config: MetricsConfig, cwd?: string): string {
  return resolveEventsFilePath(config, event.userSlug, event.timestamp, cwd);
}

/**
 * Synchronous by design: safe to call from hook scripts, which exit immediately after the hook
 * process runs. Writes to `<eventsDir>/<userSlug>/<YYYY-MM-DD>.jsonl` (one JSON object per line,
 * verbatim — no truncation or transformation of string fields). Throws on write failure; callers
 * that must never block their host process (e.g. hook adapters) are responsible for catching it.
 */
export function recordEvent<T extends MetricsEvent>(input: RecordableEvent<T>, options: RecordEventOptions = {}): T {
  const config = options.config ?? loadConfig({ cwd: options.cwd });
  const event = stampEvent(input);
  appendJsonlSync(resolvePath(event, config, options.cwd), event);
  return event;
}

export async function recordEventAsync<T extends MetricsEvent>(
  input: RecordableEvent<T>,
  options: RecordEventOptions = {},
): Promise<T> {
  const config = options.config ?? loadConfig({ cwd: options.cwd });
  const event = stampEvent(input);
  await appendJsonl(resolvePath(event, config, options.cwd), event);
  return event;
}
