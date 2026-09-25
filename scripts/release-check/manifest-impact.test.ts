import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { classifyManifest, type ManifestSide } from './manifest-impact.js';

const cli = '@kingsguard/cli';
const react = '@kingsguard/eslint-plugin-sentinel-react';
interface Fixture {
  fields?: Record<string, unknown>;
  packages?: string[] | null;
  dependencies?: string[];
  scripts?: string[];
}
function side({
  fields = {},
  packages = [cli],
  dependencies = [],
  scripts = [],
}: Fixture = {}): ManifestSide {
  return {
    manifest: { name: cli, ...fields },
    packages,
    toolOnly: { dependencies, scripts },
  };
}

it.each(['dependencies', 'peerDependencies', 'optionalDependencies'])(
  'requires %s on addition, update and deletion',
  (field) => {
    const absent = side();
    const old = side({ fields: { [field]: { eslint: '^9' } } });
    const next = side({ fields: { [field]: { eslint: '^10' } } });
    for (const [base, head] of [
      [absent, old],
      [old, next],
      [next, absent],
    ] as const) {
      expect(classifyManifest({ base, head })).toMatchObject({
        status: 'require',
        packages: [cli],
      });
    }
  },
);

it.each([
  'bin',
  'exports',
  'files',
  'engines',
  'description',
  'version',
  'packageManager',
  'workspaces',
])('requires changes to %s', (field) => {
  expect(
    classifyManifest({
      base: side(),
      head: side({ fields: { [field]: 'changed' } }),
    }).status,
  ).toBe('require');
});

it('requires attributed root compiler changes and preserves mixed unknown evidence', () => {
  const base = side({
    fields: { name: 'root', private: true },
    packages: [cli, react],
  });
  const head = side({
    fields: {
      name: 'root',
      private: true,
      devDependencies: { typescript: '~5.9', unfamiliar: '1' },
    },
    packages: [cli, react],
  });
  expect(classifyManifest({ base, head })).toMatchObject({
    status: 'unresolved',
    packages: [cli, react],
    evidence: [
      { field: ['devDependencies', 'typescript'], status: 'require' },
      { field: ['devDependencies', 'unfamiliar'], status: 'unresolved' },
    ],
  });
});

it('exempts known tools only with proof on every relevant side', () => {
  const base = side({
    fields: { devDependencies: { vitest: '4' } },
    dependencies: ['vitest'],
  });
  const head = side({
    fields: { devDependencies: { vitest: '5' } },
    dependencies: ['vitest'],
  });
  expect(classifyManifest({ base, head }).status).toBe('exempt');
  for (const input of [
    { base: { ...base, toolOnly: { dependencies: [], scripts: [] } }, head },
    { base, head: { ...head, toolOnly: { dependencies: [], scripts: [] } } },
  ])
    expect(classifyManifest(input).status).toBe('unresolved');
  expect(classifyManifest({ base, head: side() }).status).toBe('exempt');
  expect(classifyManifest({ base: side(), head }).status).toBe('exempt');
});

it.each(['unknown-tool', 'typescript'])('proof cannot exempt %s', (tool) => {
  const result = classifyManifest({
    base: side(),
    head: side({
      fields: { devDependencies: { [tool]: '1' } },
      dependencies: [tool],
    }),
  });
  expect(result.status).toBe(tool === 'typescript' ? 'require' : 'unresolved');
});

it('accepts exact internal commands, but not arbitrary commands with familiar names', () => {
  const lint = side({
    fields: { scripts: { lint: 'eslint . --max-warnings 0' } },
    scripts: ['lint'],
  });
  expect(classifyManifest({ base: side(), head: lint }).status).toBe('exempt');
  for (const command of [
    'node build.js',
    'eslint . --max-warnings 0 && node build.js',
  ]) {
    const arbitrary = side({
      fields: { scripts: { lint: command } },
      scripts: ['lint'],
    });
    expect(classifyManifest({ base: lint, head: arbitrary }).status).toBe(
      'unresolved',
    );
    expect(classifyManifest({ base: arbitrary, head: lint }).status).toBe(
      'unresolved',
    );
  }
  expect(
    classifyManifest({
      base: side(),
      head: { ...lint, toolOnly: { dependencies: [], scripts: [] } },
    }).status,
  ).toBe('unresolved');
});

it.each(['build', 'prepack', 'prepare', 'install'])(
  'requires lifecycle script %s despite tool proof',
  (key) => {
    const head = side({
      fields: { scripts: { [key]: 'vitest run' } },
      scripts: [key],
    });
    expect(classifyManifest({ base: side(), head }).status).toBe('require');
    expect(classifyManifest({ base: head, head: side() }).status).toBe(
      'require',
    );
  },
);

it('does not let an internal tool change hide public metadata', () => {
  const head = side({
    fields: { description: 'Updated', devDependencies: { prettier: '3' } },
    dependencies: ['prettier'],
  });
  expect(classifyManifest({ base: side(), head })).toMatchObject({
    status: 'require',
    packages: [cli],
  });
});

it('preserves old and new public identities and private transitions', () => {
  const base = side();
  const head = side({ fields: { name: react }, packages: [react] });
  expect(classifyManifest({ base, head }).packages).toEqual([cli, react]);
  expect(
    classifyManifest({
      base,
      head: side({ fields: { private: true }, packages: [] }),
    }),
  ).toMatchObject({ status: 'unresolved', packages: [cli] });
});

it.each([null, []])(
  'keeps missing root attribution unresolved: %j',
  (packages) => {
    const base = side({ fields: { private: true }, packages });
    const head = side({
      fields: { private: true, engines: { node: '>=24' } },
      packages,
    });
    expect(classifyManifest({ base, head })).toMatchObject({
      status: 'unresolved',
      evidence: [{ reason: 'attribution-missing' }],
    });
  },
);

it('classifies whole manifest creation/deletion without losing base identity', () => {
  expect(classifyManifest({ base: null, head: side() })).toMatchObject({
    status: 'require',
    packages: [cli],
    evidence: [{ field: [] }],
  });
  expect(classifyManifest({ base: side(), head: null })).toMatchObject({
    status: 'require',
    packages: [cli],
  });
  expect(
    classifyManifest({ base: side({ packages: null }), head: null }).status,
  ).toBe('unresolved');
  expect(() => classifyManifest({ base: null, head: null })).toThrow();
});

it('ignores object key order but preserves array order without mutating input', () => {
  const base = side({
    fields: { exports: { a: 'a', b: 'b' }, files: ['dist', 'README.md'] },
  });
  const head = side({
    fields: { exports: { b: 'b', a: 'a' }, files: ['dist', 'README.md'] },
  });
  const snapshot = structuredClone({ base, head });
  expect(classifyManifest({ base, head })).toEqual({
    status: 'exempt',
    packages: [],
    evidence: [],
  });
  expect({ base, head }).toEqual(snapshot);
  expect(
    classifyManifest({
      base,
      head: side({ fields: { files: ['README.md', 'dist'] } }),
    }).status,
  ).toBe('require');
});

it.each([
  'package.json',
  'packages/cli/package.json',
  'packages/sentinel-react/package.json',
])('accepts unchanged real manifest %s', (path) => {
  const manifest: unknown = JSON.parse(readFileSync(path, 'utf8'));
  const value: ManifestSide = {
    manifest,
    packages: [cli, react],
    toolOnly: { dependencies: [], scripts: [] },
  };
  expect(classifyManifest({ base: value, head: value })).toEqual({
    status: 'exempt',
    packages: [],
    evidence: [],
  });
});

describe('invalid input', () => {
  it.each([
    null,
    [],
    {},
    { name: '' },
    { name: cli, private: 'false' },
    { name: cli, scripts: { test: 1 } },
    { name: cli, dependencies: { x: '' } },
    { name: cli, custom: undefined },
  ])('rejects malformed manifest %j', (manifest) => {
    expect(() =>
      classifyManifest({ base: null, head: { ...side(), manifest } }),
    ).toThrow();
  });
  it('rejects incomplete public attribution and malformed tool evidence', () => {
    expect(() =>
      classifyManifest({ base: null, head: side({ packages: [] }) }),
    ).toThrow();
    expect(() =>
      classifyManifest({ base: null, head: side({ dependencies: [''] }) }),
    ).toThrow();
  });
});

it.each(['scripts', 'devDependencies'])(
  'preserves both attribution sides when adding or deleting %s entries',
  (field) => {
    const key = field === 'scripts' ? 'build' : 'typescript';
    const value = field === 'scripts' ? 'tsc' : '~5.9';
    const empty = side({ fields: { private: true }, packages: [cli] });
    const populated = side({
      fields: { private: true, [field]: { [key]: value } },
      packages: [react],
    });
    for (const [base, head] of [
      [empty, populated],
      [populated, empty],
    ] as const) {
      expect(classifyManifest({ base, head })).toMatchObject({
        status: 'require',
        packages: [cli, react],
      });
    }
    for (const packages of [null, []]) {
      const unattributed = { ...empty, packages };
      for (const [base, head] of [
        [unattributed, populated],
        [populated, unattributed],
      ] as const) {
        expect(classifyManifest({ base, head })).toMatchObject({
          status: 'unresolved',
          packages: [react],
          evidence: [{ reason: 'attribution-missing' }],
        });
      }
    }
  },
);
