export { recordEventAsync } from './core/record-event.js';
export { createMetricsEventDraft } from './core/eventFactory.js';
export type { EventFactoryInput, MetricsEventDraft } from './core/eventFactory.js';
export { buildReportAsync } from './report/build-report.js';
export { aggregateSessions, aggregateSummary, collectGitContextWarnings } from './report/aggregate.js';
export { isMetricsEvent } from './schema/validate.js';
export { createCopilotAdapter, createCopilotHookAdapter, normalizeCopilotEvent } from './providers/copilot/index.js';
export { runHookEntry as runCopilotHookEntry } from './providers/copilot/index.js';
export type { CopilotEventInput, CopilotHookInput } from './providers/copilot/index.js';
export type {
  NormalizeContext as CopilotNormalizeContext,
  RunHookEntryOptions as CopilotRunHookEntryOptions,
} from './providers/copilot/index.js';
export type { CopilotAdapterOptions } from './core/types.js';
export { normalizeClaudeCodeEvent, runHookEntry } from './providers/claude-code/index.js';
export type { NormalizeContext, RunHookEntryOptions } from './providers/claude-code/index.js';
export { resolveGitContext, runGitCommand } from './core/git.js';
export { buildUserSlug, resolveGitUserName } from './core/user.js';
export { sha1Hex, shortHash } from './core/hash.js';
