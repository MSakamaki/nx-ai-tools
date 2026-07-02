import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createInterface } from 'node:readline/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { DEFAULT_CONFIG, DEFAULT_CONFIG_FILE_NAME } from '../../config/default-config.js';
import { resolveEventsDirPath, resolveGeneratedDirPath, resolveHooksDirPath, resolveMetricsRootPath } from '../../core/paths.js';
import type { ProviderId, SelectProvidersOptions } from '../provider-selection.js';
import { selectProviders } from '../provider-selection.js';
import { initClaudeCode } from './init-claude-code.js';
import type { ConfirmFn, FileTaskOptions } from './init-file-task.js';
import { applyFileTask } from './init-file-task.js';
import { initCopilot } from './init-copilot.js';

const TEMPLATES_DIR = fileURLToPath(new URL('../../templates/', import.meta.url));
const CONFIG_TEMPLATE_PATH = join(TEMPLATES_DIR, 'metrics.config.json');
const GENERATED_DIR_GITIGNORE = '*\n';

export interface RunInitOptions {
  cwd?: string;
  dryRun?: boolean;
  force?: boolean;
  /** Raw `--provider` CLI value (e.g. "claude-code,copilot"); omit to select interactively/via default. */
  provider?: string;
  /** Injection seam for tests; defaults to `process.stdin.isTTY === true`. */
  isTTY?: boolean;
  /** Injection seam for tests; defaults to a real y/N stdin prompt. */
  confirm?: ConfirmFn;
  /** Injection seam for tests; defaults to the real interactive checkbox / non-TTY fallback. */
  selectProviders?: (options: SelectProvidersOptions) => Promise<ProviderId[]>;
}

async function defaultConfirm(message: string): Promise<boolean> {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  try {
    const answer = await rl.question(`${message} [y/N] `);
    return /^y(es)?$/i.test(answer.trim());
  } finally {
    rl.close();
  }
}

function ensureGitignoreEntry(gitignorePath: string, line: string): 'added' | 'already-present' {
  const content = existsSync(gitignorePath) ? readFileSync(gitignorePath, 'utf8') : '';
  const alreadyPresent = content
    .split('\n')
    .map((entry) => entry.trim())
    .includes(line);

  if (alreadyPresent) {
    return 'already-present';
  }

  const separator = content.length > 0 && !content.endsWith('\n') ? '\n' : '';
  writeFileSync(gitignorePath, `${content}${separator}${line}\n`, 'utf8');
  return 'added';
}

export async function runInit(options: RunInitOptions = {}): Promise<void> {
  const cwd = options.cwd ?? process.cwd();
  const dryRun = options.dryRun ?? false;
  const force = options.force ?? false;
  const confirm = options.confirm ?? defaultConfirm;
  const isTTY = options.isTTY ?? process.stdin.isTTY === true;
  const resolveProviders = options.selectProviders ?? selectProviders;

  const providers = await resolveProviders({ provider: options.provider, isTTY });
  console.log(`ai-metrics init: providers = [${providers.join(', ')}]${dryRun ? ' (dry-run)' : ''}`);

  const config = DEFAULT_CONFIG;
  const metricsRoot = resolveMetricsRootPath(config, cwd);
  const eventsDir = resolveEventsDirPath(config, cwd);
  const generatedDir = resolveGeneratedDirPath(config, cwd);
  const hooksDir = resolveHooksDirPath(config, cwd);
  const configPath = join(metricsRoot, DEFAULT_CONFIG_FILE_NAME);
  const gitignorePath = join(cwd, '.gitignore');
  const gitignoreLine = `${config.generatedDir}/`;

  const fileTaskOptions: FileTaskOptions = { dryRun, force, isTTY, confirm };

  const dirsToCreate = [metricsRoot, eventsDir, generatedDir, hooksDir].filter((dir) => !existsSync(dir));
  for (const dir of dirsToCreate) {
    if (dryRun) {
      console.log(`[dry-run] create directory: ${dir}`);
    } else {
      mkdirSync(dir, { recursive: true });
      console.log(`Created directory: ${dir}`);
    }
  }

  // Shared by every provider: the config file itself and the events/generated dirs above.
  await applyFileTask({ destPath: configPath, sourcePath: CONFIG_TEMPLATE_PATH }, fileTaskOptions);

  if (providers.includes('claude-code')) {
    await initClaudeCode({ ...fileTaskOptions, cwd, hooksDir });
  }

  if (providers.includes('copilot')) {
    await initCopilot({ ...fileTaskOptions, cwd, hooksDir });
  }

  if (dryRun) {
    console.log(`  write file: ${join(generatedDir, '.gitignore')}`);
  } else {
    writeFileSync(join(generatedDir, '.gitignore'), GENERATED_DIR_GITIGNORE, 'utf8');
  }

  const gitignoreAlreadyHasLine = existsSync(gitignorePath)
    ? readFileSync(gitignorePath, 'utf8')
        .split('\n')
        .map((line) => line.trim())
        .includes(gitignoreLine)
    : false;

  if (dryRun) {
    console.log(
      gitignoreAlreadyHasLine
        ? `  skip (already present): ${gitignorePath} entry "${gitignoreLine}"`
        : `  append to ${gitignorePath}: "${gitignoreLine}"`,
    );
    return;
  }

  const gitignoreResult = ensureGitignoreEntry(gitignorePath, gitignoreLine);
  console.log(
    gitignoreResult === 'added'
      ? `Added "${gitignoreLine}" to ${gitignorePath}`
      : `${gitignorePath} already ignores "${gitignoreLine}"`,
  );
}
