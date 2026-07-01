#!/usr/bin/env node
import { createClaudeCodeAdapter } from '@nx-ai-tools/ai-metrics';

const adapter = createClaudeCodeAdapter({
  onError: (error) => {
    console.error('[ai-metrics] claude-code hook error:', error instanceof Error ? error.message : error);
  },
});

let input = '';
process.stdin.setEncoding('utf8');
process.stdin.on('data', (chunk) => {
  input += chunk;
});
process.stdin.on('end', () => {
  adapter.handleInput(input);
  process.exit(0);
});
