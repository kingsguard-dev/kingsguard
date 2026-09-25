import { expect, it } from 'vitest';
import {
  classifyLockfileGraph,
  type DependencyNode,
  type DependencyRoot,
  type LockfileGraph,
} from './lockfile-graph.js';

const cli = '@kingsguard/cli';
const react = '@kingsguard/eslint-plugin-sentinel-react';
function node(
  id: string,
  dependencies: string[] = [],
  fingerprint = 'original',
): DependencyNode {
  return { id, dependencies, fingerprint };
}
function root(
  input: Pick<DependencyRoot, 'id' | 'target' | 'impact' | 'packages'>,
): DependencyRoot {
  return { fingerprint: 'original', ...input };
}
interface Fixture {
  nodes?: DependencyNode[];
  roots?: DependencyRoot[];
  metadataFingerprint?: string;
}
function graph({
  nodes = [],
  roots = [],
  metadataFingerprint = 'settings',
}: Fixture = {}): LockfileGraph {
  return { complete: true, nodes, roots, metadataFingerprint };
}
const tool = root({
  id: 'root/dev/vitest',
  target: 'tool',
  impact: 'exempt',
  packages: [],
});
const runtime = root({
  id: 'react/runtime',
  target: 'runtime',
  impact: 'require',
  packages: [react],
});
const build = root({
  id: 'root/build',
  target: 'build',
  impact: 'require',
  packages: [cli],
});

it('exempts an isolated transitive tool node change', () => {
  const base = graph({
    roots: [tool],
    nodes: [node('tool', ['leaf']), node('leaf')],
  });
  const head = graph({
    roots: [tool],
    nodes: [node('tool', ['leaf']), node('leaf', [], 'new-resolution')],
  });
  expect(classifyLockfileGraph({ base, head })).toEqual({
    status: 'exempt',
    packages: [],
    evidence: [
      {
        kind: 'node',
        id: 'leaf',
        status: 'exempt',
        packages: [],
        roots: [tool.id],
        reason: 'known-impact',
      },
    ],
  });
});

it('requires every runtime/build owner of a shared transitive tool dependency', () => {
  const base = graph({
    roots: [tool, runtime, build],
    nodes: [
      node('tool', ['shared']),
      node('runtime', ['shared']),
      node('build', ['shared']),
      node('shared'),
    ],
  });
  const head = {
    ...base,
    nodes: base.nodes.map((value) =>
      value.id === 'shared'
        ? { ...value, fingerprint: 'new-integrity' }
        : value,
    ),
  };
  expect(classifyLockfileGraph({ base, head })).toMatchObject({
    status: 'require',
    packages: [cli, react],
    evidence: [{ roots: [runtime.id, build.id, tool.id].sort() }],
  });
});

it('retains known coverage when another root is unknown', () => {
  const roots = [
    runtime,
    root({
      id: 'unknown',
      target: 'runtime',
      impact: 'unresolved',
      packages: [cli],
    }),
  ];
  const base = graph({ roots, nodes: [node('runtime')] });
  const head = graph({ roots, nodes: [node('runtime', [], 'changed')] });
  expect(classifyLockfileGraph({ base, head })).toMatchObject({
    status: 'unresolved',
    packages: [cli, react],
    evidence: [{ reason: 'unknown-impact' }],
  });
});

it.each([null, []])(
  'keeps requiring roots with attribution %j unresolved',
  (packages) => {
    const base = graph({ roots: [runtime], nodes: [node('runtime')] });
    const head = graph({
      roots: [{ ...runtime, packages }],
      nodes: [node('runtime', [], 'new')],
    });
    expect(classifyLockfileGraph({ base, head })).toMatchObject({
      status: 'unresolved',
      packages: [react],
      evidence: [
        { reason: 'attribution-missing' },
        { reason: 'attribution-missing' },
      ],
    });
  },
);

it('terminates cycles and finds all owners', () => {
  const roots = [tool, { ...runtime, target: 'cycle' }];
  const base = graph({
    roots,
    nodes: [node('tool', ['cycle']), node('cycle', ['tool'])],
  });
  const head = graph({
    roots,
    nodes: [node('tool', ['cycle']), node('cycle', ['tool'], 'new')],
  });
  expect(classifyLockfileGraph({ base, head })).toMatchObject({
    status: 'require',
    packages: [react],
  });
});

it('retains deleted node/root identities and classifies additions', () => {
  const populated = graph({ roots: [runtime], nodes: [node('runtime')] });
  for (const [base, head] of [
    [graph(), populated],
    [populated, graph()],
  ] as const) {
    expect(classifyLockfileGraph({ base, head })).toMatchObject({
      status: 'require',
      packages: [react],
      evidence: [{ kind: 'node' }, { kind: 'root' }],
    });
  }
});

it('classifies root target rewiring even if node payloads are unchanged', () => {
  const base = graph({
    roots: [runtime],
    nodes: [node('runtime'), node('other')],
  });
  const head = {
    ...base,
    roots: [{ ...runtime, target: 'other', packages: [cli] }],
  };
  expect(classifyLockfileGraph({ base, head })).toMatchObject({
    status: 'require',
    packages: [cli, react],
    evidence: [{ kind: 'root', id: runtime.id }],
  });
});

it('does not hide orphan ownership on one side behind known ownership on the other', () => {
  const base = graph({ nodes: [node('runtime')] });
  const head = graph({ roots: [runtime], nodes: [node('runtime', [], 'new')] });
  expect(classifyLockfileGraph({ base, head })).toMatchObject({
    status: 'unresolved',
    packages: [react],
    evidence: [{ reason: 'orphan' }, { kind: 'root', status: 'require' }],
  });
});

it('classifies removed dependency edges and preserves old ownership', () => {
  const base = graph({
    roots: [runtime],
    nodes: [node('runtime', ['leaf']), node('leaf')],
  });
  const head = graph({
    roots: [runtime],
    nodes: [node('runtime'), node('leaf')],
  });
  expect(classifyLockfileGraph({ base, head })).toMatchObject({
    status: 'require',
    packages: [react],
    evidence: [{ kind: 'node', id: 'runtime' }],
  });
});

it('keeps global metadata changes unresolved without losing requiring coverage', () => {
  const base = graph({ roots: [runtime], nodes: [node('runtime')] });
  const head = graph({
    roots: [runtime],
    nodes: [node('runtime', [], 'new')],
    metadataFingerprint: 'different-settings',
  });
  expect(classifyLockfileGraph({ base, head })).toMatchObject({
    status: 'unresolved',
    packages: [react],
    evidence: [
      { kind: 'node' },
      { kind: 'metadata', reason: 'metadata-changed' },
    ],
  });
});

it('ignores ordering and duplicate edges without changing caller arrays', () => {
  const base = graph({
    roots: [runtime, { ...build, target: 'runtime', packages: [cli, react] }],
    nodes: [node('runtime', ['a', 'b']), node('a'), node('b')],
  });
  const head = graph({
    roots: [
      { ...build, target: 'runtime', packages: [react, cli, cli] },
      runtime,
    ],
    nodes: [node('b'), node('a'), node('runtime', ['b', 'a', 'a'])],
  });
  const original = structuredClone({ base, head });
  expect(classifyLockfileGraph({ base, head })).toEqual({
    status: 'exempt',
    packages: [],
    evidence: [],
  });
  expect({ base, head }).toEqual(original);
  expect(classifyLockfileGraph({ base: graph(), head: graph() })).toEqual({
    status: 'exempt',
    packages: [],
    evidence: [],
  });
});

it.each([
  { complete: false },
  { nodes: undefined },
  { roots: undefined },
  { metadataFingerprint: '' },
  { nodes: [node('a'), node('a')] },
  { nodes: [node('a', ['missing'])] },
  { nodes: [node('runtime')], roots: [runtime, runtime] },
  { roots: [runtime] },
  { nodes: [node('runtime')], roots: [{ ...runtime, impact: 'other' }] },
  { nodes: [node('tool')], roots: [{ ...tool, packages: null }] },
  { nodes: [node('tool')], roots: [{ ...tool, packages: [cli] }] },
])('rejects invalid graph even when otherwise unchanged: %j', (override) => {
  const invalid = { ...graph(), ...override } as LockfileGraph;
  expect(() =>
    classifyLockfileGraph({ base: invalid, head: invalid }),
  ).toThrow();
});

it('rejects sparse attribution on either side before comparing snapshots', () => {
  const valid = graph({ roots: [runtime], nodes: [node('runtime')] });
  const invalid = graph({
    roots: [{ ...runtime, packages: new Array<string>(1) }],
    nodes: [node('runtime')],
  });
  for (const [base, head] of [
    [invalid, valid],
    [valid, invalid],
    [invalid, invalid],
  ] as const) {
    expect(() => classifyLockfileGraph({ base, head })).toThrow(
      'Invalid or duplicate dependency root',
    );
  }
});

it('retains all owners of a dependency shared by many roots', () => {
  const roots = Array.from({ length: 2000 }, (_, i) =>
    root({
      id: `workspace-${i}`,
      target: 'shared',
      impact: 'require',
      packages: [`package-${i}`],
    }),
  );
  const base = graph({ roots, nodes: [node('shared')] });
  const head = graph({ roots, nodes: [node('shared', [], 'changed')] });
  const before = structuredClone({ base, head });
  const result = classifyLockfileGraph({ base, head });
  expect(result.status).toBe('require');
  expect(result.packages).toEqual(
    roots.flatMap((item) => item.packages ?? []).sort(),
  );
  expect(result.evidence[0]?.roots).toEqual(
    roots.map((item) => item.id).sort(),
  );
  expect({ base, head }).toEqual(before);
});
