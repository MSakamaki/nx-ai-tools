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

/** Serializes `rawEvent` and cuts it to `maxBytes` (UTF-8) if it's too large, so one oversized payload can't blow up a jsonl file. */
function truncateRawEvent(rawEvent: unknown, maxBytes: number): { rawEvent: unknown; truncated: boolean } {
  const serialized = JSON.stringify(rawEvent ?? null) ?? 'null';
  if (Buffer.byteLength(serialized, 'utf8') <= maxBytes) {
    return { rawEvent, truncated: false };
  }
  return { rawEvent: Buffer.from(serialized, 'utf8').subarray(0, maxBytes).toString('utf8'), truncated: true };
}

/** Applies `providers.copilot.rawEvent.maxBytes` to every event's `rawEvent`, regardless of provider. */
function applyRawEventLimit<T extends MetricsEvent>(input: RecordableEvent<T>, config: MetricsConfig): RecordableEvent<T> {
  const { rawEvent, truncated } = truncateRawEvent(input.rawEvent, config.providers.copilot.rawEvent.maxBytes);
  if (!truncated) {
    return input;
  }
  return { ...input, rawEvent, rawEventTruncated: true } as unknown as RecordableEvent<T>;
}

/**
 * Synchronous by design: safe to call from hook scripts, which exit immediately after the hook
 * process runs. Writes to `<eventsDir>/<userSlug>/<YYYY-MM-DD>.jsonl` (one JSON object per line,
 * verbatim — no truncation or transformation of string fields). Throws on write failure; callers
 * that must never block their host process (e.g. hook adapters) are responsible for catching it.
 */
export function recordEvent<T extends MetricsEvent>(input: RecordableEvent<T>, options: RecordEventOptions = {}): T {
  const config = options.config ?? loadConfig({ cwd: options.cwd });
  const event = stampEvent(applyRawEventLimit(input, config));
  appendJsonlSync(resolvePath(event, config, options.cwd), event);
  return event;
}

export async function recordEventAsync<T extends MetricsEvent>(
  input: RecordableEvent<T>,
  options: RecordEventOptions = {},
): Promise<T> {
  const config = options.config ?? loadConfig({ cwd: options.cwd });
  const event = stampEvent(applyRawEventLimit(input, config));
  await appendJsonl(resolvePath(event, config, options.cwd), event);
  return event;
}
