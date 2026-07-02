# ai-metrics Claude Code integration

`.ai/metrics/hooks/claude-code-hook.mjs` is registered in `.claude/settings.json` for the
`UserPromptSubmit`, `PreToolUse`, `PostToolUse`, `Stop`, and `SessionEnd` hooks. It is a thin
wrapper: on each event it spawns
`node_modules/@nx-ai-tools/ai-metrics/dist/providers/claude-code/hook-entry.js` in a child process
with the hook's JSON payload on stdin, and always exits `0` — a missing/broken install or any
internal error is reported as a `[ai-metrics] WARN: ...` line on stderr, never a blocking hook
failure.

Events are normalized into the common ai-metrics schema and appended to
`.ai/metrics/events/<userSlug>/<YYYY-MM-DD>.jsonl`. Run `npx ai-metrics report build` to aggregate
them, or `npx ai-metrics doctor` to check the hook is wired up correctly.

Re-running `ai-metrics init` never removes hooks it didn't add: your own entries in
`.claude/settings.json` are always preserved, and this hook is only appended once per event (a
second `init` run recognizes the existing command and skips re-adding it).
