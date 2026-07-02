import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { FileTaskOptions } from './init-file-task.js';
import { applyFileTask } from './init-file-task.js';

const TEMPLATES_DIR = fileURLToPath(new URL('../../templates/copilot/', import.meta.url));
const HOOKS_JSON_TEMPLATE_PATH = join(TEMPLATES_DIR, 'hooks.json');
const HOOK_SCRIPT_TEMPLATE_PATH = join(TEMPLATES_DIR, 'copilot-hook.mjs');
const README_TEMPLATE_PATH = join(TEMPLATES_DIR, 'README.md');
const ADAPTER_CONFIG_TEMPLATE_PATH = join(TEMPLATES_DIR, 'adapter.config.json');
const SAMPLE_EVENT_TEMPLATE_PATH = join(TEMPLATES_DIR, 'sample-event.json');
const HOOK_SCRIPT_FILE_NAME = 'copilot-hook.mjs';

export interface InitCopilotOptions extends FileTaskOptions {
  cwd: string;
  hooksDir: string;
}

/**
 * Scaffolds the Copilot provider (experimental / project hooks template):
 * `.github/hooks/ai-metrics.json` is the hook configuration Copilot reads directly — its filename
 * is fixed and it carries no ai-metrics-specific settings, only the command/env wiring to
 * `.ai/metrics/hooks/copilot-hook.mjs`. ai-metrics' own settings instead live in
 * `.ai/metrics/copilot/adapter.config.json` and the shared `.ai/metrics/metrics.config.json`.
 */
export async function initCopilot(options: InitCopilotOptions): Promise<void> {
  const copilotDir = join(options.cwd, '.ai', 'metrics', 'copilot');

  await applyFileTask(
    { destPath: join(options.cwd, '.github', 'hooks', 'ai-metrics.json'), sourcePath: HOOKS_JSON_TEMPLATE_PATH },
    options,
  );
  await applyFileTask(
    { destPath: join(options.hooksDir, HOOK_SCRIPT_FILE_NAME), sourcePath: HOOK_SCRIPT_TEMPLATE_PATH, executable: true },
    options,
  );
  await applyFileTask({ destPath: join(copilotDir, 'README.md'), sourcePath: README_TEMPLATE_PATH }, options);
  await applyFileTask({ destPath: join(copilotDir, 'adapter.config.json'), sourcePath: ADAPTER_CONFIG_TEMPLATE_PATH }, options);
  await applyFileTask({ destPath: join(copilotDir, 'sample-event.json'), sourcePath: SAMPLE_EVENT_TEMPLATE_PATH }, options);
}
