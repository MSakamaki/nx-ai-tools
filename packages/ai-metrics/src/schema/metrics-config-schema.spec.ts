import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { DEFAULT_CONFIG } from '../config/default-config.js';

interface JsonSchemaNode {
  type?: string;
  default?: unknown;
  additionalProperties?: boolean;
  properties?: Record<string, JsonSchemaNode>;
}

const SCHEMA_PATH = join(import.meta.dirname, 'metrics.config.schema.json');

function loadSchema(): JsonSchemaNode {
  return JSON.parse(readFileSync(SCHEMA_PATH, 'utf8')) as JsonSchemaNode;
}

/** Walks matching schema/value trees together, asserting every schema `default` matches the actual DEFAULT_CONFIG value at the same path. */
function assertDefaultsMatch(schemaNode: JsonSchemaNode, value: unknown, path: string): void {
  if (schemaNode.properties) {
    expect(typeof value).toBe('object');
    for (const [key, childSchema] of Object.entries(schemaNode.properties)) {
      assertDefaultsMatch(childSchema, (value as Record<string, unknown>)[key], `${path}.${key}`);
    }
    return;
  }

  if ('default' in schemaNode) {
    expect(value, `default for ${path}`).toEqual(schemaNode.default);
  }
}

describe('metrics.config.schema.json', () => {
  it('is valid, parseable JSON', () => {
    expect(() => loadSchema()).not.toThrow();
  });

  it('declares additionalProperties: false at every object level, so unknown config keys are rejected consistently with the zod schema', () => {
    const schema = loadSchema();

    function walk(node: JsonSchemaNode): void {
      if (node.properties) {
        expect(node.additionalProperties).toBe(false);
        for (const child of Object.values(node.properties)) {
          walk(child);
        }
      }
    }

    walk(schema);
  });

  it('every declared default matches the actual DEFAULT_CONFIG value, so the two never drift apart', () => {
    const schema = loadSchema();
    assertDefaultsMatch(schema, DEFAULT_CONFIG, 'metrics.config');
  });

  it('declares every top-level MetricsConfig key', () => {
    const schema = loadSchema();
    expect(Object.keys(schema.properties ?? {}).sort()).toEqual(Object.keys(DEFAULT_CONFIG).sort());
  });

  it('declares providers.claudeCode and providers.copilot.rawEvent nested shapes', () => {
    const schema = loadSchema();
    const providers = schema.properties?.providers?.properties ?? {};

    expect(Object.keys(providers.claudeCode?.properties ?? {})).toEqual(['enabled']);
    expect(Object.keys(providers.copilot?.properties ?? {}).sort()).toEqual(['enabled', 'rawEvent']);
    expect(Object.keys(providers.copilot?.properties?.rawEvent?.properties ?? {}).sort()).toEqual(['enabled', 'maxBytes']);
  });
});
