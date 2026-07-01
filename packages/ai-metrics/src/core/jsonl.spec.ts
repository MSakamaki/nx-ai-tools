import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  appendJsonl,
  appendJsonlSync,
  listJsonlFiles,
  readJsonl,
  readJsonlLenient,
  readJsonlLenientSync,
  readJsonlSync,
} from './jsonl.js';

interface Numbered {
  n: number;
}

function isNumbered(value: unknown): value is Numbered {
  return typeof value === 'object' && value !== null && typeof (value as Numbered).n === 'number';
}

describe('appendJsonlSync / readJsonlSync', () => {
  let cwd: string;

  beforeEach(() => {
    cwd = mkdtempSync(join(tmpdir(), 'ai-metrics-'));
  });

  afterEach(() => {
    rmSync(cwd, { recursive: true, force: true });
  });

  it('creates missing parent directories', () => {
    const filePath = join(cwd, 'a/b/c/events.jsonl');
    appendJsonlSync(filePath, { hello: 'world' });
    expect(readJsonlSync(filePath)).toEqual([{ hello: 'world' }]);
  });

  it('appends multiple values, each independently parseable', () => {
    const filePath = join(cwd, 'events.jsonl');
    appendJsonlSync(filePath, { n: 1 });
    appendJsonlSync(filePath, { n: 2 });
    appendJsonlSync(filePath, { n: 3 });

    expect(readJsonlSync(filePath)).toEqual([{ n: 1 }, { n: 2 }, { n: 3 }]);
  });

  it('returns an empty array for a missing file', () => {
    expect(readJsonlSync(join(cwd, 'missing.jsonl'))).toEqual([]);
  });
});

describe('appendJsonl / readJsonl', () => {
  let cwd: string;

  beforeEach(() => {
    cwd = mkdtempSync(join(tmpdir(), 'ai-metrics-'));
  });

  afterEach(() => {
    rmSync(cwd, { recursive: true, force: true });
  });

  it('appends and reads asynchronously', async () => {
    const filePath = join(cwd, 'events.jsonl');
    await appendJsonl(filePath, { n: 1 });
    await appendJsonl(filePath, { n: 2 });

    expect(await readJsonl(filePath)).toEqual([{ n: 1 }, { n: 2 }]);
  });
});

describe('listJsonlFiles', () => {
  let cwd: string;

  beforeEach(() => {
    cwd = mkdtempSync(join(tmpdir(), 'ai-metrics-'));
  });

  afterEach(() => {
    rmSync(cwd, { recursive: true, force: true });
  });

  it('returns an empty array when the root directory does not exist', () => {
    expect(listJsonlFiles(join(cwd, 'missing'))).toEqual([]);
  });

  it('finds .jsonl files nested under per-user subdirectories', () => {
    mkdirSync(join(cwd, 'alice'), { recursive: true });
    mkdirSync(join(cwd, 'bob'), { recursive: true });
    writeFileSync(join(cwd, 'alice/2026-07-01.jsonl'), '');
    writeFileSync(join(cwd, 'alice/2026-07-02.jsonl'), '');
    writeFileSync(join(cwd, 'bob/2026-07-01.jsonl'), '');
    writeFileSync(join(cwd, 'bob/notes.txt'), '');

    expect(listJsonlFiles(cwd)).toEqual([
      join(cwd, 'alice/2026-07-01.jsonl'),
      join(cwd, 'alice/2026-07-02.jsonl'),
      join(cwd, 'bob/2026-07-01.jsonl'),
    ]);
  });
});

describe('readJsonlLenientSync / readJsonlLenient', () => {
  let cwd: string;

  beforeEach(() => {
    cwd = mkdtempSync(join(tmpdir(), 'ai-metrics-'));
  });

  afterEach(() => {
    rmSync(cwd, { recursive: true, force: true });
  });

  it('returns an empty result for a missing file', () => {
    expect(readJsonlLenientSync(join(cwd, 'missing.jsonl'), isNumbered)).toEqual({ values: [], issues: [] });
  });

  it('parses every valid line and reports no issues', () => {
    const filePath = join(cwd, 'events.jsonl');
    writeFileSync(filePath, '{"n":1}\n{"n":2}\n');

    const result = readJsonlLenientSync(filePath, isNumbered);

    expect(result.values).toEqual([{ n: 1 }, { n: 2 }]);
    expect(result.issues).toEqual([]);
  });

  it('skips a line that is not valid JSON and reports it as an issue with its line number', () => {
    const filePath = join(cwd, 'events.jsonl');
    writeFileSync(filePath, '{"n":1}\nnot json\n{"n":2}\n');

    const result = readJsonlLenientSync(filePath, isNumbered);

    expect(result.values).toEqual([{ n: 1 }, { n: 2 }]);
    expect(result.issues).toHaveLength(1);
    expect(result.issues[0]).toMatchObject({ filePath, lineNumber: 2 });
    expect(result.issues[0].message).toContain('invalid JSON');
  });

  it('skips a well-formed JSON line that fails the validator', () => {
    const filePath = join(cwd, 'events.jsonl');
    writeFileSync(filePath, '{"n":1}\n{"wrong":"shape"}\n');

    const result = readJsonlLenientSync(filePath, isNumbered);

    expect(result.values).toEqual([{ n: 1 }]);
    expect(result.issues).toEqual([{ filePath, lineNumber: 2, message: 'does not match the expected event schema' }]);
  });

  it('behaves the same asynchronously', async () => {
    const filePath = join(cwd, 'events.jsonl');
    writeFileSync(filePath, '{"n":1}\nnot json\n');

    const result = await readJsonlLenient(filePath, isNumbered);

    expect(result.values).toEqual([{ n: 1 }]);
    expect(result.issues).toHaveLength(1);
  });

  it('returns an empty result asynchronously for a missing file', async () => {
    expect(await readJsonlLenient(join(cwd, 'missing.jsonl'), isNumbered)).toEqual({ values: [], issues: [] });
  });
});
