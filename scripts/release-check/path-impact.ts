/** Repository-relative selectors are literal paths, never globs. */
export type PathSelector = { kind: 'file' | 'directory'; path: string };
export interface PackagePaths {
  path: string;
  name: string;
  private: boolean;
  shipped: PathSelector[];
  build: PathSelector[];
}
export interface PathInventory {
  complete: true;
  packages: PackagePaths[];
  sharedBuild: { selector: PathSelector; packages: string[] | null }[];
}
export interface PathChange {
  oldPath: string | null;
  newPath: string | null;
}
export type ImpactStatus = 'require' | 'exempt' | 'unresolved';
export interface PathEvidence {
  side: 'base' | 'head';
  path: string;
  status: ImpactStatus;
  packages: string[];
  reason:
    | 'manifest-content'
    | 'lockfile-content'
    | 'source'
    | 'shipped'
    | 'build'
    | 'build-attribution-missing'
    | 'known-internal'
    | 'unknown-path';
  selector?: PathSelector;
}
export interface PathImpact {
  change: PathChange;
  status: ImpactStatus;
  packages: string[];
  evidence: PathEvidence[];
}

function validPath(path: unknown): asserts path is string {
  if (
    typeof path !== 'string' ||
    !path ||
    /[\\:*?[\]{}]/u.test(path) ||
    [...path].some((char) => char.charCodeAt(0) < 32) ||
    path.split('/').some((part) => !part || part === '.' || part === '..')
  ) {
    throw new Error('Expected a normalized repository-relative literal path');
  }
}

function validateSelector(selector: PathSelector) {
  if (!selector || !['file', 'directory'].includes(selector.kind)) {
    throw new Error('Expected an explicit file or directory selector');
  }
  validPath(selector.path);
}

function matches(path: string, selector: PathSelector): boolean {
  return (
    path === selector.path ||
    (selector.kind === 'directory' && path.startsWith(`${selector.path}/`))
  );
}

function validateInventory(inventory: PathInventory) {
  if (
    inventory?.complete !== true ||
    !Array.isArray(inventory.packages) ||
    !Array.isArray(inventory.sharedBuild)
  ) {
    throw new Error(
      'Each inventory must be explicitly complete with all metadata',
    );
  }
  const names = new Set<string>();
  const paths = new Set<string>();
  for (const pkg of inventory.packages) {
    validPath(pkg.path);
    if (
      typeof pkg.name !== 'string' ||
      !pkg.name.trim() ||
      typeof pkg.private !== 'boolean' ||
      !Array.isArray(pkg.shipped) ||
      !Array.isArray(pkg.build) ||
      names.has(pkg.name) ||
      paths.has(pkg.path)
    ) {
      throw new Error('Invalid, missing, or duplicate package metadata');
    }
    names.add(pkg.name);
    paths.add(pkg.path);
    [...pkg.shipped, ...pkg.build].forEach(validateSelector);
  }
  for (const shared of inventory.sharedBuild) {
    validateSelector(shared.selector);
    if (
      shared.packages !== null &&
      (!Array.isArray(shared.packages) ||
        shared.packages.length === 0 ||
        shared.packages.some(
          (name) =>
            !inventory.packages.some(
              (pkg) => pkg.name === name && !pkg.private,
            ),
        ))
    ) {
      throw new Error(
        'Shared build attribution must name public packages or be null',
      );
    }
  }
}

const internal: PathSelector[] = [
  ...['tests', 'docs', '.github/workflows'].map((path): PathSelector => ({
    kind: 'directory',
    path,
  })),
  ...[
    'README.md',
    'eslint.config.js',
    'vitest.config.ts',
    '.prettierrc.json',
    '.prettierignore',
    '.changeset/config.json',
  ].map((path): PathSelector => ({ kind: 'file', path })),
];

function classifySide(
  path: string,
  side: PathEvidence['side'],
  inventory: PathInventory,
): PathEvidence[] {
  const evidence: PathEvidence[] = [];
  const add = (
    status: ImpactStatus,
    reason: PathEvidence['reason'],
    packages: string[] = [],
    selector?: PathSelector,
  ) =>
    evidence.push({
      side,
      path,
      status,
      reason,
      packages,
      ...(selector ? { selector } : {}),
    });

  // Content classifiers own these decisions, including deleted/renamed manifests.
  if (path === 'package.json' || path.endsWith('/package.json')) {
    add('unresolved', 'manifest-content');
    return evidence;
  }
  if (path === 'pnpm-lock.yaml' || path.endsWith('/pnpm-lock.yaml')) {
    add('unresolved', 'lockfile-content');
    return evidence;
  }
  for (const pkg of inventory.packages.filter((pkg) => !pkg.private)) {
    const source: PathSelector = { kind: 'directory', path: `${pkg.path}/src` };
    if (matches(path, source)) add('require', 'source', [pkg.name], source);
    for (const [reason, selectors] of [
      ['shipped', pkg.shipped],
      ['build', pkg.build],
    ] as const) {
      for (const selector of selectors) {
        if (matches(path, selector))
          add('require', reason, [pkg.name], selector);
      }
    }
  }
  for (const shared of inventory.sharedBuild) {
    if (matches(path, shared.selector)) {
      add(
        shared.packages ? 'require' : 'unresolved',
        shared.packages ? 'build' : 'build-attribution-missing',
        shared.packages ?? [],
        shared.selector,
      );
    }
  }
  if (path === 'tsconfig.json' && evidence.length === 0) {
    const names = inventory.packages
      .filter((pkg) => !pkg.private)
      .map((pkg) => pkg.name);
    add(
      names.length ? 'require' : 'unresolved',
      names.length ? 'build' : 'build-attribution-missing',
      names,
    );
  }
  if (evidence.length) return evidence;
  const selector = [
    ...internal,
    ...(path.startsWith('.changeset/') &&
    path.endsWith('.md') &&
    path.split('/').length === 2
      ? [{ kind: 'file' as const, path }]
      : []),
    ...inventory.packages.map((pkg): PathSelector => ({
      kind: 'directory',
      path: `${pkg.path}/tests`,
    })),
  ].find((selector) => matches(path, selector));
  add(
    selector ? 'exempt' : 'unresolved',
    selector ? 'known-internal' : 'unknown-path',
    [],
    selector,
  );
  return evidence;
}

/** Pure classification only: unresolved evidence is never a successful exemption. */
export function classifyPaths(input: {
  complete: true;
  changes: PathChange[];
  base: PathInventory;
  head: PathInventory;
}): PathImpact[] {
  if (input?.complete !== true || !Array.isArray(input.changes)) {
    throw new Error('Changed paths must be explicitly complete');
  }
  validateInventory(input.base);
  validateInventory(input.head);
  return input.changes.map((change) => {
    if (!change || (change.oldPath === null && change.newPath === null)) {
      throw new Error('A change needs at least one path');
    }
    const evidence: PathEvidence[] = [];
    for (const [side, path] of [
      ['base', change.oldPath],
      ['head', change.newPath],
    ] as const) {
      if (path === null) continue;
      validPath(path);
      evidence.push(...classifySide(path, side, input[side]));
    }
    return {
      change,
      status: evidence.some((item) => item.status === 'unresolved')
        ? 'unresolved'
        : evidence.some((item) => item.status === 'require')
          ? 'require'
          : 'exempt',
      packages: [...new Set(evidence.flatMap((item) => item.packages))].sort(),
      evidence,
    };
  });
}
