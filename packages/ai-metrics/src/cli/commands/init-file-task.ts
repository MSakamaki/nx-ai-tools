import { chmodSync, copyFileSync, existsSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

export type ConfirmFn = (message: string) => boolean | Promise<boolean>;

export interface FileTask {
  destPath: string;
  sourcePath: string;
  executable?: boolean;
}

export interface FileTaskOptions {
  dryRun: boolean;
  force: boolean;
  isTTY: boolean;
  confirm: ConfirmFn;
}

function copyTemplate(task: FileTask): void {
  mkdirSync(dirname(task.destPath), { recursive: true });
  copyFileSync(task.sourcePath, task.destPath);
  if (task.executable) {
    chmodSync(task.destPath, 0o755);
  }
}

/**
 * Copies a template file to `destPath`, never destroying an existing file without explicit
 * consent: `--force` overwrites unconditionally; an interactive TTY is asked and overwrites only
 * on "yes"; a non-interactive shell without `--force` always keeps the existing file untouched.
 */
export async function applyFileTask(task: FileTask, options: FileTaskOptions): Promise<void> {
  const exists = existsSync(task.destPath);

  if (!exists) {
    if (!options.dryRun) {
      copyTemplate(task);
    }
    console.log(options.dryRun ? `[dry-run] create: ${task.destPath}` : `Created ${task.destPath}`);
    return;
  }

  if (options.force) {
    if (!options.dryRun) {
      copyTemplate(task);
    }
    console.log(options.dryRun ? `[dry-run] overwrite (--force): ${task.destPath}` : `Overwrote ${task.destPath} (--force)`);
    return;
  }

  if (!options.isTTY) {
    console.log(
      options.dryRun ? `[dry-run] skip (exists, non-interactive): ${task.destPath}` : `Skipped ${task.destPath} (already exists)`,
    );
    return;
  }

  if (options.dryRun) {
    console.log(`[dry-run] would prompt to overwrite: ${task.destPath}`);
    return;
  }

  const overwrite = await options.confirm(`${task.destPath} already exists. Overwrite?`);
  if (overwrite) {
    copyTemplate(task);
    console.log(`Overwrote ${task.destPath}`);
  } else {
    console.log(`Skipped ${task.destPath} (kept existing)`);
  }
}
