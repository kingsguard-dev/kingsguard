import { describe, expect, it } from 'vitest';
import { parseVersion } from '../src/version.js';

describe('CLI package version', () => {
  it('returns the metadata string without assuming a particular version', () => {
    expect(
      parseVersion('{"version":"9.8.7-test","name":"@kingsguard/cli"}'),
    ).toBe('9.8.7-test');
  });

  it.each([
    'null',
    '[]',
    '42',
    'true',
    '"1.0.0"',
    '{}',
    '{"version":null}',
    '{"version":42}',
    '{"version":{}}',
  ])('rejects invalid metadata %s', (json) => {
    expect(() => parseVersion(json)).toThrow(
      'Invalid CLI package metadata: version must be a string.',
    );
  });

  it('rejects malformed JSON', () => {
    expect(() => parseVersion('{')).toThrow(SyntaxError);
  });
});
