import type { MetricsEvent } from '../core/types.js';

export function isMetricsEvent(value: unknown): value is MetricsEvent {
  if (typeof value !== 'object' || value === null) {
    return false;
  }

  const event = value as Record<string, unknown>;
  return (
    typeof event['schemaVersion'] === 'string' &&
    typeof event['eventId'] === 'string' &&
    typeof event['eventType'] === 'string' &&
    typeof event['timestamp'] === 'string' &&
    typeof event['sessionId'] === 'string' &&
    typeof event['toolProvider'] === 'string'
  );
}
