/**
 * Shape of the JSON Claude Code writes to a hook script's stdin. Only `hook_event_name` is
 * guaranteed; everything else is best-effort and varies by hook type and Claude Code version,
 * so unknown/absent fields must be tolerated rather than treated as errors.
 */
export interface ClaudeCodeHookInput {
  hook_event_name: string;
  session_id?: string;
  transcript_path?: string;
  cwd?: string;
  tool_name?: string;
  tool_use_id?: string;
  tool_input?: Record<string, unknown>;
  tool_response?: unknown;
  prompt?: string;
  model?: string;
  [key: string]: unknown;
}
