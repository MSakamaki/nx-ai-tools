import { InvalidProviderError, parseProviderOption, selectProviders } from './provider-selection.js';

describe('parseProviderOption', () => {
  it('parses a single provider', () => {
    expect(parseProviderOption('claude-code')).toEqual(['claude-code']);
  });

  it('parses a comma-separated list', () => {
    expect(parseProviderOption('claude-code,copilot')).toEqual(['claude-code', 'copilot']);
  });

  it('trims whitespace around entries', () => {
    expect(parseProviderOption(' claude-code , copilot ')).toEqual(['claude-code', 'copilot']);
  });

  it('dedupes repeated providers', () => {
    expect(parseProviderOption('claude-code,claude-code')).toEqual(['claude-code']);
  });

  it('throws InvalidProviderError for an unknown provider', () => {
    expect(() => parseProviderOption('vscode-copilot')).toThrow(InvalidProviderError);
  });

  it('throws InvalidProviderError for an empty value', () => {
    expect(() => parseProviderOption('')).toThrow(InvalidProviderError);
    expect(() => parseProviderOption(' , ')).toThrow(InvalidProviderError);
  });
});

describe('selectProviders', () => {
  it('uses --provider verbatim, bypassing any prompt', async () => {
    const prompt = vi.fn();
    const providers = await selectProviders({ provider: 'copilot', isTTY: true, prompt });

    expect(providers).toEqual(['copilot']);
    expect(prompt).not.toHaveBeenCalled();
  });

  it('falls back to claude-code only when not a TTY and no --provider is given', async () => {
    const prompt = vi.fn();
    const providers = await selectProviders({ isTTY: false, prompt });

    expect(providers).toEqual(['claude-code']);
    expect(prompt).not.toHaveBeenCalled();
  });

  it('prompts interactively when it is a TTY and no --provider is given', async () => {
    const prompt = vi.fn().mockResolvedValue('1');
    const providers = await selectProviders({ isTTY: true, prompt });

    expect(prompt).toHaveBeenCalledOnce();
    expect(providers).toEqual(['claude-code']);
  });

  it('selects every provider when the prompt answer is empty (Enter)', async () => {
    const prompt = vi.fn().mockResolvedValue('');
    const providers = await selectProviders({ isTTY: true, prompt });

    expect(providers).toEqual(['claude-code', 'copilot']);
  });

  it('accepts numbers, names, spaces, or commas in the prompt answer', async () => {
    const byNumbers = await selectProviders({ isTTY: true, prompt: vi.fn().mockResolvedValue('1,2') });
    const byNames = await selectProviders({ isTTY: true, prompt: vi.fn().mockResolvedValue('claude-code copilot') });

    expect(byNumbers.sort()).toEqual(['claude-code', 'copilot']);
    expect(byNames.sort()).toEqual(['claude-code', 'copilot']);
  });

  it('throws InvalidProviderError for an unrecognized prompt answer', async () => {
    await expect(selectProviders({ isTTY: true, prompt: vi.fn().mockResolvedValue('9') })).rejects.toThrow(InvalidProviderError);
  });
});
