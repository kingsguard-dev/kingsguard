import { isDeepStrictEqual } from 'node:util';
import type { ImpactStatus } from './path-impact.js';

export interface ToolOnlyEvidence {
  dependencies: string[];
  scripts: string[];
}
export interface ManifestSide {
  manifest: unknown;
  packages: string[] | null;
  toolOnly: ToolOnlyEvidence;
}
export interface ManifestInput {
  base: ManifestSide | null;
  head: ManifestSide | null;
}
export interface ManifestEvidence {
  field: string[];
  status: ImpactStatus;
  packages: string[];
  reason:
    'release-field' | 'tool-only' | 'unknown-field' | 'attribution-missing';
}
export interface ManifestImpact {
  status: ImpactStatus;
  packages: string[];
  evidence: ManifestEvidence[];
}
interface ValidatedSide extends ManifestSide {
  manifest: Record<string, unknown>;
}

const requiringFields = new Set([
  'name',
  'private',
  'version',
  'description',
  'license',
  'repository',
  'homepage',
  'bugs',
  'author',
  'contributors',
  'keywords',
  'type',
  'main',
  'module',
  'browser',
  'types',
  'typings',
  'exports',
  'imports',
  'bin',
  'files',
  'engines',
  'os',
  'cpu',
  'libc',
  'dependencies',
  'optionalDependencies',
  'peerDependencies',
  'peerDependenciesMeta',
  'bundledDependencies',
  'bundleDependencies',
  'publishConfig',
  'packageManager',
  'workspaces',
]);
const requiringScripts = new Set([
  'build',
  'prepack',
  'prepare',
  'prepublish',
  'prepublishOnly',
  'postpack',
  'preinstall',
  'install',
  'postinstall',
]);
const requiringTools = new Set([
  'typescript',
  '@types/node',
  '@types/cross-spawn',
  'vite',
  'rollup',
  'esbuild',
  'tsup',
  'webpack',
]);
const internalTools = new Set([
  'eslint',
  '@eslint/js',
  'typescript-eslint',
  '@typescript-eslint/parser',
  '@typescript-eslint/rule-tester',
  'vitest',
  '@vitest/coverage-v8',
  'prettier',
]);
const internalScripts = new Map([
  ['test', 'vitest run'],
  ['test:watch', 'vitest'],
  ['test:coverage', 'vitest run --coverage'],
  ['lint', 'eslint . --max-warnings 0'],
  ['format', 'prettier --write .'],
  ['format:check', 'prettier --check .'],
]);

function record(value: unknown): value is Record<string, unknown> {
  return (
    value !== null &&
    typeof value === 'object' &&
    !Array.isArray(value) &&
    Object.getPrototypeOf(value) === Object.prototype
  );
}
function nonempty(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}
function stringList(value: unknown): value is string[] {
  return Array.isArray(value) && value.every(nonempty);
}
function jsonValue(value: unknown, ancestors = new Set<object>()): boolean {
  if (value === null || typeof value === 'string' || typeof value === 'boolean')
    return true;
  if (typeof value === 'number') return Number.isFinite(value);
  if ((!record(value) && !Array.isArray(value)) || ancestors.has(value))
    return false;
  ancestors.add(value);
  const valid = Object.values(value).every((item) =>
    jsonValue(item, ancestors),
  );
  ancestors.delete(value);
  return valid;
}
function validate(side: ManifestSide | null): ValidatedSide | null {
  if (side === null) return null;
  const manifest = side?.manifest;
  if (
    !record(manifest) ||
    !jsonValue(manifest) ||
    !nonempty(manifest.name) ||
    ('private' in manifest && typeof manifest.private !== 'boolean') ||
    (side.packages !== null && !stringList(side.packages)) ||
    !stringList(side.toolOnly?.dependencies) ||
    !stringList(side.toolOnly?.scripts)
  ) {
    throw new Error(
      'Expected a JSON manifest, attribution, and explicit tool-only evidence',
    );
  }
  if (
    manifest.private !== true &&
    side.packages !== null &&
    !side.packages.includes(manifest.name)
  ) {
    throw new Error('Public manifest attribution must include its own name');
  }
  for (const key of [
    'scripts',
    'dependencies',
    'optionalDependencies',
    'peerDependencies',
    'devDependencies',
  ]) {
    if (Object.hasOwn(manifest, key)) {
      const map = manifest[key];
      if (
        !record(map) ||
        !Object.entries(map).every(
          ([name, value]) => nonempty(name) && nonempty(value),
        )
      ) {
        throw new Error(`Expected nonempty string entries in ${key}`);
      }
    }
  }
  return { ...side, manifest };
}
function mapField(side: ValidatedSide, field: string): Record<string, unknown> {
  const value = side.manifest[field];
  return record(value) ? value : {};
}

/** Trusted callers supply attribution and tool-only proof; no discovery or script execution. */
export function classifyManifest(input: ManifestInput): ManifestImpact {
  const base = validate(input.base);
  const head = validate(input.head);
  const sides = [base, head].filter(
    (side): side is ValidatedSide => side !== null,
  );
  if (!sides.length) throw new Error('At least one manifest must exist');
  const evidence: ManifestEvidence[] = [];
  const add = (
    field: string[],
    status: ImpactStatus,
    relevant: ValidatedSide[],
  ) => {
    const missing =
      status === 'require' && relevant.some((side) => !side.packages?.length);
    evidence.push({
      field,
      status: missing ? 'unresolved' : status,
      packages:
        status === 'exempt'
          ? []
          : [
              ...new Set(relevant.flatMap((side) => side.packages ?? [])),
            ].sort(),
      reason: missing
        ? 'attribution-missing'
        : status === 'require'
          ? 'release-field'
          : status === 'exempt'
            ? 'tool-only'
            : 'unknown-field',
    });
  };
  if (!base || !head) {
    add([], 'require', sides);
  } else {
    const fields = [
      ...new Set([
        ...Object.keys(base.manifest),
        ...Object.keys(head.manifest),
      ]),
    ].sort();
    for (const field of fields) {
      if (isDeepStrictEqual(base.manifest[field], head.manifest[field]))
        continue;
      if (field !== 'scripts' && field !== 'devDependencies') {
        add(
          [field],
          requiringFields.has(field) ? 'require' : 'unresolved',
          sides,
        );
        continue;
      }
      const keys = [
        ...new Set(sides.flatMap((side) => Object.keys(mapField(side, field)))),
      ].sort();
      for (const key of keys) {
        if (
          isDeepStrictEqual(
            mapField(base, field)[key],
            mapField(head, field)[key],
          )
        )
          continue;
        const relevant = sides.filter((side) =>
          Object.hasOwn(mapField(side, field), key),
        );
        const required =
          field === 'scripts'
            ? requiringScripts.has(key)
            : requiringTools.has(key);
        const internal = relevant.every((side) =>
          field === 'scripts'
            ? side.toolOnly.scripts.includes(key) &&
              internalScripts.has(key) &&
              mapField(side, field)[key] === internalScripts.get(key)
            : side.toolOnly.dependencies.includes(key) &&
              internalTools.has(key),
        );
        add(
          [field, key],
          required ? 'require' : internal ? 'exempt' : 'unresolved',
          sides,
        );
      }
    }
  }
  return {
    status: evidence.some((item) => item.status === 'unresolved')
      ? 'unresolved'
      : evidence.some((item) => item.status === 'require')
        ? 'require'
        : 'exempt',
    packages: [...new Set(evidence.flatMap((item) => item.packages))].sort(),
    evidence,
  };
}
