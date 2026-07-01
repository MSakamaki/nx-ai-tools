import { appendFileSync, existsSync, mkdirSync, readdirSync, readFileSync } from 'node:fs';
import { appendFile, mkdir, readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';

export function appendJsonlSync(filePath: string, value: unknown): void {
  mkdirSync(dirname(filePath), { recursive: true });
  appendFileSync(filePath, `${JSON.stringify(value)}\n`, 'utf8');
}

export async function appendJsonl(filePath: string, value: unknown): Promise<void> {
  await mkdir(dirname(filePath), { recursive: true });
  await appendFile(filePath, `${JSON.stringify(value)}\n`, 'utf8');
}

export function readJsonlSync<T>(filePath: string): T[] {
  if (!existsSync(filePath)) {
    return [];
  }
  return parseJsonlContent<T>(readFileSync(filePath, 'utf8'));
}

export async function readJsonl<T>(filePath: string): Promise<T[]> {
  try {
    return parseJsonlContent<T>(await readFile(filePath, 'utf8'));
  } catch {
    return [];
  }
}

function parseJsonlContent<T>(content: string): T[] {
  return content
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
    .map((line) => JSON.parse(line) as T);
}

export interface JsonlParseIssue {
  filePath: string;
  lineNumber: number;
  message: string;
}

export interface JsonlLenientResult<T> {
  values: T[];
  issues: JsonlParseIssue[];
}

function collectLenientResults<T>(
  filePath: string,
  content: string,
  isValid: (value: unknown) => value is T,
): JsonlLenientResult<T> {
  const values: T[] = [];
  const issues: JsonlParseIssue[] = [];

  content.split('\n').forEach((rawLine, index) => {
    const line = rawLine.trim();
    if (line.length === 0) {
      return;
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(line);
    } catch (error) {
      issues.push({ filePath, lineNumber: index + 1, message: `invalid JSON (${error instanceof Error ? error.message : String(error)})` });
      return;
    }

    if (!isValid(parsed)) {
      issues.push({ filePath, lineNumber: index + 1, message: 'does not match the expected event schema' });
      return;
    }

    values.push(parsed);
  });

  return { values, issues };
}

/** Skips (and reports) invalid lines instead of throwing, so one corrupt line doesn't lose an entire file's events. */
export function readJsonlLenientSync<T>(filePath: string, isValid: (value: unknown) => value is T): JsonlLenientResult<T> {
  if (!existsSync(filePath)) {
    return { values: [], issues: [] };
  }
  return collectLenientResults(filePath, readFileSync(filePath, 'utf8'), isValid);
}

export async function readJsonlLenient<T>(
  filePath: string,
  isValid: (value: unknown) => value is T,
): Promise<JsonlLenientResult<T>> {
  try {
    return collectLenientResults(filePath, await readFile(filePath, 'utf8'), isValid);
  } catch {
    return { values: [], issues: [] };
  }
}

/** Walks a directory tree (e.g. `<eventsDir>/<userSlug>/<date>.jsonl`) and returns every `.jsonl` file found. */
export function listJsonlFiles(rootDir: string): string[] {
  if (!existsSync(rootDir)) {
    return [];
  }

  const results: string[] = [];
  const walk = (dir: string): void => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const fullPath = join(dir, entry.name);
      if (entry.isDirectory()) {
        walk(fullPath);
      } else if (entry.isFile() && entry.name.endsWith('.jsonl')) {
        results.push(fullPath);
      }
    }
  };

  walk(rootDir);
  return results.sort();
}
