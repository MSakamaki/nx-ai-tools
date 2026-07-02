#!/usr/bin/env node
// Thin wrapper: Copilot invokes this command directly per `.github/hooks/ai-metrics.json`. It maps
// the Copilot-native hook event name (AI_METRICS_HOOK_EVENT) onto ai-metrics' own event vocabulary
// using `.ai/metrics/copilot/adapter.config.json` (falling back to built-in defaults when that file
// is missing/invalid), then hands the combined payload to the installed package's compiled hook
// entry in a child process — so a broken/missing install, an unresolvable repo root, or any other
// failure is reported as a WARN instead of crashing the Copilot host process.
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const DEFAULT_EVENT_TYPE_MAP = {
  userPromptSubmitted: 'prompt_submitted',
  preToolUse: 'action_started',
  postToolUse: 'action_completed',
  errorOccurred: 'action_failed',
  agentStop: 'session_completed',
  sessionEnd: 'session_completed',
};

const hookEntryPath = join(
  process.cwd(),
  'node_modules',
  '@nx-ai-tools',
  'ai-metrics',
  'dist',
  'providers',
  'copilot',
  'hook-entry.js',
);

function warn(message) {
  console.error(`[ai-metrics] WARN: copilot hook: ${message}`);
}

/** `.ai/metrics/copilot/adapter.config.json` is optional; a missing/invalid file just falls back to the defaults above. */
function loadEventTypeMap() {
  const configPath = join(process.cwd(), '.ai', 'metrics', 'copilot', 'adapter.config.json');
  try {
    const parsed = JSON.parse(readFileSync(configPath, 'utf8'));
    if (parsed && typeof parsed.eventTypeMap === 'object' && parsed.eventTypeMap !== null) {
      return { ...DEFAULT_EVENT_TYPE_MAP, ...parsed.eventTypeMap };
    }
  } catch {
    // Missing or invalid config: keep the built-in defaults.
  }
  return DEFAULT_EVENT_TYPE_MAP;
}

/** Merges the (unknown-shape) stdin body with the event name/type derived from AI_METRICS_HOOK_EVENT. */
function buildPayload(rawInput) {
  let body;
  try {
    body = rawInput.trim().length > 0 ? JSON.parse(rawInput) : {};
  } catch {
    body = { rawText: rawInput };
  }
  if (typeof body !== 'object' || body === null) {
    body = { rawValue: body };
  }

  const providerEventName = process.env.AI_METRICS_HOOK_EVENT;
  const eventType = providerEventName ? loadEventTypeMap()[providerEventName] : undefined;

  return JSON.stringify({
    ...body,
    ...(providerEventName ? { providerEventName } : {}),
    ...(eventType ? { eventType } : {}),
  });
}

let input = '';
process.stdin.setEncoding('utf8');
process.stdin.on('data', (chunk) => {
  input += chunk;
});
process.stdin.on('end', () => {
  try {
    if (!existsSync(hookEntryPath)) {
      warn(`${hookEntryPath} not found. Run "npm install".`);
      return;
    }

    const payload = buildPayload(input);
    const result = spawnSync(process.execPath, [hookEntryPath], { input: payload, encoding: 'utf8' });
    if (result.error) {
      warn(result.error.message);
    } else if (result.stderr) {
      process.stderr.write(result.stderr);
    }
  } catch (error) {
    warn(error instanceof Error ? error.message : String(error));
  } finally {
    process.exit(0);
  }
});
