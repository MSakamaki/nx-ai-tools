# ai-metrics Copilot integration (experimental)

This is a **project hooks template**, not a finished integration. **Full VS Code Chat measurement
is not guaranteed** — whether prompt/response text, token usage, or model names are available at
all depends entirely on your Copilot execution environment; there is no universal Copilot
telemetry API this template can rely on. Fields that aren't available are recorded as `null`, never
guessed.

## Files

- **`.github/hooks/ai-metrics.json`** — the hook configuration **Copilot reads directly**. Its
  filename and location are fixed. It only declares which command runs for which event
  (`node .ai/metrics/hooks/copilot-hook.mjs`, as a relative path) and the `AI_METRICS_PROVIDER` /
  `AI_METRICS_HOOK_EVENT` environment variables — no ai-metrics-specific configuration lives here.
- **`.ai/metrics/hooks/copilot-hook.mjs`** — a thin wrapper. It maps the Copilot-native event name
  (from `AI_METRICS_HOOK_EVENT`) onto ai-metrics' own event vocabulary using
  `adapter.config.json`'s `eventTypeMap`, then spawns
  `node_modules/@nx-ai-tools/ai-metrics/dist/providers/copilot/hook-entry.js` with the combined
  payload on stdin. A missing/broken install, an unresolvable repo root, or any other failure is
  reported as a `[ai-metrics] WARN: ...` line on stderr — it never blocks the Copilot host process,
  always exiting `0`.
- **`.ai/metrics/copilot/adapter.config.json`** — ai-metrics-specific settings, kept separate from
  `.github/hooks/ai-metrics.json`: the `eventTypeMap` from Copilot event names to ai-metrics event
  types. Edit this if your event source uses different names.
- **`.ai/metrics/copilot/sample-event.json`** — an example of the payload shape the hook script
  expects on stdin.
- **`.ai/metrics/metrics.config.json`** — the shared ai-metrics config
  (`providers.copilot.enabled`, `providers.copilot.rawEvent.enabled` / `maxBytes`, etc.).

## What gets recorded

- An event whose mapped type ai-metrics recognizes is normalized into the common schema; anything
  else is still recorded as a `raw_event` (see
  [event-schema.md](../../../docs/event-schema.md)) rather than silently dropped.
- The raw payload is kept in every event's `rawEvent` field (subject to
  `providers.copilot.rawEvent.enabled` / `maxBytes` in `metrics.config.json`), alongside whichever
  of prompt body, response body, token usage, and model name your event source actually supplied.
