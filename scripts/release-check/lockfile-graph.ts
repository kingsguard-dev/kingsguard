import { isDeepStrictEqual } from 'node:util';
import type { ImpactStatus } from './path-impact.js';

export interface DependencyNode {
  id: string;
  fingerprint: string;
  dependencies: string[];
}
export interface DependencyRoot {
  id: string;
  fingerprint: string;
  target: string;
  impact: ImpactStatus;
  packages: string[] | null;
}
export interface LockfileGraph {
  complete: true;
  metadataFingerprint: string;
  nodes: DependencyNode[];
  roots: DependencyRoot[];
}
export interface GraphInput {
  base: LockfileGraph;
  head: LockfileGraph;
}
export interface GraphEvidence {
  kind: 'node' | 'root' | 'metadata';
  id: string;
  status: ImpactStatus;
  packages: string[];
  roots: string[];
  reason:
    | 'known-impact'
    | 'orphan'
    | 'attribution-missing'
    | 'unknown-impact'
    | 'metadata-changed';
}
export interface GraphImpact {
  status: ImpactStatus;
  packages: string[];
  evidence: GraphEvidence[];
}
interface IndexedGraph {
  nodes: Map<string, DependencyNode>;
  roots: Map<string, DependencyRoot>;
  owners: Map<string, DependencyRoot[]>;
}
const unique = (values: string[]) => [...new Set(values)].sort();
const nonempty = (value: unknown): value is string =>
  typeof value === 'string' && value.trim().length > 0;
const strings = (value: unknown): value is string[] =>
  Array.isArray(value) && Array.from(value).every(nonempty);
function statusOf(statuses: ImpactStatus[]): ImpactStatus {
  return statuses.includes('unresolved')
    ? 'unresolved'
    : statuses.includes('require')
      ? 'require'
      : 'exempt';
}

function index(graph: LockfileGraph): IndexedGraph {
  if (
    graph?.complete !== true ||
    !nonempty(graph.metadataFingerprint) ||
    !Array.isArray(graph.nodes) ||
    !Array.isArray(graph.roots)
  ) {
    throw new Error('Expected a complete normalized graph');
  }
  const nodes = new Map<string, DependencyNode>();
  const roots = new Map<string, DependencyRoot>();
  for (const node of graph.nodes) {
    if (
      !node ||
      !nonempty(node.id) ||
      !nonempty(node.fingerprint) ||
      !strings(node.dependencies) ||
      nodes.has(node.id)
    ) {
      throw new Error('Invalid or duplicate dependency node');
    }
    nodes.set(node.id, { ...node, dependencies: unique(node.dependencies) });
  }
  for (const node of nodes.values()) {
    if (node.dependencies.some((id) => !nodes.has(id)))
      throw new Error('Dangling dependency reference');
  }
  for (const root of graph.roots) {
    if (
      !root ||
      !nonempty(root.id) ||
      !nonempty(root.fingerprint) ||
      !nonempty(root.target) ||
      !nodes.has(root.target) ||
      roots.has(root.id) ||
      !['require', 'exempt', 'unresolved'].includes(root.impact) ||
      (root.packages !== null && !strings(root.packages)) ||
      (root.impact === 'exempt' &&
        (root.packages === null || root.packages.length !== 0))
    ) {
      throw new Error('Invalid or duplicate dependency root');
    }
    roots.set(root.id, {
      ...root,
      packages: root.packages === null ? null : unique(root.packages),
    });
  }
  const owners = new Map<string, DependencyRoot[]>();
  for (const root of roots.values()) {
    const pending = [root.target];
    const visited = new Set<string>();
    while (pending.length) {
      const id = pending.pop();
      if (id === undefined || visited.has(id)) continue;
      visited.add(id);
      const node = nodes.get(id);
      if (!node) throw new Error('Missing validated dependency node');
      owners.set(id, [...(owners.get(id) ?? []), root]);
      pending.push(...node.dependencies);
    }
  }
  return { nodes, roots, owners };
}
interface EvidenceInput {
  kind: 'node' | 'root';
  id: string;
  owners: DependencyRoot[];
  orphan: boolean;
}
function classify({ kind, id, owners, orphan }: EvidenceInput): GraphEvidence {
  const missing = owners.some(
    (root) => root.impact === 'require' && !root.packages?.length,
  );
  const unknown = owners.some((root) => root.impact === 'unresolved');
  return {
    kind,
    id,
    status:
      orphan || missing || unknown
        ? 'unresolved'
        : statusOf(owners.map((root) => root.impact)),
    packages: unique(owners.flatMap((root) => root.packages ?? [])),
    roots: unique(owners.map((root) => root.id)),
    reason: orphan
      ? 'orphan'
      : missing
        ? 'attribution-missing'
        : unknown
          ? 'unknown-impact'
          : 'known-impact',
  };
}

/** Input policy and fingerprints must come from a trusted, complete normalizer. */
export function classifyLockfileGraph({ base, head }: GraphInput): GraphImpact {
  const before = index(base);
  const after = index(head);
  const evidence: GraphEvidence[] = [];
  for (const id of unique([...before.nodes.keys(), ...after.nodes.keys()])) {
    if (isDeepStrictEqual(before.nodes.get(id), after.nodes.get(id))) continue;
    const present = [before, after].filter((side) => side.nodes.has(id));
    evidence.push(
      classify({
        kind: 'node',
        id,
        owners: present.flatMap((side) => side.owners.get(id) ?? []),
        orphan: present.some((side) => !side.owners.get(id)?.length),
      }),
    );
  }
  for (const id of unique([...before.roots.keys(), ...after.roots.keys()])) {
    if (isDeepStrictEqual(before.roots.get(id), after.roots.get(id))) continue;
    const owners = [before.roots.get(id), after.roots.get(id)].filter(
      (root): root is DependencyRoot => root !== undefined,
    );
    evidence.push(classify({ kind: 'root', id, owners, orphan: false }));
  }
  if (base.metadataFingerprint !== head.metadataFingerprint) {
    evidence.push({
      kind: 'metadata',
      id: 'metadata',
      status: 'unresolved',
      packages: [],
      roots: [],
      reason: 'metadata-changed',
    });
  }
  return {
    status: statusOf(evidence.map((item) => item.status)),
    packages: unique(evidence.flatMap((item) => item.packages)),
    evidence,
  };
}
