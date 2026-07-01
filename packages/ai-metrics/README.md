# @nx-ai-tools/ai-metrics

Capture AI coding assistant usage (prompts, responses, token/model info, git context) as local,
git-friendly JSONL logs, and turn them into a browsable usage report — no external service, no
telemetry leaves your machine.

`@nx-ai-tools/ai-metrics` is published as a **public npm package**.

> **Node.js `>=22` is required.**

## ⚠️ Before you install: what this package stores, unmasked

This package is designed to record **verbatim, unmasked** data about AI-assisted coding sessions.
Every event recorded to `.ai/metrics/events/**/*.jsonl` may include:

- **Prompt body** — the literal text you submitted to the AI assistant
- **AI response body** — the literal text/output the assistant returned
- **Token usage** — input/output/cache-read/cache-write/total token counts
- **`modelRaw`** — the raw model identifier reported by the provider
- **Duration** — how long an action took
- **`git user.name`** — the local git identity that produced the session
- **`branch`** — the git branch active during the session
- **`baseCommitHash`** — the commit the working tree was based on at session start
- **`commitHash`** — the commit the session's changes ended up in, once known

**Prompt bodies and AI response bodies are stored as-is — this package does not mask, redact, or
truncate them.** If your prompts or the assistant's responses could contain secrets, credentials,
customer data, or anything else sensitive, treat `.ai/metrics/events/` with the same care you'd
give any other file that might contain that data (review before sharing, restrict repo access,
etc.). `showPromptBody` / `showResponseBody` in `metrics.config.json` only control whether the
**report UI/API** displays these fields — they do not change what gets written to the JSONL files.

## Providers

| Provider    | Status       | Entry point                                                          |
| ----------- | ------------ | --------------------------------------------------------------------- |
| Claude Code | **Initial support** | `createClaudeCodeAdapter` from `@nx-ai-tools/ai-metrics`             |
| Copilot     | **Experimental adapter** | `createCopilotAdapter` from `@nx-ai-tools/ai-metrics/experimental` |

Claude Code hooks are wired via `createClaudeCodeAdapter` and recorded synchronously so a failing
hook never blocks Claude Code itself (errors go to stderr; the hook process still exits 0).

Copilot has no real telemetry source yet (no VS Code extension, no OpenTelemetry collector). Its
adapter exists only as an interface that follows the same `ProviderAdapter` contract as Claude
Code's, so a real integration can be dropped in later without a breaking change. Until then it's
exposed exclusively from the `./experimental` entry point and every event it could produce reports
`sourceAvailability` as unavailable for whatever fields weren't actually supplied.

## Install

```sh
npm install @nx-ai-tools/ai-metrics
```

## What gets committed to git vs. gitignored

| Path                          | Git status              | Why                                                                 |
| ------------------------------ | ------------------------ | -------------------------------------------------------------------- |
| `.ai/metrics/metrics.config.json` | **commit**             | Shared team config                                                  |
| `.ai/metrics/hooks/claude-code-hook.mjs` | **commit**       | The hook script Claude Code runs; shared across the team             |
| `.ai/metrics/events/**/*.jsonl` | **commit**               | The raw event log — treated as source history, meant to be shared/reviewed like other commits |
| `.ai/metrics/generated/summary.json` | **gitignore (recommended)** | Derived output of `report build`; regenerate anytime from events    |
| `.ai/metrics/generated/sessions.json` | **gitignore (recommended)** | Derived output of `report build`; regenerate anytime from events    |

`ai-metrics init` sets this up for you automatically: it appends `.ai/metrics/generated/` to
`.gitignore` and leaves `events/` untouched (i.e., trackable). Because events files are meant to be
committed, keep the "no masking" behavior above in mind — anything written there is going into your
repo's history.

## CLI

### `ai-metrics init`

Scaffolds everything needed to start collecting Claude Code usage in the current project:

- `.ai/metrics/`, `.ai/metrics/events/`, `.ai/metrics/generated/`, `.ai/metrics/hooks/`
- `.ai/metrics/metrics.config.json` (default config)
- `.ai/metrics/hooks/claude-code-hook.mjs` (the hook script Claude Code runs)
- a `hooks` entry for `UserPromptSubmit` / `PreToolUse` / `PostToolUse` / `Stop` / `SessionEnd` merged
  into the project's `.claude/settings.json` — existing hooks and other settings are preserved
- a `.ai/metrics/generated/` entry appended to `.gitignore`

```sh
npx ai-metrics init
```

```
Created /path/to/project/.ai/metrics/metrics.config.json
Created /path/to/project/.ai/metrics/hooks/claude-code-hook.mjs
Added ".ai/metrics/generated/" to /path/to/project/.gitignore
Updated /path/to/project/.claude/settings.json (added hooks for: UserPromptSubmit, PreToolUse, PostToolUse, Stop, SessionEnd)
```

Re-running `init` is safe: existing `metrics.config.json` and hook script content are never
overwritten, and hooks already registered in `.claude/settings.json` are left as-is (no duplicate
entries). Only `.claude/settings.json` in the current project is ever touched — never a global or
user-level Claude settings file.

Preview changes without writing anything:

```sh
npx ai-metrics init --dry-run
```

Skip the confirmation prompt for a partial/previous setup (e.g. in CI):

```sh
npx ai-metrics init --force
```

### `ai-metrics doctor`

Read-only diagnostic — checks the local setup without ever recording a metrics event (Node.js
version, package installed, config/hook/settings files present, events directory writable, git
identity/branch resolvable).

```sh
npx ai-metrics doctor
```

```
[OK] Node.js version: Node.js v24.11.1
[OK] @nx-ai-tools/ai-metrics in node_modules: /path/to/project/node_modules/@nx-ai-tools/ai-metrics
[OK] metrics.config.json: /path/to/project/.ai/metrics/metrics.config.json
[OK] claude-code-hook.mjs: /path/to/project/.ai/metrics/hooks/claude-code-hook.mjs
[OK] .claude/settings.json: /path/to/project/.claude/settings.json
[OK] Claude Code hook configuration: ai-metrics hook found in /path/to/project/.claude/settings.json
[OK] events directory writable: /path/to/project/.ai/metrics/events
[OK] git user.name: Mizuho Sakamaki
[OK] git branch / HEAD: branch=main head=68d04fd

9 OK, 0 WARN, 0 ERROR
Overall: OK
```

Exit code is `0` when the worst check is `OK` or `WARN` (e.g. not-yet-initialized), `1` only when
at least one check is `ERROR` — safe to use in CI as a "did init actually work" gate.

```sh
npx ai-metrics doctor --json
```

### `ai-metrics report build`

Reads every `.ai/metrics/events/<userSlug>/<YYYY-MM-DD>.jsonl` file and writes:

- `.ai/metrics/generated/sessions.json` — one row per session (prompts, actions, tokens, agent/skill
  usage, commit)
- `.ai/metrics/generated/summary.json` — an `overall` metrics block plus the same metrics broken
  down `byUser` / `byDate` / `byProvider` / `byModel` / `byCommit` / `byAgent` / `bySkill`

```sh
npx ai-metrics report build
```

By default, a line in an events file that isn't valid JSON or doesn't match the event schema is
skipped with a warning. Use `--strict` to fail the build instead (exit code `1`, no output files
written) — useful in CI to catch corrupted event logs:

```sh
npx ai-metrics report build --strict
```

### `ai-metrics report serve`

A read-only local HTTP server (GET/HEAD only) for browsing the report built by
`ai-metrics report build`, with an Overview / Prompt View / Commit View / Provider-Model View /
Agent-Skill View UI.

```sh
npx ai-metrics report serve
```

```
ai-metrics report served at http://localhost:4321
```

Defaults to `localhost:4321` (or `report.port` from `metrics.config.json`); override with `--port`.
Display respects `metrics.config.json`'s `showPromptBody` / `showResponseBody` (redacts the field in
the API response, not the underlying JSONL) and `markdownRendering`.

## `.ai/metrics/` directory layout

```
.ai/metrics/
├── metrics.config.json           # committed — shared config
├── hooks/
│   └── claude-code-hook.mjs      # committed — the Claude Code hook script
├── events/
│   └── <userSlug>/
│       └── <YYYY-MM-DD>.jsonl    # committed — raw, unmasked event log, one file per user per day
└── generated/
    ├── summary.json              # gitignored — output of `report build`
    └── sessions.json             # gitignored — output of `report build`
```

`userSlug` identifies the git user without needing their raw name as a directory name (see
`gitUserName` on each event for the human-readable form).

## Event schema (`schemaVersion: "1.0"`)

Every line in an events `.jsonl` file is one independently-parseable JSON object sharing this
schema (`schemaVersion` currently `"1.0"`, stamped by `recordEvent`/`recordEventAsync`):

- `eventType` — one of `prompt_submitted` / `action_started` / `action_completed` /
  `action_failed` / `session_completed`
- `eventId`, `sessionId`, `actionId` (actions only) — identifiers correlating events within a session
- `timestamp` — ISO 8601, when the event occurred
- `gitUserName`, `userSlug` — who produced the event
- `toolProvider` — `claude-code` / `copilot` / `unknown`
- `modelRaw`, `status` — provider-reported model id and outcome (`success` / `error` / `cancelled`),
  `null` when unavailable
- `sourceAvailability` — per-field booleans (`tokenUsageAvailable`, `modelAvailable`,
  `durationAvailable`, `promptAvailable`, `responseAvailable`) distinguishing "not observed" from
  "observed as zero/empty"
- `gitContext` — `repoRootHash`, `branch`, `baseCommitHash`, `workingTreeId`, `commitHash`,
  `commitLinkStrategy`
- `raw` — the unprocessed provider payload the event was normalized from (kept for
  debugging/reprocessing)
- type-specific fields: `promptBody` (`prompt_submitted`); `agentInfo` / `skillInfo` (action /
  session events); `tokenUsage` + `responseBody` (`action_completed` / `action_failed` /
  `session_completed`)

A future incompatible change to this shape will bump `schemaVersion`; readers should not assume
unknown fields won't be added.

## Public API

```ts
import { recordEvent, loadConfig, createClaudeCodeAdapter, buildReport } from '@nx-ai-tools/ai-metrics';
```

- `recordEvent` — append a schema-stamped event to `.ai/metrics/events/<userSlug>/<YYYY-MM-DD>.jsonl`
- `loadConfig` — read `.ai/metrics/metrics.config.json`, defaults if absent, throws a clear error if it's broken
- `createClaudeCodeAdapter` — normalize Claude Code hook input into ai-metrics events
- `buildReport` — aggregate all recorded events into `summary.json` / `sessions.json`

## Experimental API

```ts
import { createCopilotAdapter, recordEventAsync, buildReportAsync } from '@nx-ai-tools/ai-metrics/experimental';
```

Anything under `./experimental` may change or be removed without a major version bump.

## Release / npm publish process

Versioning uses [Changesets](https://github.com/changesets/changesets); publishing to npm is
gated behind a manually-created GitHub Release, never automatic on merge to `main`:

1. A changeset is added alongside a change and merged to `main`.
2. Changesets opens/updates a "Version Packages" PR on `main` (bumps version, updates `CHANGELOG.md`).
3. Once that PR is merged, a maintainer creates a **GitHub Release** for the new version.
4. The `release.published` event triggers the `Publish` GitHub Actions workflow, which builds,
   smoke-tests, and runs `npm publish --access public` for this package.

See the repo root [README](../../README.md) for the full workflow and required secrets.

## Building / testing this package

- `nx build ai-metrics` — build the library
- `nx test ai-metrics` — run unit tests via [Vitest](https://vitest.dev/)
