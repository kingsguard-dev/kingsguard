import { describe, expect, it } from 'vitest';
import {
  classifyPaths,
  type PackagePaths,
  type PathChange,
  type PathInventory,
} from './path-impact.js';

const file = (path: string) => ({ kind: 'file' as const, path });
const directory = (path: string) => ({ kind: 'directory' as const, path });
function pkg(path: string, name: string): PackagePaths {
  return {
    path,
    name,
    private: false,
    shipped: [
      directory(`${path}/dist`),
      file(`${path}/README.md`),
      file(`${path}/LICENSE`),
    ],
    build: [file(`${path}/tsconfig.build.json`)],
  };
}
const cli = pkg('packages/cli', '@kingsguard/cli');
const react = pkg(
  'packages/sentinel-react',
  '@kingsguard/eslint-plugin-sentinel-react',
);
function inventory(packages = [cli, react]): PathInventory {
  return { complete: true, packages, sharedBuild: [] };
}
function classify(changes: PathChange[], base = inventory(), head = base) {
  return classifyPaths({ complete: true, changes, base, head });
}
const edit = (path: string): PathChange => ({ oldPath: path, newPath: path });

it('keeps independent package coverage in mixed source and internal edits', () => {
  const result = classify([
    edit('packages/cli/src/bin.ts'),
    edit('packages/sentinel-react/src/index.ts'),
    edit('tests/consumer-compat.mjs'),
  ]);
  expect(result.map(({ status, packages }) => ({ status, packages }))).toEqual([
    { status: 'require', packages: [cli.name] },
    { status: 'require', packages: [react.name] },
    { status: 'exempt', packages: [] },
  ]);
  expect(result[0]?.evidence).toEqual(
    ['base', 'head'].map((side) => ({
      side,
      path: 'packages/cli/src/bin.ts',
      status: 'require',
      packages: [cli.name],
      reason: 'source',
      selector: directory('packages/cli/src'),
    })),
  );
});

it.each([
  'packages/cli/README.md',
  'packages/cli/LICENSE',
  'packages/cli/dist/bin.js',
  'packages/cli/tsconfig.build.json',
])('%s needs CLI coverage', (path) => {
  expect(classify([edit(path)])[0]).toMatchObject({
    status: 'require',
    packages: [cli.name],
  });
});

it.each([
  'README.md',
  'docs/architecture.md',
  'packages/cli/tests/bin.test.ts',
  'tests/consumer-compat.mjs',
  '.github/workflows/ci.yml',
  'eslint.config.js',
  'vitest.config.ts',
  '.changeset/config.json',
  '.changeset/fresh-note.md',
])('%s is known internal-only', (path) => {
  expect(classify([edit(path)])[0]).toMatchObject({
    status: 'exempt',
    packages: [],
  });
});

it.each([
  'README.md/extra',
  'docs-extra/readme.md',
  'packages/cli/tests-extra/test.ts',
  'packages/cli/src-extra/file.ts',
  'packages/cli/README.md.bak',
  'scripts/unknown.ts',
  'packages/cli/unknown.md',
  '.github/script.js',
  '.changeset/script.js',
])('%s cannot borrow an exemption or prefix match', (path) => {
  expect(classify([edit(path)])[0]).toMatchObject({
    status: 'unresolved',
    packages: [],
  });
});

it('shared build inputs cover all attributed identities, and root tsconfig covers public packages', () => {
  const data = inventory();
  data.sharedBuild = [
    { selector: file('scripts/build.ts'), packages: [cli.name, react.name] },
  ];
  expect(
    classify([edit('scripts/build.ts'), edit('tsconfig.json')], data).map(
      (item) => [item.status, item.packages],
    ),
  ).toEqual([
    ['require', [cli.name, react.name]],
    ['require', [cli.name, react.name]],
  ]);
});

it('missing shared attribution stays unresolved even under docs or alongside requiring evidence', () => {
  const data = inventory();
  data.sharedBuild = [
    { selector: directory('docs'), packages: null },
    { selector: directory('packages/cli/src'), packages: null },
  ];
  const result = classify(
    [edit('docs/build.md'), edit('packages/cli/src/bin.ts')],
    data,
  );
  expect(result.map((item) => item.status)).toEqual([
    'unresolved',
    'unresolved',
  ]);
  expect(result[1]?.packages).toEqual([cli.name]);
  expect(result[0]?.evidence[0]?.reason).toBe('build-attribution-missing');
});

it('shipped and build inputs override test, CI, docs, and Changeset exemptions', () => {
  const data = inventory([
    {
      ...cli,
      shipped: [directory('packages/cli/tests'), file('docs/manual.md')],
      build: [file('.github/workflows/build.yml'), file('.changeset/build.md')],
    },
  ]);
  expect(
    classify(
      [
        'packages/cli/tests/fixture.js',
        'docs/manual.md',
        '.github/workflows/build.yml',
        '.changeset/build.md',
      ].map(edit),
      data,
    ).map((item) => item.status),
  ).toEqual(['require', 'require', 'require', 'require']);
  expect(classify([edit('packages/cli/src/bin.test.ts')])[0]?.status).toBe(
    'require',
  );
});

it('renames into or out of source preserve requiring evidence and both identities', () => {
  const changes = [
    { oldPath: 'docs/example.ts', newPath: 'packages/cli/src/example.ts' },
    { oldPath: 'packages/cli/src/example.ts', newPath: 'docs/example.ts' },
    {
      oldPath: 'packages/cli/src/example.ts',
      newPath: 'packages/sentinel-react/src/example.ts',
    },
  ];
  expect(classify(changes).map((item) => [item.status, item.packages])).toEqual(
    [
      ['require', [cli.name]],
      ['require', [cli.name]],
      ['require', [cli.name, react.name]],
    ],
  );
  expect(
    classify([
      { oldPath: 'packages/cli/src/a.ts', newPath: 'unknown/a.ts' },
    ])[0],
  ).toMatchObject({ status: 'unresolved', packages: [cli.name] });
});

it('preserves deleted, new, moved, and renamed public package identities', () => {
  const moved = pkg('tools/cli', '@kingsguard/new-cli');
  const result = classify(
    [
      { oldPath: 'packages/cli/LICENSE', newPath: null },
      { oldPath: null, newPath: 'tools/cli/README.md' },
      { oldPath: 'packages/cli/src/bin.ts', newPath: 'tools/cli/src/bin.ts' },
    ],
    inventory([cli]),
    inventory([moved]),
  );
  expect(result.map((item) => [item.status, item.packages])).toEqual([
    ['require', [cli.name]],
    ['require', [moved.name]],
    ['require', [cli.name, moved.name]],
  ]);
});

it('evaluates visibility and shipping transitions on their respective sides', () => {
  const privateCli = { ...cli, private: true };
  const shippedTests = { ...cli, shipped: [directory('packages/cli/tests')] };
  for (const [base, head] of [
    [inventory([privateCli]), inventory([shippedTests])],
    [inventory([shippedTests]), inventory([privateCli])],
  ]) {
    expect(
      classify([edit('packages/cli/tests/bin.ts')], base, head)[0],
    ).toMatchObject({ status: 'require', packages: [cli.name] });
  }
  expect(
    classify(
      [{ oldPath: null, newPath: 'packages/cli/src/a.ts' }],
      inventory([]),
      inventory([privateCli]),
    )[0],
  ).toMatchObject({ status: 'unresolved', packages: [] });
});

it.each(['package.json', 'packages/cli/package.json', 'pnpm-lock.yaml'])(
  'defers %s to content classification even with shipping metadata',
  (path) => {
    expect(
      classify([edit(path)], inventory([{ ...cli, shipped: [file(path)] }]))[0],
    ).toMatchObject({ status: 'unresolved', packages: [] });
  },
);

it('accepts explicitly complete empty inventories, not missing snapshots', () => {
  expect(classify([], inventory([]))).toEqual([]);
  expect(classify([edit('tsconfig.json')], inventory([]))[0]?.status).toBe(
    'unresolved',
  );
});

describe('rejects incomplete or malformed caller data', () => {
  it.each([
    { complete: false },
    { changes: undefined },
    { base: undefined },
    { head: { complete: false, packages: [], sharedBuild: [] } },
    { head: { complete: true, packages: [] } },
    {
      head: inventory([
        { ...cli, shipped: undefined } as unknown as PackagePaths,
      ]),
    },
    { head: inventory([cli, cli]) },
    {
      head: {
        ...inventory(),
        sharedBuild: [{ selector: file('build.ts'), packages: ['missing'] }],
      },
    },
    {
      head: {
        ...inventory(),
        sharedBuild: [{ selector: file('build.ts'), packages: [] }],
      },
    },
    {
      head: inventory([
        {
          ...cli,
          build: [{ kind: 'glob', path: 'src' }],
        } as unknown as PackagePaths,
      ]),
    },
    { changes: [{ oldPath: null, newPath: null }] },
    { changes: [{ newPath: 'docs/new.md' }] },
  ])('fails rather than silently treating data as empty: %j', (override) => {
    const input = {
      complete: true,
      changes: [],
      base: inventory(),
      head: inventory(),
      ...override,
    };
    expect(() =>
      classifyPaths(input as Parameters<typeof classifyPaths>[0]),
    ).toThrow();
  });
  it.each([
    '/docs/a',
    '../docs/a',
    'docs/../a',
    './docs/a',
    'docs//a',
    'docs/a/',
    'docs\\a',
    'docs/*',
    'C:/docs/a',
  ])('rejects non-normalized path %s', (path) => {
    expect(() => classify([edit(path)])).toThrow();
  });
});
