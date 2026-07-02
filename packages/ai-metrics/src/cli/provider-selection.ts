import { createInterface } from 'node:readline/promises';

export type ProviderId = 'claude-code' | 'copilot';

export const ALL_PROVIDERS: readonly ProviderId[] = ['claude-code', 'copilot'];

const PROVIDER_MENU: ReadonlyArray<{ number: string; id: ProviderId }> = [
  { number: '1', id: 'claude-code' },
  { number: '2', id: 'copilot' },
];

export class InvalidProviderError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'InvalidProviderError';
  }
}

function isProviderId(value: string): value is ProviderId {
  return value === 'claude-code' || value === 'copilot';
}

/** Parses `--provider claude-code,copilot`. Throws `InvalidProviderError` on an unknown/empty value. */
export function parseProviderOption(value: string): ProviderId[] {
  const tokens = value
    .split(',')
    .map((token) => token.trim())
    .filter((token) => token.length > 0);

  const selected = new Set<ProviderId>();
  for (const token of tokens) {
    if (!isProviderId(token)) {
      throw new InvalidProviderError(`Unknown provider "${token}". Valid providers: ${ALL_PROVIDERS.join(', ')}.`);
    }
    selected.add(token);
  }

  if (selected.size === 0) {
    throw new InvalidProviderError(`--provider requires at least one provider (${ALL_PROVIDERS.join(', ')}).`);
  }

  return [...selected];
}

async function defaultPrompt(message: string): Promise<string> {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  try {
    return await rl.question(message);
  } finally {
    rl.close();
  }
}

/** Text-based checkbox: numbers (or provider names) separated by spaces/commas; empty answer selects every provider. */
function parseCheckboxAnswer(answer: string): ProviderId[] {
  const trimmed = answer.trim();
  if (trimmed.length === 0) {
    return [...ALL_PROVIDERS];
  }

  const tokens = trimmed.split(/[\s,]+/).filter((token) => token.length > 0);
  const selected = new Set<ProviderId>();
  for (const token of tokens) {
    const byNumber = PROVIDER_MENU.find((entry) => entry.number === token)?.id;
    if (byNumber) {
      selected.add(byNumber);
    } else if (isProviderId(token)) {
      selected.add(token);
    } else {
      throw new InvalidProviderError(`Unrecognized selection "${token}".`);
    }
  }

  if (selected.size === 0) {
    throw new InvalidProviderError('No provider selected.');
  }

  return [...selected];
}

export interface SelectProvidersOptions {
  /** Raw `--provider` CLI value; when set, selection is non-interactive regardless of TTY. */
  provider?: string;
  /** Defaults to `process.stdin.isTTY === true`. */
  isTTY?: boolean;
  /** Injection seam for tests; defaults to a real checkbox-style stdin prompt. */
  prompt?: (message: string) => string | Promise<string>;
}

const CHECKBOX_PROMPT = [
  'Select providers to enable:',
  ...PROVIDER_MENU.map((entry) => `  ${entry.number}) ${entry.id}`),
  'Enter numbers/names separated by spaces or commas, or press Enter for all: ',
].join('\n');

/**
 * Resolves which providers `ai-metrics init` should scaffold. `--provider` always wins. Without
 * it: an interactive TTY gets a checkbox-style prompt; a non-interactive shell (CI, piped input)
 * falls back to `claude-code` only, matching `ai-metrics init`'s original (pre-Copilot) behavior.
 */
export async function selectProviders(options: SelectProvidersOptions = {}): Promise<ProviderId[]> {
  if (options.provider !== undefined) {
    return parseProviderOption(options.provider);
  }

  const isTTY = options.isTTY ?? process.stdin.isTTY === true;
  if (!isTTY) {
    return ['claude-code'];
  }

  const prompt = options.prompt ?? defaultPrompt;
  const answer = await prompt(CHECKBOX_PROMPT);
  return parseCheckboxAnswer(answer);
}
